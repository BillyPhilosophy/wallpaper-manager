import { useEffect, useState } from 'react';
import type { ContentRating, Page, SteamAuthState, Wallpaper, WallpaperType } from '@wallpaper-manager/contracts';
import { api, post } from '../api';
import { useRemote } from '../hooks';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { WallpaperCard } from '../components/WallpaperCard';
import { ratingOptions, typeOptions } from '../features/library/session';

type SyncState = { status: 'idle' | 'running' | 'succeeded' | 'failed'; total: number; synced: number; message: string | null; updatedAt: string };

export function SubscriptionsPage() {
  const auth = useRemote<SteamAuthState>(() => api('/steam/auth/status'), []);
  const sync = useRemote<SyncState>(() => api('/workshop/subscriptions/sync'), [], 2000);
  const [steamId, setSteamId] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<WallpaperType[]>(typeOptions.map((option) => option.value));
  const [ratings, setRatings] = useState<ContentRating[]>(ratingOptions.map((option) => option.value));
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [busyId, setBusyId] = useState('');
  const list = useRemote<Page<Wallpaper>>(() => {
    if (!types.length || !ratings.length) return Promise.resolve({ items: [], page, pageSize: 24, total: 0 });
    const params = new URLSearchParams({ subscribed: 'true', q, page: String(page), pageSize: '24' });
    if (types.length < typeOptions.length) params.set('type', types.join(','));
    if (ratings.length < ratingOptions.length) params.set('rating', ratings.join(','));
    return api(`/wallpapers?${params}`);
  }, [q, types, ratings, page]);
  useEffect(() => { if (auth.data?.steamId) setSteamId(auth.data.steamId); }, [auth.data?.steamId]);
  useEffect(() => { if (sync.data?.status === 'succeeded') list.reload(); }, [sync.data?.status]);
  useEffect(() => { setPageInput(String(page)); }, [page]);
  const synchronize = async () => {
    setSyncBusy(true); setMessage('');
    try { await post('/workshop/subscriptions/sync', steamId.trim() ? { steamId: steamId.trim() } : {}); sync.reload(); auth.reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '同步失败'); }
    finally { setSyncBusy(false); }
  };
  const download = async (id: string) => {
    setBusyId(id);
    try { await post(`/wallpapers/${id}/download`); list.reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '下载失败'); }
    finally { setBusyId(''); }
  };
  const maxPage = Math.max(1, Math.ceil((list.data?.total || 0) / 24));
  const goToPage = (next: number) => {
    if (!Number.isSafeInteger(next) || next < 1 || next > maxPage) return;
    window.scrollTo(0, 0); setPage(next);
  };
  const changeTypes = (values: WallpaperType[]) => { setTypes(values); setPage(1); };
  const changeRatings = (values: ContentRating[]) => { setRatings(values); setPage(1); };
  return <section aria-busy={list.loading}>
    <div className="page-heading"><div><p className="eyebrow">STEAM SUBSCRIPTIONS</p><h1>订阅同步</h1><p>同步 Wallpaper Engine 订阅清单，按需筛选并下载，不会自动下载全部项目。</p></div></div>
    <article className="settings-card subscription-controls">
      <label>SteamID64<input inputMode="numeric" autoComplete="off" value={steamId} onChange={(event) => setSteamId(event.target.value)} placeholder="填写后同步并保存；留空使用已保存值"/></label>
      <div className="setting-row"><span>同步状态</span><strong>{syncLabel(sync.data)}</strong></div>
      {sync.data?.status === 'running' && <p>已处理 {sync.data.synced} / {sync.data.total || '…'} 项</p>}
      <p>最近同步：{new Date(sync.data?.updatedAt || '').toLocaleString()}</p>
      <button disabled={syncBusy || sync.data?.status === 'running'} onClick={() => void synchronize()}>同步订阅列表</button>
      {message && <p className="error-text" role="alert">{message}</p>}
    </article>
    <div className="filters"><input placeholder="筛选订阅标题或 ID" aria-label="筛选订阅标题或 ID" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }}/><MultiSelectFilter label="类型" options={typeOptions} selected={types} onChange={changeTypes}/><MultiSelectFilter label="内容分级" options={ratingOptions} selected={ratings} onChange={changeRatings}/></div>
    {list.loading && list.data && <div className="inline-loading" role="status">正在更新订阅列表…</div>}
    {list.loading && !list.data ? <div className="loading" role="status">正在读取订阅列表…</div> : <div className={`wallpaper-grid${list.loading ? ' is-loading' : ''}`}>{list.data?.items.map((wallpaper) => <WallpaperCard key={wallpaper.workshopId} item={{ ...wallpaper, metadataJson: wallpaper.metadataJson as Record<string, unknown>, localStatus: wallpaper.status, previewContentType: null }} action={wallpaper.status === 'not_downloaded' ? <button disabled={busyId === wallpaper.workshopId} onClick={() => void download(wallpaper.workshopId)}>{busyId === wallpaper.workshopId ? '正在入队' : '下载'}</button> : null}/>)}</div>}
    {!list.loading && list.data && !list.data.items.length && <div className="empty-state">暂无订阅项目，请先同步。</div>}
    <div className="pagination"><button className="secondary" disabled={list.loading || page <= 1} onClick={() => goToPage(page - 1)}>上一页</button><form className="page-jump" onSubmit={(event) => { event.preventDefault(); goToPage(Number(pageInput)); }}><input aria-label="页码" type="number" min="1" max={maxPage} step="1" value={pageInput} disabled={list.loading} onChange={(event) => setPageInput(event.target.value)}/><button className="secondary" disabled={list.loading}>跳转</button></form><span>共 {maxPage} 页 · {list.data?.total || 0} 项</span><button className="secondary" disabled={list.loading || page >= maxPage} onClick={() => goToPage(page + 1)}>下一页</button></div>
  </section>;
}

function syncLabel(sync?: SyncState | null) { return sync?.status === 'running' ? '同步中' : sync?.status === 'succeeded' ? `成功，共 ${sync.total} 项` : sync?.status === 'failed' ? sync.message || '同步失败' : '尚未同步'; }
