import { Icon } from './Icon';
import { MenuSurface } from './MenuSurface';

interface Option<T extends string> { value: T; label: string }

export function MultiSelectFilter<T extends string>({ label, options, selected, onChange }: { label: string; options: readonly Option<T>[]; selected: T[]; onChange: (values: T[]) => void }) {
  const toggle = (value: T) => onChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]);
  return <MenuSurface label={label} summary={<><span>{label}</span><span className="menu-count">{selected.length}/{options.length}</span></>}>
    {(close) => <>
      <div className="menu-heading"><strong>{label}</strong><span>可多选</span></div>
      <div className="option-list">{options.map((option) => <label key={option.value} className={selected.includes(option.value) ? 'is-selected' : ''}>
        <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)}/>
        <span>{option.label}</span><Icon name="check" size={17}/>
      </label>)}</div>
      <button type="button" className="secondary menu-done" onClick={close}>完成</button>
    </>}
  </MenuSurface>;
}
