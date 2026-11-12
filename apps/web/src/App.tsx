import { NavLink, Route, Routes } from 'react-router-dom';
import { SearchPage } from './pages/SearchPage';
import { LibraryPage } from './pages/LibraryPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { SettingsPage } from './pages/SettingsPage';
import { DetailPage } from './pages/DetailPage';
import { DynamicBackground } from './features/appearance/DynamicBackground';
import { Icon, type IconName } from './components/Icon';

const navigation: { to: string; label: string; mobileLabel: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: '工坊搜索', mobileLabel: '搜索', icon: 'search', end: true },
  { to: '/library', label: '我的壁纸', mobileLabel: '壁纸', icon: 'library' },
  { to: '/favorites', label: '我的收藏', mobileLabel: '收藏', icon: 'heart' },
  { to: '/subscriptions', label: '订阅同步', mobileLabel: '订阅', icon: 'sync' },
  { to: '/downloads', label: '下载中心', mobileLabel: '下载', icon: 'download' },
  { to: '/settings', label: 'Steam 设置', mobileLabel: '设置', icon: 'settings' },
];

export default function App() {
  return <>
    <DynamicBackground/>
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label="Wallpaper Atelier 首页"><span className="brand-mark">W</span><span>Wallpaper<small>ATELIER</small></span></NavLink>
        <nav aria-label="主导航">{navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end}><Icon name={item.icon}/><span>{item.label}</span></NavLink>)}</nav>
        <div className="sidebar-foot"><span className="online-dot"/>本地共享壁纸库<small>WebWallGL 3.0.0</small></div>
      </aside>
      <header className="mobile-header">
        <NavLink className="mobile-brand" to="/" aria-label="Wallpaper Atelier 首页"><span className="brand-mark">W</span><strong>Wallpaper</strong></NavLink>
        <NavLink className="mobile-settings" to="/settings" aria-label="Steam 设置"><Icon name="settings"/></NavLink>
      </header>
      <main>
        <Routes><Route path="/" element={<SearchPage/>}/><Route path="/library" element={<LibraryPage/>}/><Route path="/favorites" element={<FavoritesPage/>}/><Route path="/subscriptions" element={<SubscriptionsPage/>}/><Route path="/downloads" element={<DownloadsPage/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/wallpaper/:workshopId" element={<DetailPage/>}/></Routes>
      </main>
      <nav className="mobile-tab-bar" aria-label="移动端主导航">{navigation.slice(0, 5).map((item) => <NavLink key={item.to} to={item.to} end={item.end} aria-label={item.label}><Icon name={item.icon} size={21}/><span>{item.mobileLabel}</span></NavLink>)}</nav>
    </div>
  </>;
}
