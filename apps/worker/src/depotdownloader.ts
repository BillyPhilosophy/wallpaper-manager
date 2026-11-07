import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@wallpaper-manager/database';
import { sanitizeError } from '@wallpaper-manager/wallpaper-files';
import { SteamNetworkController } from '@wallpaper-manager/steam-network';
import type { DownloadProgress } from '@wallpaper-manager/contracts';
import type { AuthStatus, ProgressListener, SteamClient, SteamQrLoginState } from './steam';
import type { SteamGuardClient } from './steamguard';

const AUTH_TIMEOUT_MS = 120_000;
const QR_TIMEOUT_MS = 300_000;
const PASSWORD_PROMPT = /Enter account password/i;
const DEVICE_GUARD_PROMPT = /2-factor auth code from your authenticator app/i;
const EMAIL_GUARD_PROMPT = /auth code sent to the email/i;
const DEVICE_CONFIRMATION_PROMPT = /Use the Steam Mobile App to confirm your sign in/i;
const GUARD_PROMPT = new RegExp(`${DEVICE_GUARD_PROMPT.source}|${EMAIL_GUARD_PROMPT.source}|${DEVICE_CONFIRMATION_PROMPT.source}`, 'i');
const INCORRECT_GUARD = /previous 2-factor auth code.*incorrect/i;
const QR_MARKER = 'Use the Steam Mobile App to sign in with this QR code:';
const QR_ACCOUNT = /Success! Next time you can login with -username ([^\s]+) -remember-password instead of -qr/i;

interface ActiveProcess {
  child: ChildProcess;
  mode: 'login' | 'qr' | 'download';
  output: string;
  exited: boolean;
  exitCode: number | null;
  error: boolean;
  progressBuffer: string;
  onProgress?: ProgressListener;
  previousNetwork?: { bytes: number; time: number; rate: number };
}

export class DepotDownloaderClient implements SteamClient {
  private active: ActiveProcess | null = null;
  private starting = false;
  private qrCode: string | null = null;
  private qrUpdatedAt: string | null = null;
  accountName: string | null = null;
  steamId: string | null = null;
  status: AuthStatus = 'auth_required';

  constructor(private readonly binary: string, private readonly configDir: string, private readonly timeoutMs: number, private readonly steamGuard: SteamGuardClient, private readonly network = new SteamNetworkController()) { }

  async initialize(): Promise<void> {
    const state = await prisma.steamAuthState.findUnique({ where: { id: 1 } });
    this.accountName = state?.accountName || null;
    this.steamId = state?.steamId || null;
    this.status = state?.status === 'authenticated' && this.accountName ? 'authenticated' : 'auth_required';
    if (state && state.status !== this.status) await this.updateState(this.status, this.status === 'auth_required' ? '请重新完成 Steam 登录' : null);
  }

  async updateState(status: AuthStatus, message: string | null = null): Promise<void> {
    this.status = status;
    console.log(`[steam] status=${status}${message ? ` message=${message}` : ''}`);
    const data = { status, message, steamId: this.steamId, accountName: this.accountName };
    await prisma.steamAuthState.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  }

  qrLoginState(): SteamQrLoginState {
    return { status: this.status, qrCode: this.status === 'qr_required' ? this.qrCode : null, updatedAt: this.status === 'qr_required' ? this.qrUpdatedAt : null };
  }

  async startQrLogin(steamId?: string): Promise<void> {
    if (steamId && !/^7656119\d{10}$/.test(steamId)) throw new Error('INVALID_STEAM_ID');
    if (this.active || this.starting) throw new Error('STEAM_BUSY');
    this.starting = true;
    const probeDir = path.join(this.configDir, 'auth-probe');
    let run: ActiveProcess | null = null;
    try {
      await mkdir(this.configDir, { recursive: true, mode: 0o700 });
      await chmod(this.configDir, 0o700).catch(() => undefined);
      await this.removeStoredSession();
      await rm(probeDir, { recursive: true, force: true });
      this.accountName = null;
      this.steamId = steamId || this.steamId;
      this.clearQr();
      run = await this.start('qr', ['-app', '431960', '-manifest-only', '-qr', '-remember-password', '-dir', probeDir]);
      await this.updateState('qr_required', '请使用 Steam 手机 App 扫码并确认');
    } finally {
      this.starting = false;
      if (run && this.status !== 'qr_required') {
        this.terminate(run);
        this.active = null;
      }
    }
    void this.monitorQrLogin(run, probeDir);
  }

