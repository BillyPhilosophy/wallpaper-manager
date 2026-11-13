// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { AppearanceProvider, useAppearance } from '../src/features/appearance/AppearanceContext';

function AudioSetting() {
  const { settings, update } = useAppearance();
  return <button onClick={() => update({ audioEnabled: !settings.audioEnabled })}>{String(settings.audioEnabled)}</button>;
}

describe('AppearanceContext audio', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('defaults audio on and persists changes', () => {
    const view = render(<AppearanceProvider><AudioSetting/></AppearanceProvider>);
    const button = view.getByRole('button');
    expect(button.textContent).toBe('true');
    expect(JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').audioEnabled).toBe(true);
    fireEvent.click(button);
    expect(button.textContent).toBe('false');
    expect(JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').audioEnabled).toBe(false);
  });

  it('keeps existing installations opted in unless audio was explicitly disabled', () => {
    localStorage.setItem('wallpaper-appearance-v1', JSON.stringify({ theme: 'light' }));
    const first = render(<AppearanceProvider><AudioSetting/></AppearanceProvider>);
    expect(first.getByRole('button').textContent).toBe('true');
    first.unmount();
    localStorage.setItem('wallpaper-appearance-v1', JSON.stringify({ audioEnabled: false }));
    const second = render(<AppearanceProvider><AudioSetting/></AppearanceProvider>);
    expect(second.getByRole('button').textContent).toBe('false');
  });
});
