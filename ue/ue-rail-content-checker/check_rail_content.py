"""
Check whether rail Blueprint assets declared in rail_config.csv exist in the
expected Unreal Content Browser locations.

Run inside Unreal Editor Python. Results are logged and also shown in an editor
message dialog when that API is available.
"""

from __future__ import annotations

import csv
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
DEFAULT_RAIL_CONFIG_CSV = REPO_ROOT / "web-maze-builder" / "rail_config.csv"

# Leave empty to use DEFAULT_RAIL_CONFIG_CSV.
RAIL_CONFIG_CSV_PATH = ""

# CSV columns that may contain real Blueprint/Class references if the CSV gains
# explicit BP columns later.
RAIL_CLASS_COLUMNS = ("BP_Rail", "RailActor", "RailBP", "RailRef", "Reference", "Actor", "Blueprint", "Class")

# Current rail_config.csv declares proxy meshes. The expected BP location is
# derived as the sibling Real folder beside Proxy:
# /Game/.../Proxy/SM_Name -> /Game/.../Real/BP_Name
RAIL_PART_COLUMNS = ("Side", "BR", "BL", "B", "L", "R")
EXPECTED_BP_FOLDER_NAME = "Real"

# Misplaced search only scans assets inside folders named Real under these
# Content Browser roots.
REAL_SEARCH_ROOTS = ("/Game/Item/Rail",)
REAL_FOLDER_NAME = "Real"

LOG_PREFIX = "[RailContentCheck]"


@dataclass(frozen=True)
class RailExpectedPath:
    source_column: str
    package_path: str
    object_path: str


@dataclass
class RailRow:
    row_name: str
    expected_paths: List[RailExpectedPath]


@dataclass
class MisplacedRail:
    row_name: str
    expected_paths: List[str]
    actual_paths: List[str]


def _log(message: str) -> None:
    unreal.log(f"{LOG_PREFIX} {message}")


def _warn(message: str) -> None:
    unreal.log_warning(f"{LOG_PREFIX} {message}")


def _resolve_csv_path(path: Optional[Path] = None) -> Path:
    if path:
        return path if path.is_absolute() else REPO_ROOT / path
    if RAIL_CONFIG_CSV_PATH:
        configured = Path(RAIL_CONFIG_CSV_PATH)
        return configured if configured.is_absolute() else REPO_ROOT / configured
    return DEFAULT_RAIL_CONFIG_CSV


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

    package_path = object_path.split(".", 1)[0]
    return object_path, package_path


def _object_path_from_package(package_path: str) -> str:
    return f"{package_path}.{package_path.rsplit('/', 1)[-1]}"


def _derive_bp_path_from_mesh_ref(row_name: str, mesh_package_path: str) -> Optional[RailExpectedPath]:
    proxy_marker = "/Proxy/"
    if proxy_marker in mesh_package_path:
        rail_folder = mesh_package_path.split(proxy_marker, 1)[0]
    else:
        parent = mesh_package_path.rsplit("/", 1)[0]
        if not parent.lower().endswith(f"/{EXPECTED_BP_FOLDER_NAME.lower()}"):
            return None
        rail_folder = parent.rsplit("/", 1)[0]

    package_path = f"{rail_folder}/{EXPECTED_BP_FOLDER_NAME}/{row_name}"
    return RailExpectedPath("DerivedRealBP", package_path, _object_path_from_package(package_path))


def _append_unique(target: List[RailExpectedPath], incoming: Iterable[RailExpectedPath]) -> None:
    known = {item.package_path for item in target}
    for item in incoming:
        if item.package_path not in known:
            target.append(item)
            known.add(item.package_path)


def _read_rail_config(csv_path: Path) -> List[RailRow]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Rail config CSV not found: {csv_path}")

    rows_by_name: Dict[str, RailRow] = {}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames:
            raise RuntimeError(f"CSV has no header row: {csv_path}")

        for row_number, row in enumerate(reader, start=2):
            row_name = (row.get("RowName") or row.get("Name") or "").strip()
            if not row_name:
                _warn(f"CSV row {row_number} skipped: missing RowName/Name.")
                continue

            expected_paths: List[RailExpectedPath] = []

            for column_name in RAIL_CLASS_COLUMNS:
                normalized = _normalize_asset_ref((row.get(column_name) or "").strip())
                if normalized:
                    object_path, package_path = normalized
                    expected_paths.append(RailExpectedPath(column_name, package_path, object_path))

            for column_name in RAIL_PART_COLUMNS:
                normalized = _normalize_asset_ref((row.get(column_name) or "").strip())
                if not normalized:
                    continue
                _, mesh_package_path = normalized
                derived = _derive_bp_path_from_mesh_ref(row_name, mesh_package_path)
                if derived:
                    expected_paths.append(derived)

            rail_row = rows_by_name.setdefault(row_name, RailRow(row_name, []))
            _append_unique(rail_row.expected_paths, expected_paths)

    return list(rows_by_name.values())


