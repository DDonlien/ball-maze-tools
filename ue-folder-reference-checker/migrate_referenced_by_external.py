"""Move externally referenced assets beside their first external referencer."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys
from typing import List, Sequence, Tuple

import unreal

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from folder_reference_checker import MODE_REFERENCED_BY, AssetReport, ExternalReference, _log, _scan, _show_message, _warn


MIGRATED_FOLDER_NAME = "ReferenceMigrated"
IGNORED_REFERENCER_ROOTS = (
    "/Game/ExternalAsset",
    "/Game/Developer",
)


@dataclass(frozen=True)
class MigrationResult:
    source_path: str
    destination_path: str
    referencer_path: str
    status: str


def _parent_folder(package_name: str) -> str:
    return package_name.rsplit("/", 1)[0]


def _is_ignored_referencer(package_name: str) -> bool:
    return any(
        package_name == root_path or package_name.startswith(f"{root_path}/")
        for root_path in IGNORED_REFERENCER_ROOTS
    )


def _eligible_referencers(report: AssetReport) -> Tuple[ExternalReference, ...]:
    return tuple(
        referencer for referencer in report.referenced_by if not _is_ignored_referencer(referencer.package_name)
    )


def _destination_path(report: AssetReport, first_referencer: ExternalReference) -> str:
    return f"{_parent_folder(first_referencer.package_name)}/{MIGRATED_FOLDER_NAME}/{report.name}"


def _migrate_report(report: AssetReport, first_referencer: ExternalReference) -> MigrationResult:
    destination_path = _destination_path(report, first_referencer)
    destination_folder = _parent_folder(destination_path)

    if unreal.EditorAssetLibrary.does_asset_exist(destination_path):
        return MigrationResult(
            source_path=report.package_name,
            destination_path=destination_path,
            referencer_path=first_referencer.package_name,
            status="skipped: destination asset already exists",
        )

    if not unreal.EditorAssetLibrary.does_directory_exist(destination_folder):
        unreal.EditorAssetLibrary.make_directory(destination_folder)

    if unreal.EditorAssetLibrary.rename_asset(report.package_name, destination_path):
        return MigrationResult(
            source_path=report.package_name,
            destination_path=destination_path,
            referencer_path=first_referencer.package_name,
            status="moved",
        )

    return MigrationResult(
        source_path=report.package_name,
        destination_path=destination_path,
        referencer_path=first_referencer.package_name,
        status="failed: Unreal could not move the asset",
    )


def _format_results(root_path: str, results: Sequence[MigrationResult], ignored_only_count: int) -> str:
    moved = sum(result.status == "moved" for result in results)
    skipped = sum(result.status.startswith("skipped:") for result in results)
    failed = len(results) - moved - skipped
    lines = [
        f"Folder: {root_path}",
        f"Assets with non-ignored external referencers: {len(results)}",
        f"Ignored because all external referencers are under ignored roots: {ignored_only_count}",
        f"Moved: {moved}; Skipped: {skipped}; Failed: {failed}",
        "",
    ]
    if not results:
        lines.append("No assets with non-ignored external referencers were found.")
        return "\n".join(lines)
    for result in results:
        lines.append(
            f"{result.status}: {result.source_path} -> {result.destination_path}; "
            f"first referencer: {result.referencer_path}"
        )
    return "\n".join(lines)


def run() -> None:
    try:
        root_path, reports = _scan(MODE_REFERENCED_BY)
        results: List[MigrationResult] = []
        ignored_only_count = 0
        with unreal.ScopedSlowTask(len(reports), "Moving externally referenced assets...") as task:
            task.make_dialog(True)
            for report in reports:
                if task.should_cancel():
                    _warn("Migration cancelled by user. Reporting completed moves.")
                    break
                task.enter_progress_frame(1, report.package_name)
                eligible_referencers = _eligible_referencers(report)
                if not eligible_referencers:
                    ignored_only_count += 1
                    _log(f"ignored: {report.package_name}; all external referencers are under ignored roots")
                    continue
                first_referencer = eligible_referencers[0]
                try:
                    result = _migrate_report(report, first_referencer)
                except Exception as exc:
                    result = MigrationResult(
                        source_path=report.package_name,
                        destination_path=_destination_path(report, first_referencer),
                        referencer_path=first_referencer.package_name,
                        status=f"failed: {exc}",
                    )
                results.append(result)
                _log(
                    f"{result.status}: {result.source_path} -> {result.destination_path}; "
                    f"first referencer: {result.referencer_path}"
                )
        _show_message("Folder Reference Migration", _format_results(root_path, results, ignored_only_count))
    except Exception as exc:
        _show_message("Folder Reference Migration Error", str(exc))
        raise


run()
