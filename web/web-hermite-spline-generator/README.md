# Hermite Spline Generator

Vite web tool for editing Hermite spline inputs, previewing generated curves, and exporting CSV.

## What It Does

- Provides ARC mode for radius/angle based curve groups.
- Provides VEC mode for editing point/tangent rows directly.
- Imports parameter/reference CSV files.
- Exports generated CSV results.
- Renders curves in a browser canvas.
- Supports undo/redo style navigation through edit history.

## Run

```bash
cd /path/to/ball-maze-tools/web/web-hermite-spline-generator
npm install
npm run dev
```

The dev server uses port `43188`.

## Build

```bash
cd /path/to/ball-maze-tools/web/web-hermite-spline-generator
npm run build
```

## Key Files

- `src/main.ts`: UI, interaction state, import/export wiring.
- `src/hermite/math.ts`: Hermite generation and fitting math.
- `src/hermite/csv.ts`: CSV import/export helpers.
- `src/hermite/renderer.ts`: canvas renderer.
- `src/styles/main.css`: app styling.

## Notes

This tool has fully moved to the browser-based workflow. Any older Python fitting flow should be treated as historical unless reintroduced intentionally.
