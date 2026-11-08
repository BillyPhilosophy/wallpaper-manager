import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Page, DownloadJob } from '@wallpaper-manager/contracts';
import { api, post, statusLabel } from '../api';
import { useRemote } from '../hooks';
const active = ['queued', 'downloading', 'verifying', 'publishing'];

export function DownloadsPage() {
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const { data, error, reload } = useRemote<Page<DownloadJob>>(() => api(`/downloads?page=${page}&pageSize=20`), [page], 2500);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const perform = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key); setMessage('');
    try { await task(); reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(''); }
  };
  const action = (job: DownloadJob, name: 'cancel' | 'retry') => perform(job.id, () => post(`/downloads/${job.id}/${name}`));
  const remove = (job: DownloadJob) => perform(job.id, () => api(`/downloads/${job.id}`, { method: 'DELETE' }));
  const clearFailed = () => {
    if (confirm('确定删除所有失败的下载记录？此操作不会删除已下载壁纸。')) void perform('clear-failed', () => api('/downloads/failed', { method: 'DELETE' }));
  };
  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / 20));
  const goToPage = (next: number) => {
    if (!Number.isSafeInteger(next) || next < 1 || next > maxPage) return;
    window.scrollTo(0, 0); setPage(next); setPageInput(String(next));
  };
  return <section>
    <div className="page-heading"><div><p className="eyebrow">TRANSFER ACTIVITY</p><h1>下载中心</h1><p>显示上游返回的真实字节进度、占比和平均速率。</p></div><button className="danger" disabled={!data || busy === 'clear-failed'} onClick={clearFailed}>清空失败记录</button></div>
    {message && <p className="error-text" role="alert">{message}</p>}
    {error && <div className="error-state">{error}<button className="text-button" onClick={reload}>重试</button></div>}
    <div className="job-list">{data?.items.map((job) => <article className="job" key={job.id}>
      <div><Link to={`/wallpaper/${job.workshopId}`}>工坊 {job.workshopId}</Link><small>{job.id} · 第 {job.attempt} 次尝试</small></div>
      <span className={`status ${job.status}`}>{statusLabel[job.status]}</span>
      <div className="job-message">
        {job.errorMessage || stageText(job.status)}
        {job.progress && <div className="job-progress">
          <div><strong>{job.progress.percent === null ? '等待总量' : `${job.progress.percent.toFixed(1)}%`}</strong><span>{formatBytes(job.progress.bytesPerSecond)}/s</span></div>
          {job.progress.percent !== null && <progress aria-label={`工坊 ${job.workshopId} 下载进度`} max="100" value={job.progress.percent}/>}
          {Number(job.progress.totalBytes) > 0 && <small>{formatBytes(job.progress.downloadedBytes)} / {formatBytes(job.progress.totalBytes)}</small>}
        </div>}
      </div>
      <div className="job-actions">{active.includes(job.status) && <button className="secondary" disabled={busy === job.id} onClick={() => void action(job, 'cancel')}>取消</button>}{['failed', 'cancelled'].includes(job.status) && <button className="secondary" disabled={busy === job.id} onClick={() => void action(job, 'retry')}>重试</button>}{['failed', 'cancelled'].includes(job.status) && <button className="danger" disabled={busy === job.id} onClick={() => void remove(job)}>删除记录</button>}</div>
    </article>)}</div>
    {!error && data && !data.items.length && <div className="empty-state">暂无下载任务。去工坊搜索一张喜欢的壁纸吧。</div>}
    <div className="pagination"><button className="secondary" disabled={!data || page <= 1} onClick={() => goToPage(page - 1)}>上一页</button><form className="page-jump" onSubmit={(event) => { event.preventDefault(); goToPage(Number(pageInput)); }}><input aria-label="页码" type="number" min="1" max={maxPage} value={pageInput} onChange={(event) => setPageInput(event.target.value)}/><button className="secondary" disabled={!data}>跳转</button></form><span>共 {maxPage} 页 · {data?.total || 0} 项</span><button className="secondary" disabled={!data || page >= maxPage} onClick={() => goToPage(page + 1)}>下一页</button></div>
  </section>;
}

function stageText(status: string) { return ({ queued: '等待 Worker 领取', downloading: '正在写入隔离暂存目录', verifying: '正在检查 project.json 与资源', publishing: '正在原子发布到共享目录', succeeded: '已在壁纸库中可用' } as Record<string, string>)[status] || ''; }
function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}
