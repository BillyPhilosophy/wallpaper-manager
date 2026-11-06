import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SteamGuardClient } from '../src/steamguard';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

class FakeStream extends EventEmitter { resume = vi.fn(); }
class FakeProcess extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  kill = vi.fn();
  asChild() { return this as unknown as ChildProcess; }
}

describe('steamguard-cli', () => {
  afterEach(() => vi.clearAllMocks());

  it('reads SteamID64 and accepts informational stderr output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-guard-'));
    const files = path.join(root, 'maFiles');
    await mkdir(files);
    await writeFile(path.join(files, 'manifest.json'), '{"entries":[{"account_name":"test","steam_id":76561197960265851}]}');
    const child = new FakeProcess();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        child.stderr.emit('data', Buffer.from('INFO Generating code for test'));
        child.stdout.emit('data', Buffer.from('ABCDE\n'));
        child.emit('close', 0);
      });
      return child.asChild();
    });
    try {
      const guard = new SteamGuardClient('steamguard', files);
      expect(await guard.steamId('TEST')).toBe('76561197960265851');
      await expect(guard.generateCode('test')).resolves.toBe('ABCDE');
      expect(vi.mocked(spawn).mock.calls[0][1]).toEqual(expect.arrayContaining(['--offline', 'code', '--mafiles-path', files]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('loads an encryption passkey from a file without adding it to arguments', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wallpaper-manager-guard-'));
    const files = path.join(root, 'maFiles');
    const passkeyFile = path.join(root, 'passkey');
    await mkdir(files);
    await writeFile(path.join(files, 'manifest.json'), '{"entries":[{"account_name":"test","steam_id":76561197960265851}]}');
    await writeFile(passkeyFile, 'encryption-secret\n');
    const child = new FakeProcess();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => { child.stdout.emit('data', Buffer.from('ABCDE\n')); child.emit('close', 0); });
      return child.asChild();
    });
    try {
      await expect(new SteamGuardClient('steamguard', files, passkeyFile).generateCode('test')).resolves.toBe('ABCDE');
      const call = vi.mocked(spawn).mock.calls[0];
      expect(call[1]).not.toContain('encryption-secret');
      expect((call[2]?.env as NodeJS.ProcessEnv).STEAMGUARD_CLI_PASSKEY).toBe('encryption-secret');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
