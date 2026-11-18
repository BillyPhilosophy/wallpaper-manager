import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ContentRating, type Page, type Wallpaper, type WallpaperGroup, type WallpaperType } from '@wallpaper-manager/contracts';
import { api } from '../api';
import { useRemote } from '../hooks';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { WallpaperCard } from '../components/WallpaperCard';
import { Icon } from '../components/Icon';
import { GroupMenu } from '../features/groups/GroupMenu';
import { defaultLibraryGroup } from '../features/groups/preferences';
import { librarySession, ratingOptions, saveLibrarySession, typeOptions } from '../features/library/session';

export function LibraryPage() {
  const [q, setQ] = useState(librarySession.q);
  const [types, setTypes] = useState<WallpaperType[]>(librarySession.types);
  const [ratings, setRatings] = useState<ContentRating[]>(librarySession.ratings);
  const [groupId, setGroupId] = useState(defaultLibraryGroup);
  const [page, setPage] = useState(librarySession.page);
  const [pageInput, setPageInput] = useState(String(page));
  const [pageError, setPageError] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetGroup, setTargetGroup] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const groups = useRemote<{ items: WallpaperGroup[] }>(() => api('/groups'), []);
  const { data, error, loading, reload } = useRemote<Page<Wallpaper>>(() => {
    if (!types.length || !ratings.length) return Promise.resolve({ items: [], page, pageSize: 24, total: 0 });
    const params = new URLSearchParams({ q, status: 'downloaded', page: String(page), pageSize: '24' });
    if (types.length < typeOptions.length) params.set('type', types.join(','));
    if (ratings.length < ratingOptions.length) params.set('rating', ratings.join(','));
    if (groupId) params.set('groupId', groupId);
    return api(`/wallpapers?${params}`);
  }, [q, types, ratings, groupId, page]);
  const maxPage = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 24)));
  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => { if (data && page > maxPage) goToPage(maxPage); }, [data, page, maxPage]);
  const resetPage = () => { librarySession.page = 1; setPage(1); };
  const changeQ = (value: string) => { librarySession.q = value; resetPage(); saveLibrarySession(); setQ(value); };
  const changeTypes = (values: WallpaperType[]) => { librarySession.types = values; resetPage(); saveLibrarySession(); setTypes(values); };
  const changeRatings = (values: ContentRating[]) => { librarySession.ratings = values; resetPage(); saveLibrarySession(); setRatings(values); };
  const changeGroup = (value: string) => { resetPage(); setGroupId(value); };
  const goToPage = (next: number) => {
    if (!Number.isSafeInteger(next) || next < 1 || next > maxPage) { setPageError(`请输入 1 到 ${maxPage} 之间的页码`); return; }
    setPageError('');
    if (next === page) { setPageInput(String(next)); return; }
    window.scrollTo(0, 0);
    librarySession.page = next; saveLibrarySession(); setPage(next);
  };
  const refresh = () => { reload(); groups.reload(); };
  const remove = async (id: string) => { if (!confirm('确定从网站与 DSH 共享目录删除这张壁纸？')) return; await api(`/wallpapers/${id}`, { method: 'DELETE' }); refresh(); };
  const toggleSelected = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleSelectionMode = () => { setSelectionMode((value) => !value); setSelected([]); setTargetGroup(''); };
  const applyGroups = async () => {
    if (!selected.length || !targetGroup) return;
    setBulkBusy(true);
    try {
      await Promise.all(selected.map((id) => {
        const current = data?.items.find((item) => item.workshopId === id)?.groupIds || [];
        const groupIds = targetGroup === 'none' ? [] : [...new Set([...current, targetGroup])];
        return api(`/wallpapers/${id}/groups`, { method: 'PUT', body: JSON.stringify({ groupIds }) });
      }));
      refresh();
      setSelected([]); setSelectionMode(false); setTargetGroup('');
    } catch (error) { alert(error instanceof Error ? error.message : '批量设置分组失败'); }
    finally { setBulkBusy(false); }
  };
  return <section aria-busy={loading}>
    <div className="page-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h1>我的壁纸</h1><p>软分组仅整理数据库关联，不移动源文件，也不会影响 DSH。</p></div></div>
    <div className="filters"><input placeholder="筛选标题或 ID" aria-label="筛选标题或 ID" value={q} onChange={(event) => changeQ(event.target.value)}/><MultiSelectFilter label="类型" options={typeOptions} selected={types} onChange={changeTypes}/><MultiSelectFilter label="内容分级" options={ratingOptions} selected={ratings} onChange={changeRatings}/><GroupMenu groups={groups.data?.items || []} selected={groupId} onSelect={changeGroup} reload={groups.reload}/><Link className="button-link secondary library-manage-groups" to="/groups">管理分组</Link><button type="button" className="secondary" onClick={toggleSelectionMode}>{selectionMode ? '取消批量' : '批量分组'}</button></div>
    {selectionMode && <div className="bulk-group-bar"><strong>已选 {selected.length} 张</strong><button type="button" className="text-button" onClick={() => setSelected(data?.items.map((item) => item.workshopId) || [])}>选择本页</button><select aria-label="目标分组" value={targetGroup} onChange={(event) => setTargetGroup(event.target.value)}><option value="">选择目标分组</option><option value="none">移出所有分组</option>{(groups.data?.items || []).map((group) => <option key={group.id} value={group.id}>加入：{group.name}</option>)}</select><button type="button" disabled={bulkBusy || !selected.length || !targetGroup} onClick={() => void applyGroups()}>{bulkBusy ? '正在设置…' : '应用到所选'}</button></div>}
    {error && <div className="error-state">{error}<button className="text-button" onClick={reload}>重试</button></div>}
    {loading && data && <div className="inline-loading" role="status">正在更新壁纸库…</div>}
    {loading && !data ? <div className="loading" role="status">正在读取壁纸库…</div> : <div className={`wallpaper-grid${loading ? ' is-loading' : ''}`}>{data?.items.map((wallpaper) => {
      const item = { ...wallpaper, metadataJson: wallpaper.metadataJson as Record<string, unknown>, localStatus: wallpaper.status, previewContentType: null };
      return <div className={`library-select-item${selected.includes(wallpaper.workshopId) ? ' is-selected' : ''}`} key={wallpaper.workshopId}>
        {selectionMode && <input className="library-select-checkbox" type="checkbox" aria-label={`选择 ${wallpaper.title}`} checked={selected.includes(wallpaper.workshopId)} onChange={() => toggleSelected(wallpaper.workshopId)}/>}
        <WallpaperCard item={item} onFavoriteChange={refresh} action={!selectionMode ? <button className="card-icon-action danger" aria-label="删除" title="删除" onClick={() => void remove(wallpaper.workshopId)}><Icon name="trash" size={17}/></button> : null}/>
      </div>;
    })}</div>}
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
