import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepotDownloaderClient } from '../src/depotdownloader';
import { SteamGuardClient } from '../src/steamguard';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('@wallpaper-manager/database', () => ({ prisma: { steamAuthState: { upsert: vi.fn(), findUnique: vi.fn() } } }));

class FakeStream extends EventEmitter { resume = vi.fn(); }
class FakeProcess extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  exitCode: number | null = null;
  killed = false;
  stdin: { writable: boolean; write: ReturnType<typeof vi.fn> };
  kill = vi.fn();
  constructor(onWrite: (input: string, child: FakeProcess) => void = () => undefined) {
    super();
    this.stdin = { writable: true, write: vi.fn((input: string) => onWrite(input, this)) };
  }
  output(value: string, error = false) { (error ? this.stderr : this.stdout).emit('data', Buffer.from(value)); }
  close(code = 0) { this.exitCode = code; queueMicrotask(() => this.emit('close', code)); }
  asChild() { return this as unknown as ChildProcess; }
}

async function maFiles(root: string): Promise<string> {
  const directory = path.join(root, 'maFiles');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'manifest.json'), '{"version":1,"entries":[{"account_name":"test","steam_id":76561197960265851}]}');
  return directory;
}

describe('DepotDownloader authentication', () => {
  afterEach(() => vi.clearAllMocks());

  it('uses steamguard-cli for device Guard without putting secrets in arguments', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const guardFiles = await maFiles(root);
    const depot = new FakeProcess((input, child) => {
      if (input === 'secret\n') queueMicrotask(() => child.output('STEAM GUARD! Please enter your 2-factor auth code from your authenticator app: ', true));
      if (input === 'ABCDE\n') child.close();
    });
    const guard = new FakeProcess();
    vi.mocked(spawn).mockImplementation((binary) => {
      if (binary === 'steamguard') {
        queueMicrotask(() => { guard.output('INFO generating code\n', true); guard.output('ABCDE\n'); guard.close(); });
        return guard.asChild();
      }
      queueMicrotask(() => depot.output('Enter account password for "test": '));
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', guardFiles));
    try {
      await steam.login('test', 'secret');
      expect(steam.status).toBe('authenticated');
      expect(steam.steamId).toBe('76561197960265851');
      expect(depot.stdin.write).toHaveBeenNthCalledWith(1, 'secret\n');
      expect(depot.stdin.write).toHaveBeenNthCalledWith(2, 'ABCDE\n');
      for (const call of vi.mocked(spawn).mock.calls) expect(call[1]).not.toEqual(expect.arrayContaining(['secret', 'ABCDE']));
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('serializes login attempts while the downloader is still starting', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    let release = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const guard = { steamId: vi.fn(async () => { await gate; return null; }) } as unknown as SteamGuardClient;
    const depot = new FakeProcess((input, child) => { if (input === 'secret\n') child.close(); });
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => depot.output('Enter account password for "test": '));
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, guard);
    try {
      const first = steam.login('test', 'secret');
      expect(() => steam.login('test', 'secret')).toThrow('STEAM_BUSY');
      release();
      await first;
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to manual Guard and stores a supplied SteamID64', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess((input, child) => {
      if (input === 'secret\n') queueMicrotask(() => child.output('STEAM GUARD! Please enter your 2-factor auth code from your authenticator app: ', true));
      if (input === 'ABCDE\n') child.close();
    });
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => depot.output('Enter account password for "test": '));
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    try {
      await steam.login('test', 'secret', '76561197960265851');
      expect(steam.status).toBe('guard_required');
      await steam.guard('ABCDE');
      expect(steam.status).toBe('authenticated');
      expect(steam.steamId).toBe('76561197960265851');
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('waits for upstream device confirmation without requesting a code', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess((input, child) => {
      if (input === 'secret\n') queueMicrotask(() => child.output('STEAM GUARD! Use the Steam Mobile App to confirm your sign in...', true));
    });
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => depot.output('Enter account password for "test": '));
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    try {
      await steam.login('test', 'secret');
      expect(steam.status).toBe('confirmation_required');
      expect(depot.stdin.write).toHaveBeenCalledTimes(1);
      expect(vi.mocked(spawn).mock.calls[0][1]).not.toContain('-no-mobile');
      depot.close();
      await vi.waitFor(() => expect(steam.status).toBe('authenticated'));
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('distinguishes email Guard from a device authenticator code', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess((input, child) => {
      if (input === 'secret\n') queueMicrotask(() => child.output('STEAM GUARD! Please enter the auth code sent to the email at hidden@example.test: ', true));
      if (input === 'EMAIL\n') child.close();
    });
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => depot.output('Enter account password for "test": '));
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    try {
      await steam.login('test', 'secret');
      expect(steam.status).toBe('email_required');
      await steam.guard('EMAIL');
      expect(steam.status).toBe('authenticated');
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an incorrect manual Guard code without closing the login process', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess((input, child) => {
      if (input === 'secret\n') queueMicrotask(() => child.output('STEAM GUARD! Please enter your 2-factor auth code from your authenticator app: ', true));
      if (input === 'WRONG\n') queueMicrotask(() => child.output('The previous 2-factor auth code you have provided is incorrect.', true));
    });
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => depot.output('Enter account password for "test": '));
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    try {
      await steam.login('test', 'secret');
      await expect(steam.guard('WRONG')).rejects.toThrow('STEAM_GUARD_REQUIRED');
      expect(steam.status).toBe('guard_required');
      expect(depot.kill).not.toHaveBeenCalled();
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('starts QR login without credentials, refreshes the code and completes authentication', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess();
    vi.mocked(spawn).mockImplementation(() => depot.asChild());
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    try {
      await steam.startQrLogin('76561197960265851');
      expect(steam.status).toBe('qr_required');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(steam.status).toBe('qr_required');
      depot.output('Use the Steam Mobile App to sign in with this QR code:\n██ FIRST\n');
      await vi.waitFor(() => expect(steam.qrLoginState().qrCode).toContain('██ FIRST'));
      depot.output('The QR code has changed:\nUse the Steam Mobile App to sign in with this QR code:\n██ SECOND\n');
      expect(steam.qrLoginState().qrCode).toBe('██ SECOND\n');
      const args = vi.mocked(spawn).mock.calls[0][1] as string[];
      expect(args).toEqual(expect.arrayContaining(['-qr', '-remember-password', '-manifest-only']));
      expect(args).not.toContain('-username');
      expect(args).not.toContain('-password');
      depot.output('Success! Next time you can login with -username qruser -remember-password instead of -qr.\n');
      depot.close();
      await vi.waitFor(() => expect(steam.status).toBe('authenticated'));
      expect(steam.accountName).toBe('qruser');
      expect(steam.steamId).toBe('76561197960265851');
      expect(steam.qrLoginState().qrCode).toBeNull();
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports the actual QR process failure without logging its raw output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess();
    vi.mocked(spawn).mockImplementation(() => depot.asChild());
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    try {
      await steam.startQrLogin();
      depot.output('connection failed for https://user:password@example.test token=secret\nUse the Steam Mobile App to sign in with this QR code:\n██ PRIVATE\n', true);
      depot.close(1);
      await vi.waitFor(() => expect(steam.status).toBe('error'));
      expect(warn).toHaveBeenCalledWith('[steam] DepotDownloader exited mode=qr code=1 reason=STEAM_NETWORK_UNAVAILABLE');
      expect(log).toHaveBeenCalledWith('[steam] status=error message=无法连接 Steam，请检查直连或代理线路');
      const logs = [...log.mock.calls, ...warn.mock.calls].flat().join(' ');
      for (const secret of ['password', 'secret', 'example.test', '██ PRIVATE']) expect(logs).not.toContain(secret);
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
      log.mockRestore();
      warn.mockRestore();
    }
  });

  it('keeps a saved subscription SteamID64 across QR login and logout', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess();
    depot.kill.mockImplementation(() => { depot.close(143); });
    vi.mocked(spawn).mockImplementation(() => depot.asChild());
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    steam.steamId = '76561197960265851';
    try {
      await steam.startQrLogin();
      expect(steam.steamId).toBe('76561197960265851');
      await steam.logout();
      expect(steam.steamId).toBe('76561197960265851');
      expect(steam.status).toBe('auth_required');
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('DepotDownloader downloads', () => {
  afterEach(() => vi.clearAllMocks());

  it('downloads a pubfile directly into the staging source and removes downloader metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const target = path.join(root, 'target');
    const depot = new FakeProcess();
    vi.mocked(spawn).mockImplementation((_binary, args) => {
      const directory = String(args?.[args.indexOf('-dir') + 1]);
      queueMicrotask(async () => {
        await mkdir(path.join(directory, '.DepotDownloader'), { recursive: true });
        await writeFile(path.join(directory, '.DepotDownloader', 'depot.config'), 'test');
        depot.close();
      });
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    steam.accountName = 'test';
    try {
      await steam.download(target, '123', async () => false);
      const args = vi.mocked(spawn).mock.calls[0][1] as string[];
      expect(args).toEqual(expect.arrayContaining(['-app', '431960', '-pubfile', '123', '-remember-password', '-dir', target]));
      expect(args).not.toContain('-password');
      await expect(stat(path.join(target, '.DepotDownloader'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('parses structured byte progress and reports percentage and rate', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const target = path.join(root, 'target');
    const depot = new FakeProcess();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(async () => {
        depot.output('WM_PROG');
        depot.output('RESS {"downloadedBytes":50,"networkBytes":25,"totalBytes":100}\n');
        await new Promise((resolve) => setTimeout(resolve, 10));
        depot.output('WM_PROGRESS {"downloadedBytes":100,"networkBytes":75,"totalBytes":100}\n');
        depot.close();
      });
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    steam.accountName = 'test';
    const updates: { percent: number | null; bytesPerSecond: string }[] = [];
    try {
      await steam.download(target, '123', async () => false, (progress) => updates.push(progress));
      expect(updates.map((update) => update.percent)).toEqual([50, 100]);
      expect(updates[0].bytesPerSecond).toBe('0');
      expect(Number(updates[1].bytesPerSecond)).toBeGreaterThan(0);
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('marks a rejected persisted session as requiring authentication', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => { depot.output('Access token was rejected (Expired).', true); depot.close(1); });
      return depot.asChild();
    });
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    steam.accountName = 'test';
    try {
      await expect(steam.download(path.join(root, 'target'), '123', async () => false)).rejects.toThrow('STEAM_AUTH_REQUIRED');
      expect(steam.status).toBe('auth_required');
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('cancels only the active download process', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-depot-'));
    const depot = new FakeProcess();
    vi.mocked(spawn).mockReturnValue(depot.asChild());
    const steam = new DepotDownloaderClient('depotdownloader', path.join(root, 'config'), 1000, new SteamGuardClient('steamguard', path.join(root, 'missing')));
    steam.accountName = 'test';
    let checks = 0;
    try {
      await expect(steam.download(path.join(root, 'target'), '123', async () => ++checks > 1)).rejects.toThrow('CANCELLED');
      expect(depot.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      await steam.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
