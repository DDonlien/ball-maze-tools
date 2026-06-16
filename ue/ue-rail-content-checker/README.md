# Rail Content Checker

Unreal Editor Python script for checking whether every Blueprint declared by
`web/web-maze-builder/rail_config.csv` exists in the expected Content Browser
location.

## Usage

Run inside Unreal Editor Python:

```python
exec(open(r"C:\path\to\ball-maze-tools\ue\ue-rail-content-checker\check_rail_content.py", encoding="utf-8").read())
```

The script logs the report and shows it in an Unreal message dialog when the
editor API is available.

## Output

The report starts with:

```text
A/B
Content Missing = C
Content Missplaced = D
```

- `A`: BP assets found at the expected Content Browser location.
- `B`: total BP row count in `rail_config.csv`.
- `C`: BP assets not found at the expected location and not found elsewhere
  under `Real` folders.
- `D`: BP assets not found at the expected location but found under a `Real`
  folder in a different location.

Missing BP names are listed under `Content Missing`. Misplaced BP names include
their actual Content Browser paths and expected paths.

## Path Rules

The current CSV declares proxy mesh paths. The checker derives expected BP paths
by replacing the mesh `Proxy` folder with the sibling `Real` folder and using the
CSV row name as the BP asset name:

```text
/Game/.../Proxy/SM_Name -> /Game/.../Real/BP_Name
```

If your project uses a different root or folder casing, edit these constants at
the top of `check_rail_content.py`:

```python
EXPECTED_BP_FOLDER_NAME = "Real"
REAL_SEARCH_ROOTS = ("/Game/Item/Rail",)
REAL_FOLDER_NAME = "Real"
```
