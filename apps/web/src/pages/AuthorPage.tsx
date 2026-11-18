import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AuthorWorksPage } from '@wallpaper-manager/contracts';
import { api, post } from '../api';
import { useRemote } from '../hooks';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { WallpaperCard } from '../components/WallpaperCard';
import { Icon } from '../components/Icon';
import { ratingOptions, typeOptions, type SearchRating, type SearchType } from '../features/search/session';
import { contentFilterEnabled } from '../features/content-filter';

export function AuthorPage() {
  const { steamId = '' } = useParams();
  const contentFilter = contentFilterEnabled();
  const availableRatingOptions = contentFilter ? ratingOptions.filter((option) => option.value !== 'mature') : ratingOptions;
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [types, setTypes] = useState<SearchType[]>(typeOptions.map((option) => option.value));
  const [ratings, setRatings] = useState<SearchRating[]>(availableRatingOptions.map((option) => option.value));
  const [pageError, setPageError] = useState('');
  const [busy, setBusy] = useState('');
  const { data, error, loading, reload } = useRemote<AuthorWorksPage>(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (types.length < typeOptions.length) params.set('type', types.join(','));
    if (ratings.length < ratingOptions.length) params.set('rating', ratings.join(','));
    return api(`/workshop/authors/${steamId}/files?${params}`);
  }, [steamId, page, types, ratings]);
  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / 20));

  useEffect(() => { setPage(1); }, [steamId]);
  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => { if (data && page > maxPage) goToPage(maxPage); }, [data, page, maxPage]);

  const goToPage = (next: number) => {
    if (!Number.isSafeInteger(next) || next < 1 || next > maxPage) { setPageError(`请输入 1 到 ${maxPage} 之间的页码`); return; }
    setPageError('');
    window.scrollTo(0, 0);
    setPage(next);
  };
  const changeTypes = (values: SearchType[]) => { setTypes(values); setPage(1); };
  const changeRatings = (values: SearchRating[]) => { setRatings(values); setPage(1); };
  const download = async (id: string) => {
    setBusy(id);
    try { await post(`/wallpapers/${id}/download`); reload(); }
    catch (error) { alert(error instanceof Error ? error.message : '下载失败'); }
    finally { setBusy(''); }
  };

  return <section aria-busy={loading}>
    <Link className="back-link" to="/">← 返回工坊搜索</Link>
    <div className="author-summary">
      {data?.author.avatarUrl ? <img src={data.author.avatarUrl} alt="" className="author-avatar"/> : <span className="author-avatar-placeholder"><Icon name="monitor" size={28}/></span>}
      <div><p className="eyebrow">WORKSHOP AUTHOR</p><h1>{data?.author.name || '壁纸作者'}</h1><p>查看该作者发布的 Wallpaper Engine 作品，共 {data?.total ?? '…'} 项。</p></div>
      {data?.author.profileUrl && <a className="button-link secondary author-steam-link" href={data.author.profileUrl} target="_blank" rel="noopener noreferrer">Steam 主页</a>}
    </div>
    <div className="filters"><MultiSelectFilter label="类型" options={typeOptions} selected={types} onChange={changeTypes}/><MultiSelectFilter label="内容分级" options={availableRatingOptions} selected={ratings} onChange={changeRatings}/></div>
    {contentFilter && <p className="filter-notice">内容过滤已开启：不显示成人和未分级内容，可在 Steam 设置中关闭。</p>}
    {error && <div className="error-state">{error}<button className="text-button" onClick={reload}>重试</button></div>}
    {loading && data && <div className="inline-loading" role="status">正在更新作者作品…</div>}
    {loading && !data ? <div className="loading" role="status">正在读取作者作品…</div> : <div className={`wallpaper-grid${loading ? ' is-loading' : ''}`}>{data?.items.map((item) => <WallpaperCard key={item.workshopId} item={item} showStats onFavoriteChange={reload} action={item.localStatus === 'not_downloaded' ? <button className="card-icon-action" aria-label={busy === item.workshopId ? '正在入队' : '下载'} title="下载" disabled={busy === item.workshopId} onClick={() => void download(item.workshopId)}><Icon name="download" size={18}/></button> : null}/>)}</div>}
    {!loading && data && !data.items.length && <div className="empty-state">该作者没有符合条件的公开作品。</div>}
    <div className="pagination">
      <button className="secondary" disabled={loading || !data || page <= 1} onClick={() => goToPage(page - 1)}>上一页</button>
      <form className="page-jump" onSubmit={(event) => { event.preventDefault(); goToPage(Number(pageInput)); }}><input aria-label="页码" type="number" min="1" max={maxPage} step="1" value={pageInput} disabled={loading || !data} onChange={(event) => { setPageInput(event.target.value); setPageError(''); }}/><button className="secondary" disabled={loading || !data}>跳转</button></form>
      <span>共 {maxPage} 页 · {data?.total || 0} 项</span>
      <button className="secondary" disabled={loading || !data || page >= maxPage} onClick={() => goToPage(page + 1)}>下一页</button>
    </div>
    {pageError && <p className="page-error" role="alert">{pageError}</p>}
  </section>;
}
