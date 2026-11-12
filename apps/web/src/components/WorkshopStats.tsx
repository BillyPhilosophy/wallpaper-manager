function count(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

export function WorkshopStats({ metadata, compact = false }: { metadata: unknown; compact?: boolean }) {
  const data = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
  const subscriptions = count(data.subscriptions);
  const favorites = count(data.favorited);
  if (subscriptions === null && favorites === null) return null;
  const format = (value: number) => new Intl.NumberFormat('zh-CN', compact ? { notation: 'compact', maximumFractionDigits: 1 } : undefined).format(value);
  return <div className={compact ? 'card-stats' : 'detail-stats'} aria-label="工坊热度统计">
    {subscriptions !== null && <span><strong>{format(subscriptions)}</strong> 订阅</span>}
    {favorites !== null && <span><strong>{format(favorites)}</strong> 收藏</span>}
  </div>;
}
