import type { Page, Wallpaper } from '@wallpaper-manager/contracts';
import { api } from '../../api';
import { useRemote } from '../../hooks';
import { Icon, type IconName } from '../../components/Icon';
import { useAppearance, type BackgroundMode, type ThemePreference } from './AppearanceContext';

const themeOptions: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'system', label: '跟随系统', icon: 'monitor' },
];
const backgroundOptions: { value: BackgroundMode; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'static', label: '静态图片' },
  { value: 'dynamic', label: '动态壁纸' },
];

export function AppearancePanel() {
  const { settings, update } = useAppearance();
  const wallpapers = useRemote<Page<Wallpaper>>(() => api('/wallpapers?status=downloaded&page=1&pageSize=100'), []);
  const select = (wallpaper: Wallpaper) => update({ backgroundId: wallpaper.workshopId, backgroundMode: wallpaper.type === 'image' ? 'static' : 'dynamic' });
  return <article className="settings-card appearance-card">
    <h2>外观与背景</h2>
    <p>让导航和控件浮在壁纸上。动态背景仅使用已下载内容，并在后台标签页自动暂停。</p>
    <div className="appearance-section">
      <span className="setting-label">主题</span>
      <div className="segmented-control" aria-label="主题模式">
        {themeOptions.map((option) => <button type="button" key={option.value} className={settings.theme === option.value ? 'is-selected' : ''} aria-pressed={settings.theme === option.value} onClick={() => update({ theme: option.value })}><Icon name={option.icon} size={16}/>{option.label}</button>)}
      </div>
    </div>
    <div className="appearance-section">
      <span className="setting-label">背景模式</span>
      <div className="segmented-control" aria-label="背景模式">
        {backgroundOptions.map((option) => <button type="button" key={option.value} className={settings.backgroundMode === option.value ? 'is-selected' : ''} aria-pressed={settings.backgroundMode === option.value} disabled={option.value !== 'off' && !settings.backgroundId} onClick={() => update({ backgroundMode: option.value })}>{option.label}</button>)}
      </div>
    </div>
    <div className="appearance-section">
      <span className="setting-label">背景壁纸</span>
      {wallpapers.loading ? <p className="muted">正在读取已下载壁纸…</p> : wallpapers.data?.items.length ? <div className="background-picker">
        {wallpapers.data.items.map((wallpaper) => <button type="button" key={wallpaper.workshopId} className={`background-choice${settings.backgroundId === wallpaper.workshopId ? ' is-selected' : ''}`} aria-pressed={settings.backgroundId === wallpaper.workshopId} onClick={() => select(wallpaper)}>
          {wallpaper.officialPreviewUrl ? <img src={wallpaper.officialPreviewUrl} alt="" loading="lazy"/> : <span className="background-choice-placeholder"><Icon name="image"/></span>}
          <span>{wallpaper.title}</span>
          {settings.backgroundId === wallpaper.workshopId && <i><Icon name="check" size={14}/></i>}
        </button>)}
      </div> : <p className="muted">还没有已下载的壁纸，下载后即可设为页面背景。</p>}
    </div>
    <label className="dimming-control"><span>背景压暗 <strong>{settings.dimming}%</strong></span><input type="range" min="0" max="80" step="5" value={settings.dimming} disabled={settings.backgroundMode === 'off'} onChange={(event) => update({ dimming: Number(event.target.value) })}/></label>
    <div className="appearance-section">
      <label className="content-filter-toggle"><input type="checkbox" role="switch" checked={settings.audioEnabled} onChange={(event) => update({ audioEnabled: event.target.checked })}/>播放壁纸音频</label>
      <p>默认开启，实时预览和动态背景均可使用源文件音轨。音频仅在当前标签页可见时播放；没有音轨的源文件保持无声。</p>
    </div>
  </article>;
}
