import { describe, expect, it } from 'vitest';
import { sanitizeWorkerError } from '../src/processor';
describe('worker errors', () => { it('classifies without leaking input', () => { expect(sanitizeWorkerError(new Error('STEAM_AUTH_REQUIRED')).code).toBe('STEAM_AUTH_REQUIRED'); expect(sanitizeWorkerError(new Error('password=secret'))).toEqual({ code: 'INTERNAL_ERROR', message: '操作失败，请稍后重试' }); }); });
