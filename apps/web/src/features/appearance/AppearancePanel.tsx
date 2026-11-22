import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { Page, Wallpaper, WallpaperGroup } from '@wallpaper-manager/contracts';
import { api } from '../../api';
import { useRemote } from '../../hooks';
import { Icon, type IconName } from '../../components/Icon';
import { useCanvasEffectsCapability } from '../canvas-effects/capability';
import { useAppearance, type BackgroundMode, type CanvasEffectPreference, type ThemePreference } from './AppearanceContext';

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
const canvasEffectOptions: { value: CanvasEffectPreference; label: string; description: string }[] = [
  { value: 'off', label: '关闭', description: '仅保留磨玻璃' },
  { value: 'glass', label: 'Glass', description: '折射玻璃透镜' },
  { value: 'liquid', label: 'Liquid', description: '流体波纹扭曲' },
  { value: 'shatter', label: 'Shatter', description: '3D 玻璃碎片' },
  { value: 'blaze', label: 'Blaze', description: '底部火星热浪' },
];

export function AppearancePanel() {
  const { settings, update } = useAppearance();
  const capability = useCanvasEffectsCapability();
  const wallpapers = useRemote<Page<Wallpaper>>(() => api('/wallpapers?status=downloaded&page=1&pageSize=100'), []);
  const groups = useRemote<{ items: WallpaperGroup[] }>(() => api('/groups'), [], 5000);
  const [rotationStatus, setRotationStatus] = useState<{ index: number; total: number } | null>(null);
  const selectedGroup = groups.data?.items?.find((group) => group.id === settings.rotationGroupId);
  const playableCount = selectedGroup?.playableCount ?? 0;
  useEffect(() => {
    const changed = (event: Event) => setRotationStatus((event as CustomEvent<{ index: number; total: number }>).detail);
    window.addEventListener('wm-background-rotation-status', changed);
    return () => window.removeEventListener('wm-background-rotation-status', changed);
  }, []);
  useEffect(() => { setRotationStatus(null); }, [settings.rotationGroupId, settings.rotationEnabled]);
  const select = (wallpaper: Wallpaper) => update({ backgroundId: wallpaper.workshopId, backgroundMode: wallpaper.type === 'image' ? 'static' : 'dynamic', rotationEnabled: false });
  const compatibility = capability.reducedMotion ? '已遵循系统“减弱动态效果”设置，暂停 Canvas 特效。'
    : capability.reducedTransparency ? '已遵循系统“降低透明度”设置，使用静态界面。'
      : capability.constrained ? '移动端与触屏设备使用轻量磨玻璃，不运行全页 GPU 特效。'
        : !capability.webgl ? '当前浏览器没有可用的 WebGL 2，已回退到静态磨玻璃。'
          : capability.htmlInCanvas ? 'HTML-in-Canvas 已就绪：真实 DOM 折射，链接、表单与文本交互保持可用。'
            : '兼容模式：液态与火焰使用 GPU 叠加；完整折射和 Shatter 需要桌面版 Chrome 157+。';
  return <article className="settings-card appearance-card">
    <h2>外观与背景</h2>
    <p>让导航和控件浮在壁纸上。动态背景仅使用已下载内容，并在后台标签页自动暂停。</p>
    <div className="appearance-section">
      <span className="setting-label">主题</span>
      <div className="segmented-control" aria-label="主题模式">
        {themeOptions.map((option) => <button type="button" key={option.value} className={settings.theme === option.value ? 'is-selected' : ''} aria-pressed={settings.theme === option.value} onClick={() => update({ theme: option.value })}><Icon name={option.icon} size={16}/>{option.label}</button>)}
      </div>
    </div>
    <div className="appearance-section canvas-effects-settings">
      <span className="setting-label">Canvas UI 主效果</span>
      <div className="canvas-effect-options" aria-label="Canvas UI 主效果">
        {canvasEffectOptions.map((option) => <button type="button" key={option.value} className={`canvas-effect-option${settings.canvasEffect === option.value ? ' is-selected' : ''}`} aria-pressed={settings.canvasEffect === option.value} disabled={!capability.enabled && option.value !== 'off'} onClick={() => update(option.value === 'off' ? { canvasEffect: 'off', liquidTrail: false } : { canvasEffect: option.value })}><strong>{option.label}</strong><small>{option.description}</small></button>)}
      </div>
      <label className="content-filter-toggle liquid-trail-toggle"><input type="checkbox" role="switch" checked={settings.canvasEffect === 'liquid' || settings.liquidTrail} disabled={!capability.enabled || settings.canvasEffect === 'liquid'} onChange={(event) => update({ liquidTrail: event.target.checked })}/>叠加液态流光<small>{settings.canvasEffect === 'liquid' ? '液态已是主效果，不重复渲染' : '可与 Glass、Shatter 或 Blaze 组合'}</small></label>
      <label className="dimming-control effect-intensity-control"><span>效果强度 <strong>{settings.effectIntensity}%</strong></span><input aria-label="效果强度" type="range" min="20" max="100" step="10" value={settings.effectIntensity} disabled={!capability.enabled || (settings.canvasEffect === 'off' && !settings.liquidTrail)} onChange={(event) => update({ effectIntensity: Number(event.target.value) })}/></label>
      <p className={`canvas-effect-status${capability.enabled && capability.htmlInCanvas ? ' is-native' : ''}`} role="status">{compatibility}</p>
      <p className="canvas-effect-note">主效果互斥，避免重复捕获 DOM。实时预览页不应用特效；后台标签页自动暂停渲染。</p>
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
          {wallpaper.officialPreviewUrl ? <img src={wallpaper.officialPreviewUrl} alt="" loading="lazy" crossOrigin="anonymous"/> : <span className="background-choice-placeholder"><Icon name="image"/></span>}
          <span>{wallpaper.title}</span>
          {settings.backgroundId === wallpaper.workshopId && <i><Icon name="check" size={14}/></i>}
        </button>)}
      </div> : <p className="muted">还没有已下载的壁纸，下载后即可设为页面背景。</p>}
    </div>
    <div className="appearance-section background-rotation-section">
      <span className="setting-label">自动轮播</span>
      <div className="rotation-controls">
        <label>轮播分组<select aria-label="轮播分组" value={settings.rotationGroupId || ''} onChange={(event) => update({ rotationGroupId: event.target.value || null, rotationEnabled: false })}><option value="">选择分组</option>{(groups.data?.items || []).map((group) => <option key={group.id} value={group.id}>{group.name}（{group.playableCount} 可播放）</option>)}</select></label>
        <label>切换间隔<select aria-label="轮播间隔" value={settings.rotationIntervalMinutes} onChange={(event) => update({ rotationIntervalMinutes: Number(event.target.value) })}>{[1, 5, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}</select></label>
        <div className="segmented-control" aria-label="轮播顺序"><button type="button" className={settings.rotationOrder === 'sequence' ? 'is-selected' : ''} aria-pressed={settings.rotationOrder === 'sequence'} onClick={() => update({ rotationOrder: 'sequence' })}>顺序</button><button type="button" className={settings.rotationOrder === 'random' ? 'is-selected' : ''} aria-pressed={settings.rotationOrder === 'random'} onClick={() => update({ rotationOrder: 'random' })}>随机</button></div>
        <div className="segmented-control" aria-label="轮播推进方式"><button type="button" className={settings.rotationTrigger === 'interval' ? 'is-selected' : ''} aria-pressed={settings.rotationTrigger === 'interval'} onClick={() => update({ rotationTrigger: 'interval' })}>按间隔</button><button type="button" className={settings.rotationTrigger === 'videoEnd' ? 'is-selected' : ''} aria-pressed={settings.rotationTrigger === 'videoEnd'} onClick={() => update({ rotationTrigger: 'videoEnd' })}>视频播完</button></div>
      </div>
      <label className="content-filter-toggle"><input type="checkbox" role="switch" checked={settings.rotationEnabled} disabled={!settings.rotationGroupId || playableCount < 2} onChange={(event) => update({ rotationEnabled: event.target.checked, backgroundMode: event.target.checked ? 'dynamic' : settings.backgroundMode })}/>启用分组轮播</label>
      {settings.rotationGroupId && <p className="rotation-status">{playableCount < 2 ? `当前分组有 ${playableCount} 张可播放壁纸，至少需要 2 张才能启用。` : settings.rotationEnabled && rotationStatus ? `轮播中 · 第 ${rotationStatus.index}/${rotationStatus.total} 张` : `当前分组有 ${playableCount} 张可播放壁纸。`}</p>}
      <p>仅轮换分组内已下载的 Scene、Web 和视频壁纸，至少需要 2 张。隐藏标签页或实时预览时暂停切换；选择“视频播完”时，达到最短间隔后等待本次播放结束，其他类型仍按间隔。</p>
      <div className="rotation-actions"><button type="button" className="secondary" disabled={!settings.rotationEnabled} onClick={() => window.dispatchEvent(new Event('wm-background-rotation-next'))}>立即下一张</button><Link className="button-link secondary" to="/groups">管理分组</Link><span className="muted">每 {settings.rotationIntervalMinutes} 分钟 · {settings.rotationOrder === 'random' ? '随机' : '顺序'}</span></div>
    </div>
    <label className="dimming-control"><span>背景压暗 <strong>{settings.dimming}%</strong></span><input type="range" min="0" max="80" step="5" value={settings.dimming} disabled={settings.backgroundMode === 'off'} onChange={(event) => update({ dimming: Number(event.target.value) })}/></label>
    <div className="appearance-section">
      <label className="content-filter-toggle"><input type="checkbox" role="switch" checked={settings.audioEnabled} onChange={(event) => update({ audioEnabled: event.target.checked })}/>播放壁纸音频</label>
      <p>默认开启，实时预览和动态背景均可使用源文件音轨。音频仅在当前标签页可见时播放；没有音轨的源文件保持无声。</p>
    </div>
  </article>;
}
