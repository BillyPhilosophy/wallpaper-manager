import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PreviewDescriptor, Wallpaper, WorkshopItem } from '@wallpaper-manager/contracts';
import { api, post, statusLabel, typeLabel } from '../api';
import { useRemote } from '../hooks';
import { OfficialPreview } from '../components/OfficialPreview';
import { LivePreview } from '../features/live-preview/LivePreview';
export function DetailPage() {
  const { workshopId = '' } = useParams(); const [live, setLive] = useState(false);
  const remote = useRemote<WorkshopItem>(() => api(`/workshop/items/${workshopId}`), [workshopId]);
  const local = useRemote<Wallpaper>(() => api(`/wallpapers/${workshopId}`), [workshopId]);
  const descriptor = useRemote<PreviewDescriptor>(() => api(`/wallpapers/${workshopId}/preview-descriptor`), [workshopId, local.data?.status]);
  const item = remote.data; const wallpaper = local.data;
  if (remote.error && !wallpaper) return <div className="error-state">{remote.error}</div>;
  if (!item && !wallpaper) return <div className="loading">正在读取工坊详情…</div>;
  const downloaded = wallpaper?.status === 'downloaded'; const title = wallpaper?.title || item?.title || workshopId;
  const download = async () => { await post(`/wallpapers/${workshopId}/download`); local.reload(); descriptor.reload(); };
  return <section><Link className="back-link" to="..">← 返回壁纸库</Link><div className="detail-layout"><div className="detail-preview">{live && descriptor.data && downloaded ? <LivePreview descriptor={descriptor.data}/> : <OfficialPreview url={wallpaper?.officialPreviewUrl || item?.officialPreviewUrl || null} title={title}/>}</div><div className="detail-copy"><p className="eyebrow">WORKSHOP {workshopId}</p><h1>{title}</h1><div className="badges"><span>{typeLabel[wallpaper?.type || item?.type || 'unknown']}</span><span>{statusLabel[wallpaper?.status || item?.localStatus || 'not_downloaded']}</span></div><p className="description">{wallpaper?.description || item?.description || '暂无描述'}</p>{downloaded ? <button onClick={() => setLive(!live)}>{live ? '查看官方预览' : '启动实时预览'}</button> : <button onClick={() => void download()}>下载到壁纸库</button>}{wallpaper?.fileSizeBytes && <p className="muted">本地大小 {(Number(wallpaper.fileSizeBytes) / 1024 / 1024).toFixed(1)} MB</p>}<details><summary>完整官方元数据</summary><pre>{JSON.stringify(wallpaper?.metadataJson || item?.metadataJson, null, 2)}</pre></details></div></div></section>;
}
