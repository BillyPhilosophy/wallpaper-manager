import { FormEvent, useEffect, useState } from 'react';
import type { WorkshopSearchResult } from '@wallpaper-manager/contracts';
import { api, post } from '../api';
import { useRemote } from '../hooks';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { WallpaperCard } from '../components/WallpaperCard';
import { cachedSearch, invalidateSearch, ratingOptions, searchKey, searchSession, typeOptions, type SearchRating, type SearchType } from '../features/search/session';

export function SearchPage() {
  const [input, setInput] = useState(searchSession.input);
  const [query, setQuery] = useState(searchSession.query);
  const [cursor, setCursor] = useState(searchSession.cursor);
  const [types, setTypes] = useState<SearchType[]>(searchSession.types);
  const [ratings, setRatings] = useState<SearchRating[]>(searchSession.ratings);
  const [busy, setBusy] = useState('');
  const key = searchKey(query, cursor, types, ratings);
  const [requestKey, setRequestKey] = useState(key);
  useEffect(() => {
    const timer = window.setTimeout(() => setRequestKey(key), 300);
    return () => window.clearTimeout(timer);
  }, [key]);
  const [requestedQuery, requestedCursor, requestedTypes, requestedRatings] = JSON.parse(requestKey) as [string, string, SearchType[], SearchRating[]];
  const { data, error, loading, reload } = useRemote<WorkshopSearchResult>(() => {
    if (!requestedTypes.length || !requestedRatings.length) return Promise.resolve({ items: [], cursor: null, total: 0 });
    const params = new URLSearchParams({ q: requestedQuery, cursor: requestedCursor, pageSize: '20' });
    if (requestedTypes.length < typeOptions.length) params.set('type', requestedTypes.join(','));
    if (requestedRatings.length < ratingOptions.length) params.set('rating', requestedRatings.join(','));
    return cachedSearch(requestKey, () => api(`/workshop/search?${params}`));
  }, [requestKey]);
  useEffect(() => {
    let navigating = false;
    const rememberScroll = () => { if (!navigating) searchSession.scrollY = window.scrollY; };
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
    const nextKey = searchKey(nextQuery, '*', types, ratings);
    searchSession.query = nextQuery; searchSession.cursor = '*';
    if (nextKey === requestKey) refresh();
    setRequestKey(nextKey); setCursor('*'); setQuery(nextQuery);
  };
  const changeCursor = (value: string) => { searchSession.cursor = value; setCursor(value); };
  const changeTypes = (values: SearchType[]) => { searchSession.types = values; searchSession.cursor = '*'; setTypes(values); setCursor('*'); };
  const changeRatings = (values: SearchRating[]) => { searchSession.ratings = values; searchSession.cursor = '*'; setRatings(values); setCursor('*'); };
  return <section>
    <div className="page-heading"><div><p className="eyebrow">STEAM WORKSHOP</p><h1>发现下一张壁纸</h1><p>搜索官方创意工坊，将原始文件安全发布到共享壁纸库。</p></div></div>
    <form className="search-bar" onSubmit={submit}><input value={input} onChange={(event) => { searchSession.input = event.target.value; setInput(event.target.value); }} placeholder="搜索壁纸、场景或艺术家…" aria-label="搜索工坊"/><button>搜索</button></form>
    <div className="filters"><MultiSelectFilter label="类型" options={typeOptions} selected={types} onChange={changeTypes}/><MultiSelectFilter label="内容分级" options={ratingOptions} selected={ratings} onChange={changeRatings}/></div>
    {error && <div className="error-state">{error}<button className="text-button" onClick={refresh}>重试</button></div>}
    {loading && !data ? <div className="loading">正在连接 Steam 创意工坊…</div> : <div className="wallpaper-grid">{data?.items.map((item) => <WallpaperCard key={item.workshopId} item={item} action={item.localStatus === 'not_downloaded' ? <button disabled={busy === item.workshopId} onClick={() => void download(item.workshopId)}>{busy === item.workshopId ? '正在入队' : '下载'}</button> : null}/>)}</div>}
    {data && !data.items.length && <div className="empty-state">没有找到匹配的壁纸。</div>}
    <div className="pagination"><button className="secondary" disabled={cursor === '*'} onClick={() => changeCursor('*')}>从头浏览</button><span>共 {data?.total || 0} 项</span><button className="secondary" disabled={!data?.cursor} onClick={() => data?.cursor && changeCursor(data.cursor)}>下一页</button></div>
  </section>;
}
