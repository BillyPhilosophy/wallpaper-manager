import { FormEvent, useState } from 'react';
import type { WorkshopSearchResult } from '@wallpaper-manager/contracts';
import { api, post } from '../api';
import { useRemote } from '../hooks';
import { WallpaperCard } from '../components/WallpaperCard';
export function SearchPage() {
  const [input, setInput] = useState(''); const [query, setQuery] = useState(''); const [cursor, setCursor] = useState('*'); const [busy, setBusy] = useState('');
  const { data, error, loading, reload } = useRemote<WorkshopSearchResult>(() => api(`/workshop/search?q=${encodeURIComponent(query)}&cursor=${encodeURIComponent(cursor)}&pageSize=20`), [query, cursor]);
  const download = async (id: string) => { setBusy(id); try { await post(`/wallpapers/${id}/download`); reload(); } catch (error) { alert(error instanceof Error ? error.message : '下载失败'); } finally { setBusy(''); } };
  const submit = (event: FormEvent) => { event.preventDefault(); setCursor('*'); setQuery(input.trim()); };
  return <section><div className="page-heading"><div><p className="eyebrow">STEAM WORKSHOP</p><h1>发现下一张壁纸</h1><p>搜索官方创意工坊，将原始文件安全发布到共享壁纸库。</p></div></div><form className="search-bar" onSubmit={submit}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="搜索壁纸、场景或艺术家…" aria-label="搜索工坊"/><button>搜索</button></form>{error && <div className="error-state">{error}<button className="text-button" onClick={reload}>重试</button></div>}{loading && !data ? <div className="loading">正在连接 Steam 创意工坊…</div> : <div className="wallpaper-grid">{data?.items.map((item) => <WallpaperCard key={item.workshopId} item={item} action={item.localStatus === 'not_downloaded' ? <button disabled={busy === item.workshopId} onClick={() => void download(item.workshopId)}>{busy === item.workshopId ? '正在入队' : '下载'}</button> : null}/>)}</div>}{data && !data.items.length && <div className="empty-state">没有找到匹配的壁纸。</div>}<div className="pagination"><button className="secondary" disabled={cursor === '*'} onClick={() => { setCursor('*'); }}>从头浏览</button><span>共 {data?.total || 0} 项</span><button className="secondary" disabled={!data?.cursor} onClick={() => data?.cursor && setCursor(data.cursor)}>下一页</button></div></section>;
}