def _asset_exists(package_path: str) -> bool:
    try:
        if unreal.EditorAssetLibrary.does_asset_exist(package_path):
            return True
    except Exception:
        pass

    try:
        return bool(unreal.EditorAssetLibrary.find_asset_data(package_path).is_valid())
    except Exception:
        return False


def _get_asset_registry():
    if hasattr(unreal, "AssetRegistryHelpers"):
        return unreal.AssetRegistryHelpers.get_asset_registry()
    return unreal.get_asset_registry()


def _asset_name(asset_data) -> str:
    try:
        return str(asset_data.asset_name)
    except Exception:
        return str(asset_data.get_editor_property("asset_name"))


def _package_path(asset_data) -> str:
    try:
        return str(asset_data.package_name)
    except Exception:
        return str(asset_data.get_editor_property("package_name"))


def _is_in_real_folder(package_path: str) -> bool:
    marker = f"/{REAL_FOLDER_NAME.lower()}/"
    return marker in package_path.lower()


def _find_assets_named_in_real_folders(asset_names: Sequence[str]) -> Dict[str, List[str]]:
    names = set(asset_names)
    found: Dict[str, List[str]] = {name: [] for name in asset_names}
    if not names:
        return found

    registry = _get_asset_registry()

    for root in REAL_SEARCH_ROOTS:
        try:
            assets = registry.get_assets_by_path(root, recursive=True)
        except TypeError:
            assets = registry.get_assets_by_path(unreal.Name(root), True)

        for asset_data in assets:
            name = _asset_name(asset_data)
            if name not in names:
                continue
            package_path = _package_path(asset_data)
            if _is_in_real_folder(package_path):
                found[name].append(package_path)

    for paths in found.values():
        paths[:] = sorted(set(paths))

    return found


def _expected_path_text(paths: Sequence[RailExpectedPath]) -> List[str]:
    return [path.package_path for path in paths] or ["<no expected path could be derived>"]


def _build_report(total: int, found: Sequence[RailRow], missing: Sequence[RailRow], misplaced: Sequence[MisplacedRail]) -> str:
    lines = [
        f"{len(found)}/{total}",
        f"Content Missing = {len(missing)}",
    ]

    for row in missing:
        lines.append(f"- {row.row_name}")

    lines.append(f"Content Missplaced = {len(misplaced)}")

    for item in misplaced:
        lines.append(f"- {item.row_name}")
        for actual_path in item.actual_paths:
            lines.append(f"  Actual: {actual_path}")
        for expected_path in item.expected_paths:
            lines.append(f"  Expected: {expected_path}")

    return "\n".join(lines)


def _show_message(report: str) -> None:
    for line in report.splitlines():
        _log(line)

    try:
        unreal.EditorDialog.show_message("Rail Content Check", report, unreal.AppMsgType.OK)
    except Exception:
        pass


def check_rail_content(rail_config_csv: Optional[Path] = None) -> str:
    csv_path = _resolve_csv_path(rail_config_csv)
    rows = _read_rail_config(csv_path)

    found: List[RailRow] = []
    missing_candidates: List[RailRow] = []

    for row in rows:
        if any(_asset_exists(path.package_path) for path in row.expected_paths):
            found.append(row)
        else:
            missing_candidates.append(row)

    found_elsewhere = _find_assets_named_in_real_folders([row.row_name for row in missing_candidates])

    missing: List[RailRow] = []
    misplaced: List[MisplacedRail] = []

    for row in missing_candidates:
        expected_package_paths = {path.package_path for path in row.expected_paths}
        actual_paths = [path for path in found_elsewhere.get(row.row_name, []) if path not in expected_package_paths]
        if actual_paths:
            misplaced.append(MisplacedRail(row.row_name, _expected_path_text(row.expected_paths), actual_paths))
        else:
            missing.append(row)

    report = _build_report(len(rows), found, missing, misplaced)
    _show_message(report)
    return report


if __name__ == "__main__":
    check_rail_content()
