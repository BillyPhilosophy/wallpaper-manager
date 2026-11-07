import { createServer, Server } from 'node:http';
import type { DownloadProgress } from '@wallpaper-manager/contracts';
import type { SteamClient } from './steam';
import { authErrorCode, safeAuthMessage } from './depotdownloader';

interface ProgressSource { getProgress(): (DownloadProgress & { jobId: string })[] }

export function startAuthServer(steam: SteamClient, port = 9780, progress?: ProgressSource): Server {
  return createServer((request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.method === 'GET' && request.url === '/health') { response.writeHead(200).end(JSON.stringify({ status: 'ok' })); return; }
    if (request.method === 'GET' && request.url === '/auth/qr') { response.writeHead(200).end(JSON.stringify(steam.qrLoginState())); return; }
    if (request.method === 'GET' && request.url === '/downloads/progress') { response.writeHead(200).end(JSON.stringify(progress?.getProgress() || [])); return; }
    if (request.method !== 'POST' || !['/auth/login', '/auth/guard', '/auth/logout', '/auth/qr/start'].includes(request.url || '')) { response.writeHead(404).end(JSON.stringify({ message: 'Not found' })); return; }
    let raw = ''; let aborted = false;
    request.on('data', (chunk: Buffer) => { raw += chunk.toString(); if (raw.length > 4096) { aborted = true; response.writeHead(413).end(JSON.stringify({ message: '请求过大' })); request.destroy(); } });
    request.on('end', () => {
      if (aborted) return;
      const action = request.url;
      console.log(`[auth] request=${action}`);
      void (async () => {
        const body = raw ? JSON.parse(raw) : {};
        if (request.url === '/auth/login') {
          const username = String(body.username || '');
          const password = String(body.password || '');
          const steamId = body.steamId ? String(body.steamId) : undefined;
          if (!/^[^\s]{1,64}$/.test(username) || !password) throw new Error('INVALID_LOGIN');
          if (steamId && !/^7656119\d{10}$/.test(steamId)) throw new Error('INVALID_STEAM_ID');
          const pending = steam.login(username, password, steamId);
          body.password = '';
          void pending.then(() => {
            console.log(`[auth] request=${action} result=success status=${steam.status}`);
          }).catch((error) => {
            console.warn(`[auth] request=${action} result=failed code=${authErrorCode(error)}`);
          });
          response.writeHead(202).end(JSON.stringify({ status: steam.status }));
          return;
        }
        if (request.url === '/auth/guard') { await steam.guard(String(body.code || '')); body.code = ''; }
        else if (request.url === '/auth/qr/start') await steam.startQrLogin(body.steamId ? String(body.steamId) : undefined);
        else await steam.logout();
        console.log(`[auth] request=${action} result=success status=${steam.status}`);
        response.writeHead(200).end(JSON.stringify(request.url === '/auth/qr/start' ? steam.qrLoginState() : { status: steam.status }));
      })().catch((error) => { const code = error instanceof SyntaxError ? 'BAD_REQUEST' : authErrorCode(error); console.warn(`[auth] request=${action} result=failed code=${code}`); response.writeHead(400).end(JSON.stringify({ code, message: safeAuthMessage(error) })); });
    });
  }).listen(port, '0.0.0.0');
}
