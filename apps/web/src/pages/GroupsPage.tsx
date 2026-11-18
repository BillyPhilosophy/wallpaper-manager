import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { WallpaperGroup } from '@wallpaper-manager/contracts';
import { api, post } from '../api';
import { useRemote } from '../hooks';
import { defaultLibraryGroup, setDefaultLibraryGroup } from '../features/groups/preferences';

export function GroupsPage() {
  const { data, error, loading, reload } = useRemote<{ items: WallpaperGroup[] }>(() => api('/groups'), []);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4f8cff');
  const [defaultGroup, setDefaultGroup] = useState(defaultLibraryGroup);
  const [busy, setBusy] = useState(false);
  const groups = data?.items || [];
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); reload(); }
    catch (error) { alert(error instanceof Error ? error.message : '分组操作失败'); }
    finally { setBusy(false); }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await run(() => post('/groups', { name, color }));
    setName('');
  };
  const rename = (group: WallpaperGroup) => {
    const next = window.prompt('新的分组名称', group.name)?.trim();
    if (next && next !== group.name) void run(() => api(`/groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ name: next }) }));
  };
  const remove = (group: WallpaperGroup) => {
    if (!window.confirm(`删除分组“${group.name}”？不会删除壁纸文件。`)) return;
    void run(async () => {
      await api(`/groups/${group.id}`, { method: 'DELETE' });
      if (defaultGroup === group.id) { setDefaultGroup(''); setDefaultLibraryGroup(''); }
    });
  };
  const changeDefault = (value: string) => { setDefaultGroup(value); setDefaultLibraryGroup(value); };
  return <section aria-busy={loading}>
    <Link className="back-link" to="/library">← 返回壁纸库</Link>
    <div className="page-heading"><div><p className="eyebrow">SOFT COLLECTIONS</p><h1>分组管理器</h1><p>分组只保存数据库关联，不移动源文件，也不会影响 DSH。</p></div></div>
    <div className="groups-manager-grid">
      <article className="settings-card">
        <h2>创建分组</h2>
        <form className="group-manager-create" onSubmit={(event) => void create(event)}>
          <label>名称<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="例如：夜景、动漫、常用" required/></label>
          <label>颜色<input type="color" value={color} onChange={(event) => setColor(event.target.value)}/></label>
          <button type="submit" disabled={busy || !name.trim()}>创建分组</button>
        </form>
        <label className="default-group-setting">壁纸库默认展示<select value={defaultGroup} onChange={(event) => changeDefault(event.target.value)}><option value="">全部分组</option><option value="none">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <p>默认展示设置保存在当前浏览器，各设备可以分别选择。</p>
      </article>
      <article className="settings-card">
        <h2>全部分组 <span className="muted">{groups.length} 个</span></h2>
        {error && <p className="error-text">{error}</p>}
        {loading && !data ? <p className="muted">正在读取分组…</p> : <div className="group-manager-list">{groups.map((group) => <div className="group-manager-item" key={group.id}>
          <i style={{ background: group.color }}/><div><strong>{group.name}</strong><span>{group.itemCount} 张壁纸</span></div>
          <button type="button" className="secondary" disabled={busy} onClick={() => rename(group)}>重命名</button>
          <button type="button" className="secondary danger-text" disabled={busy} onClick={() => remove(group)}>删除</button>
        </div>)}{!loading && !groups.length && <p className="muted">还没有分组，先创建一个。</p>}</div>}
      </article>
    </div>
  </section>;
}
