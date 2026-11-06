# DSH 接入

基线为 `elysia395/dsh-wallpaper-engine` 插件 `1.4.0`（`cde8e9c66972f47f6d369f5e51484ca8fa48c9b5`）与 WebWallGL `3.0.0`。

DSH Compose 服务增加以下只读挂载，其余配置保持不变：

```yaml
services:
  dsh:
    volumes:
      - /srv/wallpaper-manager/steam-data:/wallpaper-manager/steam-data:ro
    environment:
      DSH_WE_STEAM_ROOT: /wallpaper-manager/steam-data
```

宿主机直接运行时设置 `DSH_WE_STEAM_ROOT=/srv/wallpaper-manager/steam-data`。变量指向包含 `steamapps/` 的 Steam 根，不是 `431960` 目录。无需伪造 `libraryfolders.vdf`。不要向 DSH 挂载 `staging`、`app-data` 或 `steam-config`。

下载完成后打开或刷新 DSH 壁纸库，由 `/wallpaper-engine/inventory` 请求触发清单重建。不能承诺固定 30 秒自动出现。网站删除采用原子移动，刷新清单后对应项目应消失。

无桌面环境无需 Xvfb；插件 X11 依赖只涉及可选遮挡检测。网站与 DSH 必须对齐 WebWallGL：运行 `scripts/check-webwallgl.sh` 检查网站锁文件，再在 DSH 实际安装目录检查其 `package.json` 和 lock 文件。
