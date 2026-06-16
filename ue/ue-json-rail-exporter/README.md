# JSON Rail Exporter

Exports rail actors from the current Unreal Engine level to Maze Builder-compatible JSON.

## What It Does

- Finds maze-related actors in the current level:
  - `BP_Maze`
  - `BP_MazeBoundary`
  - `BP_MazeBottom`
  - `BP_Rail`
- Detects actors by Blueprint class/type prefix rather than actor label.
- Extracts rail ID, relative position, rotation, logical grid position, size, and scene metadata.
- Writes JSON to `web/web-maze-builder/exported_level_rails.json` by default.

## Run

Run inside Unreal Editor Python:

```python
exec(open(r"/path/to/ball-maze-tools/ue/ue-json-rail-exporter/export_level_rails_to_json.py", encoding="utf-8").read())
```

This script cannot run in normal system Python because it imports `unreal`.

## Key Config

Edit the top of `export_level_rails_to_json.py` when needed:

- `DEFAULT_OUTPUT_JSON`: export target path.
- `GRID_TO_WORLD`: logical grid to UE world-unit scale.
- `CLASS_PREFIX_*`: actor class prefixes used for detection.
- `RAIL_ID_PROPERTY_NAMES`: property fallback order for reading a rail row name.

## Notes

Rail IDs are resolved from editor properties, tags, actor labels, or class names. Keep rail Blueprint/class naming aligned with Maze Builder `rail_config.csv` row names whenever possible.
