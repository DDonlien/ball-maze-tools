# Selected Static Mesh Arranger

Unreal Editor Python script for arranging selected Static Mesh actors in the current level.

## What It Does

- Reads the current level actor selection.
- Keeps actors that have a valid `StaticMeshComponent` with a Static Mesh asset.
- Uses the first valid selected Static Mesh actor as the anchor.
- Moves each valid selected actor to `anchor + normalized direction * spacing * index`.
- Skips non-Static Mesh actors and reports them in the Unreal log.

The script moves level actors only. It does not edit Static Mesh assets, pivots, materials, or Content Browser assets.

## Run

1. In the Unreal level viewport or World Outliner, select the Static Mesh actors to arrange.
2. Edit the config values at the top of `arrange_selected_static_mesh_actors.py`.
3. Run inside Unreal Editor Python:

```python
exec(open(r"/path/to/ball-maze-tools/ue/ue-selected-static-mesh-arranger/arrange_selected_static_mesh_actors.py", encoding="utf-8").read())
```

This script cannot run in normal system Python because it imports `unreal`.

## Key Config

- `SPACING`: center-to-center spacing in Unreal units.
- `DIRECTION`: world-space arrangement direction. The script normalizes this vector.
- `RESTORE_SELECTION`: restores the original selection after arranging.
- `DRY_RUN`: prints target positions without moving actors.

## Notes

Unreal selection order is used as returned by the editor API. If exact order matters, select actors in the intended order immediately before running the script.
