import { FormEvent, useEffect, useState } from 'react';
import type { Capabilities, SteamAuthState, SteamQrLoginState } from '@wallpaper-manager/contracts';
import { api, post } from '../api';
import { useRemote } from '../hooks';
import { AsciiQrCode } from '../components/AsciiQrCode';

type SyncState = { status: 'idle' | 'running' | 'succeeded' | 'failed'; total: number; synced: number; message: string | null; updatedAt: string };

export function SettingsPage() {
  const capabilities = useRemote<Capabilities & { steamApiKeyConfigured: boolean }>(() => api('/system/capabilities'), [], 5000);
  const auth = useRemote<SteamAuthState>(() => api('/steam/auth/status'), [], 2500);
  const qr = useRemote<SteamQrLoginState>(() => api('/steam/auth/qr'), [auth.data?.status], auth.data?.status === 'qr_required' ? 750 : 0);
  const sync = useRemote<SyncState>(() => api('/workshop/subscriptions/sync'), [], 2500);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [steamId, setSteamId] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
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
  const synchronize = async () => { setSyncBusy(true); setMessage(''); try { await post('/workshop/subscriptions/sync', steamId.trim() ? { steamId: steamId.trim() } : {}); sync.reload(); auth.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : '同步失败'); } finally { setSyncBusy(false); } };
  return <section>
    <div className="page-heading"><div><p className="eyebrow">SYSTEM & STEAM</p><h1>设置</h1><p>管理 Steam 会话。扫码登录不需要密码；账密登录的密码仅用于当前请求。</p></div></div>
    <div className="settings-grid">
      <article className="settings-card"><h2>Steam Web API</h2><p>官方工坊搜索使用服务端环境变量中的独立 API Key。</p><div className="setting-row"><span>API Key</span><strong>{capabilities.data?.steamApiKeyConfigured ? '已配置' : '未配置'}</strong></div><div className="setting-row"><span>Worker</span><strong>{capabilities.data?.workerReady ? '就绪' : '未连接'}</strong></div><div className="setting-row"><span>WebWallGL</span><strong>{capabilities.data?.webwallglVersion || '3.0.0'}</strong></div></article>
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
          <button disabled={busy || auth.data?.status === 'qr_required'}>账号密码登录</button>
        </form>
        {['guard_required', 'email_required'].includes(auth.data?.status || '') && <form onSubmit={guard}><label>{auth.data?.status === 'email_required' ? '邮箱验证码' : '手机令牌码（Steam Guard）'}<input autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required/></label><button disabled={busy}>提交验证码</button></form>}
        <button className="text-button" onClick={() => void post('/steam/auth/logout').then(auth.reload)}>{auth.data?.status === 'qr_required' ? '取消扫码' : '退出 Steam 会话'}</button>
        {message && <p className="error-text">{message}</p>}
      </article>
      <article className="settings-card">
        <h2>订阅同步</h2>
        <p>将 Wallpaper Engine 订阅项目加入网站，不会自动下载。已知 SteamID64 时无需登录 Steam。</p>
        <label>SteamID64<input inputMode="numeric" autoComplete="off" value={steamId} onChange={(e) => setSteamId(e.target.value)} placeholder="填写后同步并保存；留空使用已保存值"/></label>
        <div className="setting-row"><span>同步状态</span><strong>{syncLabel(sync.data)}</strong></div>
        {sync.data?.status === 'running' && <p>已处理 {sync.data.synced} / {sync.data.total || '…'} 项</p>}
        <p>最近同步：{new Date(sync.data?.updatedAt || '').toLocaleString()}</p>
        <button disabled={syncBusy || sync.data?.status === 'running'} onClick={synchronize}>同步订阅列表</button>
      </article>
    </div>
  </section>;
}
function authLabel(status?: string) { return ({ authenticated: '已认证', auth_required: '需要登录', guard_required: '需要手机令牌码', email_required: '需要邮箱验证码', confirmation_required: '等待手机确认', qr_required: '等待手机扫码', error: '登录错误' } as Record<string, string>)[status || ''] || '读取中'; }
function syncLabel(sync?: SyncState | null) { return sync?.status === 'running' ? '同步中' : sync?.status === 'succeeded' ? `成功，共 ${sync.total} 项` : sync?.status === 'failed' ? sync.message || '同步失败' : '尚未同步'; }
