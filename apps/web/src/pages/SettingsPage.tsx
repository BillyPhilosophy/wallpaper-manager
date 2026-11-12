import { FormEvent, useEffect, useState } from 'react';
import type { Capabilities, SteamAuthState, SteamQrLoginState } from '@wallpaper-manager/contracts';
import { api, post } from '../api';
import { useRemote } from '../hooks';
import { AsciiQrCode } from '../components/AsciiQrCode';
import { contentFilterEnabled, setContentFilterEnabled } from '../features/content-filter';
import { AppearancePanel } from '../features/appearance/AppearancePanel';

export function SettingsPage() {
  const capabilities = useRemote<Capabilities & { steamApiKeyConfigured: boolean }>(() => api('/system/capabilities'), [], 5000);
  const auth = useRemote<SteamAuthState>(() => api('/steam/auth/status'), [], 2500);
  const qr = useRemote<SteamQrLoginState>(() => api('/steam/auth/qr'), [auth.data?.status], auth.data?.status === 'qr_required' ? 750 : 0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [steamId, setSteamId] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [contentFilter, setContentFilter] = useState(contentFilterEnabled());
  useEffect(() => { if (auth.data?.steamId) setSteamId(auth.data.steamId); }, [auth.data?.steamId]);
  const startQr = async () => {
    setBusy(true); setMessage('');
    try { await post('/steam/auth/qr', steamId ? { steamId } : {}); auth.reload(); qr.reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '扫码登录失败'); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await post('/steam/auth/login', { username, password, ...(steamId ? { steamId } : {}) }); setPassword(''); auth.reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '登录失败'); }
    finally { setBusy(false); }
  };
  const guard = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await post('/steam/auth/guard', { code }); setCode(''); auth.reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '登录失败'); }
    finally { setBusy(false); }
  };
  return <section>
    <div className="page-heading"><div><p className="eyebrow">SYSTEM & STEAM</p><h1>设置</h1><p>管理 Steam 会话。扫码登录不需要密码；账密登录的密码仅用于当前请求。</p></div></div>
    <div className="settings-grid">
      <AppearancePanel/>
      <article className="settings-card"><h2>Steam Web API</h2><p>官方工坊搜索使用服务端环境变量中的独立 API Key。</p><div className="setting-row"><span>API Key</span><strong>{capabilities.data?.steamApiKeyConfigured ? '已配置' : '未配置'}</strong></div><div className="setting-row"><span>Worker</span><strong>{capabilities.data?.workerReady ? '就绪' : '未连接'}</strong></div><div className="setting-row"><span>WebWallGL</span><strong>{capabilities.data?.webwallglVersion || '3.0.0'}</strong></div></article>
      <article className="settings-card"><h2>搜索内容过滤</h2><p>默认只显示全年龄和 PG13 内容，排除成人及未分级项目。关闭后不过滤这些内容。</p><label className="content-filter-toggle"><input type="checkbox" role="switch" checked={contentFilter} onChange={(event) => { setContentFilterEnabled(event.target.checked); setContentFilter(event.target.checked); }}/>过滤成人和未分级内容</label></article>
      <article className="settings-card">
        <h2>Steam 登录</h2>
        <p>当前状态：<strong>{authLabel(auth.data?.status)}</strong></p>
        {auth.data?.accountName && <p>账号：{auth.data.accountName}</p>}
        {auth.data?.message && <p className="notice">{auth.data.message}</p>}
        <p>推荐使用 Steam 手机 App 扫码并确认，不需要输入密码或迁移手机认证器。</p>
        <button disabled={busy || auth.data?.status === 'qr_required'} onClick={startQr}>扫码登录</button>
        {auth.data?.status === 'qr_required' && <div className="qr-login">
          {qr.data?.qrCode ? <AsciiQrCode value={qr.data.qrCode}/> : <p>正在生成二维码…</p>}
          <p>二维码会自动刷新，请在五分钟内完成扫码和手机确认。</p>
        </div>}
        <p>或使用账号密码登录。需要手机确认时直接在 App 批准；需要手机令牌码时才会使用 steamguard-cli 或手工输入。</p>
        <form onSubmit={submit}>
          <label>Steam 用户名<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required/></label>
          <label>密码<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required/></label>
          <button disabled={busy || ['qr_required', 'authenticating'].includes(auth.data?.status || '')}>账号密码登录</button>
        </form>
        {['guard_required', 'email_required'].includes(auth.data?.status || '') && <form onSubmit={guard}><label>{auth.data?.status === 'email_required' ? '邮箱验证码' : '手机令牌码（Steam Guard）'}<input autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required/></label><button disabled={busy}>提交验证码</button></form>}
        <button className="text-button" onClick={() => void post('/steam/auth/logout').then(auth.reload)}>{auth.data?.status === 'qr_required' ? '取消扫码' : '退出 Steam 会话'}</button>
        {message && <p className="error-text">{message}</p>}
      </article>
    </div>
  </section>;
}
function authLabel(status?: string) { return ({ authenticated: '已认证', authenticating: '正在连接 Steam', auth_required: '需要登录', guard_required: '需要手机令牌码', email_required: '需要邮箱验证码', confirmation_required: '等待手机确认', qr_required: '等待手机扫码', error: '登录错误' } as Record<string, string>)[status || ''] || '读取中'; }
