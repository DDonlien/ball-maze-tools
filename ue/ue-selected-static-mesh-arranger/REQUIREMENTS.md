# Selected Static Mesh Arranger 需求

- [x] [UE-SMA-001] 读取当前关卡中选中的 Static Mesh Actor #feature
  - [x] 跳过没有有效 Static Mesh 的选中 Actor
  - [x] 在 Unreal log 中报告选中数量、有效数量和跳过项
- [x] [UE-SMA-002] 按脚本配置的间隔和方向排列选中 Actor #feature
  - [x] 使用第一个有效 Static Mesh Actor 的当前位置作为起点
  - [x] 使用 `SPACING` 控制中心间距
  - [x] 使用 `DIRECTION` 控制世界空间方向并自动归一化
- [x] [UE-SMA-003] 保持工具只移动关卡 Actor，不修改 Static Mesh 资源 #safety
- [x] [UE-SMA-004] 提供 dry-run 和选择恢复配置 #feature
