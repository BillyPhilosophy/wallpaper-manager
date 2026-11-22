"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const canvasDimensionLimits = new WeakMap<WebGLRenderingContext | WebGL2RenderingContext, number>();

function getCanvasPixelRatio(
  element: HTMLElement,
  context?: WebGLRenderingContext | WebGL2RenderingContext,
): number {
  const scale = window.visualViewport?.scale || 1;
  const requested = Math.min(window.devicePixelRatio || 1, 2) * scale;
  const width = Math.max(element.clientWidth, 1);
  const height = Math.max(element.clientHeight, 1);
  let maxDimension = 8192;
  if (context) {
    let limit = canvasDimensionLimits.get(context);
    if (limit === undefined) {
      limit = Math.min(
        maxDimension,
        context.getParameter(context.MAX_TEXTURE_SIZE),
        context.getParameter(context.MAX_RENDERBUFFER_SIZE),
      );
      canvasDimensionLimits.set(context, limit);
    }
    maxDimension = limit;
  }
  return Math.min(
    requested,
    maxDimension / Math.max(width, height),
    Math.sqrt(16_777_216 / (width * height)),
  );
}

function createCanvasResizeObserver(onResize: () => void) {
  const viewport = window.visualViewport;
  let frame = 0;
  let disconnected = false;
  const schedule = () => {
    if (frame || disconnected) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onResize();
    });
  };
  const observer = new ResizeObserver(schedule);
  window.addEventListener("resize", schedule, { passive: true });
  viewport?.addEventListener("resize", schedule, { passive: true });
  return {
    observe(element: Element, options?: ResizeObserverOptions) {
      observer.observe(element, options);
    },
    unobserve(element: Element) {
      observer.unobserve(element);
    },
    disconnect() {
      disconnected = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
    },
  };
}

type HtmlInCanvasContext = CanvasRenderingContext2D & {
  drawElementImage: (element: Element, x: number, y: number) => DOMMatrix | void;
};

type HtmlInCanvasElement = HTMLCanvasElement & {
  updateElementGeometry?: (
    element: Element,
    options: { canvasTransform: DOMMatrix },
  ) => void;
};

function isHtmlInCanvasBlocked(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData?.platform;
  return platform === "Android" || /Android/i.test(navigator.userAgent);
}

function prepareHtmlInCanvas(source: HTMLCanvasElement, content: HTMLElement) {
  if ("content" in source) {
    source.setAttribute("content", "drawable");
    content.setAttribute("drawable", "");
  } else {
    source.setAttribute("layoutsubtree", "");
  }
}

const captureBackdrops = new WeakMap<
  HTMLCanvasElement,
  { at: number; layers: string[] }
>();

function captureBackdrop(source: HTMLCanvasElement): string[] {
  const now = performance.now();
  const cached = captureBackdrops.get(source);
  if (cached && now - cached.at < 500) return cached.layers;
  const layers: string[] = [];
  for (let node: Element | null = source; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    let alpha = 1;
    if (!color || color === "transparent") {
      alpha = 0;
    } else {
      const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
      const rgba = /^rgba\(([^)]+)\)$/.exec(color);
      if (slash) alpha = Number(slash[1]) / (slash[2] ? 100 : 1);
      else if (rgba) alpha = Number(rgba[1].split(",")[3] ?? 1);
    }
    if (!(alpha > 0)) continue;
    layers.unshift(color);
    if (alpha >= 1) break;
  }
  captureBackdrops.set(source, { at: now, layers });
  return layers;
}

function drawHtmlInCanvas(
  source: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  content: HTMLElement,
  fillBackdrop = false,
) {
  if (fillBackdrop) {
    for (const color of captureBackdrop(source)) {
      context.fillStyle = color;
      context.fillRect(0, 0, source.width, source.height);
    }
  }
  const transform = (context as HtmlInCanvasContext).drawElementImage(content, 0, 0);
  const canvas = source as HtmlInCanvasElement;
  if (transform && typeof canvas.updateElementGeometry === "function") {
    canvas.updateElementGeometry(content, { canvasTransform: transform });
  }
}

function createRectCache(element: Element) {
  let current = element.getBoundingClientRect();

  const refresh = () => {
    current = element.getBoundingClientRect();
  };

  const observer = new ResizeObserver(refresh);
  observer.observe(element);
  window.addEventListener("resize", refresh, { passive: true });
  window.addEventListener("scroll", refresh, {
    capture: true,
    passive: true,
  });

  return {
    get current() {
      return current;
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    },
  };
}

