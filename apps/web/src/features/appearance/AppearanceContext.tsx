import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
export type BackgroundMode = 'off' | 'static' | 'dynamic';
export type CanvasEffectName = 'glass' | 'liquid' | 'shatter' | 'blaze';
export type CanvasEffectPreference = 'off' | CanvasEffectName;

export interface AppearanceSettings {
  theme: ThemePreference;
  backgroundMode: BackgroundMode;
  backgroundId: string | null;
  dimming: number;
  audioEnabled: boolean;
  autoQuality: boolean;
  rotationEnabled: boolean;
  rotationGroupId: string | null;
  rotationIntervalMinutes: number;
  rotationOrder: 'sequence' | 'random';
  rotationTrigger: 'interval' | 'videoEnd';
  canvasEffect: CanvasEffectPreference;
  liquidTrail: boolean;
  effectIntensity: number;
}

interface AppearanceValue {
  settings: AppearanceSettings;
  resolvedTheme: 'dark' | 'light';
  update: (patch: Partial<AppearanceSettings>) => void;
}

const storageKey = 'wallpaper-appearance-v1';
const defaults: AppearanceSettings = { theme: 'dark', backgroundMode: 'off', backgroundId: null, dimming: 45, audioEnabled: true, autoQuality: true, rotationEnabled: false, rotationGroupId: null, rotationIntervalMinutes: 5, rotationOrder: 'sequence', rotationTrigger: 'interval', canvasEffect: 'off', liquidTrail: false, effectIntensity: 60 };
const AppearanceContext = createContext<AppearanceValue | null>(null);

function readSettings(): AppearanceSettings {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}') as Partial<AppearanceSettings>;
    return {
      theme: ['dark', 'light', 'system'].includes(value.theme || '') ? value.theme as ThemePreference : defaults.theme,
      backgroundMode: ['off', 'static', 'dynamic'].includes(value.backgroundMode || '') ? value.backgroundMode as BackgroundMode : defaults.backgroundMode,
      backgroundId: typeof value.backgroundId === 'string' && /^\d+$/.test(value.backgroundId) ? value.backgroundId : null,
      dimming: typeof value.dimming === 'number' ? Math.max(0, Math.min(80, value.dimming)) : defaults.dimming,
      audioEnabled: typeof value.audioEnabled === 'boolean' ? value.audioEnabled : defaults.audioEnabled,
      autoQuality: typeof value.autoQuality === 'boolean' ? value.autoQuality : defaults.autoQuality,
      rotationEnabled: typeof value.rotationEnabled === 'boolean' ? value.rotationEnabled : defaults.rotationEnabled,
      rotationGroupId: typeof value.rotationGroupId === 'string' && value.rotationGroupId ? value.rotationGroupId : defaults.rotationGroupId,
      rotationIntervalMinutes: typeof value.rotationIntervalMinutes === 'number' && [1, 5, 15, 30, 60].includes(value.rotationIntervalMinutes) ? value.rotationIntervalMinutes : defaults.rotationIntervalMinutes,
      rotationOrder: value.rotationOrder === 'random' ? 'random' : defaults.rotationOrder,
      rotationTrigger: value.rotationTrigger === 'videoEnd' ? 'videoEnd' : defaults.rotationTrigger,
      canvasEffect: ['off', 'glass', 'liquid', 'shatter', 'blaze'].includes(value.canvasEffect || '') ? value.canvasEffect as CanvasEffectPreference : defaults.canvasEffect,
      liquidTrail: typeof value.liquidTrail === 'boolean' ? value.liquidTrail : defaults.liquidTrail,
      effectIntensity: typeof value.effectIntensity === 'number' ? Math.max(20, Math.min(100, value.effectIntensity)) : defaults.effectIntensity,
    };
  } catch {
    return defaults;
  }
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(readSettings);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  const resolvedTheme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const changed = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#090c12' : '#e8edf5');
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings, resolvedTheme]);

  const update = useCallback((patch: Partial<AppearanceSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const value = useMemo(() => ({ settings, resolvedTheme, update }), [settings, resolvedTheme, update]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider');
  return value;
}
