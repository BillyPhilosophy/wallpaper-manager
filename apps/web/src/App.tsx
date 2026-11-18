import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { SearchPage } from './pages/SearchPage';
import { LibraryPage } from './pages/LibraryPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { SettingsPage } from './pages/SettingsPage';
import { DetailPage } from './pages/DetailPage';
import { AuthorPage } from './pages/AuthorPage';
import { GroupsPage } from './pages/GroupsPage';
import { DynamicBackground } from './features/appearance/DynamicBackground';
import { useAppearance } from './features/appearance/AppearanceContext';
import { Icon, type IconName } from './components/Icon';

const navigation: { to: string; label: string; mobileLabel: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: '工坊搜索', mobileLabel: '搜索', icon: 'search', end: true },
  { to: '/library', label: '我的壁纸', mobileLabel: '壁纸', icon: 'library' },
  { to: '/groups', label: '分组管理', mobileLabel: '分组', icon: 'filter' },
  { to: '/favorites', label: '我的收藏', mobileLabel: '收藏', icon: 'heart' },
  { to: '/subscriptions', label: '订阅同步', mobileLabel: '订阅', icon: 'sync' },
  { to: '/downloads', label: '下载中心', mobileLabel: '下载', icon: 'download' },
  { to: '/settings', label: 'Steam 设置', mobileLabel: '设置', icon: 'settings' },
];

export default function App() {
  const { settings } = useAppearance();
  const [uiHidden, setUiHidden] = useState(false);
  const visibilityButton = useRef<HTMLButtonElement>(null);
  const backgroundAvailable = settings.backgroundMode !== 'off' && !!settings.backgroundId;

  useEffect(() => { if (!backgroundAvailable) setUiHidden(false); }, [backgroundAvailable]);
  useEffect(() => { if (uiHidden) visibilityButton.current?.focus(); }, [uiHidden]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && uiHidden) { setUiHidden(false); return; }
      const target = event.target as HTMLElement | null;
      if (event.key?.toLowerCase() !== 'h' || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')) return;
      if (backgroundAvailable) setUiHidden((value) => !value);
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [backgroundAvailable, uiHidden]);

  return <>
    <DynamicBackground/>
    <div className={`app-shell${uiHidden ? ' is-ui-hidden' : ''}`} aria-hidden={uiHidden} inert={uiHidden}>
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
        <Routes><Route path="/" element={<SearchPage/>}/><Route path="/library" element={<LibraryPage/>}/><Route path="/favorites" element={<FavoritesPage/>}/><Route path="/subscriptions" element={<SubscriptionsPage/>}/><Route path="/downloads" element={<DownloadsPage/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/wallpaper/:workshopId" element={<DetailPage/>}/><Route path="/author/:steamId" element={<AuthorPage/>}/><Route path="/groups" element={<GroupsPage/>}/></Routes>
      </main>
      <nav className="mobile-tab-bar" aria-label="移动端主导航">{navigation.filter((item) => ['/', '/library', '/favorites', '/subscriptions', '/downloads'].includes(item.to)).map((item) => <NavLink key={item.to} to={item.to} end={item.end} aria-label={item.label}><Icon name={item.icon} size={21}/><span>{item.mobileLabel}</span></NavLink>)}</nav>
    </div>
    {backgroundAvailable && <button ref={visibilityButton} type="button" className={`ui-visibility-toggle${uiHidden ? ' is-hidden' : ''}`} aria-pressed={uiHidden} onClick={() => setUiHidden((value) => !value)}><Icon name={uiHidden ? 'eye' : 'eye-off'} size={18}/><span>{uiHidden ? '显示界面' : '欣赏背景'}</span></button>}
  </>;
}
