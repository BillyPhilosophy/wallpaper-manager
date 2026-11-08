import { describe, expect, it, vi } from 'vitest';
import { recoverInterruptedJobs } from './index';

describe('interrupted job recovery', () => {
  it('keeps queued jobs for requeueing and marks only started jobs as failed', async () => {
    const downloadJob = { findMany: vi.fn().mockResolvedValue([]) };
    const db = { $transaction: vi.fn((callback) => callback({ downloadJob })) };
    await recoverInterruptedJobs(db as any);
    expect(downloadJob.findMany).toHaveBeenCalledWith({ where: { status: { in: ['downloading', 'verifying', 'publishing'] } } });
  });
});
