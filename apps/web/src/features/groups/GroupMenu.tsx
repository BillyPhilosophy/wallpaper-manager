import { useState } from 'react';
import type { WallpaperGroup } from '@wallpaper-manager/contracts';
import { api, post } from '../../api';
import { MenuSurface } from '../../components/MenuSurface';

export function GroupMenu({ groups, selected, onSelect, reload }: { groups: WallpaperGroup[]; selected: string; onSelect: (groupId: string) => void; reload: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedName = selected === 'none' ? '未分组' : groups.find((group) => group.id === selected)?.name || '全部';
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); reload(); }
    catch (error) { alert(error instanceof Error ? error.message : '分组操作失败'); }
    finally { setBusy(false); }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await run(() => post('/groups', { name }));
    setName('');
  };
  const rename = (group: WallpaperGroup) => {
    const next = window.prompt('新的分组名称', group.name)?.trim();
    if (next && next !== group.name) void run(() => api(`/groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ name: next }) }));
  };
  const remove = (group: WallpaperGroup) => {
    if (!window.confirm(`删除分组“${group.name}”？仅删除分组关联，不删除壁纸文件。`)) return;
    void run(async () => {
      await api(`/groups/${group.id}`, { method: 'DELETE' });
      if (selected === group.id) onSelect('');
    });
  };
  return <MenuSurface label="分组" summary={selectedName} className="group-filter-menu">
    {(close) => <div className="group-menu">
      <button type="button" className={selected === '' ? 'is-selected' : ''} onClick={() => { onSelect(''); close(); }}>全部壁纸</button>
      <button type="button" className={selected === 'none' ? 'is-selected' : ''} onClick={() => { onSelect('none'); close(); }}>未分组</button>
      {groups.map((group) => <div className="group-row" key={group.id}>
        <button type="button" className={selected === group.id ? 'is-selected' : ''} onClick={() => { onSelect(group.id); close(); }}><i style={{ background: group.color }}/><span>{group.name}<small>{group.itemCount}</small></span></button>
        <button type="button" className="text-button" disabled={busy} onClick={() => rename(group)}>重命名</button>
        <button type="button" className="text-button danger-text" disabled={busy} onClick={() => remove(group)}>删除</button>
      </div>)}
      <form className="group-create" onSubmit={(event) => void create(event)}><input aria-label="新分组名称" placeholder="新分组名称" maxLength={40} value={name} onChange={(event) => setName(event.target.value)}/><button type="submit" disabled={busy || !name.trim()}>创建</button></form>
    </div>}
  </MenuSurface>;
}
