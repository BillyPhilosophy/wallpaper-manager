import { useEffect, useState } from 'react';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
import { api } from '../../api';
import { useRemote } from '../../hooks';
import { LivePreview } from '../live-preview/LivePreview';
import { useAppearance } from './AppearanceContext';

export function DynamicBackground() {
  const { settings } = useAppearance();
  const [previewActive, setPreviewActive] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const enabled = settings.backgroundMode !== 'off' && !!settings.backgroundId;
  const descriptor = useRemote<PreviewDescriptor | null>(() => enabled
    ? api(`/wallpapers/${settings.backgroundId}/preview-descriptor`)
    : Promise.resolve(null), [enabled, settings.backgroundId]);

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

  const data = descriptor.data;
  return <div className={`dynamic-background${enabled ? ' is-enabled' : ''}`} aria-hidden="true">
    {enabled && data?.fallbackPreviewUrl && <img className="background-poster" src={data.fallbackPreviewUrl} alt=""/>}
    {enabled && settings.backgroundMode === 'dynamic' && !reducedMotion && data && <LivePreview descriptor={data} background paused={previewActive}/>}
    <div className="background-dimming" style={{ opacity: enabled ? settings.dimming / 100 : 0 }}/>
  </div>;
}
