"""
Import a maze-builder JSON layout into the current Unreal level.

Run inside Unreal Editor Python. The script reads maze_layout.json plus a rail
reference CSV, places BP_Maze at world origin when configured, and places rails
from the JSON. If the CSV has Blueprint/Class references, those are used; with
the current CSV it falls back to the StaticMesh references in Side/BR/BL/B/L/R.
"""

from __future__ import annotations

import csv
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import unreal
except ImportError as exc:
    raise RuntimeError("This script must be run inside Unreal Editor Python.") from exc


# ============================================================
# Config
# ============================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LAYOUT_JSON = REPO_ROOT / "maze-builder" / "maze_layout.json"
DEFAULT_RAIL_CONFIG_CSV = REPO_ROOT / "maze-builder" / "rail_config.csv"

FOLDER_PATH = "GeneratedMazeRails"
CLEAR_EXISTING_IN_FOLDER = True
SELECT_SPAWNED_ACTORS = True

GRID_TO_WORLD = 16.0
LOCATION_SCALE = 1.0
LOCATION_OFFSET = unreal.Vector(0.0, 0.0, 0.0)
ROTATION_OFFSET = unreal.Rotator(0.0, 0.0, 0.0)

# Fill these once the project-side Blueprint references are settled.
BP_MAZE_CLASS_PATH = ""
BP_MAZE_BOUNDARY_CLASS_PATH = ""
BP_MAZE_BOTTOM_CLASS_PATHS = {
    "1x1": "",
    "2x2": "",
    "3x3": "",
    "4x4": "",
}

RAIL_CLASS_COLUMNS = ("BP_Rail", "Rail", "RailRef", "Reference", "Actor", "Blueprint", "Class")
RAIL_PART_COLUMNS = ("Side", "BR", "BL", "B", "L", "R")


@dataclass
class RailRef:
    column_name: str
    raw_ref: str
    object_path: str
    package_path: str
    is_actor_class: bool


@dataclass
class RailConfigRow:
    row_name: str
    actor_refs: List[RailRef]
    mesh_refs: List[RailRef]


def _log(message: str) -> None:
    unreal.log(f"[JsonRailImporter] {message}")


def _warn(message: str) -> None:
    unreal.log_warning(f"[JsonRailImporter] {message}")


def _error(message: str) -> None:
    unreal.log_error(f"[JsonRailImporter] {message}")


def _read_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Layout JSON not found: {path}")
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def _looks_like_unreal_ref(value: str) -> bool:
    value = value.strip()
    return bool(value) and ("/Game/" in value or value.startswith("/Script/"))


def _normalize_asset_ref(raw_ref: str) -> Optional[Tuple[str, str]]:
    value = raw_ref.strip()
    if not _looks_like_unreal_ref(value):
        return None

    quoted = re.search(r"'([^']+)'", value)
    object_path = quoted.group(1) if quoted else value
    object_path = object_path.strip()
    if not object_path.startswith("/Game/"):
        return None

    return object_path, object_path.split(".", 1)[0]


def _read_rail_config(csv_path: Path) -> Dict[str, RailConfigRow]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Rail config CSV not found: {csv_path}")

    config: Dict[str, RailConfigRow] = {}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames:
            raise RuntimeError(f"CSV has no header row: {csv_path}")

        for row_number, row in enumerate(reader, start=2):
            row_name = (row.get("RowName") or row.get("Name") or "").strip()
            if not row_name:
                _warn(f"CSV row {row_number} skipped: missing RowName/Name.")
                continue

            actor_refs: List[RailRef] = []
            mesh_refs: List[RailRef] = []

            for column_name in RAIL_CLASS_COLUMNS:
                raw_ref = (row.get(column_name) or "").strip()
                normalized = _normalize_asset_ref(raw_ref)
                if normalized:
                    object_path, package_path = normalized
                    actor_refs.append(RailRef(column_name, raw_ref, object_path, package_path, True))

            for column_name in RAIL_PART_COLUMNS:
                raw_ref = (row.get(column_name) or "").strip()
                normalized = _normalize_asset_ref(raw_ref)
                if normalized:
                    object_path, package_path = normalized
                    mesh_refs.append(RailRef(column_name, raw_ref, object_path, package_path, False))

            existing = config.setdefault(row_name, RailConfigRow(row_name, [], []))
            _append_unique_refs(existing.actor_refs, actor_refs)
            _append_unique_refs(existing.mesh_refs, mesh_refs)

    return config


