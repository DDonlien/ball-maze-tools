# Agent Notes

This file records project-specific rules for future agents working in this repository.

## General Rules

- Prefer reading existing code before editing.
- Keep changes scoped to the requested tool or module.
- Do not revert unrelated user changes.
- Use `rg` for searching.
- Use `apply_patch` for manual edits.
- For `maze-builder`, always run:

```bash
cd /Users/taobe/Documents/GitHub/ball-maze-tools/maze-builder
npm test
npm run build
```

## Documentation Roles

- `README.md`: user-facing overview, what the tools are, how to run them.
- `REQUIREMENT.md`: implementation rules, coordinate system, generation requirements.
- `PROGRESS.md`: current work status and known risks.
- `AGENTS.md`: rules for future coding agents.

## Maze Builder Core Invariant

For every placed rail, `Pos_Rev + Rot_Abs` is the single authoritative pose.

Do not mix separate transform systems for footprint, exit position, and exit direction.

Correct pipeline:

```text
CSV local data -> local footprint/exits -> transform by Rail Rot_Abs -> add Pos_Rev
```

## Rail Coordinate Rules

- CSV/config data is local-space data.
- `Size_Rev` describes local bounds.
- Direction names such as `L90`, `R90`, `U90`, `D90` describe local footprint expansion.
- `Exit_Array` contains local exit position and local exit rotation.
- World logical occupied cells are computed by rotating local occupied cells by `Rot_Abs`, then adding `Pos_Rev`.

## Footprint Rules

Generate footprint in local coordinates first.

Examples:

- Forward rail: expands along local `+X`.
- `L90` / `R90`: expands in local `Y`.
- `U90` / `D90`: expands in local `Z`.
- `T` / `CR`: can expand to both left and right.

For a common `U90 X3 Y1 Z3` asset, local occupied cells are a 3 by 3 shape on the `x-z` plane:

```text
000, 100, 200
001, 101, 201
002, 102, 202
```

Each three-digit token means `(x, y, z)`, e.g. `102` means `(1, 0, 2)`.

## Exit Rules

Exit calculations must follow:

```text
Exit_Pos_Rev = Pos_Rev + RotateByRotAbs(Exit_Local_Pos, Rail_Rot_Abs)
Exit_Rot_Abs = Rail_Rot_Abs + Exit_Local_Rot
Exit_Dir_Abs = forward direction derived from Exit_Rot_Abs
```

Never derive `Exit_Dir_Abs` from `Exit_Pos_Rev - Pos_Rev`.

Reason: curve exit position and exit direction are not the same concept. With Pitch/Roll/Yaw, a R90/L90 curve can have a position offset on another axis while still facing a horizontal direction.

## Placement Rules

When placing a child rail:

- Use parent exit position as child `Pos_Rev`.
- Use parent exit rotation as the base child `Rot_Abs`.
- Apply self-spin only if allowed by `maxSpins`.
- Collision and bounds must use the child footprint transformed by full child `Rot_Abs`.

## Self-Spin Rules

- Default `maxSpins` is 0.
- Non-zero `spinRot` is forbidden unless `usedSpinCount < maxSpins`.
- Rollback/backtracking must decrement spin count for removed non-zero-spin rails.

## Checkpoint Rules

- Checkpoint count minimum is 0.
- For target difficulty `a` and checkpoint count `n`, when `n > 0`, checkpoint threshold is `a / n`.
- When threshold is exceeded:
  - backtrack one rail,
  - place a fork rail with at least two exits,
  - place checkpoint on one exit,
  - leave another exit for continuing generation.
- Track segment difficulties in `MapMeta.SegmentDiffs`.

## Seed Rules

Current generated seed format:

```text
bm01-random-difficulty-checkpoints-spins-bounds
```

All fields are lowercase base36.

Field widths:

- `bm01`: version, 4 chars.
- `random`: 6 chars.
- `difficulty`: 2 chars.
- `checkpoints`: 2 chars.
- `spins`: 2 chars.
- `bounds`: 6 chars, `xx yy zz` packed together.

Example:

```text
bm01-0d2wnk-0o-03-00-0d0905
```

Means:

```text
random = parseInt("0d2wnk", 36)
difficulty = parseInt("0o", 36)
checkpoints = parseInt("03", 36)
spins = parseInt("00", 36)
bounds = 13 / 9 / 5
```

`random` initializes `SeededRandom`; it is not the layout itself.

`SeededRandom` uses:

```ts
state = seed >>> 0
state = (1664525 * state + 1013904223) >>> 0
value = state / 0x100000000
```

To reproduce a maze, seed, config, generator code, and random call order must match.

## Known Asset Overrides

Current asset-specific footprint/exit overrides exist for:

- `BP_Curve_L90_X4_Y4_Z1_Rail`
- `BP_Curve_L90_Borderless_O_X2_Y2_Z1_Rail`
- `BP_Curve_R90_X3_Y3_Z1_Rail`

Treat these as temporary compatibility patches. Prefer explicit CSV/config footprint metadata in the long term.

## Debugging Direction Bugs

If a rail direction/connection bug appears, inspect in this order:

1. CSV local exit data.
2. Local footprint generation.
3. Rail `Rot_Abs`.
4. Occupied cells after full `Rot_Abs`.
5. `Exit_Pos_Rev`.
6. `Exit_Rot_Abs`.
7. `Exit_Dir_Abs`.
8. Viewer mapping from `Exit_Dir_Abs` to Three.js vector.

Do not fix by changing only viewer arrows unless the exported JSON is already correct.

