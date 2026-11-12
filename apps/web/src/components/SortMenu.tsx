import { Icon } from './Icon';
import { MenuSurface } from './MenuSurface';

interface Option<T extends string> { value: T; label: string }

export function SortMenu<T extends string>({ options, value, onChange }: { options: readonly Option<T>[]; value: T; onChange: (value: T) => void }) {
  const current = options.find((option) => option.value === value);
  return <MenuSurface label="排序方式" className="menu-sort" summary={<span>{current?.label || '排序'}</span>}>
    {(close) => <>
      <div className="menu-heading"><strong>排序方式</strong><span>单选</span></div>
      <div className="option-list">{options.map((option) => <label key={option.value} className={value === option.value ? 'is-selected' : ''}>
        <input type="radio" name="wallpaper-sort" checked={value === option.value} onChange={() => { onChange(option.value); close(); }}/>
        <span>{option.label}</span><Icon name="check" size={17}/>
      </label>)}</div>
    </>}
  </MenuSurface>;
}
