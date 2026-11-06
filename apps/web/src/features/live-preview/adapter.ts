import { httpSource, mount, type SceneInstance } from 'webwallgl';
import type { PreviewDescriptor } from '@wallpaper-manager/contracts';
export interface LivePreviewAdapter { mount(container: HTMLElement, descriptor: PreviewDescriptor): Promise<void>; unmount(): Promise<void>; pause(): void; resume(): void }
export class WebWallGlAdapter implements LivePreviewAdapter {
  private instance: SceneInstance | null = null;
  async mount(container: HTMLElement, descriptor: PreviewDescriptor) {
    await this.unmount(); if (!descriptor.resourceBaseUrl) throw new Error('缺少本地资源地址');
    this.instance = await mount(container, { source: httpSource(descriptor.resourceBaseUrl), fit: 'contain', scripts: descriptor.type === 'scene', fps: 45, autoQuality: true });
  }
  async unmount() { const current = this.instance; this.instance = null; if (current) { current.release(); current.destroy({ releasePkgCache: true }); } }
  pause() { this.instance?.pause(); }
  resume() { this.instance?.resume(); }
}
