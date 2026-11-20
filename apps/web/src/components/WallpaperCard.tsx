import { Link } from 'react-router-dom';
import type { WorkshopItem } from '@wallpaper-manager/contracts';
import { statusLabel, typeLabel } from '../api';
import { OfficialPreview } from './OfficialPreview';
import { FavoriteButton } from './FavoriteButton';
import { WorkshopStats } from './WorkshopStats';

export function WallpaperCard({ item, action, onFavoriteChange, showStats = false, groups = [] }: { item: WorkshopItem; action?: React.ReactNode; onFavoriteChange?: () => void; showStats?: boolean; groups?: { id: string; name: string; color: string }[] }) {
  return <article className={`wallpaper-card${action ? ' has-action' : ''}${showStats ? ' has-stats' : ''}`}>
    <FavoriteButton item={item} variant="overlay" onChange={onFavoriteChange}/>
    <Link to={`/wallpaper/${item.workshopId}`}>
      <OfficialPreview url={item.officialPreviewUrl} title={item.title}/>
      <div className="card-copy">
        <div className="badges"><span>{typeLabel[item.type]}</span>{item.localStatus !== 'not_downloaded' && <span className={`status ${item.localStatus}`}>{statusLabel[item.localStatus]}</span>}</div>
        <h3>{item.title}</h3>
        {groups.length > 0 && <div className="card-groups">{groups.map((group) => <span className="card-group" key={group.id} title="已加入分组"><i style={{ background: group.color }}/>{group.name}</span>)}</div>}
        {showStats && <WorkshopStats metadata={item.metadataJson} compact/>}
      </div>
    </Link>
    {action && <div className="card-action">{action}</div>}
  </article>;
}
