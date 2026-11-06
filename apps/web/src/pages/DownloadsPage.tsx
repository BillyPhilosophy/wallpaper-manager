import { Link } from 'react-router-dom';
import type { Page, DownloadJob } from '@wallpaper-manager/contracts';
import { api, post, statusLabel } from '../api';
import { useRemote } from '../hooks';
const active = ['queued', 'downloading', 'verifying', 'publishing'];
export function DownloadsPage() {
  const { data, reload } = useRemote<Page<DownloadJob>>(() => api('/downloads?page=1&pageSize=50'), [], 2500);
  const action = async (job: DownloadJob, name: 'cancel' | 'retry') => { await post(`/downloads/${job.id}/${name}`); reload(); };
  return <section><div className="page-heading"><div><p className="eyebrow">TRANSFER ACTIVITY</p><h1>下载中心</h1><p>仅展示 DepotDownloader 的真实任务阶段，不估算下载百分比。</p></div></div><div className="job-list">{data?.items.map((job) => <article className="job" key={job.id}><div><Link to={`/wallpaper/${job.workshopId}`}>工坊 {job.workshopId}</Link><small>{job.id} · 第 {job.attempt} 次尝试</small></div><span className={`status ${job.status}`}>{statusLabel[job.status]}</span><div className="job-message">{job.errorMessage || stageText(job.status)}</div><div>{active.includes(job.status) && <button className="secondary" onClick={() => void action(job, 'cancel')}>取消</button>}{['failed', 'cancelled'].includes(job.status) && <button className="secondary" onClick={() => void action(job, 'retry')}>重试</button>}</div></article>)}</div>{data && !data.items.length && <div className="empty-state">暂无下载任务。去工坊搜索一张喜欢的壁纸吧。</div>}</section>;
}
function stageText(status: string) { return ({ queued: '等待 Worker 领取', downloading: '正在写入隔离暂存目录', verifying: '正在检查 project.json 与资源', publishing: '正在原子发布到共享目录', succeeded: '已在壁纸库中可用' } as Record<string, string>)[status] || ''; }
