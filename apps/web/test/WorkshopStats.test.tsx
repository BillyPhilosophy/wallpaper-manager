// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { WorkshopStats } from '../src/components/WorkshopStats';

describe('WorkshopStats', () => {
  afterEach(() => cleanup());

  it('formats real subscription and favorite counts for cards and details', () => {
    const compact = render(<WorkshopStats metadata={{ subscriptions: 12345, favorited: 678 }} compact/>);
    expect(compact.getByText('1.2万')).toBeTruthy();
    expect(compact.getByText('678')).toBeTruthy();
    compact.unmount();
    const exact = render(<WorkshopStats metadata={{ subscriptions: 12345, favorited: 678 }}/>);
    expect(exact.getByText('12,345')).toBeTruthy();
  });

  it('preserves zero and omits missing or invalid values', () => {
    const view = render(<WorkshopStats metadata={{ subscriptions: 0, favorited: 'unknown' }}/>);
    expect(view.getByText('0')).toBeTruthy();
    expect(view.container.textContent).not.toContain('收藏');
    view.unmount();
    expect(render(<WorkshopStats metadata={{}}/>).container.firstChild).toBeNull();
  });
});