  async login(username: string, password: string, steamId?: string): Promise<void> {
    if (!/^[^\s]{1,64}$/.test(username) || !password) throw new Error('INVALID_LOGIN');
    if (steamId && !/^7656119\d{10}$/.test(steamId)) throw new Error('INVALID_STEAM_ID');
    if (this.active || this.starting) throw new Error('STEAM_BUSY');

    this.starting = true;
    const probeDir = path.join(this.configDir, 'auth-probe');
    let run: ActiveProcess | null = null;
    try {
      await this.updateState('authenticating', '正在连接 Steam，请稍候');
      await mkdir(this.configDir, { recursive: true, mode: 0o700 });
      await chmod(this.configDir, 0o700).catch(() => undefined);
      const previousAccount = this.accountName;
      this.accountName = username;
      this.steamId = steamId || await this.steamGuard.steamId(username) || (previousAccount === username ? this.steamId : null);
      await this.removeStoredSession();
      await rm(probeDir, { recursive: true, force: true });
      this.clearQr();
      const activeRun = await this.start('login', ['-app', '431960', '-manifest-only', '-username', username, '-remember-password', '-dir', probeDir]);
      run = activeRun;
      let matched = await this.wait(activeRun, new RegExp(`${PASSWORD_PROMPT.source}|${GUARD_PROMPT.source}`, 'i'), AUTH_TIMEOUT_MS);
      if (!activeRun.exited && PASSWORD_PROMPT.test(activeRun.output)) {
        activeRun.output = '';
        this.write(activeRun, `${password.replace(/[\r\n]/g, '')}\n`);
        password = '';
        matched = await this.wait(activeRun, GUARD_PROMPT, AUTH_TIMEOUT_MS);
      }
      if (activeRun.exited) {
        await this.completeLogin(activeRun, probeDir);
        return;
      }
      if (!matched) throw new Error('STEAM_AUTH_REQUIRED');

      if (DEVICE_CONFIRMATION_PROMPT.test(activeRun.output)) {
        await this.updateState('confirmation_required', '请在 Steam 手机 App 中确认本次登录');
        void this.monitorPasswordLogin(activeRun, probeDir);
        return;
      }
      if (DEVICE_GUARD_PROMPT.test(activeRun.output)) {
        try {
          const code = await this.steamGuard.generateCode(username);
          activeRun.output = '';
          this.write(activeRun, `${code}\n`);
          await this.wait(activeRun, INCORRECT_GUARD, AUTH_TIMEOUT_MS);
          if (activeRun.error) throw new Error('STEAM_AUTH_REQUIRED');
          if (!activeRun.exited && INCORRECT_GUARD.test(activeRun.output)) throw new Error('STEAM_GUARD_REQUIRED');
          if (activeRun.exited) {
            await this.completeLogin(activeRun, probeDir);
            return;
          }
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'STEAM_GUARD_REQUIRED') throw error;
          if (activeRun.exited) throw error;
        }
      }
      await this.updateState(EMAIL_GUARD_PROMPT.test(activeRun.output) ? 'email_required' : 'guard_required', EMAIL_GUARD_PROMPT.test(activeRun.output) ? '请输入发送到邮箱的验证码' : '请输入手机令牌码');
    } catch (error) {
      if (run) this.terminate(run);
      if (this.active === run) this.active = null;
      await rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
      const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      await this.updateState(code === 'STEAM_AUTH_REQUIRED' ? 'auth_required' : 'error', safeAuthMessage(error));
      throw error;
    } finally {
      this.starting = false;
    }
  }

  async guard(code: string): Promise<void> {
    const run = this.active;
    if (!['guard_required', 'email_required'].includes(this.status) || !run || run.mode !== 'login' || !/^[A-Za-z0-9-]{4,16}$/.test(code)) throw new Error('STEAM_GUARD_REQUIRED');
    run.output = '';
    this.write(run, `${code}\n`);
    try {
      await this.wait(run, INCORRECT_GUARD, AUTH_TIMEOUT_MS);
      if (!run.exited) {
        await this.updateState(this.status, '验证码无效，请重试');
        throw new Error('STEAM_GUARD_REQUIRED');
      }
      await this.completeLogin(run, path.join(this.configDir, 'auth-probe'));
    } catch (error) {
      if (error instanceof Error && error.message === 'STEAM_GUARD_REQUIRED' && !run.exited) throw error;
      this.terminate(run);
      this.active = null;
      await this.updateState('error', safeAuthMessage(error));
      throw error;
    }
  }

  async logout(): Promise<void> {
    if (this.starting) throw new Error('STEAM_BUSY');
    if (this.active) {
      const run = this.active;
      this.terminate(run);
      await this.wait(run, /(?!)/, 5000).catch(() => undefined);
    }
    this.active = null;
    this.clearQr();
    await this.removeStoredSession();
    await rm(path.join(this.configDir, 'auth-probe'), { recursive: true, force: true });
    this.accountName = null;
    await this.updateState('auth_required');
  }

  async download(target: string, workshopId: string, isCancelled: () => Promise<boolean>, onProgress?: ProgressListener): Promise<void> {
    if (!/^\d+$/.test(workshopId)) throw new Error('BAD_REQUEST');
    if (!this.accountName) throw new Error('STEAM_AUTH_REQUIRED');
    if (this.active || this.starting) throw new Error(this.active?.mode === 'download' || this.starting ? 'STEAM_BUSY' : 'STEAM_AUTH_REQUIRED');
    this.starting = true;
    try {
      await mkdir(target, { recursive: true, mode: 0o755 });
    } finally {
      this.starting = false;
    }
    const run = await this.start('download', ['-app', '431960', '-pubfile', workshopId, '-username', this.accountName, '-remember-password', '-dir', target], onProgress);
    try {
      await this.wait(run, new RegExp(`${PASSWORD_PROMPT.source}|${GUARD_PROMPT.source}`, 'i'), this.timeoutMs, isCancelled);
      if (!run.exited) {
        this.terminate(run);
        await this.updateState('auth_required', 'Steam 会话已失效，请重新登录');
        throw new Error('STEAM_AUTH_REQUIRED');
      }
      if (run.exitCode !== 0 || run.error) throw new Error(downloadErrorCode(run.output));
      await rm(path.join(target, '.DepotDownloader'), { recursive: true, force: true });
      await this.updateState('authenticated');
    } catch (error) {
      this.terminate(run);
      if (error instanceof Error && error.message === 'STEAM_AUTH_REQUIRED') await this.updateState('auth_required', 'Steam 会话已失效，请重新登录');
      throw error;
    } finally {
      if (this.active === run) this.active = null;
    }
  }

  async close(): Promise<void> {
    if (this.active) this.terminate(this.active);
    this.active = null;
    this.clearQr();
  }

  private async start(mode: ActiveProcess['mode'], args: string[], onProgress?: ProgressListener): Promise<ActiveProcess> {
    console.log(`[steam] starting DepotDownloader mode=${mode}`);
    this.starting = true;
    try {
      const env = await this.network.processEnv({ ...process.env, HOME: this.configDir });
      delete env.STEAMGUARD_CLI_PASSKEY;
      console.log(`[steam] network route=${env.STEAM_PROXY_URL ? 'proxy' : 'direct'}`);
      const child = spawn(this.binary, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
      const run: ActiveProcess = { child, mode, output: '', exited: false, exitCode: null, error: false, progressBuffer: '', onProgress };
    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      run.output = (run.output + text).slice(-32_000);
      if (run.mode === 'qr') this.captureQr(run.output);
      if (run.onProgress) {
        run.progressBuffer = (run.progressBuffer + text).slice(-8192);
        const lines = run.progressBuffer.split(/\r?\n/);
        run.progressBuffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('WM_PROGRESS ')) this.reportProgress(run, line);
        }
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', () => { run.error = true; });
    child.on('close', (code) => {
      run.exited = true;
      run.exitCode = code;
      const message = `[steam] DepotDownloader exited mode=${mode} code=${code ?? 'null'}`;
      if (code === 0) console.log(message);
      else console.warn(`${message} reason=${run.error ? 'SPAWN_FAILED' : depotFailureCode(run.output)}`);
    });
      this.active = run;
      return run;
    } finally {
      this.starting = false;
    }
  }

  private reportProgress(run: ActiveProcess, line: string): void {
    try {
      const data = JSON.parse(line.slice('WM_PROGRESS '.length)) as Record<string, unknown>;
      const downloadedBytes = Number(data.downloadedBytes);
      const networkBytes = Number(data.networkBytes);
      const totalBytes = Number(data.totalBytes);
      if (![downloadedBytes, networkBytes, totalBytes].every((value) => Number.isSafeInteger(value) && value >= 0)) return;
      const now = Date.now();
      const previous = run.previousNetwork;
      let rate = 0;
      if (previous && now > previous.time) {
        const instantaneous = Math.max(0, networkBytes - previous.bytes) / ((now - previous.time) / 1000);
        rate = previous.rate ? previous.rate * 0.7 + instantaneous * 0.3 : instantaneous;
      }
      run.previousNetwork = { bytes: networkBytes, time: now, rate };
      const progress: DownloadProgress = {
        downloadedBytes: String(downloadedBytes),
        totalBytes: String(totalBytes),
        networkBytes: String(networkBytes),
        bytesPerSecond: String(Math.max(0, Math.round(rate))),
        percent: totalBytes > 0 ? Math.min(100, Math.max(0, downloadedBytes / totalBytes * 100)) : null,
        updatedAt: new Date(now).toISOString(),
      };
      run.onProgress?.(progress);
    } catch { }
  }

  private captureQr(output: string): void {
    const marker = output.lastIndexOf(QR_MARKER);
    if (marker < 0) return;
    const qrCode = output.slice(marker + QR_MARKER.length).replace(/^(?:\r?\n)+/, '');
    if (!qrCode || qrCode === this.qrCode) return;
    this.qrCode = qrCode;
    this.qrUpdatedAt = new Date().toISOString();
  }

  private async monitorPasswordLogin(run: ActiveProcess, probeDir: string): Promise<void> {
    try {
      await this.wait(run, /(?!)/, AUTH_TIMEOUT_MS);
      if (this.active !== run) return;
      await this.completeLogin(run, probeDir);
    } catch (error) {
      this.terminate(run);
      if (this.active !== run) return;
      this.active = null;
      await rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
      const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      await this.updateState(code === 'STEAM_AUTH_REQUIRED' ? 'auth_required' : 'error', safeAuthMessage(error));
    }
  }

  private async monitorQrLogin(run: ActiveProcess, probeDir: string): Promise<void> {
    try {
      await this.wait(run, /(?!)/, QR_TIMEOUT_MS);
      if (this.active !== run) return;
      if (run.exitCode !== 0 || run.error) throw new Error(run.error ? 'STEAM_PROCESS_FAILED' : depotFailureCode(run.output));
      const accountName = QR_ACCOUNT.exec(run.output)?.[1];
      if (!accountName) throw new Error('QR_ACCOUNT_MISSING');
      this.accountName = accountName;
      this.steamId = this.steamId || await this.steamGuard.steamId(accountName);
      await this.completeLogin(run, probeDir);
    } catch (error) {
      this.terminate(run);
      if (this.active !== run) return;
      this.active = null;
      this.clearQr();
      await rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
      const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      await this.updateState(code === 'STEAM_AUTH_REQUIRED' ? 'auth_required' : 'error', safeAuthMessage(error));
    }
  }

  private write(run: ActiveProcess, value: string): void {
    if (run.exited || !run.child.stdin?.writable) throw new Error(run.mode === 'login' ? 'STEAM_AUTH_REQUIRED' : 'STEAM_DOWNLOAD_FAILED');
    run.child.stdin.write(value);
  }

  private async wait(run: ActiveProcess, pattern: RegExp, timeout: number, isCancelled?: () => Promise<boolean>): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (!run.exited && !run.error) {
      if (isCancelled && await isCancelled()) {
        this.terminate(run);
        throw new Error('CANCELLED');
      }
      if (pattern.test(run.output)) return true;
      if (Date.now() >= deadline) {
        this.terminate(run);
        throw new Error('DOWNLOAD_TIMEOUT');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  private async completeLogin(run: ActiveProcess, probeDir: string): Promise<void> {
    if (run.exitCode !== 0 || run.error) throw new Error(run.error ? 'STEAM_PROCESS_FAILED' : depotFailureCode(run.output));
    this.steamId = this.steamId || (this.accountName ? await this.steamGuard.steamId(this.accountName) : null);
    if (this.active === run) this.active = null;
    this.clearQr();
    await rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
    await this.updateState('authenticated');
  }

  private clearQr(): void {
    this.qrCode = null;
    this.qrUpdatedAt = null;
  }

  private terminate(run: ActiveProcess): void {
    if (run.exited) return;
    run.child.kill('SIGTERM');
    const timer = setTimeout(() => { if (!run.exited) run.child.kill('SIGKILL'); }, 5000);
    timer.unref();
  }

  private async removeStoredSession(): Promise<void> {
    const files: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name === 'account.config') files.push(full);
      }
    };
    await walk(this.configDir);
    await Promise.all(files.map((file) => rm(file, { force: true })));
  }
}

