import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function MenuSurface({ label, summary, className = '', children }: { label: string; summary: React.ReactNode; className?: string; children: React.ReactNode | ((close: () => void) => React.ReactNode) }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const mobile = window.matchMedia?.('(max-width: 700px)').matches;
    if (mobile) document.body.style.overflow = 'hidden';
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const pointerdown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', pointerdown);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', pointerdown);
    };
  }, [open]);

  return <div className={`filter-menu ${className}`} ref={root}>
    <button type="button" ref={trigger} className="menu-trigger" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
      <span className="menu-summary">{summary}</span><Icon name="chevron-down" size={15}/>
    </button>
    {open && <>
      <button type="button" className="menu-backdrop" aria-label={`关闭${label}`} onClick={close}/>
      <div className="filter-options" role="dialog" aria-label={label} ref={panel} tabIndex={-1}>
        <div className="sheet-handle"/>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </>}
  </div>;
}
