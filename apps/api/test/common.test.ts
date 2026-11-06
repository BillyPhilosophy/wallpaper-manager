import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from '../src/common';

describe('API exception logging', () => {
  afterEach(() => vi.restoreAllMocks());
  it('logs request metadata without leaking secrets or query strings', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const json = vi.fn(); const status = vi.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ headers: {}, method: 'GET', path: '/api/workshop/search', route: { path: '/api/workshop/search' } }) }) };
    new ApiExceptionFilter().catch(new Error('key=secret'), host as any);
    expect(status).toHaveBeenCalledWith(500);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('requestId='));
    expect(log.mock.calls[0][0]).not.toContain('secret');
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('secret');
  });
});
