# 需求追踪

## 仓库协作基础

- [x] [DOC-A-001] 按 `agent-template/` 建立根目录协作文档 #docs #P0
  - [x] 提供 `AGENTS.md`
  - [x] 提供 `README.md`
  - [x] 提供 `REQUIREMENTS.md`
  - [x] 提供 `DESIGN.md`
  - [x] 提供 `agent-log/`
- [x] [DOC-A-002] 为独立工具建立局部文档入口 #docs #P1

## UE Folder Reference Checker

- [x] [UE-FRC-001] 检查选中 Content Browser 文件夹中资产是否被文件夹外资产引用 #feature #P0
- [x] [UE-FRC-002] 检查选中 Content Browser 文件夹中资产是否引用文件夹外资产 #feature #P0
- [x] [UE-FRC-003] 提供同时检查双向引用的入口脚本 #feature #P0
- [x] [UE-FRC-004] 在 UE 消息中输出资产及外部引用关系 #feature #P0
- [x] [UE-FRC-005] 将同样信息保存为展开列的 CSV #feature #P0
  - [x] 默认保存路径为空或无效时弹出文件选择框
  - [x] 默认保存路径有效时直接保存

## 持续约束

- [ ] [X-A-001] 每次任务开始前执行 `git pull` #qa #P0
- [ ] [X-A-002] 每次任务完成后创建 `agent-log/` 执行日志 #qa #P0
- [ ] [X-A-003] 提交并推送每次成功完成的任务 #qa #P0
