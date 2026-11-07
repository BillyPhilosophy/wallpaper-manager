# Steam 登录与安全

Worker 使用原生 ARM64／AMD64 的 DepotDownloader 下载工坊内容，不再依赖 SteamCMD、Box64 或 32 位运行库。设置页默认提供手机扫码登录，不需要输入密码或迁移手机认证器。二维码由 DepotDownloader `-qr` 生成，只保存在 Worker 内存中，刷新时自动更新；扫码会话五分钟后过期。二维码不进入 SQLite、BullMQ 或日志。

也可使用账号密码登录。密码只存在于当前浏览器请求、API 到 Worker 的内部 HTTP 请求及 DepotDownloader 受控 stdin 中，不进入 BullMQ payload、SQLite、命令行参数或应用日志。内部端口 `9780` 不对宿主机发布。

账密登录按 Steam 上游实际要求处理：需要手机确认时只在 Steam App 中批准，不要求输入验证码；需要手机令牌码时由 steamguard-cli 自动产码，失败时可手工输入；邮箱验证码只能手工输入。不会用 steamguard-cli 盲目批准所有登录请求。

## 配置 steamguard-cli

steamguard-cli 不能直接读取现有 Steam 手机 App 中的认证器。可以使用已有 Steam Desktop Authenticator maFile，或执行以下交互式命令绑定／迁移认证器：

```bash
docker compose -f deploy/docker-compose.yml exec -it worker \
  steamguard --mafiles-path /steam-config/steamguard/maFiles setup
```

`setup` 会显示恢复码，必须先离线记录。已有手机认证器时，迁移或撤销可能产生交易限制，也会让原手机 App 不再持有同一个认证器；执行前必须阅读命令输出并备份。不要在网页或群聊中提交 maFile、恢复码或 passkey。

maFiles 位于 `steam-config/steamguard/maFiles`，其中包含长期有效的 2FA 密钥，不只是短期会话。整个 `steam-config` 目录必须为 `0700`，DSH 和其他业务服务不应挂载它。应备份 maFiles 和恢复码，但备份也必须受到同等保护。

如果 maFiles 已加密，将 passkey 写入 `steam-config/steamguard/passkey`，限制文件权限为 `0600`，并在 `deploy/.env` 设置：

```env
STEAMGUARD_CLI_PASSKEY_FILE=/steam-config/steamguard/passkey
```

Worker 只在启动 steamguard-cli 时通过环境变量传递 passkey，不把它写入命令行或日志。容器无桌面 keyring，不要将系统 keyring 作为无人值守部署的前提。自动令牌使用本机时间，设备必须启用 NTP 校时。

## 会话与订阅

首次登录成功后，DepotDownloader 将持久 refresh token 保存在 `steam-config/depotdownloader` 的 .NET IsolatedStorage 中。后续下载和 Worker 重启会使用该会话，不保存账号密码；会话被撤销或过期后会转为 `auth_required`，不会无限重试认证。

订阅同步只依赖 Web API Key 和 SteamID64，不需要 DepotDownloader 登录会话。可在“订阅同步”卡片直接填写 SteamID64，点击同步时会保存并复用；Worker 也可从 steamguard-cli 的 `manifest.json` 读取。账号名和 SteamID64 属于非秘密状态，会保存在 SQLite；密码和一次性 Guard 码不会保存。

“退出 Steam 会话”会终止当前 DepotDownloader 进程并删除本地 refresh token，不会删除 steamguard-cli maFiles 或解除认证器。如需彻底撤销服务器端授权，还应在 Steam 账号的授权设备管理中撤销对应会话。

Steam Web API Key 与 DepotDownloader 会话是两套独立配置。Key 仅由 API 从环境变量读取，前端只能看到“已配置／未配置”，不存在读取原值的接口。订阅同步使用保存的 SteamID64 和 Web API Key，不会自动创建下载任务。

部署仅面向可信局域网，无多租户或权限体系。不要将服务暴露公网。

## 故障排查

```bash
docker compose -f deploy/docker-compose.yml logs --tail=200 api worker
```

API 异常日志包含 `requestId`、HTTP 方法、路由、状态码和错误码。Worker 的 `[auth]` 日志记录登录／Guard 请求结果，`[steam]` 日志只记录 DepotDownloader 操作类型、认证状态和进程退出码。订阅同步使用 `[subscriptions]` 前缀，`[steam-api]` 不会记录包含 API Key 的 URL。

日志不会主动记录请求正文、查询字符串、完整认证命令、DepotDownloader 原始输出、steamguard-cli 原始输出、密码、Guard 码、passkey 或 API Key。`STEAM_RATE_LIMITED` 表示请求限流，应暂停操作后重试；它不等于账号被封。