function downloadErrorCode(output: string): string {
  return depotFailureCode(output);
}

function depotFailureCode(output: string): string {
  if (!output.trim()) return 'STEAM_PROCESS_FAILED';
  if (/rate.?limit|too many requests|throttl/i.test(output)) return 'STEAM_RATE_LIMITED';
  if (/could not connect|connection.*failed|timed out|timeout|ECONN|ENOTFOUND|UND_ERR_|network|ServiceUnavailable|no connection/i.test(output)) return 'STEAM_NETWORK_UNAVAILABLE';
  if (/not available from this account|app .*not available/i.test(output)) return 'STEAM_APP_UNAVAILABLE';
  if (/access token was rejected|failed to authenticate|invalid.?password|invalid.?signature|access denied|accountlogondenied|\b(expired|revoked)\b/i.test(output)) return 'STEAM_AUTH_REQUIRED';
  if (/steam guard|authenticator|verification code/i.test(output)) return 'STEAM_GUARD_REQUIRED';
  if (/file.?not.?found|not found|no subscription|unsupported file type|unable to locate manifest/i.test(output)) return 'WORKSHOP_ITEM_NOT_FOUND';
  if (/no space left|ENOSPC/.test(output)) return 'DISK_FULL';
  return 'STEAM_DOWNLOAD_FAILED';
}

