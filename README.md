# Ball Maze (迷宫球) 工具集

这是为游戏 Ball Maze（迷宫球）准备的一系列便捷开发与程序化内容生成 (PCG) 工具套件。涵盖了迷宫生成、UE关卡互导、美术资产自动化处理以及样条曲线计算等多个环节，极大地提高了开发与迭代效率。

## 📁 包含工具概览

- **Maze Builder (迷宫生成与可视化)**: 核心PCG生成器，支持难度驱动的 3D 轨道迷宫生成，JSON 文件导入导出，并带 Web H5 预览。
- **JSON Rail Exporter (关卡导出器)**: UE 关卡导出 JSON，方便保存手工拼装的迷宫。
- **JSON Rail Importer (关卡导入器)**: 读取 JSON，自动在 UE 关卡中生成和组装迷宫。
- **Asset Pivot Editor (资产原点编辑器)**: 批量修改 UE Static Mesh 资源的 Pivot 坐标。
- **Texture Assigner (材质自动分配器)**: 自动将贴图、材质实例与静态网格体互相绑定。
- **Hermite Spline Generator (Hermite 曲线生成器)**: 用于平滑轨道与曲线计算的 Web 可视化编辑器。

---

## 🛠️ 工具详情

### 1. Maze Builder (迷宫生成与可视化)
**功能与开发简介**: 
核心的程序化内容生成 (PCG) 工具，负责读取轨道配置表（`rail_config.csv`），基于“难度驱动的生长算法”，自动构建无穿插、逻辑严密的 3D 轨道迷宫布局，并提供一个基于 TypeScript/Vite 和 Three.js 的前端页面用于快速可视化预览（无需打开引擎）。
**使用方法**: 
- **生成**: 在项目根目录下运行 `python maze-builder/maze_generator.py`，会生成 `maze_layout.json`。
- **可视化**: 运行 `cd maze-builder && npm install && npm run dev` 启动新版前端工具，或直接用浏览器打开 `maze_viewer.html` 拖入 JSON。
- **Web 版 Seed 规则**: 新版前端的 seed 是完整生成配置编码，格式为 `bm01-random-difficulty-checkpoints-spins-bounds`。所有字段均使用小写 base36（数字 + 英文字母），并用 `-` 分割。
  - `bm01`: seed 格式版本。
  - `random`: 6 位随机性字段，用于初始化确定性随机数生成器。
  - `difficulty`: 2 位目标总难度。
  - `checkpoints`: 2 位 checkpoint 数量。
  - `spins`: 2 位允许非 0 自旋的最大次数。
  - `bounds`: 6 位边界尺寸，按 `xx yy zz` 各 2 位拼接，例如 `0d0905` 表示 `13 / 9 / 5`。
  - 示例: `bm01-0d2wnk-0o-03-00-0d0905` 表示 `random=790943075`、`difficulty=24`、`checkpoints=3`、`spins=0`、`bounds=13/9/5`。
- **Seed 复现机制**: `random` 字段不是布局本身，而是 `SeededRandom` 的初始状态。生成器内部使用线性同余随机数推进状态：`state = (1664525 * state + 1013904223) >>> 0`。同一个 seed 会让 Start Rail、起点位置、开放连接点选择、候选轨道选择等随机决策按同样顺序重放。要严格复现迷宫，需要同时保持 seed、`rail_config.csv`、生成器代码版本一致。
**最近更新**: 
优化了生长逻辑，移除了由于浮点数产生的对齐问题，全量升级为整数逻辑坐标。重构了基于 Vite 的前端可视化工具，提升了预览性能和交互体验。

### 2. JSON Rail Exporter (关卡导出器)
**功能与开发简介**: 
UE (Unreal Engine) 编辑器内的自动化 Python 脚本。它能够遍历当前关卡中的 `BP_Rail` 实例，将其相对世界坐标、旋转和零件ID等逻辑信息提取并导出为符合 Maze Builder 标准的 JSON 文件。常用于把手工在 UE 内调整后的迷宫布局转化为数据格式。
**使用方法**: 
在 UE 的 Python 控制台或 Script Editor 中运行 `json-rail-exporter/export_level_rails_to_json.py`。默认会在 `maze-builder` 目录下生成 `exported_level_rails.json`。
**最近更新**: 
新增了针对 `BP_MazeBoundary` 和 `BP_MazeBottom` 等环境辅助 Actor 的识别和导出功能，更全面地保留了关卡结构元数据。支持了多种 Actor Label 与属性名作为识别依据的 Fallback 机制。

