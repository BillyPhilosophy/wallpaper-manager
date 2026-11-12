import { httpSource, mount, type MountOptions as WebWallGlMountOptions, type SceneInstance } from 'webwallgl';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
export interface LivePreviewAdapter { mount(container: HTMLElement, descriptor: PreviewDescriptor, options?: MountOptions): Promise<void>; unmount(): Promise<void>; pause(): void; resume(): void }
interface MountOptions { fit?: 'contain' | 'cover'; fps?: number; interactive?: boolean }
export class WebWallGlAdapter implements LivePreviewAdapter {
  private instance: SceneInstance | null = null;
  private pointerCleanup: (() => void) | null = null;
  async mount(container: HTMLElement, descriptor: PreviewDescriptor, mountOptions: MountOptions = {}) {
    await this.unmount(); if (!descriptor.resourceBaseUrl) throw new Error('缺少本地资源地址');
    const options: WebWallGlMountOptions = { source: httpSource(descriptor.resourceBaseUrl), fit: mountOptions.fit || 'contain', scripts: descriptor.type === 'scene', fps: mountOptions.fps || 45, autoQuality: true, webSandbox: 'legacy' };
    const instance = await mount(container, options);
    this.instance = instance;
    if (descriptor.type === 'scene' && mountOptions.interactive !== false) this.bindPointer(container, instance);
  }
  private bindPointer(container: HTMLElement, instance: SceneInstance): void {
    let pending: { u: number; v: number; buttons: number } | null = null;
    let frame = 0;
    let downAt = 0;
    let releaseTimer: number | null = null;
    const flush = () => {
      frame = 0;
      if (pending) instance.pushPointer(pending.u, pending.v, pending.buttons);
    };
    const sample = (event: MouseEvent, buttons: number) => {
      const rect = container.getBoundingClientRect();
      pending = {
        u: Math.max(0, Math.min(1, (event.clientX - rect.left) / (rect.width || 1))),
        v: Math.max(0, Math.min(1, (event.clientY - rect.top) / (rect.height || 1))),
        buttons,
      };
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const move = (event: MouseEvent) => sample(event, event.buttons & 1);
    const down = (event: MouseEvent) => { if (event.button === 0) { downAt = Date.now(); sample(event, 1); } };
    const up = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      if (Date.now() - downAt < 16) releaseTimer = window.setTimeout(() => { releaseTimer = null; sample(event, 0); }, 20);
      else sample(event, 0);
    };
    const leave = () => {
      pending = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      instance.pointerLeave();
    };
    container.addEventListener('mousemove', move, { passive: true });
    container.addEventListener('mousedown', down, { passive: true });
    container.addEventListener('mouseleave', leave, { passive: true });
    window.addEventListener('mouseup', up, { passive: true });
    window.addEventListener('blur', leave, { passive: true });
    this.pointerCleanup = () => {
      container.removeEventListener('mousemove', move);
      container.removeEventListener('mousedown', down);
      container.removeEventListener('mouseleave', leave);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', leave);
      if (frame) cancelAnimationFrame(frame);
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
    };
  }
  async unmount() {
    this.pointerCleanup?.(); this.pointerCleanup = null;
    const current = this.instance; this.instance = null;
    if (current) { current.release(); current.destroy({ releasePkgCache: true }); }
  }
  pause() { this.instance?.pause(); }
  resume() { this.instance?.resume(); }
}
