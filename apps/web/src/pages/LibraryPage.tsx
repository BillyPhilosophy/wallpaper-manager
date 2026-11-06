import { useState } from 'react';
import { type ContentRating, type Page, type Wallpaper, type WallpaperType } from '@wallpaper-manager/contracts';
import { api, ratingLabel, statusLabel, typeLabel } from '../api';
import { useRemote } from '../hooks';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { WallpaperCard } from '../components/WallpaperCard';

const typeOptions = (Object.keys(typeLabel) as WallpaperType[]).map((value) => ({ value, label: typeLabel[value] }));
const ratingOptions = (Object.keys(ratingLabel) as ContentRating[]).map((value) => ({ value, label: ratingLabel[value] }));

export function LibraryPage() {
  const [q, setQ] = useState(''); const [types, setTypes] = useState<WallpaperType[]>(typeOptions.map((option) => option.value)); const [ratings, setRatings] = useState<ContentRating[]>(ratingOptions.map((option) => option.value)); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const { data, loading, reload } = useRemote<Page<Wallpaper>>(() => {
    const params = new URLSearchParams({ q, status, page: String(page), pageSize: '24' });
    if (types.length < typeOptions.length) params.set('type', types.join(','));
    if (ratings.length < ratingOptions.length) params.set('rating', ratings.join(','));
    return api(`/wallpapers?${params}`);
  }, [q, types, ratings, status, page]);
  const changeTypes = (values: WallpaperType[]) => { setTypes(values); setPage(1); };
  const changeRatings = (values: ContentRating[]) => { setRatings(values); setPage(1); };
  const remove = async (id: string) => { if (!confirm('确定从网站与 DSH 共享目录删除这张壁纸？')) return; await api(`/wallpapers/${id}`, { method: 'DELETE' }); reload(); };
  return <section><div className="page-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h1>我的壁纸</h1><p>管理已与 DSH 共享的本地原始工坊文件。</p></div></div><div className="filters"><input placeholder="筛选标题或 ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}/><MultiSelectFilter label="类型" options={typeOptions} selected={types} onChange={changeTypes}/><MultiSelectFilter label="内容分级" options={ratingOptions} selected={ratings} onChange={changeRatings}/><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">全部状态</option>{Object.entries(statusLabel).slice(0, 7).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>{loading && !data ? <div className="loading">正在读取壁纸库…</div> : <div className="wallpaper-grid">{data?.items.map((wallpaper) => <WallpaperCard key={wallpaper.workshopId} item={{ ...wallpaper, metadataJson: wallpaper.metadataJson as Record<string, unknown>, localStatus: wallpaper.status, previewContentType: null }} action={wallpaper.status === 'downloaded' ? <button className="danger" onClick={() => void remove(wallpaper.workshopId)}>删除</button> : null}/>)}</div>}{data && !data.items.length ? <div className="empty-state">还没有匹配的壁纸。</div> : null}<div className="pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} 页 · 共 {data?.total || 0} 项</span><button className="secondary" disabled={!data || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>下一页</button></div></section>;
}
