# 需求追踪

## 仓库协作基础

- [x] [DOC-A-001] 按 `agent-template/` 建立根目录协作文档 #docs #P0
  - [x] 提供 `AGENTS.md`
  - [x] 提供 `README.md`
  - [x] 提供 `REQUIREMENTS.md`
  - [x] 提供 `DESIGN.md`
  - [x] 提供 `agent-log/`
- [x] [DOC-A-002] 为独立工具建立局部文档入口 #docs #P1
- [x] [DOC-A-003] 按 `agent-template/` 检查并更新分组目录后的仓库文档入口 #docs #P0
  - [x] 根目录工具索引指向 `web/`、`ue/`、`blender/` 下的实际路径
  - [x] 历史 `PROGRESS.md` 内容迁移到标准化 `agent-log/`
  - [x] 根目录 `DESIGN.md` 存在并说明跨工具视觉适用范围

## UE Folder Reference Checker

- [x] [UE-FRC-001] 检查选中 Content Browser 文件夹中资产是否被文件夹外资产引用 #feature #P0
- [x] [UE-FRC-002] 检查选中 Content Browser 文件夹中资产是否引用文件夹外资产 #feature #P0
- [x] [UE-FRC-003] 提供同时检查双向引用的入口脚本 #feature #P0
- [x] [UE-FRC-004] 在 UE 消息中输出资产及外部引用关系 #feature #P0
- [x] [UE-FRC-005] 将同样信息保存为展开列的 CSV #feature #P0
  - [x] 默认保存路径为空或无效时弹出文件选择框
  - [x] 默认保存路径有效时直接保存

## UE Selected Static Mesh Arranger

- [x] [UE-SMA-001] 创建 Unreal Editor Python 工具，用于排列关卡中选中的 Static Mesh Actor #feature #P0
  - [x] 以第一个有效选中 Static Mesh Actor 的当前位置为起点
  - [x] 在脚本顶部配置排列间隔和世界方向
  - [x] 只移动关卡 Actor，不修改 Static Mesh 资源
  - [x] 提供 README、REQUIREMENTS、DESIGN、AGENTS 和 agent-log 入口

## 持续约束

- [ ] [X-A-001] 每次任务开始前执行 `git pull` #qa #P0
- [ ] [X-A-002] 每次任务完成后创建 `agent-log/` 执行日志 #qa #P0
- [ ] [X-A-003] 提交并推送每次成功完成的任务 #qa #P0
