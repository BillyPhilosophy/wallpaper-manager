import { useEffect, useRef, useState } from 'react';
import type { PreviewDescriptor, Wallpaper } from '@wallpaper-manager/contracts';
import { api } from '../../api';
import { useRemote } from '../../hooks';
import { LivePreview } from '../live-preview/LivePreview';
import { useAppearance } from './AppearanceContext';
import { loadRotationWallpapers, nextRotationId } from './rotation';

export function DynamicBackground() {
  const { settings, update } = useAppearance();
  const [previewActive, setPreviewActive] = useState(false);
  const [videoEndEligible, setVideoEndEligible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const lastAdvance = useRef(Date.now());
  const pendingAdvance = useRef(false);
  const enabled = settings.backgroundMode !== 'off' && !!settings.backgroundId;
  const rotationActive = settings.rotationEnabled && !!settings.rotationGroupId && settings.backgroundMode === 'dynamic';
  const descriptor = useRemote<PreviewDescriptor | null>(() => enabled
    ? api(`/wallpapers/${settings.backgroundId}/preview-descriptor`)
    : Promise.resolve(null), [enabled, settings.backgroundId]);
  const rotation = useRemote<Wallpaper[]>(() => rotationActive && settings.rotationGroupId
    ? loadRotationWallpapers(settings.rotationGroupId)
    : Promise.resolve([]), [rotationActive, settings.rotationGroupId]);
  const rotationItems = rotation.data || [];
  const currentRotationItem = rotationItems.find((item) => item.workshopId === settings.backgroundId);
  const videoEndMode = rotationActive && settings.rotationTrigger === 'videoEnd' && currentRotationItem?.type === 'video';

  useEffect(() => {
    const changed = (event: Event) => setPreviewActive(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener('wm-preview-active', changed);
    return () => window.removeEventListener('wm-preview-active', changed);
  }, []);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const changed = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    lastAdvance.current = Date.now();
    pendingAdvance.current = false;
    setVideoEndEligible(false);
  }, [settings.backgroundId, settings.rotationGroupId, settings.rotationIntervalMinutes, settings.rotationOrder, settings.rotationTrigger]);
  useEffect(() => {
    if (!rotationActive || !rotation.data) return;
    if (rotationItems.length < 2) { update({ rotationEnabled: false }); return; }
    if (!currentRotationItem && rotationItems.length) update({ backgroundId: rotationItems[0].workshopId, backgroundMode: 'dynamic' });
  }, [rotationActive, rotation.data, rotationItems, currentRotationItem, update]);
  useEffect(() => {
    if (!rotationActive || rotationItems.length < 2) return;
    const advance = (force = false) => {
      if (document.hidden || previewActive || reducedMotion) {
        if (force) pendingAdvance.current = true;
        return;
      }
      const due = Date.now() - lastAdvance.current >= settings.rotationIntervalMinutes * 60000;
      if (videoEndMode) {
        if (due && !videoEndEligible) setVideoEndEligible(true);
        if (!force && !pendingAdvance.current) return;
      } else if (!force && !pendingAdvance.current && !due) return;
      const next = nextRotationId(rotationItems, settings.backgroundId, settings.rotationOrder);
      pendingAdvance.current = false;
      lastAdvance.current = Date.now();
      setVideoEndEligible(false);
      if (next && next !== settings.backgroundId) update({ backgroundId: next, backgroundMode: 'dynamic' });
    };
    const timer = window.setInterval(() => advance(), 1000);
    const visible = () => advance();
    const next = () => advance(true);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('wm-background-rotation-next', next);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('wm-background-rotation-next', next);
    };
  }, [rotationActive, rotationItems, settings.rotationIntervalMinutes, settings.rotationOrder, settings.backgroundId, previewActive, reducedMotion, videoEndMode, videoEndEligible, update]);

  const data = descriptor.data;
  return <div className={`dynamic-background${enabled ? ' is-enabled' : ''}`} aria-hidden="true">
    {enabled && data?.fallbackPreviewUrl && <img className="background-poster" src={data.fallbackPreviewUrl} alt=""/>}
    {enabled && settings.backgroundMode === 'dynamic' && !reducedMotion && data && <LivePreview descriptor={data} background paused={previewActive} audioEnabled={settings.audioEnabled} autoQuality={settings.autoQuality} backgroundLoop={!videoEndEligible} onEnded={videoEndMode && videoEndEligible ? () => window.dispatchEvent(new Event('wm-background-rotation-next')) : undefined}/>}
    <div className="background-dimming" style={{ opacity: enabled ? settings.dimming / 100 : 0 }}/>
  </div>;
}
