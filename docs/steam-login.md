# Steam 登录与安全

在“Steam 设置”输入 Steam 用户名和密码。密码只存在于当前浏览器请求、API 到 Worker 的内部 HTTP 请求及 SteamCMD 受控 stdin 中，不进入 BullMQ payload、SQLite、命令行参数或日志。内部端口 `9780` 不对宿主机发布。

出现 `guard_required` 后，在同一页面提交一次性 Guard 码。Guard 码同样不持久化。会话状态保存在 `steam-config`，目录权限应为 `0700`。会话失效会转为 `auth_required`，重新登录即可；系统不会无限重试认证。

Steam Web API Key 与 SteamCMD 会话是两套独立配置：Key 仅由 API 从环境变量读取，前端只能看到“已配置／未配置”，不存在读取原值的接口。登出会终止当前 SteamCMD 进程；必要时可由管理员清理 `steam-config` 后重新登录。

部署仅面向可信局域网，无多租户或权限体系。不要将服务暴露公网。日志检查可使用测试中的脱敏用例，但真实树莓派验收仍须人工确认日志没有密码、Guard 码和完整认证命令。
