import { createServer, Server } from 'node:http';
import type { SteamClient } from './steam';
import { safeAuthMessage } from './depotdownloader';

export function startAuthServer(steam: SteamClient, port = 9780): Server {
  return createServer((request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.method === 'GET' && request.url === '/health') { response.writeHead(200).end(JSON.stringify({ status: 'ok' })); return; }
    if (request.method === 'GET' && request.url === '/auth/qr') { response.writeHead(200).end(JSON.stringify(steam.qrLoginState())); return; }
    if (request.method !== 'POST' || !['/auth/login', '/auth/guard', '/auth/logout', '/auth/qr/start'].includes(request.url || '')) { response.writeHead(404).end(JSON.stringify({ message: 'Not found' })); return; }
    let raw = ''; let aborted = false;
    request.on('data', (chunk: Buffer) => { raw += chunk.toString(); if (raw.length > 4096) { aborted = true; response.writeHead(413).end(JSON.stringify({ message: '请求过大' })); request.destroy(); } });
    request.on('end', () => {
      if (aborted) return;
      const action = request.url;
      console.log(`[auth] request=${action}`);
      void (async () => {
        const body = raw ? JSON.parse(raw) : {};
        if (request.url === '/auth/login') { await steam.login(String(body.username || ''), String(body.password || ''), body.steamId ? String(body.steamId) : undefined); body.password = ''; }
        else if (request.url === '/auth/guard') { await steam.guard(String(body.code || '')); body.code = ''; }
        else if (request.url === '/auth/qr/start') await steam.startQrLogin(body.steamId ? String(body.steamId) : undefined);
        else await steam.logout();
        console.log(`[auth] request=${action} result=success status=${steam.status}`);
        response.writeHead(200).end(JSON.stringify(request.url === '/auth/qr/start' ? steam.qrLoginState() : { status: steam.status }));
      })().catch((error) => { const code = error instanceof SyntaxError ? 'BAD_REQUEST' : error instanceof Error ? error.message : 'INTERNAL_ERROR'; console.warn(`[auth] request=${action} result=failed code=${code}`); response.writeHead(400).end(JSON.stringify({ code, message: safeAuthMessage(error) })); });
    });
  }).listen(port, '0.0.0.0');
}
