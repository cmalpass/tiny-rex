import { describe, it, expect } from 'vitest';
import { clamp, lerp, overlap, fmtTime, mulberry32, easeOutBack } from '../src/util';

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('interpolates between two values', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(10, 0, 0.5)).toBe(5);
  });
});

describe('easeOutBack', () => {
  it('starts at 0 and lands on 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
  });

  it('overshoots past 1 mid-ease, peaking near the middle, then lands exactly on 1', () => {
    expect(easeOutBack(0.58)).toBeGreaterThan(1.05);
    expect(easeOutBack(0.95)).toBeGreaterThan(1);
    expect(easeOutBack(1)).toBeCloseTo(1);
  });

  it('clamps out-of-range input', () => {
    expect(easeOutBack(-1)).toBeCloseTo(0);
    expect(easeOutBack(2)).toBeCloseTo(1);
  });
});

describe('overlap', () => {
  it('detects axis-aligned rect intersection', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(overlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlap(a, { x: 10, y: 10, w: 5, h: 5 })).toBe(false);
    expect(overlap(a, { x: -1, y: 11, w: 5, h: 5 })).toBe(false);
  });
});

describe('fmtTime', () => {
  it('formats seconds as m:ss', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(59)).toBe('0:59');
    expect(fmtTime(65)).toBe('1:05');
    expect(fmtTime(125)).toBe('2:05');
  });
});

describe('mulberry32', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});
