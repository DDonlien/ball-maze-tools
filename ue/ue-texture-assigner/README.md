# Texture Assigner

Unreal Editor Python script for assigning textures, material instances, and static meshes by naming convention.

## What It Does

For each `StaticMesh` under the chosen root path:

1. Derives a base name by removing `SM_`.
2. Searches a sibling `Material` folder for `MI_<base>` or `MI_<base>_Color`.
3. Searches a sibling `Texture` folder for `T_<base>` or `T_<base>_Color`.
4. Assigns the texture to the material instance parameter.
5. Assigns the material instance to Static Mesh slot 0.
6. Logs modified assets that need saving.

## Run

Select a Content Browser folder or asset, then run inside Unreal Editor Python:

```python
exec(open(r"/path/to/ball-maze-tools/ue/ue-texture-assigner/texture_assigner.py", encoding="utf-8").read())
```

This script cannot run in normal system Python because it imports `unreal`.

## Key Config

Edit the top of `texture_assigner.py` when needed:

- `DEFAULT_ROOT_PATH`: fallback scan path.
- `PREFIX_SM`: Static Mesh prefix.
- `PREFIX_MI`: Material Instance prefix.
- `PREFIX_T`: Texture prefix.
- `TEXTURE_PARAM_NAME`: material parameter to receive the texture.

## Expected Folder Shape

```text
SomeAssetFolder/
├─ SM_Example
├─ Material/
│  └─ MI_Example
└─ Texture/
   └─ T_Example
```

## Notes

The script updates material instances and static meshes, then logs dirty assets. Save them in the Content Browser after reviewing the result.
