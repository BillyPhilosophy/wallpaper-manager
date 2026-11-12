import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PreviewDescriptor, Wallpaper, WorkshopItem } from '@wallpaper-manager/contracts';
import { api, post, statusLabel, typeLabel } from '../api';
import { useRemote } from '../hooks';
import { OfficialPreview } from '../components/OfficialPreview';
import { FavoriteButton } from '../components/FavoriteButton';
import { LivePreview } from '../features/live-preview/LivePreview';
import { useAppearance } from '../features/appearance/AppearanceContext';
import { Icon } from '../components/Icon';
import { WorkshopStats } from '../components/WorkshopStats';

export function DetailPage() {
  const { workshopId = '' } = useParams();
  const [live, setLive] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const { update: updateAppearance } = useAppearance();
  const remote = useRemote<WorkshopItem>(() => api(`/workshop/items/${workshopId}`), [workshopId]);
  const local = useRemote<Wallpaper>(() => api(`/wallpapers/${workshopId}`), [workshopId]);
  const descriptor = useRemote<PreviewDescriptor>(() => api(`/wallpapers/${workshopId}/preview-descriptor`), [workshopId, local.data?.status]);
  const item = remote.data;
  const wallpaper = local.data;
  const downloaded = wallpaper?.status === 'downloaded';
  const title = wallpaper?.title || item?.title || workshopId;

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === previewRef.current);
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') setImmersive(false); };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('fullscreenchange', changed); document.removeEventListener('keydown', keyboard); };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('wm-preview-active', { detail: live && downloaded }));
    return () => { window.dispatchEvent(new CustomEvent('wm-preview-active', { detail: false })); };
  }, [live, downloaded]);

  if (remote.error && !wallpaper) return <div className="error-state">{remote.error}</div>;
  if (!item && !wallpaper) return <div className="loading">正在读取工坊详情…</div>;

  const favoriteItem = { workshopId, title, officialPreviewUrl: wallpaper?.officialPreviewUrl ?? item?.officialPreviewUrl ?? null, type: wallpaper?.type || item?.type || 'unknown', contentRating: wallpaper?.contentRating || item?.contentRating || 'unrated', favorited: item?.favorited ?? wallpaper?.favorited ?? false };
  const expanded = fullscreen || immersive;
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (immersive) { setImmersive(false); return; }
    if (previewRef.current?.requestFullscreen) {
      try { await previewRef.current.requestFullscreen(); return; } catch { }
    }
    setImmersive(true);
  };
  const toggleLive = () => {
    if (live) {
      setImmersive(false);
      if (document.fullscreenElement === previewRef.current) void document.exitFullscreen().catch(() => undefined);
    }
    setLive(!live);
  };
  const download = async () => { await post(`/wallpapers/${workshopId}/download`); local.reload(); descriptor.reload(); };
  const setBackground = () => updateAppearance({ backgroundId: workshopId, backgroundMode: wallpaper?.type === 'image' ? 'static' : 'dynamic' });

  return <section>
    <Link className="back-link" to="..">← 返回壁纸库</Link>
    <div className="detail-layout">
      <div className={`detail-preview${immersive ? ' preview-immersive' : ''}`} ref={previewRef}>
        {live && descriptor.data && downloaded ? <LivePreview descriptor={descriptor.data}/> : <OfficialPreview url={wallpaper?.officialPreviewUrl || item?.officialPreviewUrl || null} title={title}/>}
        {live && downloaded && <button type="button" className="preview-fullscreen" aria-pressed={expanded} onClick={() => void toggleFullscreen()}>{expanded ? '退出全屏' : '全屏预览'}</button>}
      </div>
      <div className="detail-copy">
        <p className="eyebrow">WORKSHOP {workshopId}</p>
        <h1>{title}</h1>
        <div className="badges"><span>{typeLabel[wallpaper?.type || item?.type || 'unknown']}</span><span>{statusLabel[wallpaper?.status || item?.localStatus || 'not_downloaded']}</span></div>
        <WorkshopStats metadata={item?.metadataJson || wallpaper?.metadataJson}/>
        <p className="description">{wallpaper?.description || item?.description || '暂无描述'}</p>
        <div className="detail-actions">
          {downloaded ? <button onClick={toggleLive}>{live ? '查看官方预览' : '启动实时预览'}</button> : <button onClick={() => void download()}>下载到壁纸库</button>}
          {downloaded && <button className="secondary set-background" onClick={setBackground}><Icon name="image" size={17}/>设为背景</button>}
          <FavoriteButton item={favoriteItem} onChange={() => { remote.reload(); local.reload(); }}/>
        </div>
        {wallpaper?.fileSizeBytes && <p className="muted">本地大小 {(Number(wallpaper.fileSizeBytes) / 1024 / 1024).toFixed(1)} MB</p>}
        <details><summary>完整官方元数据</summary><pre>{JSON.stringify(wallpaper?.metadataJson || item?.metadataJson, null, 2)}</pre></details>
      </div>
    </div>
  </section>;
}
