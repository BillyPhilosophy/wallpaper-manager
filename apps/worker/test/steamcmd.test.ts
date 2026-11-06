import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SteamCmdClient } from '../src/steamcmd';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('@wallpaper-manager/database', () => ({ prisma: { steamAuthState: { upsert: vi.fn() } } }));

class FakeSteamProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exitCode: number | null = null;
  killed = false;
  kill = vi.fn();
  stdin = { write: vi.fn((input: string) => {
    const output = input.startsWith('login ') ? 'password:' : input === 'secret\n' ? 'Steam Guard code:' : input === 'ABCDE\n' ? 'Logging in user test OK\nSteam> ' : '';
    queueMicrotask(() => this.stdout.emit('data', Buffer.from(output)));
  }) };
}

describe('SteamCMD authentication', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns for an email Guard code and completes authentication without waiting for an early shell prompt', async () => {
    const child = new FakeSteamProcess();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => child.stdout.emit('data', Buffer.from('Steam> ')));
      return child as unknown as ChildProcess;
    });
    const configDir = await mkdtemp(join(tmpdir(), 'wallpaper-manager-steam-'));
    const steam = new SteamCmdClient('steamcmd', configDir, 1000);
    try {
      await steam.login('test', 'secret');
      expect(steam.status).toBe('guard_required');
      await steam.guard('ABCDE');
      expect(steam.status).toBe('authenticated');
      expect(child.stdin.write).toHaveBeenNthCalledWith(3, 'ABCDE\n');
    } finally {
      await steam.close();
      await rm(configDir, { recursive: true, force: true });
    }
  });
});
