import { useEffect, useState } from 'react';
import type { Wallpaper, WallpaperGroup } from '@wallpaper-manager/contracts';
import { api } from '../../api';
import { MenuSurface } from '../../components/MenuSurface';

export function GroupAssignmentMenu({ wallpaper, groups, onChanged }: { wallpaper: Wallpaper; groups: WallpaperGroup[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(wallpaper.groupIds || []);
  useEffect(() => { setSelected(wallpaper.groupIds || []); }, [wallpaper.groupIds]);
  const toggle = async (groupId: string) => {
    const previous = selected;
    const groupIds = selected.includes(groupId) ? selected.filter((id) => id !== groupId) : [...selected, groupId];
    setSelected(groupIds);
    setBusy(true);
    try { await api(`/wallpapers/${wallpaper.workshopId}/groups`, { method: 'PUT', body: JSON.stringify({ groupIds }) }); onChanged(); }
    catch (error) { setSelected(previous); alert(error instanceof Error ? error.message : '设置分组失败'); }
    finally { setBusy(false); }
  };
  return <MenuSurface label={`设置 ${wallpaper.title} 分组`} summary="分组" className="group-assignment-menu">
    <div className="group-menu">
      {!groups.length && <p className="muted">先在上方“分组”菜单中创建分组。</p>}
      {groups.map((group) => <label className="group-checkbox" key={group.id}><input type="checkbox" checked={selected.includes(group.id)} disabled={busy} onChange={() => void toggle(group.id)}/><i style={{ background: group.color }}/><span>{group.name}</span></label>)}
    </div>
  </MenuSurface>;
}
