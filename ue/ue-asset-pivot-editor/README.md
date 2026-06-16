# Asset Pivot Editor

Unreal Editor Python script for baking Static Mesh Pivot changes directly in UE.

## What It Does

- Reads selected level actors.
- Finds their Static Mesh assets.
- Moves mesh vertices so the asset Pivot matches a selected target.
- Optionally compensates selected actors so their visible world position stays unchanged.
- Optionally saves modified Static Mesh assets.

## Run

1. Select target actors in the Unreal level.
2. Pick one of the preset scripts or configure `TARGET_PIVOT_POSITION` manually.
3. Run inside Unreal Editor Python:

```python
exec(open(r"/path/to/ball-maze-tools/ue/ue-asset-pivot-editor/pivot_set_buttom.py", encoding="utf-8").read())
```

This script cannot run in normal system Python because it imports `unreal`.

## Pivot Targets

`TARGET_PIVOT_POSITION` values:

| Value | Target |
|---|---|
| `0` | bottom |
| `1` | center |
| `2` | top |
| `3` | left |
| `4` | right |
| `5` | back |
| `6` | front |
| `7` | world origin |

## Key Config

- `pivot_set_buttom.py`: preset for bottom Pivot. The filename keeps the current project spelling.
- `pivot_set_center.py`: preset for center Pivot.
- `pivot_set_top.py`: preset for top Pivot.
- `COMPENSATE_SELECTED_ACTORS`: moves selected actors after baking the mesh so they stay visually in place.
- `SAVE_MODIFIED_ASSETS`: saves modified Static Mesh assets.

## Notes

Baking a Static Mesh Pivot changes the asset itself, so every instance of that mesh is affected. Actor compensation only applies to currently selected actors.