### 3. JSON Rail Importer (关卡导入器)
**功能与开发简介**: 
与导出器对应的 UE 编辑器内自动化工具。读取 `maze_layout.json`，通过映射配置表 (`rail_config.csv`) 自动在 UE 关卡内生成所有的迷宫组件（Blueprint 和 Static Mesh），一步到位实现迷宫数据在引擎中的可视化重建。
**使用方法**: 
在 UE 内部执行 `json-rail-importer/import_json_rails_to_level.py`。生成的 Actor 将被自动放置到 `GeneratedMazeRails` 文件夹下以保持关卡整洁。
**最近更新**: 
增强了资产引用的健壮性，当特定蓝图 (`BP_Rail`) 未找到时，能够智能回退并直接实例化对应的 StaticMesh。增加了关卡清理和生成 Actor 的自动化文件夹归档功能。

### 4. Asset Pivot Editor (资产原点编辑器)
**功能与开发简介**: 
UE 批量资产处理提效工具。修改模型资源的原点（Pivot）通常需要重新导出至 DCC 软件（如 Blender/Maya），此脚本能直接在 UE 内通过修改 MeshDescription 的顶点坐标，实现 Static Mesh 原点的重新对齐（如置底、居中）。
**使用方法**: 
在 UE 场景中选中需要修改的 Actor，运行 `asset-pivot-editor/pivot_set_buttom.py`。通过修改代码顶部的 `TARGET_PIVOT_POSITION` 可以设置新的原点（如 `0` 为底部，`1` 为中心）。
**最近更新**: 
引入了位置补偿机制（`COMPENSATE_SELECTED_ACTORS = True`）。在烘焙修改底层 Static Mesh 资产 Pivot 的同时，自动反向补偿选中 Actor 在场景中的坐标，确保其在关卡内的视觉位置不发生改变。

### 5. Texture Assigner (材质自动分配器)
**功能与开发简介**: 
UE 美术管线自动化工具。当美术批量导入资源后，手动寻找并绑定材质非常繁琐。该工具可根据严格的命名规范（`SM_`、`MI_`、`T_`），自动在目录中寻址关联的材质实例（MI）和贴图（Texture），把贴图赋给MI相应的参数，并最终将MI绑定到静态网格体上。
**使用方法**: 
在 UE 内部执行 `texture-assigner/texture_assigner.py`。可以优先通过选中 Content Browser 的目标文件夹触发，若未选中则回退读取脚本内的默认根路径。
**最近更新**: 
增加了健壮的类型和异常处理，能识别并跳过类型不匹配的资产；操作完成后在日志中详细列出所有已变脏（Dirty）需要手动保存的资产路径，避免数据丢失。

### 6. Hermite Spline Generator (Hermite 曲线生成器)
**功能与开发简介**: 
为了在迷宫复杂轨道中生成平滑的运动曲线，此工具基于 Hermite 样条原理对空间向量进行采样与拟合，以一套基于 Web 的曲线编辑器来提供直观的参数调试。
**使用方法**: 
- **前端工具**: 运行 `cd hermite-spline-generator && npm install && npm run dev` 即可在本地开启 Web 版本的曲线可视化编辑器。
**最近更新**: 
移除了旧版的纯 Python 后台拟合脚本，完全过渡到了图形化交互。支持直接在浏览器里实时交互与调试样条曲线的控制点与切线，极大地提升了曲线调参的直观性。

---

## 💻 环境需求

- **Python**: 3.8+ (迷宫生成等独立数据计算工具需要)
  - 依赖模块：`pandas`, `numpy`, `matplotlib`, `scipy`
- **Node.js / npm**: 用于运行部分工具自带的 Web 可视化界面 (如 maze-builder前端 和 Hermite曲线编辑器)
- **Unreal Engine 5**: 需要在项目中开启 `Python Editor Script Plugin` 和 `Editor Scripting Utilities` 插件，才能正常运行涉及 UE 的自动化脚本。
