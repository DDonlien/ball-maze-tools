# Seed 和实际迷宫的关系

这份文档说明 `seed` 是如何影响最终迷宫布局的，以及为什么只看 seed 并不能完整定义一个迷宫。

## 简短结论

`seed` 不是一份迷宫存档。

它的作用是初始化一个“确定性的随机数生成器”。生成器随后会用这条随机序列来决定建造迷宫过程中的各种随机选择。

在以下条件完全相同的情况下，同一个 seed 应该生成同一个迷宫：

- CSV 配置相同
- Bounds 相同
- Target difficulty 相同
- Generator 代码相同
- 生成流程没有被其它输入打断

如果其中任何一项变化，同一个 seed 都可能生成不同的迷宫。

## 真正决定迷宫的输入

最终迷宫由这些输入一起决定：

- `seed`
- 轨道 CSV 配置，默认来自 `rail_config.csv`，也可能来自拖入页面的 CSV
- `targetDifficulty`
- `bounds`，也就是当前 UI 里的 `Bounds X/Y/Z`
- 生成器代码版本
- 轨道放置规则、碰撞规则、边界规则

所以更准确地说，迷宫和输入的关系是：

```text
maze = generate(seed, rail_config_csv, target_difficulty, bounds, generator_code)
```

seed 很重要，但它只是这组输入中的一个。

## 随机数是怎么来的

TypeScript 版生成器使用 `src/maze/random.ts` 里的 `SeededRandom`。

它是一个确定性的线性同余随机数生成器：

```ts
state = (1664525 * state + 1013904223) >>> 0
random = state / 0x100000000
```

seed 会作为初始 `state`。

之后每调用一次：

- `next()`
- `int()`
- `choice()`

都会推进一次随机状态。

这意味着“调用顺序”很重要。如果我们在生成器中增加、删除、提前或延后了一次随机调用，即使 seed 一样，后续拿到的随机数也会错位，最终迷宫就可能变化。

## 生成流程

目前生成器的大致流程是：

1. 从 CSV 读取所有轨道定义。
2. 用 seed 初始化 `SeededRandom`。
3. 从所有 Start Rail 中随机选择一个起点轨道。
4. 在当前 bounds 内随机选择起点位置。
5. 从开放的连接口里随机选择一个继续扩展。
6. 根据当前目标，从候选轨道里随机选择要尝试的 rail。
7. 根据 CSV 里的 `SpinDiff` 尝试不同旋转/翻转连接方式。
8. 检查这个 rail 是否碰撞。
9. 检查这个 rail 是否超出 bounds。
10. 如果成功，就放置它并更新开放连接口。
11. 如果失败，就记录失败原因并尝试下一个候选。
12. 如果某条路径走不下去，就执行 backtrack。
13. 当总难度达到目标后，尝试放置终点并结束。
14. 把已经放置的 rail 导出成 maze JSON。

这些随机选择对固定 seed 来说是确定的，但候选列表、碰撞结果、bounds 结果都来自 CSV 和生成器规则。

## Seed 控制了什么

seed 会影响这些选择：

- 选择哪个 Start Rail
- 起点放在 bounds 内的哪个位置
- 下一步扩展哪个开放连接口
- 优先尝试哪个候选 rail
- 当某个 rail 放置失败后，下一次尝试哪个候选

因为失败尝试也会消耗随机选择，所以碰撞规则和 bounds 规则也会间接影响最终迷宫。

例如同一个 seed 下，如果 bounds 从 `9/9/3` 改成 `7/7/3`，某些 rail 可能从“可以放置”变成“OutOfBounds”，之后生成器就会尝试别的候选，最终迷宫会变。

## Seed 不能单独控制什么

seed 本身不能定义这些东西：

- rail 的尺寸
- rail 的出口位置
- U90 / D90 这类曲线的方向
- rail 的 difficulty
- bounds 大小
- 碰撞逻辑
- 渲染样式

这些来自 CSV 和代码。

比如，如果 CSV 里修改了 `BP_Curve_U90_X4_Y1_Z4_Rail` 的出口位置，同一个 seed 可能仍然在同一步选中这个 rail，但后续连接位置和最终迷宫都会变化。

## 当前页面的行为

现在页面打开时会先生成一个随机 seed。

然后页面会立刻用这个 seed 运行一次生成器，所以 seed 输入框里的值和右侧看到的迷宫是对应的。

点击随机 seed 按钮时，也会：

1. 生成一个新的 seed。
2. 立刻用这个 seed 重新生成迷宫。

如果你手动修改 seed，需要点击 `Generate`，才会用这个手动输入的 seed 重新生成迷宫。

## 如何复现一份迷宫

如果想复现某一份迷宫，需要保持这些条件一致：

- seed 数值一致
- CSV 内容一致
- Bounds X/Y/Z 一致
- Target difficulty 一致
- Generator 代码版本一致

然后点击 `Generate`。

如果需要长期、严格地复现，导出的 maze JSON 最好在 `MapMeta` 里额外记录生成输入，例如：

```json
{
  "Seed": 94697346,
  "Bounds": { "x": 9, "y": 9, "z": 3 },
  "TargetDifficulty": 15,
  "RailConfigHash": "..."
}
```

目前导出的 layout JSON 主要记录“生成结果”，也就是 rail 的位置、旋转、出口和连接关系；它还没有完整记录“生成这个结果所需的全部输入”。

## 调试检查清单

如果你发现“同一个 seed 生成出来不一样”，优先检查：

- CSV 是否变了？
- Bounds 是否变了？
- Target difficulty 是否变了？
- Generator 代码是否变了？
- 当前是不是从 JSON 加载了旧迷宫，而不是用 seed 生成？
- 是否手动修改了 seed 但没有点击 `Generate`？

如果这些都没有变化，同一个 seed 应该可以复现同一个生成结果。