const AUTH_ERROR_CODES = new Set(['STEAM_AUTH_REQUIRED', 'STEAM_GUARD_REQUIRED', 'STEAM_BUSY', 'STEAM_RATE_LIMITED', 'STEAM_NETWORK_UNAVAILABLE', 'STEAM_APP_UNAVAILABLE', 'STEAM_PROCESS_FAILED', 'STEAM_DOWNLOAD_FAILED', 'STEAM_API_UNAVAILABLE', 'DOWNLOAD_TIMEOUT', 'INVALID_LOGIN', 'INVALID_STEAM_ID', 'QR_ACCOUNT_MISSING']);

export function authErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  return AUTH_ERROR_CODES.has(code) ? code : 'INTERNAL_ERROR';
}

export function safeAuthMessage(error: unknown): string {
  const code = authErrorCode(error);
  const messages: Record<string, string> = {
    STEAM_AUTH_REQUIRED: 'Steam 登录失效，请重新登录',
    STEAM_GUARD_REQUIRED: 'Steam Guard 验证失败',
    STEAM_BUSY: '另一个 Steam 操作正在进行',
    STEAM_RATE_LIMITED: 'Steam 请求限流，请稍后重试',
    STEAM_NETWORK_UNAVAILABLE: '无法连接 Steam，请检查直连或代理线路',
    STEAM_APP_UNAVAILABLE: '当前账号无法访问 Wallpaper Engine',
    STEAM_PROCESS_FAILED: 'DepotDownloader 进程异常退出，请检查日志中的错误码',
    STEAM_DOWNLOAD_FAILED: 'Steam 操作失败，请检查日志中的错误码',
    STEAM_API_UNAVAILABLE: 'Steam 官方接口暂不可用',
    DOWNLOAD_TIMEOUT: 'DepotDownloader 操作超时',
    INVALID_LOGIN: '用户名或密码格式无效',
    INVALID_STEAM_ID: 'SteamID64 格式无效',
    QR_ACCOUNT_MISSING: '扫码成功但未取得账号名，请改用账号密码登录',
  };
  return messages[code] || sanitizeError(error).message;
}
