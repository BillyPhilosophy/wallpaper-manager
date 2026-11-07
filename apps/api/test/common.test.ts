import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter, requestLogger } from '../src/common';

describe('API request logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs completed requests with request ID, status and duration without sensitive data', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = Object.assign(new EventEmitter(), { locals: {}, statusCode: 202, setHeader: vi.fn() });
    const request = { headers: { 'x-request-id': 'test-request' }, method: 'POST', path: '/api/steam/auth/login', url: '/api/steam/auth/login?password=secret' };
    const next = vi.fn();
    requestLogger(request as any, response as any, next);
    response.emit('finish');
    expect(next).toHaveBeenCalledOnce();
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'test-request');
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[http\] requestId=test-request method=POST route=\/api\/steam\/auth\/login status=202 durationMs=\d+$/));
    expect(log.mock.calls.flat().join(' ')).not.toContain('secret');
  });

  it('logs request metadata without leaking secrets or query strings', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const json = vi.fn(); const status = vi.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status, locals: {} }), getRequest: () => ({ headers: {}, method: 'GET', path: '/api/workshop/search', route: { path: '/api/workshop/search' } }) }) };
    new ApiExceptionFilter().catch(new Error('key=secret'), host as any);
    expect(status).toHaveBeenCalledWith(500);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('requestId='));
    expect(log.mock.calls[0][0]).not.toContain('secret');
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('secret');
  });
});
