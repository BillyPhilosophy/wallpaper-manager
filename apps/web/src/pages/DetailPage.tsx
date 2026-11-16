import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PreviewDescriptor, Wallpaper, WorkshopItem } from '@wallpaper-manager/contracts';
import { api, post, statusLabel, typeLabel } from '../api';
import { useRemote } from '../hooks';
import { OfficialPreview } from '../components/OfficialPreview';
import { FavoriteButton } from '../components/FavoriteButton';
import { LivePreview, type PreviewQualityState } from '../features/live-preview/LivePreview';
import { useAppearance } from '../features/appearance/AppearanceContext';
import { Icon } from '../components/Icon';
import { WorkshopStats } from '../components/WorkshopStats';

export function DetailPage() {
  const { workshopId = '' } = useParams();
  const [live, setLive] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const controlsTimer = useRef<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [quality, setQuality] = useState<PreviewQualityState | null>(null);
  const { settings, update: updateAppearance } = useAppearance();
  const remote = useRemote<WorkshopItem>(() => api(`/workshop/items/${workshopId}`), [workshopId]);
  const local = useRemote<Wallpaper>(() => api(`/wallpapers/${workshopId}`), [workshopId]);
  const descriptor = useRemote<PreviewDescriptor>(() => api(`/wallpapers/${workshopId}/preview-descriptor`), [workshopId, local.data?.status]);
  const item = remote.data;
  const wallpaper = local.data;
  const downloaded = wallpaper?.status === 'downloaded';
  const title = wallpaper?.title || item?.title || workshopId;
  const expanded = fullscreen || immersive;

  useEffect(() => {
    const changed = () => {
      const active = document.fullscreenElement === previewRef.current;
      setFullscreen(active);
      if (!active) setLandscape(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setImmersive(false); setLandscape(false); }
    };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('fullscreenchange', changed); document.removeEventListener('keydown', keyboard); };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('wm-preview-active', { detail: live && downloaded }));
    return () => { window.dispatchEvent(new CustomEvent('wm-preview-active', { detail: false })); };
  }, [live, downloaded]);
  useEffect(() => {
    if (!expanded) { setControlsVisible(true); return; }
    const timer = window.setTimeout(() => setControlsVisible(false), 3500);
    return () => window.clearTimeout(timer);
  }, [expanded]);
  useEffect(() => () => { if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current); }, []);

  if (remote.error && !wallpaper) return <div className="error-state">{remote.error}</div>;
  if (!item && !wallpaper) return <div className="loading">正在读取工坊详情…</div>;

  const favoriteItem = { workshopId, title, officialPreviewUrl: wallpaper?.officialPreviewUrl ?? item?.officialPreviewUrl ?? null, type: wallpaper?.type || item?.type || 'unknown', contentRating: wallpaper?.contentRating || item?.contentRating || 'unrated', favorited: item?.favorited ?? wallpaper?.favorited ?? false };
  const showControls = () => {
    setControlsVisible(true);
    if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current);
    if (expanded) controlsTimer.current = window.setTimeout(() => setControlsVisible(false), 3500);
  };
  const exitExpanded = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setImmersive(false);
    setLandscape(false);
    setControlsVisible(true);
  };
  const toggleFullscreen = async () => {
    if (expanded) { exitExpanded(); return; }
    setLandscape(false);
    if (previewRef.current?.requestFullscreen) {
      try { await previewRef.current.requestFullscreen(); return; } catch { }
    }
    setImmersive(true);
  };
  const toggleLandscape = () => {
    if (landscape) { exitExpanded(); return; }
    setLandscape(true);
    setImmersive(true);
  };
  const toggleLive = () => {
    if (live) {
      exitExpanded();
      setPaused(false);
    }
    setLive(!live);
  };
  const download = async () => { await post(`/wallpapers/${workshopId}/download`); local.reload(); descriptor.reload(); };
  const setBackground = () => updateAppearance({ backgroundId: workshopId, backgroundMode: wallpaper?.type === 'image' ? 'static' : 'dynamic' });

  return <section>
    <Link className="back-link" to="..">← 返回壁纸库</Link>
    <div className="detail-layout">
      <div className={`detail-preview${immersive ? ' preview-immersive' : ''}${landscape ? ' preview-landscape' : ''}`} ref={previewRef} onPointerMove={showControls} onPointerDown={showControls} onFocusCapture={showControls}>
        {live && descriptor.data && downloaded ? <LivePreview descriptor={descriptor.data} paused={paused} audioEnabled={settings.audioEnabled} volume={volume} fit={fit} videoControls={!expanded} autoQuality={settings.autoQuality} onQualityChange={setQuality} cacheVersion={wallpaper?.updatedAt || ''}/> : <OfficialPreview url={wallpaper?.officialPreviewUrl || item?.officialPreviewUrl || null} title={title}/>}
        {live && downloaded && !expanded && <><button type="button" className="preview-fullscreen" aria-pressed={expanded} onClick={() => void toggleFullscreen()}>全屏预览</button><button type="button" className="preview-landscape-entry" onClick={() => void toggleLandscape()}>横屏预览</button></>}
        {live && downloaded && expanded && <>
          <div className={`preview-controls${controlsVisible ? '' : ' is-hidden'}`} role="toolbar" aria-label="预览控制" inert={!controlsVisible}>
            <button type="button" aria-pressed={paused} onClick={() => { setPaused((value) => !value); showControls(); }}>{paused ? '继续播放' : '暂停'}</button>
            <button type="button" aria-pressed={!settings.audioEnabled} onClick={() => { updateAppearance({ audioEnabled: !settings.audioEnabled }); showControls(); }}>{settings.audioEnabled ? '静音' : '取消静音'}</button>
            <label className="preview-volume"><span>音量</span><input aria-label="预览音量" type="range" min="0" max="100" step="5" value={Math.round(volume * 100)} disabled={!settings.audioEnabled} onChange={(event) => { setVolume(Number(event.target.value) / 100); showControls(); }}/></label>
            <button type="button" onClick={() => { setFit((value) => value === 'contain' ? 'cover' : 'contain'); showControls(); }}>{fit === 'contain' ? '铺满' : '适应'}</button>
            {descriptor.data?.mode === 'local-video' ? <span className="preview-quality-status">原始画质</span> : <>
              <span className="preview-quality-status" title={quality ? `抗锯齿 ${quality.antiAliasing} · 粒子 ${quality.particles} · 后处理 ${quality.postProcessing}` : undefined}>{quality ? `${{ high: '高画质', medium: '中画质', low: '低画质', off: '效果关闭' }[quality.postProcessing]} · ${quality.running ? `${Math.round(quality.fps)} FPS` : '已暂停'}` : '画质读取中'}</span>
              <button type="button" aria-pressed={settings.autoQuality} onClick={() => { setQuality(null); updateAppearance({ autoQuality: !settings.autoQuality }); showControls(); }}>自动画质 {settings.autoQuality ? '开' : '关'}</button>
            </>}
            <button type="button" onClick={exitExpanded}>退出全屏</button>
          </div>
          {!controlsVisible && <button type="button" className="preview-controls-toggle" onClick={showControls}>预览操作</button>}
        </>}
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
