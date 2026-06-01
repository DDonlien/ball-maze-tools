"""Run the folder reference checker in external-dependencies-only mode."""

from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from folder_reference_checker import MODE_REFERENCING, run

run(MODE_REFERENCING)
