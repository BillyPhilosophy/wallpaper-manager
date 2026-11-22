import { useEffect, useState } from 'react';

export interface CanvasEffectsCapability {
  enabled: boolean;
  htmlInCanvas: boolean;
  webgl: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  constrained: boolean;
}

type PaintableCanvas = HTMLCanvasElement & { requestPaint?: () => void };
type ElementImageContext = CanvasRenderingContext2D & { drawElementImage?: (element: Element, x: number, y: number) => void };

let cachedHtmlInCanvas: boolean | undefined;
let cachedWebgl: boolean | undefined;

export function supportsHtmlCapture(): boolean {
  if (cachedHtmlInCanvas !== undefined) return cachedHtmlInCanvas;
  try {
    if (/Android/i.test(navigator.userAgent)) return false;
    const canvas = document.createElement('canvas') as PaintableCanvas;
    const context = canvas.getContext('2d') as ElementImageContext | null;
    cachedHtmlInCanvas = Boolean(context && typeof context.drawElementImage === 'function' && typeof canvas.requestPaint === 'function');
  } catch {
    cachedHtmlInCanvas = false;
  }
  return cachedHtmlInCanvas;
}

export function supportsWebgl(): boolean {
  if (cachedWebgl !== undefined) return cachedWebgl;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    cachedWebgl = Boolean(context && !context.isContextLost());
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cachedWebgl = false;
  }
  return cachedWebgl;
}

function readCapability(): CanvasEffectsCapability {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const reducedTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches ?? false;
  const constrained = !(window.matchMedia?.('(min-width: 701px) and (pointer: fine)').matches ?? false);
  const webgl = supportsWebgl();
  return {
    enabled: !reducedMotion && !reducedTransparency && !constrained && webgl,
    htmlInCanvas: supportsHtmlCapture(),
    webgl,
    reducedMotion,
    reducedTransparency,
    constrained,
  };
}

export function useCanvasEffectsCapability(): CanvasEffectsCapability {
  const [capability, setCapability] = useState(readCapability);
  useEffect(() => {
    const queries = [
      window.matchMedia?.('(prefers-reduced-motion: reduce)'),
      window.matchMedia?.('(prefers-reduced-transparency: reduce)'),
      window.matchMedia?.('(min-width: 701px) and (pointer: fine)'),
    ].filter((query): query is MediaQueryList => Boolean(query));
    const update = () => setCapability(readCapability());
    queries.forEach((query) => query.addEventListener('change', update));
    return () => queries.forEach((query) => query.removeEventListener('change', update));
  }, []);
  return capability;
}
