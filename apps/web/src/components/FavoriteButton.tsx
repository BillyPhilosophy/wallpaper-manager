import { useEffect, useState } from 'react';
import type { WorkshopItem } from '@wallpaper-manager/contracts';
import { api } from '../api';

type FavoriteItem = Pick<WorkshopItem, 'workshopId' | 'title' | 'officialPreviewUrl' | 'type' | 'contentRating' | 'favorited'>;

export function FavoriteButton({ item, onChange }: { item: FavoriteItem; onChange?: () => void }) {
  const [on, setOn] = useState(item.favorited);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOn(item.favorited); }, [item.favorited]);
  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setBusy(true); setOn(next);
    try {
      if (next) await api(`/favorites/${item.workshopId}`, { method: 'POST', body: JSON.stringify({ title: item.title, officialPreviewUrl: item.officialPreviewUrl, type: item.type, contentRating: item.contentRating }) });
      else await api(`/favorites/${item.workshopId}`, { method: 'DELETE' });
      onChange?.();
    } catch {
      setOn(!next);
      alert('收藏操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };
  return <button type="button" className={`favorite-toggle${on ? ' is-on' : ''}`} aria-pressed={on} disabled={busy} onClick={toggle}>{on ? '★ 已收藏' : '☆ 收藏'}</button>;
}
