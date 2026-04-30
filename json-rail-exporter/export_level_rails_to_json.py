"""
Export rail actors from the current Unreal level to maze-builder-compatible JSON.

Expected scene structure can live under a persistent level or a streamed level.
Actors are detected by Blueprint class/type prefix, not actor label:
BP_Maze, BP_MazeBoundary, BP_MazeBottom, and BP_Rail.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

try:
    import unreal
except ImportError as exc:
    raise RuntimeError("This script must be run inside Unreal Editor Python.") from exc


# ============================================================
# Config
# ============================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_JSON = REPO_ROOT / "maze-builder" / "exported_level_rails.json"

GRID_TO_WORLD = 16.0
MAZE_ORIGIN_TOLERANCE_CM = 0.01

CLASS_PREFIX_MAZE = "BP_Maze"
CLASS_PREFIX_BOUNDARY = "BP_MazeBoundary"
CLASS_PREFIX_BOTTOM = "BP_MazeBottom"
CLASS_PREFIX_RAIL = "BP_Rail"
RAIL_ID_PROPERTY_NAMES = (
    "Rail_ID",
    "RailID",
    "RailId",
    "RowName",
    "RailRowName",
    "ConfigRowName",
    "Type",
)


def _log(message: str) -> None:
    unreal.log(f"[JsonRailExporter] {message}")


def _warn(message: str) -> None:
    unreal.log_warning(f"[JsonRailExporter] {message}")


def _all_level_actors() -> Iterable:
    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "get_all_level_actors"):
            return subsystem.get_all_level_actors()
    return unreal.EditorLevelLibrary.get_all_level_actors()


def _class_name(actor) -> str:
    try:
        name = actor.get_class().get_name()
    except Exception:
        name = actor.get_name()
    if name.endswith("_C"):
        name = name[:-2]
    return str(name)


def _class_path(actor) -> str:
    try:
        return str(actor.get_class().get_path_name())
    except Exception:
        return _class_name(actor)


def _is_type(actor, prefix: str) -> bool:
    name = _class_name(actor)
    path = _class_path(actor)
    return name.startswith(prefix) or f".{prefix}" in path or f"/{prefix}" in path


def _actor_label(actor) -> str:
    if hasattr(actor, "get_actor_label"):
        return actor.get_actor_label()
    return actor.get_name()


def _find_scene_actors() -> Tuple[Optional[object], Optional[object], Optional[object], List[object]]:
    maze = None
    boundary = None
    bottom = None
    rails = []

    for actor in _all_level_actors():
        if _is_type(actor, CLASS_PREFIX_BOUNDARY):
            boundary = actor if boundary is None else boundary
        elif _is_type(actor, CLASS_PREFIX_BOTTOM):
            bottom = actor if bottom is None else bottom
        elif _is_type(actor, CLASS_PREFIX_RAIL):
            rails.append(actor)
        elif _is_type(actor, CLASS_PREFIX_MAZE):
            maze = actor if maze is None else maze

    return maze, boundary, bottom, rails


def _relative_location(actor, maze_origin: unreal.Vector) -> unreal.Vector:
    location = actor.get_actor_location()
    return unreal.Vector(location.x - maze_origin.x, location.y - maze_origin.y, location.z - maze_origin.z)


def _vec_dict(vector: unreal.Vector) -> dict:
    return {
        "x": float(round(vector.x, 8)),
        "y": float(round(vector.y, 8)),
        "z": float(round(vector.z, 8)),
    }


def _rev_vec_dict(vector: unreal.Vector) -> dict:
    return {
        "x": int(round(vector.x / GRID_TO_WORLD)),
        "y": int(round(vector.y / GRID_TO_WORLD)),
        "z": int(round(vector.z / GRID_TO_WORLD)),
    }


def _rot_dict(rotator: unreal.Rotator) -> dict:
    return {
        "p": float(round(rotator.pitch, 8)),
        "y": float(round(rotator.yaw, 8)),
        "r": float(round(rotator.roll, 8)),
    }


def _rot_index(yaw: float) -> int:
    return int(round(yaw / 90.0)) % 4


def _dir_abs(yaw: float) -> str:
    return ["+X", "+Y", "-X", "-Y"][_rot_index(yaw)]


def _size_from_rail_id(rail_id: str) -> dict:
    match = re.search(r"_X(\d+)_Y(\d+)_Z(\d+)", rail_id, re.IGNORECASE)
    if not match:
        return {"x": 1, "y": 1, "z": 1}
    return {"x": int(match.group(1)), "y": int(match.group(2)), "z": int(match.group(3))}


def _rail_id_from_actor(actor) -> str:
    for prop_name in RAIL_ID_PROPERTY_NAMES:
        try:
            value = actor.get_editor_property(prop_name)
        except Exception:
            continue
        if value is not None and str(value).strip():
            return str(value).strip()

    try:
        for tag in actor.tags:
            text = str(tag)
            for prefix in ("Rail_ID=", "RailID=", "RowName="):
                if text.startswith(prefix) and text[len(prefix) :].strip():
                    return text[len(prefix) :].strip()
    except Exception:
        pass

    label = _actor_label(actor)
    label_match = re.search(r"(BP_[A-Za-z0-9_]+_Rail)", label)
    if label_match:
        return label_match.group(1)

    class_name = _class_name(actor)
    if class_name.startswith(CLASS_PREFIX_RAIL):
        return class_name
    return class_name


def _sort_rails(rails: Sequence[object]) -> List[object]:
    def key(actor):
        label = _actor_label(actor)
        match = re.search(r"(\d+)", label)
        index = int(match.group(1)) if match else 10**9
        loc = actor.get_actor_location()
        return (index, round(loc.x, 4), round(loc.y, 4), round(loc.z, 4), label)

    return sorted(rails, key=key)


def _boundary_grid_from_actor(boundary, maze_origin: unreal.Vector) -> Optional[dict]:
    if not boundary:
        return None

    loc = _relative_location(boundary, maze_origin)
    candidates = [abs(loc.x), abs(loc.y)]

    for prop_name in ("BoundaryHalfSize", "HalfSize", "MazeHalfSize", "Size"):
        try:
            value = boundary.get_editor_property(prop_name)
            if isinstance(value, (int, float)):
                candidates.append(abs(float(value)))
            elif hasattr(value, "x"):
                candidates.extend([abs(float(value.x)), abs(float(value.y))])
        except Exception:
            pass

    half_cm = max(candidates) if candidates else 0.0
    if half_cm <= 0.0:
        return None

    grid = int(round(((half_cm - 8.0) / GRID_TO_WORLD) * 2.0 + 1.0))
    grid = max(1, grid)
    if grid % 2 == 0:
        grid += 1

    return {
        "Boundary_Half_Abs": half_cm,
        "Boundary_Size_Rev": {"x": grid, "y": grid, "z": 1},
    }


def _bottom_type_from_actor(bottom) -> Optional[str]:
    if not bottom:
        return None
    name = _class_name(bottom)
    match = re.search(r"([1-4])x\1", name, re.IGNORECASE)
    return match.group(0).lower() if match else name


def _maze_origin(maze) -> unreal.Vector:
    if not maze:
        _warn("BP_Maze not found. Exporting with world origin as maze origin.")
        return unreal.Vector(0.0, 0.0, 0.0)

    origin = maze.get_actor_location()
    if (
        abs(origin.x) <= MAZE_ORIGIN_TOLERANCE_CM
        and abs(origin.y) <= MAZE_ORIGIN_TOLERANCE_CM
        and abs(origin.z) <= MAZE_ORIGIN_TOLERANCE_CM
    ):
        _log("BP_Maze is at world origin; no offset applied.")
        return unreal.Vector(0.0, 0.0, 0.0)

    _warn(f"BP_Maze is offset at {_vec_dict(origin)}. Exporting rails relative to that location.")
    return origin


def _rail_json(actor, index: int, maze_origin: unreal.Vector) -> dict:
    rel_location = _relative_location(actor, maze_origin)
    rotator = actor.get_actor_rotation()
    rail_id = _rail_id_from_actor(actor)
    size = _size_from_rail_id(rail_id)

    return {
        "Rail_Index": index,
        "Rail_ID": rail_id,
        "Pos_Rev": _rev_vec_dict(rel_location),
        "Pos_Abs": _vec_dict(rel_location),
        "Rot_Abs": _rot_dict(rotator),
        "Dir_Abs": _dir_abs(rotator.yaw),
        "Size_Rev": size,
        "Occupied_Cells_Rev": [_rev_vec_dict(rel_location)],
        "Diff_Base": 0,
        "Diff_Act": 0.0,
        "Prev_Index": -1,
        "Next_Index": [],
        "Exit": [],
    }


def export_level_rails(output_json: Path = DEFAULT_OUTPUT_JSON) -> dict:
    maze, boundary, bottom, rails = _find_scene_actors()
    maze_origin = _maze_origin(maze)
    sorted_rails = _sort_rails(rails)

    boundary_meta = _boundary_grid_from_actor(boundary, maze_origin)
    bottom_meta = None
    if bottom:
        bottom_location = _relative_location(bottom, maze_origin)
        bottom_meta = {
            "Bottom_Type": _bottom_type_from_actor(bottom),
            "Bottom_Pos_Abs": _vec_dict(bottom_location),
            "Bottom_Pos_Rev": _rev_vec_dict(bottom_location),
        }

    json_rails = [_rail_json(actor, index, maze_origin) for index, actor in enumerate(sorted_rails)]
    layout = {
        "MapMeta": {
            "LevelName": unreal.EditorLevelLibrary.get_editor_world().get_name(),
            "RailCount": len(json_rails),
            "MazeOrigin_Abs": _vec_dict(maze_origin),
        },
        "Rail": json_rails,
    }

    if boundary_meta:
        layout["MapMeta"].update(boundary_meta)
    if bottom_meta:
        layout["MapMeta"].update(bottom_meta)

    output_json.parent.mkdir(parents=True, exist_ok=True)
    with output_json.open("w", encoding="utf-8") as file:
        json.dump(layout, file, ensure_ascii=False, indent=4)

    _log(f"Exported {len(json_rails)} rails to {output_json}")
    if not boundary:
        _warn("BP_MazeBoundary not found; boundary metadata was not exported.")
    if not bottom:
        _warn("BP_MazeBottom not found; bottom metadata was not exported.")
    return layout


if __name__ == "__main__":
    export_level_rails()
