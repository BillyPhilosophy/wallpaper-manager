import { Link } from 'react-router-dom';
import type { WorkshopItem } from '@wallpaper-manager/contracts';
import { ratingLabel, statusLabel, typeLabel } from '../api';
import { OfficialPreview } from './OfficialPreview';
export function WallpaperCard({ item, action }: { item: WorkshopItem; action?: React.ReactNode }) {
  return <article className="wallpaper-card"><Link to={`/wallpaper/${item.workshopId}`}><OfficialPreview url={item.officialPreviewUrl} title={item.title} /><div className="card-copy"><div className="badges"><span>{typeLabel[item.type]}</span><span>{ratingLabel[item.contentRating]}</span><span className={`status ${item.localStatus}`}>{statusLabel[item.localStatus]}</span></div><h3>{item.title}</h3><small>ID {item.workshopId}</small></div></Link>{action && <div className="card-action">{action}</div>}</article>;
}
