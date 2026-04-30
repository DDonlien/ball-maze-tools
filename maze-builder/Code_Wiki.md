# 跃入迷城 (Fershli4) 迷宫生成器 - Code Wiki

## 1. 项目整体架构 (Project Architecture)
这是一个迷宫生成与检阅工具套件，专为 Roguelike 游戏（如“跃入迷城”）设计。当前包含 Python 版生成脚本、静态 H5 查看器，以及 TypeScript/Vite 版 Web 工具。它通过读取 UE5 导出的配置表，使用“难度驱动的生长算法”，自动生成逻辑严密、无穿插、保证连通性的 3D 轨道迷宫布局。

核心流程：
1. **数据输入**：读取 UE5 导出的 CSV 轨道配置表 (`rail_config.csv`)。
2. **逻辑生成**：通过 `maze_generator.py` 中的 `MazeGenerator` 核心类进行迷宫的程序化生成，包含碰撞检测、边界检查、死路回溯等逻辑。
3. **数据输出**：生成带有坐标、旋转、连接关系的 JSON 数据 (`maze_layout.json`)，以及 Markdown 格式的生成报告 (`maze_generation_report.md`)。
4. **可视化与验证**：使用 `maze_viewer.html` 或 Vite Web 工具在浏览器中进行 3D 预览，使用 `test_maze.py` / `src/test/maze.test.ts` 验证生成逻辑。

## 2. 主要模块职责 (Main Modules Responsibilities)
- **`maze_generator.py`**: [核心] 迷宫生成脚本，包含所有的配置读取、迷宫生长逻辑、碰撞与边界检测、回溯机制以及 JSON/Markdown 导出逻辑。
- **`maze_viewer.html`**: [工具] H5 3D 迷宫查看器，基于 Three.js 开发。解析生成的 JSON 数据并渲染 3D 迷宫网格，支持拖拽、旋转、缩放以及难度颜色映射。
- **`src/`**: [工具] TypeScript/Vite 版迷宫生成器与查看器，包含生成逻辑、CSV 解析、Three.js 查看器和 Vitest 测试。
- **`package.json`**: [配置] Web 工具依赖与运行脚本。
- **`test_maze.py`**: [测试] 验证生成的迷宫布局 (`maze_layout.json`) 是否符合要求，如起始/结束轨道数量、坐标系统有效性、难度值以及轨道类型分布等。
- **`rail_config.csv`**: [配置] 轨道零件配置表，由 UE5 导出，定义所有可用的轨道零件（包含尺寸、基础难度、出口位置/旋转等信息）。
- **`template_maze_layout.json`**: [参考] 生成的 JSON 数据结构参考模板。

## 3. 关键类与函数说明 (Key Classes & Functions)

### 3.1 核心数据结构 (`maze_generator.py`)
- **`Vector3`**: 基础 3D 向量类，用于处理逻辑坐标运算，支持向量加法、Z轴(Yaw)旋转和X轴(Roll)旋转逻辑。
- **`RailConfigItem`**: 轨道配置项数据类，存储从 CSV 解析的静态配置信息，如基础难度、逻辑尺寸、出口列表 (`exits_logic`) 以及类型标记。
- **`OpenConnector`**: 开放连接点类，表示生成过程中尚未连接的接口，包含目标坐标、父级信息、累计难度、旋转状态及禁忌候选集合（用于防止重复进入死路）。
- **`RailInstance`**: 轨道实例类，表示迷宫中已放置的具体轨道，记录物理与逻辑坐标、绝对旋转、实际难度、连接状态及占用的网格。

### 3.2 迷宫生成器核心 (`MazeGenerator`)
位于 `maze_generator.py` 中，控制迷宫生长的全生命周期。
- **`__init__(self, config_map)`**: 初始化生成器状态，设置检查点目标和记录状态。
- **`is_in_bounds(self, pos, occupied_cells)`**: 边界检查，支持静态边界和动态边界两种模式，确保轨道不超出 `MAZE_BOUNDS`。
- **`is_colliding(self, occupied_cells)`**: AABB 碰撞检测，通过查询 `self.occupied_cells` 字典判断新轨道是否与已放置的轨道重叠。
- **`_calculate_rail_transform(self, rail_id, connector, spin_rot)`**: 计算新轨道的逻辑旋转索引 (Yaw) 和绝对旋转 (Pitch, Yaw, Roll)。
- **`place_rail_v2(self, ...)`**: 核心放置逻辑。尝试放置轨道，执行碰撞与边界检查；若成功，则实例化轨道，标记占用格子，并将新出口加入开放列表 (`OpenList`)。
- **`generate(self)`**: 迷宫生成主循环。实现难度驱动的生长算法：
  - 初始化放置起点 (Start Rail)。
  - 从 `OpenList` 中选择连接点，过滤禁忌候选。
  - 根据当前累计难度，决定是放置普通轨道、检查点 (Checkpoint) 还是终点 (End)。
  - 若 `OpenList` 为空且未达到目标，触发死路回溯机制 (Backtracking)，移除上一轨道并恢复父级连接点和更新禁忌表。
- **`export_json(self, path)`**: 导出逻辑，将生成的轨道实例转换为 UE5 可用的 JSON 数据结构，并计算绝对物理坐标与方向。同时生成一份 Markdown 报告。

### 3.3 辅助计算函数 (`maze_generator.py`)
- **`calculate_occupied_cells(rail_id, pos, size, rot_idx, roll_idx)`**: 根据轨道的 ID、位置、尺寸及旋转，计算其在 3D 逻辑网格中实际占用的所有坐标点。
- **`load_config(csv_path)`**: 解析 `rail_config.csv`，兼容新旧版本字段，提取出口相对位置和旋转信息，并将其转换为逻辑网格坐标和旋转偏移。

## 4. 依赖关系 (Dependencies)
- **Python**: >= 3.8
- **第三方库**:
  - `pandas`: 用于读取和解析 CSV 配置表 (`rail_config.csv`)。
- **内置库**: `json`, `random`, `re`, `dataclasses`, `typing`, `pathlib`
- **Node.js / npm**: 用于运行 TypeScript/Vite 版 Web 工具。
- **前端依赖**: `three`, `gsap`, `vite`, `vitest`, `typescript`。

## 5. 项目运行方式 (How to Run)

### 5.1 环境准备
1. 确保已安装 Python 3.8+。
2. 安装必要的依赖库：
   ```bash
   pip install pandas
   ```

### 5.2 生成迷宫数据
在 `maze-builder/` 目录运行生成脚本：
```bash
python maze_generator.py
```
**运行结果**：
- 控制台将输出生成过程、放置的起点、回溯次数等日志。
- `maze-builder/` 会生成或更新 `maze_layout.json` 文件（最终的迷宫布局数据）。
- `maze-builder/` 会生成或更新 `maze_generation_report.md` 文件（迷宫生成结果报告）。

### 5.3 验证迷宫结构
运行测试脚本验证生成的 `maze_layout.json` 是否符合规则：
```bash
python test_maze.py
```
测试通过后，控制台将输出 `✅ 所有测试通过!` 等验证信息。

运行 TypeScript/Vite 测试：
```bash
npm test
```

### 5.4 3D 可视化检阅
1. 使用现代浏览器（推荐 Chrome/Edge）打开 `maze_viewer.html`。
2. 将生成的 `maze_layout.json` 文件拖拽到网页中即可渲染迷宫。
3. **操作提示**：左键拖拽旋转视角，右键拖拽平移，滚轮缩放。不同颜色代表不同的区域难度。

运行 TypeScript/Vite 版 Web 工具：
```bash
npm install
npm run dev
```