def _append_unique_refs(target: List[RailRef], incoming: Iterable[RailRef]) -> None:
    known = {item.object_path for item in target}
    for item in incoming:
        if item.object_path not in known:
            target.append(item)
            known.add(item.object_path)


def _layout_rails(layout: dict) -> List[dict]:
    rails = layout.get("Rail")
    if not isinstance(rails, list):
        raise RuntimeError("Layout JSON must contain a Rail array.")
    return rails


def _rail_id(rail: dict) -> str:
    value = rail.get("Rail_ID") or rail.get("Name")
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"Rail entry is missing Rail_ID/Name: {rail}")
    return value.strip()


def _validate_references(rails: Sequence[dict], config: Dict[str, RailConfigRow]) -> None:
    missing_rows = []
    missing_refs = []

    for rail in rails:
        rail_id = _rail_id(rail)
        config_row = config.get(rail_id)
        if not config_row:
            missing_rows.append(rail_id)
        elif not config_row.actor_refs and not config_row.mesh_refs:
            missing_refs.append(rail_id)

    if missing_rows or missing_refs:
        if missing_rows:
            _error("These Rail_ID values are missing from the CSV:")
            for rail_id in sorted(set(missing_rows)):
                _error(f"  - {rail_id}")
        if missing_refs:
            _error("These Rail_ID values have no usable Blueprint/Class or StaticMesh refs:")
            for rail_id in sorted(set(missing_refs)):
                _error(f"  - {rail_id}")
        raise RuntimeError("Missing rail references. Fix the CSV before placing rails.")


def _load_actor_class(path: str):
    if not path:
        return None

    for candidate in (path, f"{path}_C"):
        try:
            obj = unreal.load_object(None, candidate)
            if obj and _is_loaded_class(obj):
                return obj
        except Exception:
            pass

    try:
        loaded = unreal.EditorAssetLibrary.load_blueprint_class(path)
        if loaded:
            return loaded
    except Exception:
        pass

    asset = unreal.EditorAssetLibrary.load_asset(path)
    if asset:
        try:
            return asset.generated_class()
        except Exception:
            pass
        try:
            generated = asset.get_editor_property("generated_class")
            if generated:
                return generated
        except Exception:
            pass

    raise RuntimeError(f"Failed to load actor class: {path}")


def _is_loaded_class(obj) -> bool:
    if hasattr(obj, "get_default_object"):
        return True
    try:
        return obj.get_class().get_name() == "Class"
    except Exception:
        return False


def _load_static_mesh(ref: RailRef):
    for path in (ref.object_path, ref.package_path):
        asset = unreal.EditorAssetLibrary.load_asset(path)
        if asset:
            try:
                mesh = unreal.StaticMesh.cast(asset)
            except TypeError:
                mesh = None
            if mesh:
                return mesh
    raise RuntimeError(f"Failed to load StaticMesh for {ref.column_name}: {ref.raw_ref}")


def _vec_from_json(value: dict) -> unreal.Vector:
    return unreal.Vector(
        float(value.get("x", 0.0)) * LOCATION_SCALE + LOCATION_OFFSET.x,
        float(value.get("y", 0.0)) * LOCATION_SCALE + LOCATION_OFFSET.y,
        float(value.get("z", 0.0)) * LOCATION_SCALE + LOCATION_OFFSET.z,
    )


