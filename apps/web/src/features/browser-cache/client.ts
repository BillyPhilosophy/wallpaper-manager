export interface BrowserCacheUsage { bytes: number; entries: number }

let workerPromise: Promise<ServiceWorker> | null = null;

function getWorker(): Promise<ServiceWorker> {
  if (!workerPromise) workerPromise = (async () => {
    await navigator.serviceWorker.register('/wallpaper-cache-sw.js');
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          navigator.serviceWorker.removeEventListener('controllerchange', changed);
          reject(new Error('浏览器缓存服务尚未控制当前页面'));
        }, 10000);
        const changed = () => {
          window.clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('controllerchange', changed);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', changed);
      });
    }
    if (!registration.active) throw new Error('浏览器缓存服务未就绪');
    return registration.active;
  })().catch((error) => { workerPromise = null; throw error; });
  return workerPromise;
}

async function request<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const worker = await getWorker();
  return new Promise<T>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error('浏览器缓存服务响应超时'));
    }, 10000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      channel.port1.close();
      if (event.data?.error) reject(new Error(String(event.data.error)));
      else resolve(event.data as T);
    };
    worker.postMessage({ type, ...payload }, [channel.port2]);
  });
}

export async function setBrowserCacheEnabled(enabled: boolean): Promise<void> {
  await request('wm-cache-enabled', { enabled });
}

export async function prepareBrowserCache(workshopId: string, version: string): Promise<void> {
  await request('wm-cache-prepare', { workshopId, version, kind: 'video' });
}

export async function clearBrowserCache(): Promise<void> {
  await request('wm-cache-clear');
}

export function browserCacheUsage(): Promise<BrowserCacheUsage> {
  return request<BrowserCacheUsage>('wm-cache-usage');
}
