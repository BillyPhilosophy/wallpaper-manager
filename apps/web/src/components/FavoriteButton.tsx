import { useEffect, useState } from 'react';
import type { WorkshopItem } from '@wallpaper-manager/contracts';
import { api } from '../api';

type FavoriteItem = Pick<WorkshopItem, 'workshopId' | 'title' | 'officialPreviewUrl' | 'type' | 'contentRating' | 'favorited'>;

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function FavoriteButton({ item, onChange, variant = 'text' }: { item: FavoriteItem; onChange?: () => void; variant?: 'text' | 'overlay' }) {
  const [on, setOn] = useState(item.favorited);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOn(item.favorited); }, [item.favorited]);
  const toggle = async (event: React.MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
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
  if (variant === 'overlay') {
    return <button type="button" className={`favorite-overlay${on ? ' is-on' : ''}`} aria-label={on ? '取消收藏' : '收藏'} aria-pressed={on} disabled={busy} onClick={toggle}><HeartIcon filled={on} /></button>;
  }
  return <button type="button" className={`favorite-toggle${on ? ' is-on' : ''}`} aria-pressed={on} disabled={busy} onClick={toggle}><HeartIcon filled={on} />{on ? '已收藏' : '收藏'}</button>;
}