function resolveOptions<T extends object>(
  defaults: T,
  options: Partial<T>,
): Partial<T> {
  const resolved: Partial<T> = {};
  for (const key of Object.keys(options) as (keyof T)[]) {
    const value = options[key];
    resolved[key] = value === undefined ? defaults[key] : value;
  }
  return resolved;
}

export interface GlassOptions {
  /** Lens shape. */
  shape?: "circle" | "square" | "rectangle";
  /** Lens size (radius, or half height for rectangles) in CSS pixels. */
  size?: number;
  /** Width to height ratio of the rectangle shape (1 to 3). */
  aspect?: number;
  /** Corner radius for square and rectangle shapes in CSS pixels. */
  corner?: number;
  /** Index of refraction of the glass (1 to 2). Higher bends light more. */
  ior?: number;
  /** Fraction of the lens that stays optically flat before the rim (0 to 1). */
  edge?: number;
  /** How sharply the rim curves away (1 to 10). */
  bevel?: number;
  /** Optical depth in CSS pixels: how far the glass floats above the page. */
  depth?: number;
  /** Chromatic aberration strength at the rim (0 to 3). 0 disables it. */
  aberration?: number;
  /** Frosted blur of the glass face (0 = optically clear, up to 4). */
  blur?: number;
  /** Strength of the fresnel reflection on the rim (0 to 2). 0 disables it. */
  reflection?: number;
  /**
   * Specular rim highlight (0 to 2). Keeps the lens visible even over plain
   * backgrounds where clear glass would otherwise be invisible. 0 disables it.
   */
  shine?: number;
  /** Magnification while hovering a target element (1 to 3). */
  zoom?: number;
  /** CSS selector for elements that trigger the crystal ball zoom. */
  targets?: string;
  /** How quickly the lens follows the cursor (0 to 1). 1 snaps to it. */
  follow?: number;
}

export interface GlassElements {
  source: HTMLCanvasElement;
  content: HTMLElement;
  output: HTMLCanvasElement;
}

