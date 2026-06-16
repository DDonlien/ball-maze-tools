# Ball Maze Tools

Ball Maze Tools 是为 Ball Maze / 迷宫球项目准备的一组开发辅助工具。仓库按主要运行环境分组：`web/` 放浏览器/Vite 工具，`ue/` 放 Unreal Editor Python 工具，`blender/` 放 Blender Python 工具。

## Tools

| Tool | Runtime | Purpose | Entry |
|---|---|---|---|
| Maze Builder | Web / Vite | 生成、预览、导出 3D 轨道迷宫布局 | [`web/web-maze-builder/README.md`](web/web-maze-builder/README.md) |
| Hermite Spline Generator | Web / Vite | Hermite 曲线编辑、预览和 CSV 导出 | [`web/web-hermite-spline-generator/README.md`](web/web-hermite-spline-generator/README.md) |
| JSON Rail Exporter | Unreal Editor Python | 从 UE 关卡导出 rail JSON | [`ue/ue-json-rail-exporter/README.md`](ue/ue-json-rail-exporter/README.md) |
| JSON Rail Importer | Unreal Editor Python | 将 maze JSON 导入 UE 关卡 | [`ue/ue-json-rail-importer/README.md`](ue/ue-json-rail-importer/README.md) |
| Rail Content Checker | Unreal Editor Python | 检查 `rail_config.csv` 声明的 BP 是否在 Content Browser 对应位置，报告 missing/misplaced | [`ue/ue-rail-content-checker/README.md`](ue/ue-rail-content-checker/README.md) |
| Asset Pivot Editor | Unreal Editor Python | 批量烘焙 Static Mesh Pivot | [`ue/ue-asset-pivot-editor/README.md`](ue/ue-asset-pivot-editor/README.md) |
| Material Instance Creator | Unreal Editor Python | 在当前 Content Browser 路径按选中 Material 批量创建材质实例 | [`ue/ue-material-instance-creator/README.md`](ue/ue-material-instance-creator/README.md) |
| Selected Static Mesh Arranger | Unreal Editor Python | 按脚本配置的方向和间隔排列关卡中选中的 Static Mesh Actor | [`ue/ue-selected-static-mesh-arranger/README.md`](ue/ue-selected-static-mesh-arranger/README.md) |
| Texture Assigner | Unreal Editor Python | 按命名规范自动绑定贴图、材质实例和 Static Mesh | [`ue/ue-texture-assigner/README.md`](ue/ue-texture-assigner/README.md) |
| Folder Reference Checker | Unreal Editor Python | 检查选中 Content Browser 文件夹内资产与外部资产之间的引用关系，并导出 CSV | [`ue/ue-folder-reference-checker/README.md`](ue/ue-folder-reference-checker/README.md) |
| Voxel Ball Shatter | Blender Python | 将选中 Mesh 转为体素小方块集合 | [`blender/blender-voxel-ball-shatter/README.md`](blender/blender-voxel-ball-shatter/README.md) |

## Repository Docs

- [`AGENTS.md`](AGENTS.md): 全仓库通用协作规则。
- [`REQUIREMENTS.md`](REQUIREMENTS.md): 全仓库需求与验收追踪。
- [`DESIGN.md`](DESIGN.md): 全仓库视觉规范入口。
- [`agent-log/`](agent-log/): 全仓库执行日志。
- 工具目录下的 `README.md`: 该工具的用途、运行方式和关键配置。
- 工具目录下的 `AGENTS.md`: 该工具的局部实现规则和文档入口。
- 工具目录下的 `REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/`: 该工具的需求、视觉说明和执行日志。
- 历史进度或状态快照归档到对应的 `agent-log/`。
- [`agent-template/`](agent-template/): 文档规范模板；已移除嵌套 Git 元数据，可供后续工具复用。

## Environment

- Node.js / npm for `web/` Vite tools.
- Unreal Engine 5 with `Python Editor Script Plugin` and `Editor Scripting Utilities` enabled for `ue/` tools.
- Blender with Python API access for `blender/` tools.
- Python 3.8+ only for legacy standalone scripts where noted.

## Quick Start

```bash
cd web/web-maze-builder
npm install
npm run dev
```

```bash
cd web/web-hermite-spline-generator
npm install
npm run dev
```

UE scripts must be run inside Unreal Editor Python. Blender scripts must be run inside Blender Python.
