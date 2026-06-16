# 视觉规范

## 适用范围

本仓库主要包含 Unreal Editor Python、Blender Python 脚本和轻量 Web 工具。UE 与 Blender 脚本没有自定义 UI，沿用宿主应用界面。

## Web 工具

- `web/web-maze-builder/` 和 `web/web-hermite-spline-generator/` 的视觉细节分别记录在各自目录的 `DESIGN.md`。
- 新增 Web UI 时优先保持工具型界面清晰、紧凑，确保主要操作、状态和错误提示容易识别。

## 脚本工具

- `ue/` 与 `blender/` 下的脚本工具默认记录“不适用”，除非后续新增自定义 UI。
- 如果脚本通过 Unreal 或 Blender 弹窗显示信息，文案应保持简短、直接，并优先把详细报告输出到日志或文件。
