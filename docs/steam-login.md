# Steam 登录与安全

在“Steam 设置”输入 Steam 用户名和密码。密码只存在于当前浏览器请求、API 到 Worker 的内部 HTTP 请求及 SteamCMD 受控 stdin 中，不进入 BullMQ payload、SQLite、命令行参数或日志。内部端口 `9780` 不对宿主机发布。

出现 `guard_required` 后，在同一页面提交一次性 Guard 码。Guard 码同样不持久化。会话状态保存在 `steam-config`，目录权限应为 `0700`。会话失效会转为 `auth_required`，重新登录即可；系统不会无限重试认证。

Steam Web API Key 与 SteamCMD 会话是两套独立配置：Key 仅由 API 从环境变量读取，前端只能看到“已配置／未配置”，不存在读取原值的接口。登出会终止当前 SteamCMD 进程；必要时可由管理员清理 `steam-config` 后重新登录。

登录成功后，Worker 会从 SteamCMD 输出中取得 SteamID。设置页的“同步订阅列表”使用该 SteamID 和 Web API Key 获取 Wallpaper Engine（AppID `431960`）订阅，并在后台批量读取工坊详情。同步只更新网站记录和订阅标记，不会自动创建下载任务；取消订阅也不会删除已下载文件。API 重启会中断进行中的同步，重新点击同步即可。

部署仅面向可信局域网，无多租户或权限体系。不要将服务暴露公网。日志检查可使用测试中的脱敏用例，但真实 ARM64 设备验收仍须人工确认日志没有密码、Guard 码和完整认证命令。

## 故障排查

在项目根目录查看最近的 API 和 Worker 日志：

```bash
docker compose -f deploy/docker-compose.yml logs --tail=200 api worker
```

API 异常日志包含 `requestId`、HTTP 方法、路由、状态码和错误码；前端错误响应也包含相同的 `requestId`，可据此关联。Worker 的 `[auth]` 日志记录登录／Guard 请求结果，`[steam]` 日志记录 SteamCMD 启动、提示符就绪、认证状态和进程退出。订阅同步使用 `[subscriptions]` 前缀。

日志不会主动记录请求正文、查询字符串、完整 Steam URL、SteamCMD 原始输出、密码、Guard 码或 API Key。`STEAM_RATE_LIMITED` 表示请求限流，应暂停操作后重试；它不等于账号被封。
