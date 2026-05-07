# Ball Maze Tools Requirements

本文档描述工具的实现要求。`README.md` 负责说明“这是什么”和“怎么使用”，本文档负责说明“应该怎么做”。

## Maze Builder

### 1. 数据来源

Maze Builder 的核心输入是 `maze-builder/rail_config.csv`。

CSV 中的轨道配置描述的是轨道资产的局部信息：

- `RowName`: 轨道 ID。
- `Size` / `X/Y/Z`: 局部包围尺寸，单位是逻辑 grid。
- `Exit_Array`: 出口的局部位置和局部旋转。
- 轨道名称中的方向标记（如 `F`、`L90`、`R90`、`U90`、`D90`）用于决定局部 footprint 怎样展开。

CSV 中的坐标和旋转都应先被理解为局部坐标系数据，不能直接当作世界坐标。

### 2. 轨道实例

每一节已放置轨道实例必须至少包含：

- `Pos_Rev`: 轨道实例在迷宫逻辑坐标中的起点。
- `Rot_Abs`: UE 标准绝对旋转，字段为 `p/y/r`。
- `Rail_ID`: 对应 CSV 中的 `RowName`。
- `Occupied_Cells_Rev`: 该实例占用的世界逻辑格子。
- `Exit`: 该实例的出口数据。

`Pos_Rev + Rot_Abs` 是轨道实例姿态的唯一权威来源。生成器不得在不同模块中混用另一套旋转体系来分别计算 footprint、出口位置和出口方向。

### 3. 局部 footprint

轨道占用体积必须分两步计算：

1. 在轨道局部坐标系中生成 footprint。
2. 用实例的 `Rot_Abs` 将局部 footprint 旋转到世界逻辑坐标，再加上 `Pos_Rev`。

局部 footprint 的生成规则：

- 默认正向轨道沿局部 `+X` 展开。
- `L90` / `R90` 在局部 `Y` 方向展开。
- `U90` / `D90` 在局部 `Z` 方向展开。
- `T` / `CR` 这类多出口轨道可以在局部左右两侧同时展开。

例如常见的 `U90 X3 Y1 Z3` 轨道，其局部 footprint 可以理解为一个 `x-z` 面上的 3x3 占用：

```text
000, 100, 200
001, 101, 201
002, 102, 202
```

这里三位数字分别表示局部 `(x, y, z)` 坐标，例如 `102` 表示 `(1, 0, 2)`。

注意：`X1 Y1 Z3` 这类命名理论上不禁止，但实际 U90/D90 资产通常应是类似 `X3 Y1 Z3` 这样的尺寸；不能把示例中的三位占用坐标误解为轨道命名。

### 4. 世界变换

将局部坐标转为世界逻辑坐标时，必须统一使用实例的 `Rot_Abs`。

要求：

- 局部占用格 `LocalCell` 通过 `Rot_Abs` 旋转后，加 `Pos_Rev` 得到 `Occupied_Cells_Rev`。
- 局部出口位置 `Exit.Pos` 通过同一个 `Rot_Abs` 旋转后，加 `Pos_Rev` 得到 `Exit_Pos_Rev`。
- 不允许 footprint 使用一套 `rotIdx + rollIdx`，而出口使用另一套 `Rot_Abs`。这会导致 U90/D90/R90/L90 在 Pitch/Roll/Yaw 组合时错位。

实现上可以保留兼容函数，但生成、碰撞、边界检查、导出必须使用同一套 `Rot_Abs` 变换。

### 5. 出口计算

每个出口应包含：

- `Exit_Pos_Rev`: 出口世界逻辑位置。
- `Exit_Pos_Abs`: 出口 UE 世界单位位置。
- `Exit_Rot_Abs`: 出口 UE 标准绝对旋转。
- `Exit_Dir_Abs`: 出口世界方向。
- `IsConnected`: 是否已连接下一节轨道。
- `TargetInstanceID`: 连接目标轨道实例 ID。

计算规则：

1. `Exit_Pos_Rev = Pos_Rev + RotateByRotAbs(Exit_Local_Pos, Rail_Rot_Abs)`
2. `Exit_Rot_Abs = Rail_Rot_Abs + Exit_Local_Rot`
3. `Exit_Dir_Abs` 必须从 `Exit_Rot_Abs` 的 forward 方向推导。

