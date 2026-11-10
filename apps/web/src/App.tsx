import { NavLink, Route, Routes } from 'react-router-dom';
import { SearchPage } from './pages/SearchPage';
import { LibraryPage } from './pages/LibraryPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { SettingsPage } from './pages/SettingsPage';
import { DetailPage } from './pages/DetailPage';
export default function App() {
  return <div className="app-shell"><aside className="sidebar"><NavLink className="brand" to="/"><span className="brand-mark">W</span><span>Wallpaper<small>ATELIER</small></span></NavLink><nav><NavLink to="/" end>工坊搜索</NavLink><NavLink to="/library">我的壁纸</NavLink><NavLink to="/favorites">我的收藏</NavLink><NavLink to="/subscriptions">订阅同步</NavLink><NavLink to="/downloads">下载中心</NavLink><NavLink to="/settings">Steam 设置</NavLink></nav><div className="sidebar-foot"><span className="online-dot"/> 本地共享壁纸库<small>WebWallGL 3.0.0</small></div></aside><main><Routes><Route path="/" element={<SearchPage/>}/><Route path="/library" element={<LibraryPage/>}/><Route path="/favorites" element={<FavoritesPage/>}/><Route path="/subscriptions" element={<SubscriptionsPage/>}/><Route path="/downloads" element={<DownloadsPage/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/wallpaper/:workshopId" element={<DetailPage/>}/></Routes></main></div>;
}
