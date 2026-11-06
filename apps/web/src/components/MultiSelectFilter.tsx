interface Option<T extends string> { value: T; label: string }
export function MultiSelectFilter<T extends string>({ label, options, selected, onChange }: { label: string; options: readonly Option<T>[]; selected: T[]; onChange: (values: T[]) => void }) {
  const toggle = (value: T) => onChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]);
  return <details className="filter-menu"><summary>{label}<span>{selected.length}/{options.length}</span></summary><div className="filter-options">{options.map((option) => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)}/>{option.label}</label>)}</div></details>;
}
