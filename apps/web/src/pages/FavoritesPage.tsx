import { useEffect, useState } from 'react';
import type { Favorite, Page } from '@wallpaper-manager/contracts';
import { api } from '../api';
import { useRemote } from '../hooks';
import { WallpaperCard } from '../components/WallpaperCard';
import { FavoriteButton } from '../components/FavoriteButton';

export function FavoritesPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [pageError, setPageError] = useState('');
  const { data, error, loading, reload } = useRemote<Page<Favorite>>(() => {
    const params = new URLSearchParams({ q, page: String(page), pageSize: '24' });
    return api(`/favorites?${params}`);
  }, [q, page]);
  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 24)));
  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => { if (data && page > maxPage) goToPage(maxPage); }, [data, page, maxPage]);
  const goToPage = (next: number) => {
    if (!Number.isSafeInteger(next) || next < 1 || next > maxPage) { setPageError(`请输入 1 到 ${maxPage} 之间的页码`); return; }
    setPageError('');
    if (next === page) { setPageInput(String(next)); return; }
    window.scrollTo(0, 0); setPage(next);
  };
  return <section aria-busy={loading}>
    <div className="page-heading"><div><p className="eyebrow">YOUR FAVORITES</p><h1>我的收藏</h1><p>收藏的工坊项目，与下载状态互不影响。</p></div></div>
    <div className="filters"><input placeholder="筛选标题或 ID" aria-label="筛选标题或 ID" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }}/></div>
    {error && <div className="error-state">{error}<button className="text-button" onClick={reload}>重试</button></div>}
    {loading && data && <div className="inline-loading" role="status">正在更新收藏…</div>}
    {loading && !data ? <div className="loading" role="status">正在读取收藏…</div> : <div className={`wallpaper-grid${loading ? ' is-loading' : ''}`}>{data?.items.map((fav) => { const item = { ...fav, description: null, subscribed: false, favorited: true, previewContentType: null, metadataJson: {}, localStatus: 'not_downloaded' as const }; return <WallpaperCard key={fav.workshopId} item={item} action={<FavoriteButton item={item} onChange={reload}/>}/>; })}</div>}
    {!loading && !error && data && !data.items.length ? <div className="empty-state">还没有收藏的壁纸。</div> : null}
    <div className="pagination">
      <button className="secondary" disabled={loading || !data || page <= 1} onClick={() => goToPage(page - 1)}>上一页</button>
      <form className="page-jump" onSubmit={(event) => { event.preventDefault(); goToPage(Number(pageInput)); }}><input aria-label="页码" type="number" min="1" max={maxPage} step="1" value={pageInput} disabled={loading || !data} onChange={(event) => { setPageInput(event.target.value); setPageError(''); }}/><button className="secondary" disabled={loading || !data}>跳转</button></form>
      <span>共 {maxPage} 页 · {data?.total || 0} 项</span>
      <button className="secondary" disabled={loading || !data || page >= maxPage} onClick={() => goToPage(page + 1)}>下一页</button>
    </div>
    {pageError && <p className="page-error" role="alert">{pageError}</p>}
  </section>;
}
