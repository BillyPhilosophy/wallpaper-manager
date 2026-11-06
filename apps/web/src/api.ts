import type { ApiError } from '@wallpaper-manager/contracts';
export class RequestError extends Error { constructor(public code: string, message: string) { super(message); } }
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${url}`, { ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  if (!response.ok) { const error = await response.json().catch(() => ({ code: 'INTERNAL_ERROR', message: '网络请求失败' })) as ApiError; throw new RequestError(error.code, error.message); }
  return response.json();
}
export const post = <T>(url: string, body?: unknown) => api<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const typeLabel: Record<string, string> = { scene: '场景', web: '网页', video: '视频', application: '应用', unknown: '未知' };
export const statusLabel: Record<string, string> = { not_downloaded: '未下载', queued: '等待下载', downloading: '下载中', verifying: '校验中', publishing: '发布中', downloaded: '已下载', deleting: '删除中', succeeded: '已完成', failed: '失败', cancelled: '已取消' };
