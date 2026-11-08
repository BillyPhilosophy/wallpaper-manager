import { FormEvent, useEffect, useState } from 'react';
import type { WorkshopSearchResult } from '@wallpaper-manager/contracts';
import { api, post } from '../api';
import { useRemote } from '../hooks';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { WallpaperCard } from '../components/WallpaperCard';
import { cachedSearch, invalidateSearch, ratingOptions, saveSearchSession, searchKey, searchSession, typeOptions, type SearchRating, type SearchType } from '../features/search/session';

export function SearchPage() {
  const [input, setInput] = useState(searchSession.input);
  const [query, setQuery] = useState(searchSession.query);
  const [page, setPage] = useState(searchSession.page);
  const [types, setTypes] = useState<SearchType[]>(searchSession.types);
  const [ratings, setRatings] = useState<SearchRating[]>(searchSession.ratings);
  const [busy, setBusy] = useState('');
  const [pageInput, setPageInput] = useState(String(page));
  const [pageError, setPageError] = useState('');
  const key = searchKey(query, page, types, ratings);
  const [requestKey, setRequestKey] = useState(key);
  useEffect(() => {
    const timer = window.setTimeout(() => setRequestKey(key), 300);
    return () => window.clearTimeout(timer);
  }, [key]);
  const [requestedQuery, requestedPage, requestedTypes, requestedRatings] = JSON.parse(requestKey) as [string, number, SearchType[], SearchRating[]];
  const { data, error, loading, reload } = useRemote<WorkshopSearchResult>(() => {
    if (!requestedTypes.length || !requestedRatings.length) return Promise.resolve({ items: [], cursor: null, total: 0 });
    const params = new URLSearchParams({ q: requestedQuery, page: String(requestedPage), pageSize: '20' });
    if (requestedTypes.length < typeOptions.length) params.set('type', requestedTypes.join(','));
    if (requestedRatings.length < ratingOptions.length) params.set('rating', requestedRatings.join(','));
    return cachedSearch(requestKey, () => api(`/workshop/search?${params}`));
  }, [requestKey]);
  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / 20));
  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => { if (data && page > maxPage) goToPage(maxPage); }, [data, page, maxPage]);
  useEffect(() => {
    let navigating = false;
    const rememberScroll = () => {
      if (!navigating) { searchSession.scrollY = window.scrollY; saveSearchSession(); }
    };
    const prepareNavigation = () => { navigating = true; };
    const click = (event: MouseEvent) => { if (event.target instanceof Element && event.target.closest('a')) prepareNavigation(); };
    window.addEventListener('scroll', rememberScroll, { passive: true });
    window.addEventListener('popstate', prepareNavigation);
    document.addEventListener('click', click, true);
    const frame = requestAnimationFrame(() => { window.scrollTo(0, searchSession.scrollY); navigating = false; });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', rememberScroll);
      window.removeEventListener('popstate', prepareNavigation);
      document.removeEventListener('click', click, true);
    };
  }, []);
  const refresh = () => { invalidateSearch(requestKey); reload(); };
  const download = async (id: string) => { setBusy(id); try { await post(`/wallpapers/${id}/download`); refresh(); } catch (error) { alert(error instanceof Error ? error.message : '下载失败'); } finally { setBusy(''); } };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = input.trim();
    const nextKey = searchKey(nextQuery, 1, types, ratings);
    searchSession.query = nextQuery; searchSession.page = 1; saveSearchSession();
    if (nextKey === requestKey) refresh();
    setRequestKey(nextKey); setPage(1); setQuery(nextQuery);
  };
  const goToPage = (next: number) => {
    if (!Number.isSafeInteger(next) || next < 1 || next > maxPage) { setPageError(`请输入 1 到 ${maxPage} 之间的页码`); return; }
    setPageError('');
    if (next === page) { setPageInput(String(next)); return; }
    window.scrollTo(0, 0);
    searchSession.page = next; saveSearchSession();
    setPage(next); setRequestKey(searchKey(query, next, types, ratings));
  };
  const changeTypes = (values: SearchType[]) => { searchSession.types = values; searchSession.page = 1; saveSearchSession(); setTypes(values); setPage(1); };
  const changeRatings = (values: SearchRating[]) => { searchSession.ratings = values; searchSession.page = 1; saveSearchSession(); setRatings(values); setPage(1); };
  return <section aria-busy={loading}>
    <div className="page-heading"><div><p className="eyebrow">STEAM WORKSHOP</p><h1>发现下一张壁纸</h1><p>搜索官方创意工坊，将原始文件安全发布到共享壁纸库。</p></div></div>
    <form className="search-bar" onSubmit={submit}><input value={input} onChange={(event) => { searchSession.input = event.target.value; saveSearchSession(); setInput(event.target.value); }} placeholder="搜索壁纸、场景或艺术家…" aria-label="搜索工坊"/><button>搜索</button></form>
    <div className="filters"><MultiSelectFilter label="类型" options={typeOptions} selected={types} onChange={changeTypes}/><MultiSelectFilter label="内容分级" options={ratingOptions} selected={ratings} onChange={changeRatings}/></div>
    {error && <div className="error-state">{error}<button className="text-button" onClick={refresh}>重试</button></div>}
    {loading && data && <div className="inline-loading" role="status">正在更新搜索结果…</div>}
    {loading && !data ? <div className="loading" role="status">正在连接 Steam 创意工坊…</div> : <div className={`wallpaper-grid${loading ? ' is-loading' : ''}`}>{data?.items.map((item) => <WallpaperCard key={item.workshopId} item={item} action={item.localStatus === 'not_downloaded' ? <button disabled={busy === item.workshopId} onClick={() => void download(item.workshopId)}>{busy === item.workshopId ? '正在入队' : '下载'}</button> : null}/>)}</div>}
    {!loading && data && !data.items.length && <div className="empty-state">没有找到匹配的壁纸。</div>}
    <div className="pagination">
      <button className="secondary" disabled={loading || !data || page <= 1} onClick={() => goToPage(page - 1)}>上一页</button>
      <form className="page-jump" onSubmit={(event) => { event.preventDefault(); goToPage(Number(pageInput)); }}><input aria-label="页码" type="number" min="1" max={maxPage} step="1" value={pageInput} disabled={loading || !data} onChange={(event) => { setPageInput(event.target.value); setPageError(''); }}/><button className="secondary" disabled={loading || !data}>跳转</button></form>
      <span>共 {maxPage} 页 · {data?.total || 0} 项</span>
      <button className="secondary" disabled={loading || !data || page >= maxPage} onClick={() => goToPage(page + 1)}>下一页</button>
    </div>
    {pageError && <p className="page-error" role="alert">{pageError}</p>}
  </section>;
}
