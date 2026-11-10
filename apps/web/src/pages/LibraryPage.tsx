import { useEffect, useState } from 'react';
import { type ContentRating, type Page, type Wallpaper, type WallpaperType } from '@wallpaper-manager/contracts';
import { api } from '../api';
import { useRemote } from '../hooks';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { WallpaperCard } from '../components/WallpaperCard';
import { FavoriteButton } from '../components/FavoriteButton';
import { librarySession, ratingOptions, saveLibrarySession, typeOptions } from '../features/library/session';

export function LibraryPage() {
  const [q, setQ] = useState(librarySession.q);
  const [types, setTypes] = useState<WallpaperType[]>(librarySession.types);
  const [ratings, setRatings] = useState<ContentRating[]>(librarySession.ratings);
  const [page, setPage] = useState(librarySession.page);
  const [pageInput, setPageInput] = useState(String(page));
  const [pageError, setPageError] = useState('');
  const { data, error, loading, reload } = useRemote<Page<Wallpaper>>(() => {
    if (!types.length || !ratings.length) return Promise.resolve({ items: [], page, pageSize: 24, total: 0 });
    const params = new URLSearchParams({ q, status: 'downloaded', page: String(page), pageSize: '24' });
    if (types.length < typeOptions.length) params.set('type', types.join(','));
    if (ratings.length < ratingOptions.length) params.set('rating', ratings.join(','));
    return api(`/wallpapers?${params}`);
  }, [q, types, ratings, page]);
  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 24)));
  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => { if (data && page > maxPage) goToPage(maxPage); }, [data, page, maxPage]);
  const resetPage = () => { librarySession.page = 1; setPage(1); };
  const changeQ = (value: string) => { librarySession.q = value; resetPage(); saveLibrarySession(); setQ(value); };
  const changeTypes = (values: WallpaperType[]) => { librarySession.types = values; resetPage(); saveLibrarySession(); setTypes(values); };
  const changeRatings = (values: ContentRating[]) => { librarySession.ratings = values; resetPage(); saveLibrarySession(); setRatings(values); };
  const goToPage = (next: number) => {
    if (!Number.isSafeInteger(next) || next < 1 || next > maxPage) { setPageError(`请输入 1 到 ${maxPage} 之间的页码`); return; }
    setPageError('');
    if (next === page) { setPageInput(String(next)); return; }
    window.scrollTo(0, 0);
    librarySession.page = next; saveLibrarySession(); setPage(next);
  };
  const remove = async (id: string) => { if (!confirm('确定从网站与 DSH 共享目录删除这张壁纸？')) return; await api(`/wallpapers/${id}`, { method: 'DELETE' }); reload(); };
  return <section aria-busy={loading}>
    <div className="page-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h1>我的壁纸</h1><p>管理已与 DSH 共享的本地原始工坊文件。</p></div></div>
    <div className="filters"><input placeholder="筛选标题或 ID" aria-label="筛选标题或 ID" value={q} onChange={(event) => changeQ(event.target.value)}/><MultiSelectFilter label="类型" options={typeOptions} selected={types} onChange={changeTypes}/><MultiSelectFilter label="内容分级" options={ratingOptions} selected={ratings} onChange={changeRatings}/></div>
    {error && <div className="error-state">{error}<button className="text-button" onClick={reload}>重试</button></div>}
    {loading && data && <div className="inline-loading" role="status">正在更新壁纸库…</div>}
    {loading && !data ? <div className="loading" role="status">正在读取壁纸库…</div> : <div className={`wallpaper-grid${loading ? ' is-loading' : ''}`}>{data?.items.map((wallpaper) => { const item = { ...wallpaper, metadataJson: wallpaper.metadataJson as Record<string, unknown>, localStatus: wallpaper.status, previewContentType: null }; return <WallpaperCard key={wallpaper.workshopId} item={item} action={<><FavoriteButton item={item} onChange={reload}/>{wallpaper.status === 'downloaded' ? <button className="danger" onClick={() => void remove(wallpaper.workshopId)}>删除</button> : null}</>}/>; })}</div>}
    {!loading && !error && data && !data.items.length ? <div className="empty-state">还没有匹配的壁纸。</div> : null}
    <div className="pagination">
      <button className="secondary" disabled={loading || !data || page <= 1} onClick={() => goToPage(page - 1)}>上一页</button>
      <form className="page-jump" onSubmit={(event) => { event.preventDefault(); goToPage(Number(pageInput)); }}><input aria-label="页码" type="number" min="1" max={maxPage} step="1" value={pageInput} disabled={loading || !data} onChange={(event) => { setPageInput(event.target.value); setPageError(''); }}/><button className="secondary" disabled={loading || !data}>跳转</button></form>
      <span>共 {maxPage} 页 · {data?.total || 0} 项</span>
      <button className="secondary" disabled={loading || !data || page >= maxPage} onClick={() => goToPage(page + 1)}>下一页</button>
    </div>
    {pageError && <p className="page-error" role="alert">{pageError}</p>}
  </section>;
}
