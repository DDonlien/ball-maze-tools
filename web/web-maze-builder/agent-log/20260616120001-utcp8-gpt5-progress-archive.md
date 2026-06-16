# 执行日志

## 用户原始 Prompt

```text
创建一个新的tool，python 脚本 ue里使用，我会在level里选中一些资产（static mesh）你需要帮我把他们按照一定间隔、沿着一定方向布置，起点就是资产中第一个所在的位置；我会在脚本里设置间隔和方向；然后把progress删除，内容移动到标准化的agent-log里；然后用agent-template检察一下仓库的初始化状态是不是ok
```

## 迁移来源

- `web/web-maze-builder/PROGRESS.md`

## 迁移内容

### Scope

Current work focuses on the TypeScript/Vite generator and viewer in `src/`. The main risk area is rail direction/connection correctness for L90/R90/U90/D90 rails under combined Pitch/Roll/Yaw transforms.

### Completed

- Added configurable checkpoint count.
- Added configurable max self-spin count.
- Added collapsible Generator, Stats, Rail Detail, and Generation Log panels.
- Made the left sidebar scroll when content exceeds viewport height.
- Replaced the large log expand/collapse button with a small arrow toggle.
- Added hover explanations for Generator labels.
- Added click-to-lock Rail Detail.
- Updated viewer number sprites to use a JetBrains Mono first font stack.
- Updated Rail Library grouping to parse RowName segments as part, direction, descriptor, and size.
- Implemented checkpoint threshold, fork placement, forced retry, stats, and `MapMeta` segment difficulty tracking.
- Implemented `maxSpins`, spin rollback accounting, and spin metadata.
- Reworked seeds into `bm02-random-difficulty-rails-checkpoints-spins-bounds`.
- Added target rail count guidance and average target difficulty reporting.
- Updated default `rail_config.csv` to normalized config fields including `OccupiedCells`, `Exits`, `RailClassRef`, and `SpinConfig`.
- Added parser support for normalized local occupation, exits, spin config, and explicit config geometry.
- Reworked export direction so `Exit_Dir_Abs` derives from `Exit_Rot_Abs`.
- Exported JSON rotations now use UE transform order `x/y/z = Roll/Pitch/Yaw`.
- Reworked placement footprint calculation to generate local footprint, rotate by full `Rot_Abs`, then translate by `Pos_Rev`.
- Added `calculateLocalOccupiedCells` and `calculateOccupiedCellsWithRotAbs`.
- `placeRailV2` uses config-aware occupied cells for collision and bounds.
- Removed the incorrect `BP_Curve_R90_X3_Y3_Z1_Rail` footprint override.
- Split repository docs so Maze Builder has its own `README.md`, `AGENTS.md`, and progress archive.

### Important Context

Direction/connection bugs were caused by mixed transform logic: footprint used old `rotIdx + rollIdx`, exit position used `Rot_Abs`, and exit direction was sometimes inferred from offset.

The intended invariant is:

```text
local config -> full Rot_Abs transform -> world logical result
```

Everything should use `Pos_Rev + Rot_Abs` as the single authoritative rail pose.

### Known Risks / Next Work

- Some legacy tests still cover name-pattern fallback through `calculateOccupiedCells`.
- Name-pattern footprint rules and asset-level overrides are fallback behavior for old configs only.
- The viewer draws proxy boxes, not real mesh geometry.
- Visual disagreements with UE meshes may still happen if local footprint data is inaccurate.

### Verification

Latest known required checks:

```bash
cd web/web-maze-builder
npm test
npm run build
```

Latest checked status from the archived file: 26 passing tests.

## 备注

This archive preserves the removed Maze Builder progress file in the standardized tool `agent-log/` location.
