import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppearance } from '../appearance/AppearanceContext';
import { CanvasEffectStage } from './CanvasEffectStage';
import { useCanvasEffectsCapability } from './capability';

export function CanvasEffects({ children }: { children: ReactNode }) {
  const { settings } = useAppearance();
  const { pathname } = useLocation();
  const capability = useCanvasEffectsCapability();
  const excluded = pathname.startsWith('/wallpaper/');
  if (!capability.enabled || excluded) return children;

  let content = children;
  if (settings.canvasEffect !== 'off') {
    content = <CanvasEffectStage key={settings.canvasEffect} effect={settings.canvasEffect} intensity={settings.effectIntensity}>{content}</CanvasEffectStage>;
  }
  if (settings.liquidTrail && settings.canvasEffect !== 'liquid') {
    content = <CanvasEffectStage effect="liquid" intensity={settings.effectIntensity} capture={false}>{content}</CanvasEffectStage>;
  }
  return content;
}
