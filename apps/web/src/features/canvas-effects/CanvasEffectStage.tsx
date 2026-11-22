import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createBlaze } from '../../components/canvasui/Blaze';
import { createGlass } from '../../components/canvasui/Glass';
import { createLiquid } from '../../components/canvasui/Liquid';
import { createShatter } from '../../components/canvasui/Shatter';
import { supportsHtmlCapture, supportsWebgl } from './capability';
import type { CanvasEffectName } from '../appearance/AppearanceContext';

interface EffectElements {
  source: HTMLCanvasElement;
  content: HTMLElement;
  output: HTMLCanvasElement;
}

interface EffectInstance {
  setOptions: (options: any) => void;
  resize: () => void;
  destroy: () => void;
}

type EffectFactory = (elements: EffectElements, options: Record<string, unknown>) => EffectInstance | null;

const factories: Record<CanvasEffectName, EffectFactory> = {
  glass: createGlass as unknown as EffectFactory,
  liquid: createLiquid as unknown as EffectFactory,
  shatter: createShatter as unknown as EffectFactory,
  blaze: createBlaze as unknown as EffectFactory,
};

function effectOptions(effect: CanvasEffectName, intensity: number, capture: boolean): Record<string, unknown> {
  const amount = Math.max(0, Math.min(1, intensity / 100));
  if (effect === 'glass') return {
    shape: 'circle', size: 92 + Math.round(28 * amount), ior: 1.4 + amount * 0.1,
    edge: 0.68, bevel: 3.6, depth: 220, aberration: 0.2 + amount * 0.45,
    blur: 0.15, reflection: 0.55, shine: 0.4, zoom: 1.03 + amount * 0.08,
    targets: '[data-glass-target]', follow: 0.18,
  };
  if (effect === 'shatter') return {
    radius: 0.22 + amount * 0.08, softness: 0.65, tileSize: 90, shards: 1,
    lift: 12 + amount * 18, tilt: 0.8 + amount * 0.6, scatter: 2 + amount * 3,
    perspective: 1600, gapColor: 'auto', shadow: 0.4, shading: 0.4,
    refraction: 0.6 + amount * 0.7, dispersion: 0.12 + amount * 0.15,
    floatSpeed: 0.65 + amount * 0.55, strength: 0.55 + amount * 0.35,
    baseStrength: 0, followSpeed: 4,
  };
  if (effect === 'blaze') return {
    height: 0.42, distortion: 0.15 + amount * 0.35, distortionScale: 0.5,
    speed: 0.65 + amount * 0.3, sparks: 0.25 + amount * 0.35,
    sparkDensity: 1.5, sparkSize: 0.9, layers: 3,
    smoke: 0.18 + amount * 0.25, glow: 0.5 + amount * 0.65,
    sparkColor: [1, 0.4, 0.05], smokeColor: [1, 0.43, 0.1],
  };
  return {
    simResolution: 96, dyeResolution: capture ? 384 : 256,
    densityDissipation: capture ? 0.9 : 0.88, velocityDissipation: 0.9,
    pressure: 0.8, pressureIterations: 3, curl: 1.2,
    radius: capture ? 0.22 : 0.12 + amount * 0.04,
    force: capture ? 0.18 + amount * 0.12 : 0.08 + amount * 0.06,
    intensity: capture ? 0.6 + amount * 0.5 : 0.05 + amount * 0.07,
    distortion: 0.12 + amount * 0.22,
    blend: capture ? 0.8 + amount * 1.2 : 2 + amount * 3,
    color: [0.035, 0.42, 1], rainbow: false,
  };
}

export function CanvasEffectStage({ effect, intensity, capture = true, children }: {
  effect: CanvasEffectName;
  intensity: number;
  capture?: boolean;
  children: ReactNode;
}) {
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<EffectInstance | null>(null);
  const [failed, setFailed] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [webgl] = useState(supportsWebgl);
  const [htmlInCanvas] = useState(() => capture && supportsHtmlCapture());
  const native = webgl && htmlInCanvas && !failed;

  useLayoutEffect(() => {
    const content = contentRef.current;
    const stage = outputRef.current?.parentElement;
    if (!content || !stage) return;
    const measure = () => {
      const bounds = stage.getBoundingClientRect();
      stage.style.setProperty('--canvas-stage-left', `${bounds.left}px`);
      stage.style.setProperty('--canvas-stage-width', `${bounds.width}px`);
      if (!native) {
        setContentHeight(0);
        return;
      }
      const next = Math.ceil(content.getBoundingClientRect().height);
      setContentHeight((current) => Math.abs(current - next) > 1 ? next : current);
    };
    measure();
    const resize = new ResizeObserver(measure);
    const mutations = native ? new MutationObserver(measure) : null;
    resize.observe(stage);
    resize.observe(content);
    mutations?.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      resize.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [native]);

  useEffect(() => {
    const source = sourceRef.current;
    const content = contentRef.current;
    const output = outputRef.current;
    if (!webgl || !source || !content || !output) return;
    instanceRef.current = factories[effect]({ source, content, output }, effectOptions(effect, intensity, native));
    if (native && !instanceRef.current) setFailed(true);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [effect, native, webgl]);

  useEffect(() => {
    instanceRef.current?.setOptions(effectOptions(effect, intensity, native));
  });
  useEffect(() => { instanceRef.current?.resize(); }, [contentHeight]);

  const stageStyle: CSSProperties | undefined = native && contentHeight > 0 ? { height: contentHeight } : undefined;
  return <div className={`canvas-effect-stage canvas-effect-${effect}`} style={stageStyle} data-canvas-effect={effect} data-capture={native ? 'html-in-canvas' : 'dom'}>
    <canvas ref={sourceRef} className="canvas-effect-source" // @ts-expect-error experimental html-in-canvas attribute
      layoutsubtree="true" suppressHydrationWarning style={native ? undefined : { display: 'none' }}>
      {native ? <div ref={contentRef} className="canvas-effect-content">{children}</div> : null}
    </canvas>
    {!native ? <div ref={contentRef} className="canvas-effect-content">{children}</div> : null}
    {webgl && <canvas ref={outputRef} className="canvas-effect-output" aria-hidden="true"/>}
  </div>;
}