def _rot_from_json(value: dict) -> unreal.Rotator:
    return unreal.Rotator(
        float(value.get("p", 0.0)) + ROTATION_OFFSET.pitch,
        float(value.get("y", 0.0)) + ROTATION_OFFSET.yaw,
        float(value.get("r", 0.0)) + ROTATION_OFFSET.roll,
    )


def _spawn_actor(actor_class, location: unreal.Vector, rotation: unreal.Rotator, label: str):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(actor_class, location, rotation)
    if not actor:
        raise RuntimeError(f"Failed to spawn actor: {label}")
    actor.set_actor_label(label, mark_dirty=True)
    try:
        actor.set_folder_path(FOLDER_PATH)
    except Exception:
        pass
    return actor


def _spawn_static_mesh_actor(mesh, location: unreal.Vector, rotation: unreal.Rotator, label: str):
    actor = _spawn_actor(unreal.StaticMeshActor, location, rotation, label)
    component = actor.static_mesh_component
    component.set_static_mesh(mesh)
    component.set_mobility(unreal.ComponentMobility.STATIC)
    return actor


def _all_level_actors() -> Iterable:
    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "get_all_level_actors"):
            return subsystem.get_all_level_actors()
    return unreal.EditorLevelLibrary.get_all_level_actors()


def _destroy_actor(actor) -> bool:
    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "destroy_actor"):
            return bool(subsystem.destroy_actor(actor))
    return bool(unreal.EditorLevelLibrary.destroy_actor(actor))


def _clear_existing_folder() -> int:
    if not CLEAR_EXISTING_IN_FOLDER:
        return 0

    destroyed = 0
    for actor in list(_all_level_actors()):
        try:
            folder = str(actor.get_folder_path())
        except Exception:
            folder = ""
        if folder == FOLDER_PATH and _destroy_actor(actor):
            destroyed += 1
    return destroyed


def _set_selected_actors(actors: Sequence) -> None:
    if not SELECT_SPAWNED_ACTORS:
        return

    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "set_selected_level_actors"):
            subsystem.set_selected_level_actors(list(actors))
            return

    unreal.EditorLevelLibrary.set_selected_level_actors(list(actors))


def _safe_label(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]+", "_", text)


def _grid_extent_from_layout(rails: Sequence[dict]) -> int:
    max_abs = 0
    for rail in rails:
        cells = rail.get("Occupied_Cells_Rev") or [rail.get("Pos_Rev") or {}]
        for cell in cells:
            max_abs = max(max_abs, abs(int(cell.get("x", 0))), abs(int(cell.get("y", 0))))
    return max(1, max_abs * 2 + 1)


def _bottom_spec_from_maze_grid(grid_size: int) -> Tuple[str, float]:
    maze_abs = grid_size * GRID_TO_WORLD
    diagonal_grid = int(math.sqrt(maze_abs * maze_abs * 2.0) / GRID_TO_WORLD) + 1
    boundary_half = diagonal_grid * GRID_TO_WORLD * 0.5
    bottom_z = -boundary_half - GRID_TO_WORLD

    if grid_size <= 4:
        bottom_type = "1x1"
    elif grid_size <= 7:
        bottom_type = "2x2"
    elif grid_size <= 11:
        bottom_type = "3x3"
    else:
        bottom_type = "4x4"
    return bottom_type, bottom_z