export interface GlassInstance {
  setOptions: (options: GlassOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<GlassOptions> = {
  shape: "circle",
  size: 120,
  aspect: 1.7,
  corner: 32,
  ior: 1.5,
  edge: 0.7,
  bevel: 4,
  depth: 250,
  aberration: 1,
  blur: 0,
  reflection: 1,
  shine: 0.01,
  zoom: 1.5,
  targets: "[data-glass-target]",
  follow: 0.2,
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uMaxX;
uniform float uHasContent;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uCorner;
uniform float uEdge;
uniform float uBevel;
uniform float uIor;
uniform float uDepth;
uniform float uAberration;
uniform float uBlur;
uniform float uReflect;
uniform float uShine;
uniform float uZoom;
uniform float uAlpha;

const float PI = 3.14159265358979;
const float AIR_IOR = 1.0003;
const vec3 INCIDENT = vec3(0.0, 0.0, 1.0);

float pow2 (float x) { return x * x; }
float pow5 (float x) { float x2 = x * x; return x2 * x2 * x; }
float linearStep (float e0, float e1, float x) {
  return clamp((x - e0) / (e1 - e0), 0.0, 1.0);
}

float sdf (vec2 p) {
  vec2 q = abs(p) - (uHalf - vec2(uCorner));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCorner;
}

float ign (vec2 v) {
  return fract(52.9829189 * fract(0.06711056 * v.x + 0.00583715 * v.y));
}

vec3 page (vec2 px, float lod) {
  vec2 uv = px / uResolution;
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(textureLod(uContent, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));
}

float iorForWavelength (float wavelength) {
  float ab = uAberration * 0.1;
  return mix(uIor + ab, uIor - ab,
    1.0 - pow(1.0 - linearStep(450.0, 650.0, wavelength), 4.0));
}

vec3 pageAA (vec2 px, float minLod) {
  float footprint = max(length(fwidth(px)), 1.0);
  return page(px, max(minLod, log2(footprint)));
}

vec3 sampleRefraction (vec2 basePx, float rim, vec3 normal, float glassIor) {
  vec3 rv = refract(INCIDENT, normal, AIR_IOR / glassIor);
  rv /= abs(rv.z) / uDepth;

  return pageAA(basePx + rv.xy, uBlur * (1.0 + rim));
}

float fresnelSchlick (float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow5(1.0 - cosTheta);
}

float smithSchlickDenom (float cosTheta, float k) {
  return cosTheta * (1.0 - k) + k;
}

float ggx (float roughness, float NDotL, float NDotV, float NDotH) {
  if (NDotL <= 0.0) return 0.0;
  float a2 = pow2(roughness);
  float d = a2 / (PI * pow2(pow2(NDotH) * (a2 - 1.0) + 1.0));
  float k = roughness * 0.5;
  float v = 1.0 / (smithSchlickDenom(NDotL, k)
    * smithSchlickDenom(clamp(NDotV, 0.0, 1.0), k));
  return NDotL * d * v;
}

void main () {
  vec2 fragPx = gl_FragCoord.xy;
  vec2 p = fragPx - uCenter;
  float sd = sdf(p);

  float aa = 1.5;
  float mask = 1.0 - smoothstep(-aa, 0.0, sd);
  float alpha = mask * uAlpha
    * (1.0 - step(uMaxX, fragPx.x / uResolution.x));

  float minHalf = min(uHalf.x, uHalf.y);
  float edgeW = max(minHalf * (1.0 - clamp(uEdge, 0.0, 0.98)), 1.0);
  float rim = pow(linearStep(-edgeW, 0.0, sd), uBevel);

  float scatter = min(uBlur, 1.0) * 0.02;
  float randAngle = ign(fragPx) * PI * 2.0;
  vec3 flatNormal = normalize(
    vec3(sin(randAngle) * scatter, cos(randAngle) * scatter, -1.0));
  float e = 1.0;
  vec2 grad = vec2(
    sdf(p + vec2(e, 0.0)) - sdf(p - vec2(e, 0.0)),
    sdf(p + vec2(0.0, e)) - sdf(p - vec2(0.0, e)));
  vec3 rimNormal = vec3(normalize(grad + vec2(1e-5)), 0.0);
  vec3 normal = normalize(mix(flatNormal, rimNormal, rim));

  if (uHasContent < 0.5) {
    float ldot = dot(rimNormal.xy, normalize(vec2(-0.6, 0.8)));
    float band = pow(rim, 1.8);
    float arcs = pow(abs(ldot), 3.0) * (ldot > 0.0 ? 0.5 : 0.28);
    float shine = band * (0.04 + arcs) * max(uShine, 0.5);
    float a = alpha * clamp(0.06 + 0.12 * rim, 0.0, 1.0);
    outColor = vec4(vec3(shine * 1.6) * alpha, a);
    return;
  }

  vec2 basePx = uCenter + p / uZoom;

  vec3 refracted;
  if (uAberration > 0.001) {
    refracted = sampleRefraction(basePx, rim, normal, iorForWavelength(611.4))
      * vec3(1.0, 0.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(570.5))
      * vec3(1.0, 1.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(549.1))
      * vec3(0.0, 1.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(491.4))
      * vec3(0.0, 1.0, 1.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(464.2))
      * vec3(0.0, 0.0, 1.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(374.0))
      * vec3(1.0, 0.0, 1.0);
    refracted /= 3.0;
  } else {
    refracted = sampleRefraction(basePx, rim, normal, uIor);
  }

  vec3 glass = refracted;
  if (uReflect > 0.001) {
    const vec3 V = vec3(0.0, 0.0, -1.0);
    float NDotV = clamp(dot(V, normal), 0.0, 1.0);
    float f0 = pow2((uIor - AIR_IOR) / (uIor + AIR_IOR));
    float fresnelV = fresnelSchlick(NDotV, f0) * uReflect;

    vec3 reflectVector = reflect(INCIDENT, normal);
    vec3 L = reflectVector;
    vec3 H = normalize(L + V);
    reflectVector /= abs(reflectVector.z) / uDepth;
    vec3 reflected = page(basePx + reflectVector.xy, 2.5 + uBlur);
    reflected *= ggx(0.5, dot(normal, L), NDotV, dot(normal, H));
    glass = mix(refracted, reflected, clamp(fresnelV, 0.0, 1.0));
  }

  if (uShine > 0.001) {
    float ldot = dot(rimNormal.xy, normalize(vec2(-0.6, 0.8)));
    float band = pow(rim, 1.8);
    float arcs = pow(abs(ldot), 3.0) * (ldot > 0.0 ? 0.5 : 0.28);
    glass += band * (0.04 + arcs) * uShine;
  }

  // Composite against the real page when the captured DOM is transparent.
  vec2 coverageUv = vec2(
    clamp(basePx.x / uResolution.x, 0.0005, uMaxX - 0.0005),
    1.0 - clamp(basePx.y / uResolution.y, 0.0005, 0.9995));
  float coverage = textureLod(uContent, coverageUv, uBlur).a;
  float opticalAlpha = alpha * max(coverage, rim * 0.16);
  outColor = vec4(pow(glass, vec3(1.0 / 2.2)) * opticalAlpha, opticalAlpha);
}`;

export function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined" || isHtmlInCanvasBlocked()) return false;
  const probe = document.createElement("canvas") as PaintableCanvas;
  const ctx = probe.getContext("2d") as ElementImageContext | null;
  return Boolean(
    ctx &&
    typeof ctx.drawElementImage === "function" &&
    typeof probe.requestPaint === "function",
  );
}

export function createGlass(
  elements: GlassElements,
  options: GlassOptions = {},
): GlassInstance | null {
  const config = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };
  const { source, content, output } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return null;

  const sourceCtx = source.getContext("2d") as ElementImageContext | null;
  const paintable = source as PaintableCanvas;
  const htmlInCanvas = Boolean(
    !isHtmlInCanvasBlocked() &&
    source.contains(content) &&
    sourceCtx &&
    typeof sourceCtx.drawElementImage === "function" &&
    typeof paintable.requestPaint === "function",
  );

  if (htmlInCanvas) prepareHtmlInCanvas(source, content);

  let contentDirty = false;
  let wake = () => {};

  if (htmlInCanvas) {
    paintable.onpaint = () => {
      try {
        sourceCtx!.reset();
        // Keep the wallpaper backdrop visible behind the captured DOM.
        drawHtmlInCanvas(source, sourceCtx!, content);
        contentDirty = true;
        wake();
      } catch {}
    };
  }

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Glass shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)!;
    uniforms[info.name] = gl.getUniformLocation(program, info.name)!;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const contentTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );
  gl.generateMipmap(gl.TEXTURE_2D);

  let contentMaxX = 1;

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output, gl!);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    contentMaxX = Math.min(
      1,
      Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)),
    );
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
      if (source.width !== sourceWidth || source.height !== sourceHeight) {
        source.width = sourceWidth;
        source.height = sourceHeight;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      source,
    );
    gl!.generateMipmap(gl!.TEXTURE_2D);
  }

  let posX = output.clientWidth / 2;
  let posY = output.clientHeight / 2;
  let presence = 0;
  let presenceTarget = 0;
  let targetX = posX;
  let targetY = posY;
  let zoom = 1;
  let zoomTarget = 1;
  let hasPointer = false;

  function halfExtents(): [number, number] {
    const size = Math.max(config.size, 8);
    if (config.shape === "rectangle") {
      return [size * Math.min(Math.max(config.aspect, 1), 4), size];
    }
    return [size, size];
  }

  function render() {
    uploadContent();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.disable(gl!.SCISSOR_TEST);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    if (presence <= 0.004) return;

    const [baseHalfW, baseHalfH] = halfExtents();
    const halfW = baseHalfW * presence;
    const halfH = baseHalfH * presence;
    const alpha = Math.min(presence * 5, 1);
    const cx = posX * dpr;
    const cy = output.height - posY * dpr;
    const margin = 4 * dpr;
    const sx = Math.max(0, Math.floor(cx - halfW * dpr - margin));
    const sy = Math.max(0, Math.floor(cy - halfH * dpr - margin));
    gl!.enable(gl!.SCISSOR_TEST);
    gl!.scissor(
      sx,
      sy,
      Math.min(output.width - sx, Math.ceil(halfW * dpr * 2 + margin * 2)),
      Math.min(output.height - sy, Math.ceil(halfH * dpr * 2 + margin * 2)),
    );

    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);
    gl!.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
    gl!.uniform2f(uniforms.uCenter, cx, cy);
    gl!.uniform2f(uniforms.uHalf, halfW * dpr, halfH * dpr);
    const corner =
      config.shape === "circle"
        ? Math.min(halfW, halfH)
        : Math.min(Math.max(config.corner, 0), Math.min(halfW, halfH));
    gl!.uniform1f(uniforms.uCorner, corner * dpr);
    gl!.uniform1f(uniforms.uEdge, Math.min(Math.max(config.edge, 0), 0.98));
    gl!.uniform1f(uniforms.uBevel, Math.max(config.bevel, 0.5));
    gl!.uniform1f(uniforms.uIor, Math.min(Math.max(config.ior, 1.01), 2.5));
    gl!.uniform1f(uniforms.uDepth, Math.max(config.depth, 0) * dpr);
    gl!.uniform1f(uniforms.uAberration, Math.max(config.aberration, 0));
    gl!.uniform1f(uniforms.uBlur, Math.max(config.blur, 0));
    gl!.uniform1f(uniforms.uReflect, Math.max(config.reflection, 0));
    gl!.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
    gl!.uniform1f(uniforms.uZoom, Math.max(zoom, 1));
    gl!.uniform1f(uniforms.uAlpha, alpha);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    gl!.disable(gl!.SCISSOR_TEST);
  }

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;

    const follow = Math.min(Math.max(config.follow, 0.02), 1);
    const kPos =
      reducedMotion || follow >= 1
        ? 1
        : 1 - Math.exp(-delta * (4 + follow * 26));
    const kZoom = reducedMotion ? 1 : 1 - Math.exp(-delta * 7);
    const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
    posX += (targetX - posX) * kPos;
    posY += (targetY - posY) * kPos;
    zoom += (zoomTarget - zoom) * kZoom;
    presence += (presenceTarget - presence) * kScale;

    render();

    const settled =
      Math.abs(targetX - posX) < 0.1 &&
      Math.abs(targetY - posY) < 0.1 &&
      Math.abs(zoomTarget - zoom) < 0.002 &&
      Math.abs(presenceTarget - presence) < 0.002;
    if (settled && !contentDirty) {
      posX = targetX;
      posY = targetY;
      zoom = zoomTarget;
      presence = presenceTarget;
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  wake = start;
  start();

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    const rect = rectCache.current;
    targetX = event.clientX - rect.left;
    targetY = event.clientY - rect.top;
    if (!hasPointer) {
      posX = targetX;
      posY = targetY;
      hasPointer = true;
    }
    presenceTarget = 1;
    const target = event.target as Element | null;
    zoomTarget =
      config.zoom > 1 && target?.closest?.(config.targets)
        ? Math.min(Math.max(config.zoom, 1), 4)
        : 1;
    start();
  }

  function onPointerLeave() {
    presenceTarget = 0;
    zoomTarget = 1;
    hasPointer = false;
    start();
  }

  content.addEventListener("pointermove", onPointerMove, { passive: true });
  content.addEventListener("pointerleave", onPointerLeave, { passive: true });

  function onScroll() {
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const observer = createCanvasResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  observer.observe(content);

  let intersecting = true;
  function syncVisibility() {
    visible = intersecting && document.visibilityState !== "hidden";
    if (visible) {
      start();
    } else if (running) {
      cancelAnimationFrame(raf);
      running = false;
    }
  }
  const intersection = new IntersectionObserver((entries) => {
    intersecting = entries[entries.length - 1]?.isIntersecting ?? true;
    syncVisibility();
  });
  document.addEventListener("visibilitychange", syncVisibility);
  intersection.observe(output);

  return {
    setOptions(next) {
      next = resolveOptions(DEFAULTS, next);
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof GlassOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
      start();
    },
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      rectCache.destroy();
      cancelAnimationFrame(raf);
      content.removeEventListener("pointermove", onPointerMove);
      content.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("scroll", onScroll);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      gl!.deleteTexture(contentTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}

export interface GlassProps extends GlassOptions {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const emptySubscribe = () => () => {};

export function Glass({ children, className, style, ...options }: GlassProps) {
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<GlassInstance | null>(null);
  const [initialOptions] = useState(options);
  const [failed, setFailed] = useState(false);

  const supported = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
    () => false,
  );
  const native = supported && !failed;

  useEffect(() => {
    const source = sourceRef.current;
    const content = contentRef.current;
    const output = outputRef.current;
    if (!source || !content || !output) return;
    instanceRef.current = createGlass(
      { source, content, output },
      initialOptions,
    );
    if (native && !instanceRef.current) setFailed(true);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [initialOptions, native]);

  useEffect(() => {
    instanceRef.current?.setOptions(options);
  });

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <canvas
        ref={sourceRef}
        // @ts-expect-error experimental html-in-canvas attribute
        layoutsubtree="true"
        suppressHydrationWarning
        style={
          native
            ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
            : { display: "none" }
        }
      >
        {native ? (
          <div
            ref={contentRef}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "auto",
            }}
          >
            {children}
          </div>
        ) : null}
      </canvas>
      {!native ? (
        <div
          ref={contentRef}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "auto",
          }}
        >
          {children}
        </div>
      ) : null}
      <canvas
        ref={outputRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}


export default Glass;
