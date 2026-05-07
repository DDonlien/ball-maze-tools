# Progress

Last updated: 2026-05-07

## Scope

Current work has focused on `maze-builder`, especially the TypeScript/Vite generator and viewer.

## Completed

### Generator UI

- Added configurable checkpoint count.
- Added configurable max self-spin count.
- Added collapsible panels for Generator, Stats, Rail Detail, and Generation Log.
- Made the left sidebar scroll when content is taller than the viewport.
- Replaced the large log expand/collapse button with a small arrow toggle.
- Added hover explanations for Generator labels.
- Added click-to-lock Rail Detail:
  - Hover shows rail details.
  - Click keeps details visible.
  - Click empty space clears selection.
  - Viewer highlight remains locked while selected.
- Updated viewer number sprites to use a JetBrains Mono first font stack.

### Checkpoint Logic

- Checkpoint count is configurable with minimum 0.
- When checkpoint count is greater than 0, generator tracks segment difficulty.
- On checkpoint threshold, generator backtracks one rail and attempts to place a fork rail with at least two exits.
- One fork exit places checkpoint, another can continue maze generation.
- Stats and `MapMeta` now include segment difficulties.

### Self-Spin Logic

- Added `maxSpins` generator option.
- Default `maxSpins` is 0.
- Non-zero `spinRot` is disallowed by default.
- Generator tracks `SpinCount`.
- Backtracking and rollback deduct consumed spin count.
- Stats and `MapMeta` now include `SpinCount` and `MaxSpins`.

### Seed Logic

- Seed is now a complete generation configuration, not only random entropy.
- Current format:

```text
bm01-random-difficulty-checkpoints-spins-bounds
```

- All seed fields are lowercase base36.
- Current generated seed example:

```text
bm01-0d2wnk-0o-03-00-0d0905
```

- Inputting a valid seed updates Generator controls and regenerates.
- Random seed button generates a full random seed/configuration.
- Generate button keeps current configuration but changes the random part.
- Legacy `BM1-...` parsing is still accepted, but new seeds use `bm01-...`.

### Rail Detail

- Rail Detail now includes:
  - Rail ID
  - Rail type
  - Rev position
  - Abs position
  - Rotation
  - Rail difficulty
  - Cumulative total difficulty
  - Segment difficulty

### Direction and Footprint Work

- Added known asset overrides:
  - `BP_Curve_L90_X4_Y4_Z1_Rail`
  - `BP_Curve_L90_Borderless_O_X2_Y2_Z1_Rail`
  - `BP_Curve_R90_X3_Y3_Z1_Rail`
- Reworked export direction so `Exit_Dir_Abs` is derived from `Exit_Rot_Abs`, not from position offset.
- Reworked placement footprint calculation toward the correct model:
  - Generate local footprint first.
  - Rotate local footprint with full `Rot_Abs`.
  - Translate by `Pos_Rev`.
- Added `calculateLocalOccupiedCells`.
- Added `calculateOccupiedCellsWithRotAbs`.
- `placeRailV2` now uses `calculateOccupiedCellsWithRotAbs` for collision and bounds.

### Documentation

- Updated `README.md` Maze Builder section with seed format and `SeededRandom` reproduction notes.
- Added `REQUIREMENT.md` to describe implementation requirements and coordinate/rotation rules.

## Verification

Latest successful checks:

```bash
cd /Users/taobe/Documents/GitHub/ball-maze-tools/maze-builder
npm test
npm run build
```

Current test count: 16 passing tests.

## Important Context

The user repeatedly found direction/connection bugs in L90/R90/U90/D90 rails. The root cause was not individual bad arrows alone; it was mixed transform logic:

- footprint used old `rotIdx + rollIdx`;
- exit position used `Rot_Abs`;
- exit direction was sometimes inferred from offset.

The intended invariant is:

```text
local config -> full Rot_Abs transform -> world logical result
```

Everything should use `Pos_Rev + Rot_Abs` as the single authoritative rail pose.

## Known Risks / Next Work

- Some legacy tests still use `calculateOccupiedCells`, which now delegates to `calculateOccupiedCellsWithRotAbs`.
- The local footprint rules are still name-pattern based. If asset naming does not fully describe real footprint, explicit footprint data should be added to CSV/config.
- Asset-level overrides should be treated as temporary. Long term, CSV should encode true footprint side/shape explicitly.
- The viewer only draws proxy boxes, not real mesh geometry. Visual disagreements with UE meshes may still happen if local footprint data is inaccurate.
- If another direction bug appears, do not patch arrows first. Check:
  1. local footprint,
  2. `Rot_Abs`,
  3. transformed occupied cells,
  4. `Exit_Pos_Rev`,
  5. `Exit_Rot_Abs`,
  6. `Exit_Dir_Abs`.