def _place_maze_helper_actors(rails: Sequence[dict]) -> List:
    spawned = []

    if BP_MAZE_CLASS_PATH:
        spawned.append(_spawn_actor(_load_actor_class(BP_MAZE_CLASS_PATH), unreal.Vector(0.0, 0.0, 0.0), unreal.Rotator(0.0, 0.0, 0.0), "BP_Maze"))
    else:
        _warn("BP_MAZE_CLASS_PATH is empty; BP_Maze was not placed.")

    grid_size = _grid_extent_from_layout(rails)
    boundary_half_cm = ((grid_size - 1) * 0.5 * GRID_TO_WORLD) + 8.0

    if BP_MAZE_BOUNDARY_CLASS_PATH:
        actor = _spawn_actor(_load_actor_class(BP_MAZE_BOUNDARY_CLASS_PATH), unreal.Vector(0.0, 0.0, 0.0), unreal.Rotator(0.0, 0.0, 0.0), "BP_MazeBoundary")
        _try_set_editor_property(actor, ("BoundaryHalfSize", "HalfSize", "MazeHalfSize", "Size"), boundary_half_cm)
        spawned.append(actor)
    else:
        _warn("BP_MAZE_BOUNDARY_CLASS_PATH is empty; BP_MazeBoundary was not placed.")

    bottom_type, bottom_z = _bottom_spec_from_maze_grid(grid_size)
    bottom_path = BP_MAZE_BOTTOM_CLASS_PATHS.get(bottom_type, "")
    if bottom_path:
        spawned.append(_spawn_actor(_load_actor_class(bottom_path), unreal.Vector(0.0, 0.0, bottom_z), unreal.Rotator(0.0, 0.0, 0.0), f"BP_MazeBottom_{bottom_type}"))
    else:
        _warn(f"BP_MAZE_BOTTOM_CLASS_PATHS['{bottom_type}'] is empty; BP_MazeBottom was not placed.")

    return spawned


def _try_set_editor_property(actor, names: Sequence[str], value) -> None:
    for name in names:
        try:
            actor.set_editor_property(name, value)
            return
        except Exception:
            pass


def import_json_rails(layout_json: Path = DEFAULT_LAYOUT_JSON, rail_config_csv: Path = DEFAULT_RAIL_CONFIG_CSV) -> List:
    layout = _read_json(layout_json)
    rails = _layout_rails(layout)
    config = _read_rail_config(rail_config_csv)

    _validate_references(rails, config)

    destroyed = _clear_existing_folder()
    if destroyed:
        _log(f"Cleared {destroyed} existing actors from folder '{FOLDER_PATH}'.")

    spawned = _place_maze_helper_actors(rails)
    mesh_cache = {}
    class_cache = {}
    total_refs = sum(1 if config[_rail_id(rail)].actor_refs else len(config[_rail_id(rail)].mesh_refs) for rail in rails)

    map_meta = layout.get("MapMeta", {})
    level_name = map_meta.get("LevelName", layout_json.stem)
    _log(f"Placing {len(rails)} rails / {total_refs} actor refs from '{level_name}'.")

    with unreal.ScopedSlowTask(max(1, total_refs), "Importing JSON rails...") as task:
        task.make_dialog(True)

        for rail in rails:
            if task.should_cancel():
                break

            rail_id = _rail_id(rail)
            rail_index = rail.get("Rail_Index", "?")
            location = _vec_from_json(rail.get("Pos_Abs") or {})
            rotation = _rot_from_json(rail.get("Rot_Abs") or {})
            row = config[rail_id]

            if row.actor_refs:
                ref = row.actor_refs[0]
                task.enter_progress_frame(1, f"{rail_index}: {rail_id}")
                if ref.object_path not in class_cache:
                    class_cache[ref.object_path] = _load_actor_class(ref.object_path)
                label = f"MazeRail_{rail_index}_{_safe_label(rail_id)}"
                spawned.append(_spawn_actor(class_cache[ref.object_path], location, rotation, label))
                continue

            for ref in row.mesh_refs:
                task.enter_progress_frame(1, f"{rail_index}: {rail_id} / {ref.column_name}")
                if ref.object_path not in mesh_cache:
                    mesh_cache[ref.object_path] = _load_static_mesh(ref)
                label = f"MazeRail_{rail_index}_{_safe_label(rail_id)}_{ref.column_name}"
                spawned.append(_spawn_static_mesh_actor(mesh_cache[ref.object_path], location, rotation, label))

    _set_selected_actors(spawned)
    _log(f"Done. Spawned {len(spawned)} actors into folder '{FOLDER_PATH}'.")
    return spawned


if __name__ == "__main__":
    import_json_rails()
