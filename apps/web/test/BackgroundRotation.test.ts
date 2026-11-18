import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@wallpaper-manager/contracts';
import { nextRotationId } from '../src/features/appearance/rotation';

const items = ['101', '102', '103'].map((workshopId) => ({ workshopId })) as Wallpaper[];

describe('background rotation order', () => {
  it('advances sequentially and wraps around', () => {
    expect(nextRotationId(items, '101', 'sequence')).toBe('102');
    expect(nextRotationId(items, '103', 'sequence')).toBe('101');
    expect(nextRotationId(items, 'missing', 'sequence')).toBe('101');
  });

  it('does not repeat the current wallpaper randomly', () => {
    expect(nextRotationId(items, '101', 'random', () => 0)).toBe('102');
    expect(nextRotationId(items, '101', 'random', () => 0.999)).toBe('103');
  });

  it('handles empty and single-item lists', () => {
    expect(nextRotationId([], null, 'sequence')).toBeNull();
    expect(nextRotationId([items[0]], '101', 'random')).toBe('101');
  });
});
