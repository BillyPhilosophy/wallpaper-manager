import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmod, mkdir } from 'node:fs/promises';
import { prisma } from '@wallpaper-manager/database';
import { sanitizeError } from '@wallpaper-manager/wallpaper-files';

export type AuthStatus = 'authenticated' | 'auth_required' | 'guard_required' | 'error';
export class SteamCmdClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private output = '';
  private promptWaiters: (() => void)[] = [];
  private username = '';
  status: AuthStatus = 'auth_required';
  constructor(private readonly binary: string, private readonly configDir: string, private readonly timeoutMs: number) { super(); }
  async updateState(status: AuthStatus, message: string | null = null) {
    this.status = status;
    await prisma.steamAuthState.upsert({ where: { id: 1 }, update: { status, message }, create: { id: 1, status, message } });
  }
  private async ensureProcess(): Promise<ChildProcess> {
    if (this.process && this.process.exitCode === null && !this.process.killed) return this.process;
    await mkdir(this.configDir, { recursive: true, mode: 0o700 }); await chmod(this.configDir, 0o700).catch(() => undefined);
    const child = spawn(this.binary, [], { env: { ...process.env, HOME: this.configDir }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process = child; this.output = '';
    const onData = (chunk: Buffer) => {
      this.output = (this.output + chunk.toString('utf8')).slice(-32_000);
      if (/Steam Guard|two-factor|authenticator.*code|verification code/i.test(this.output)) { this.status = 'guard_required'; void this.updateState('guard_required', '需要 Steam Guard 验证码'); }
      if (/Logging in user.*OK|Logged in OK|login.*success/i.test(this.output)) { this.status = 'authenticated'; void this.updateState('authenticated'); }
      if (/Steam>\s*$/.test(this.output)) { const waiters = this.promptWaiters.splice(0); waiters.forEach((resolve) => resolve()); }
    };
    child.stdout?.on('data', onData); child.stderr?.on('data', onData);
    child.on('error', () => void this.updateState('error', 'SteamCMD 无法启动'));
    child.on('exit', () => { if (this.process === child) this.process = null; });
    await this.waitPrompt(30000); return child;
  }
  private waitPrompt(timeout = this.timeoutMs): Promise<void> {
    if (/Steam>\s*$/.test(this.output)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('DOWNLOAD_TIMEOUT')); }, timeout);
      this.promptWaiters.push(() => { clearTimeout(timer); resolve(); });
    });
  }
  async login(username: string, password: string): Promise<void> {
    if (!/^[^\s]{1,64}$/.test(username) || !password) throw new Error('INVALID_LOGIN');
    this.username = username;
    try {
      const child = await this.ensureProcess(); this.output = '';
      child.stdin?.write(`login ${username}\n`);
      await this.waitFor(/password:/i, 30000);
      child.stdin?.write(`${password.replace(/[\r\n]/g, '')}\n`);
      await this.waitPrompt(120000);
      if (this.status === 'guard_required') return;
      if (/FAILED|Invalid Password|incorrect/i.test(this.output)) throw new Error('STEAM_AUTH_REQUIRED');
      await this.updateState('authenticated');
    } catch (error) { await this.updateState('error', safeAuthMessage(error)); throw error; }
  }
  async guard(code: string): Promise<void> {
    if (this.status !== 'guard_required' || !/^[A-Za-z0-9-]{4,16}$/.test(code)) throw new Error('STEAM_GUARD_REQUIRED');
    const child = this.process; if (!child) throw new Error('STEAM_AUTH_REQUIRED');
    this.output = ''; child.stdin?.write(`${code}\n`); await this.waitPrompt(120000);
    if ((this.status as AuthStatus) !== 'authenticated') throw new Error('STEAM_GUARD_REQUIRED');
  }
  async logout(): Promise<void> {
    const child = this.process; if (child) { child.stdin?.write('logout\n'); await new Promise((resolve) => setTimeout(resolve, 500)); child.kill('SIGTERM'); }
    this.process = null; this.username = ''; await this.updateState('auth_required');
  }
  async download(staging: string, workshopId: string, isCancelled: () => Promise<boolean>): Promise<void> {
    if (this.status !== 'authenticated') throw new Error('STEAM_AUTH_REQUIRED');
    const child = await this.ensureProcess(); this.output = '';
    child.stdin?.write(`force_install_dir ${staging}\n`); await this.waitPrompt();
    this.output = ''; child.stdin?.write(`workshop_download_item 431960 ${workshopId} validate\n`);
    let completed = false; const deadline = Date.now() + this.timeoutMs;
    while (!completed && Date.now() < deadline) {
      if (await isCancelled()) { child.kill('SIGTERM'); this.process = null; throw new Error('CANCELLED'); }
      await new Promise((resolve) => setTimeout(resolve, 500)); completed = /Steam>\s*$/.test(this.output);
    }
    if (!completed) { child.kill('SIGTERM'); this.process = null; throw new Error('DOWNLOAD_TIMEOUT'); }
    if (/ERROR!|Failed to download|Timeout|No subscription|Access Denied/i.test(this.output)) {
      if (/rate|throttl/i.test(this.output)) throw new Error('STEAM_RATE_LIMITED');
      if (/No subscription|not found/i.test(this.output)) throw new Error('WORKSHOP_ITEM_NOT_FOUND');
      if (/login|logged|Access Denied/i.test(this.output)) { await this.updateState('auth_required', 'Steam 会话已失效'); throw new Error('STEAM_AUTH_REQUIRED'); }
      throw new Error('STEAM_DOWNLOAD_FAILED');
    }
  }
  private waitFor(pattern: RegExp, timeout: number): Promise<void> {
    const started = Date.now(); const poll = async (): Promise<void> => { if (pattern.test(this.output)) return; if (Date.now() - started > timeout) throw new Error('DOWNLOAD_TIMEOUT'); await new Promise((resolve) => setTimeout(resolve, 100)); return poll(); }; return poll();
  }
  async close() { this.process?.kill('SIGTERM'); this.process = null; }
}
export function safeAuthMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  const messages: Record<string, string> = { STEAM_AUTH_REQUIRED: 'Steam 登录失效，请重新登录', STEAM_GUARD_REQUIRED: 'Steam Guard 验证失败', DOWNLOAD_TIMEOUT: 'SteamCMD 操作超时', INVALID_LOGIN: '用户名或密码格式无效' };
  return messages[code] || sanitizeError(error).message;
}
