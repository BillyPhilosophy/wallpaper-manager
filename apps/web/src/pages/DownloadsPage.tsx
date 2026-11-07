import { Link } from 'react-router-dom';
import type { Page, DownloadJob } from '@wallpaper-manager/contracts';
import { api, post, statusLabel } from '../api';
import { useRemote } from '../hooks';
const active = ['queued', 'downloading', 'verifying', 'publishing'];

export function DownloadsPage() {
  const { data, reload } = useRemote<Page<DownloadJob>>(() => api('/downloads?page=1&pageSize=50'), [], 2500);
  const action = async (job: DownloadJob, name: 'cancel' | 'retry') => { await post(`/downloads/${job.id}/${name}`); reload(); };
  return <section>
    <div className="page-heading"><div><p className="eyebrow">TRANSFER ACTIVITY</p><h1>下载中心</h1><p>显示上游返回的真实字节进度、占比和平均速率。</p></div></div>
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
      <div>{active.includes(job.status) && <button className="secondary" onClick={() => void action(job, 'cancel')}>取消</button>}{['failed', 'cancelled'].includes(job.status) && <button className="secondary" onClick={() => void action(job, 'retry')}>重试</button>}</div>
    </article>)}</div>
    {data && !data.items.length && <div className="empty-state">暂无下载任务。去工坊搜索一张喜欢的壁纸吧。</div>}
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
