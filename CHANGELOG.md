# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的记录方式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)，发布记录由 release-please 根据 Conventional Commits 自动维护。

## [1.1.0](https://github.com/BillyPhilosophy/wallpaper-manager/compare/v1.0.0...v1.1.0) (2026-11-12)


### 新增

* add safe download history cleanup ([203f912](https://github.com/BillyPhilosophy/wallpaper-manager/commit/203f912a90aaddbd7830e4142e4535b37c8bd002))
* support interactive previews with legacy sandbox ([7ab8f48](https://github.com/BillyPhilosophy/wallpaper-manager/commit/7ab8f486c274b910566992d0edcf3b7a24929c2f))
* **web:** iOS frosted-glass UI with system-blue accent ([b251a3f](https://github.com/BillyPhilosophy/wallpaper-manager/commit/b251a3f2b15e26fdaaeb20d39f090a70e3e42e67))
* 修改web的ui风格 ([ccbc7eb](https://github.com/BillyPhilosophy/wallpaper-manager/commit/ccbc7eb66a1a66a2ad38c6b76aca6ba36d971893))
* 新增我的收藏并让壁纸库只展示已下载项 ([d3201df](https://github.com/BillyPhilosophy/wallpaper-manager/commit/d3201df9b3206f6449e8e185094a8cd1d488152e))
* 重构壁纸管理界面并支持动态背景 ([59fefaf](https://github.com/BillyPhilosophy/wallpaper-manager/commit/59fefaff6dc7a96a9fe8635e0d9439a120b58acb))


### 修复

* allow sandboxed preview assets to load ([bf73eaa](https://github.com/BillyPhilosophy/wallpaper-manager/commit/bf73eaaae3c282b8974fc54c46038f46ace57507))
* **deploy:** split steam-data onto a separate mount to avoid移动硬盘 EIO ([f8bb801](https://github.com/BillyPhilosophy/wallpaper-manager/commit/f8bb801826466ec100e01274459f6d00b4119a30))
* relax preview iframe sandbox so WebWallGL renders and interacts ([43a9611](https://github.com/BillyPhilosophy/wallpaper-manager/commit/43a961113f12c19a3c574d6317102f61fd8424dd))
* repair workshop type and content-rating search filters ([fde92bf](https://github.com/BillyPhilosophy/wallpaper-manager/commit/fde92bfa9201b6dd76b7189e05a1c59bab84b3e4))
* **web:** preserve same-origin WebWallGL previews ([a590bbc](https://github.com/BillyPhilosophy/wallpaper-manager/commit/a590bbc20a722fa706b5e4c096a9ab6eec295a99))
* **web:** restore search scroll after results load ([f1f6aaa](https://github.com/BillyPhilosophy/wallpaper-manager/commit/f1f6aaa8bd047df2ffaae1ab3c01a94ff4c115ee))


### 文档

* expand setup and release guidance ([77dbb73](https://github.com/BillyPhilosophy/wallpaper-manager/commit/77dbb73745292e02b7bad3738ae68f408397c9ce))

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