`Exit_Dir_Abs` 不能从 `Exit_Pos_Rev - Pos_Rev` 的最大轴偏移推导。曲线轨道的出口位置可能因为 Pitch/Roll 落在上方、下方或侧面，但出口朝向仍然应以 `Exit_Rot_Abs` 为准。

### 6. 衔接下一节轨道

放置下一节轨道时：

- 父轨道的开放出口提供下一节轨道的目标 `Pos_Rev`。
- 下一节轨道的 `Rot_Abs` 由父出口的 `Exit_Rot_Abs` 和允许的自旋共同决定。
- 如果自旋为 0，则下一节轨道默认不绕出口方向额外旋转。
- 非 0 自旋必须受 `maxSpins` 限制。

生成器必须保证：

- 下一节的起点位置等于父出口的 `Exit_Pos_Rev`。
- 下一节的绝对旋转与父出口方向一致。
- 碰撞检测使用下一节完整 `Rot_Abs` 变换后的 footprint。

### 7. 自旋规则

自旋指在同一个出口方向下，对下一节轨道绕出口方向做额外旋转。

要求：

- 默认不允许自旋，即 `maxSpins = 0`。
- 当 `maxSpins > 0` 时，整张迷宫最多允许出现 `maxSpins` 次非 0 自旋。
- 回退或回滚轨道时，必须扣回该轨道消耗的自旋次数。
- 导出 `MapMeta` 时应包含实际使用次数和上限：
  - `SpinCount`
  - `MaxSpins`

### 8. Checkpoint 规则

Checkpoint 数量可配置，最小为 0。

如果目标难度为 `a`，checkpoint 数量为 `n`：

- 当 `n = 0` 时，不生成 checkpoint。
- 当 `n > 0` 时，每当当前分段难度超过 `a / n`，生成器应回退 1 节轨道，然后尝试放置一节至少 2 个出口的分叉轨道。
- 分叉轨道其中一个出口放置 checkpoint。
- 分叉轨道另一个出口继续生成后续轨道。

统计信息中必须包含分段难度：

- Start 到第一个 checkpoint。
- checkpoint 到 checkpoint。
- 最后一个 checkpoint 到 End。

### 9. Seed 规则

Web 版 seed 是完整生成配置编码，不只是随机数。

格式：

```text
bm01-random-difficulty-checkpoints-spins-bounds
```

字段要求：

- 全部使用小写 base36，即数字 + 小写英文字母。
- 字段之间使用 `-` 分隔。
- `bm01`: seed 格式版本。
- `random`: 6 位随机性字段。
- `difficulty`: 2 位目标总难度。
- `checkpoints`: 2 位 checkpoint 数量。
- `spins`: 2 位允许自旋次数。
- `bounds`: 6 位边界尺寸，按 `xx yy zz` 各 2 位拼接。

示例：

```text
bm01-0d2wnk-0o-03-00-0d0905
```

含义：

```text
random = parseInt("0d2wnk", 36)
difficulty = parseInt("0o", 36)
checkpoints = parseInt("03", 36)
spins = parseInt("00", 36)
bounds.x = parseInt("0d", 36)
bounds.y = parseInt("09", 36)
bounds.z = parseInt("05", 36)
```

### 10. SeededRandom 复现机制

`random` 字段不是迷宫布局本身，而是确定性随机数生成器的初始状态。

生成器内部使用 `SeededRandom` 推进随机序列：

```ts
state = seed >>> 0
state = (1664525 * state + 1013904223) >>> 0
value = state / 0x100000000
```

同样的配置下，`SeededRandom` 会按相同顺序产生相同随机数，因此会重放相同的随机决策：

- 选择 Start Rail。
- 选择起点位置。
- 选择开放连接点。
- 选择候选轨道。
- 尝试自旋选项。

严格复现迷宫必须同时保持：

- seed 完全一致。
- `rail_config.csv` 完全一致。
- 生成器代码版本一致。
- 随机调用顺序一致。

seed 不直接存储布局，而是存储“随机决策序列的起点”和生成配置。
