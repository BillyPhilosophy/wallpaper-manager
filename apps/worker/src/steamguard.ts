import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface ManifestEntry {
  account_name?: unknown;
  steam_id?: unknown;
}

export class SteamGuardClient {
  constructor(private readonly binary: string, private readonly maFilesDir: string, private readonly passkeyFile?: string) {}

  async steamId(username: string): Promise<string | null> {
    const entry = await this.entry(username);
    const value = entry?.steam_id;
    const steamId = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
    return /^7656119\d{10}$/.test(steamId) ? steamId : null;
  }

  async generateCode(username: string): Promise<string> {
    const entry = await this.entry(username);
    const accountName = typeof entry?.account_name === 'string' ? entry.account_name : '';
    if (!accountName) throw new Error('STEAM_GUARD_REQUIRED');

    const env = { ...process.env };
    if (this.passkeyFile) {
      const passkey = (await readFile(this.passkeyFile, 'utf8').catch(() => '')).replace(/\r?\n$/, '');
      if (passkey) env.STEAMGUARD_CLI_PASSKEY = passkey;
    }

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.binary, ['--username', accountName, '--mafiles-path', this.maFilesDir, '--no-update-check', '--offline', 'code'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(stdout);
      };
      const timer = setTimeout(() => { child.kill('SIGTERM'); finish(new Error('STEAM_GUARD_REQUIRED')); }, 15000);
      child.stdout?.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString('utf8')).slice(-4096); });
      child.stderr?.resume();
      child.on('error', () => finish(new Error('STEAM_GUARD_REQUIRED')));
      child.on('close', (code) => {
        if (code !== 0) {
          finish(new Error('STEAM_GUARD_REQUIRED'));
          return;
        }
        finish();
      });
    });
    const code = output.split(/\r?\n/).map((line) => line.trim()).find((line) => /^[A-Za-z0-9]{4,16}$/.test(line));
    if (!code) throw new Error('STEAM_GUARD_REQUIRED');
    return code;
  }

  private async entry(username: string): Promise<ManifestEntry | null> {
    try {
      const raw = await readFile(path.join(this.maFilesDir, 'manifest.json'), 'utf8');
      const manifest = JSON.parse(raw.replace(/("steam_id"\s*:\s*)(\d+)/g, '$1"$2"')) as { entries?: ManifestEntry[] };
      if (!Array.isArray(manifest.entries)) return null;
      return manifest.entries.find((entry) => entry.account_name === username.toLowerCase()) || null;
    } catch {
      return null;
    }
  }
}
