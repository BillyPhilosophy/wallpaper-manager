# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的记录方式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)，发布记录由 release-please 根据 Conventional Commits 自动维护。

## [Unreleased]

## [1.0.0] - 2026-11-08

### 新增

- ARM64 Linux 与 Docker Compose 部署，包含 Web、API、Worker 和 Redis。
- 使用 DepotDownloader 登录和下载 Wallpaper Engine 工坊项目，支持二维码、账密、手机确认、steamguard-cli 和手工 Guard。
- 工坊搜索、类型与内容分级筛选、排序、页码跳转和搜索状态缓存。
- 默认过滤成人及未分级内容，可在设置中关闭。
- 通过 SteamID64 同步订阅，提供独立订阅列表，不自动批量下载。
- 下载进度、速率、取消、失败重试，以及失败、已取消和已完成记录清理。
- Scene/Web 沙箱预览、本地视频播放和全屏预览。
- 壁纸库和订阅列表筛选、DSH 原始文件共享。
- 可选择仅删除任务记录，或永久删除本地源文件及全部关联记录。
- GitHub Actions CI 和 ARM64 镜像发布工作流。

### 安全

- 默认不执行 Application／EXE 壁纸。
- 校验壁纸入口、资源路径和目录结构，使用暂存与原子发布。
- Scene/Web 引擎在不含同源权限的 iframe 沙箱中运行。
- API Key、密码、Guard 码和 maFiles passkey 不写入应用日志。

[Unreleased]: https://github.com/BillyPhilosophy/wallpaper-manager/compare/V1.0.0...HEAD
[1.0.0]: https://github.com/BillyPhilosophy/wallpaper-manager/releases/tag/V1.0.0
