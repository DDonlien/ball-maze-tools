# 执行日志

## 用户原始 Prompt

```text
创建一个新的tool，python 脚本 ue里使用，我会在level里选中一些资产（static mesh）你需要帮我把他们按照一定间隔、沿着一定方向布置，起点就是资产中第一个所在的位置；我会在脚本里设置间隔和方向；然后把progress删除，内容移动到标准化的agent-log里；然后用agent-template检察一下仓库的初始化状态是不是ok
```

## 迁移来源

- `PROGRESS.md`

## 迁移内容

### Scope

This repository is organized as a small suite of independent tools. Directory prefixes identify the primary runtime: `web-*`, `ue-*`, and `blender-*`. Active engineering work had been concentrated in `web-maze-builder`.

### Tool Status

- `web-maze-builder`: Active. TypeScript/Vite generator and viewer are the current authoritative Maze Builder path.
- `web-hermite-spline-generator`: Usable. Vite web tool for Hermite curve parameter editing and CSV export.
- `ue-json-rail-exporter`: Usable. Exports rail and environment helper actors from the current UE level to Maze Builder-compatible JSON.
- `ue-json-rail-importer`: Usable. Imports Maze Builder JSON into UE and can fall back from Blueprint references to Static Mesh references.
- `ue-rail-content-checker`: New / Usable. Checks `rail_config.csv` Blueprint assets against expected Content Browser locations and reports missing or misplaced assets.
- `ue-asset-pivot-editor`: Usable. Bakes Static Mesh Pivot changes and can compensate selected level actors.
- `ue-material-instance-creator`: New / Usable. Creates Material Instances in the active Content Browser path from selected Materials using a fixed parent Material reference.
- `ue-texture-assigner`: Usable. Scans UE assets by naming convention and assigns Texture -> MI -> Static Mesh.
- `ue-folder-reference-checker`: New / Usable. Checks references crossing the boundary of a selected Content Browser folder and exports a CSV report.
- `blender-voxel-ball-shatter`: New / Usable. Blender script that converts selected mesh objects into voxel cube collections.

### Repository Roadmap

- Keep root docs limited to cross-tool orientation.
- Keep tool-specific usage, progress, and implementation rules inside the matching tool directory.
- Preserve runtime prefixes in new tool directories so usage context remains obvious.
- Prefer explicit config metadata over name-pattern inference where a tool currently depends on asset naming.
- Keep Unreal scripts runnable inside Unreal Editor Python without requiring normal system Python execution.
- Keep Blender scripts runnable inside Blender Python without requiring normal system Python execution.
- Maintain root and per-tool `AGENTS.md`, `README.md`, `REQUIREMENTS.md`, `DESIGN.md`, and `agent-log/` entries according to `agent-template/`.

### Verification

For active Maze Builder work:

```bash
cd web/web-maze-builder
npm test
npm run build
```

## 备注

This archive preserves the removed root progress file in the standardized `agent-log/` location.
