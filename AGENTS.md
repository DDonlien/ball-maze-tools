# Agent Notes

This file records repository-level rules for agents working in `ball-maze-tools`.

## General Rules

- Prefer reading existing code before editing.
- Keep changes scoped to the requested tool or module.
- Do not revert unrelated user changes.
- Use `rg` for searching.
- Use `apply_patch` for manual edits.

## Git Workflow

- Before starting each task, run `git pull`.
- If `git pull` fails or reports a conflict, stop and tell the user before continuing.
- After finishing a task successfully, commit and push the agent's changes.
- Use a commit message that summarizes the actual updates made in that task; do not use a fixed or generic message by default.
- If commit or push fails, stop and tell the user before continuing.
- Do not include unrelated user changes in the commit unless the user explicitly asks for that.

## Documentation Layout

- Root `README.md`: user-facing overview of the whole tool suite.
- Root `REQUIREMENTS.md`: cross-repository requirements and acceptance tracking.
- Root `DESIGN.md`: shared visual guidance; use `不适用` for tools without custom UI.
- Root `agent-log/`: repository-level execution logs.
- Root `AGENTS.md`: general rules that apply to every tool.
- Tool `README.md`: user-facing usage and configuration for one tool.
- Tool `AGENTS.md`: tool-specific implementation rules and local document entry points.
- Tool `REQUIREMENTS.md`: tool-specific requirements and acceptance tracking.
- Tool `DESIGN.md`: tool-specific visual guidance or a note that it is not applicable.
- Tool `agent-log/`: tool-specific execution logs.
- Historical progress or status snapshots belong in the matching `agent-log/`.

Use `agent-template/AGENTS.md` as the authoritative documentation-maintenance
template. Keep the checked-in `agent-template/` free of nested Git metadata.

## Tool-Specific Rules

Read a tool's local docs before editing it:

- `blender/blender-voxel-ball-shatter/AGENTS.md`
- `ue/ue-asset-pivot-editor/AGENTS.md`
- `ue/ue-folder-reference-checker/AGENTS.md`
- `ue/ue-json-rail-exporter/AGENTS.md`
- `ue/ue-json-rail-importer/AGENTS.md`
- `ue/ue-material-instance-creator/AGENTS.md`
- `ue/ue-rail-content-checker/AGENTS.md`
- `ue/ue-selected-static-mesh-arranger/AGENTS.md`
- `ue/ue-texture-assigner/AGENTS.md`
- `web/web-hermite-spline-generator/AGENTS.md`
- `web/web-maze-builder/AGENTS.md` contains the authoritative Maze Builder generation, coordinate, footprint, exit, seed, checkpoint, and self-spin rules.

For `web-maze-builder`, always run:

```bash
cd web/web-maze-builder
npm test
npm run build
```

Prefer relative paths (for example, `cd web/web-maze-builder`) so instructions work across different machines.
