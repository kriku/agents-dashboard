import { describe, it, expect } from 'vitest';
import { formatDuration, formatCompact, formatUSD, formatBytes, formatValue } from '../formatters';

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------
describe('formatDuration', () => {
  it('formats sub-millisecond as µs', () => {
    expect(formatDuration(0.000250)).toBe('250µs');
  });

  it('formats milliseconds', () => {
    expect(formatDuration(0.345)).toBe('345ms');
  });

  it('formats seconds with 2 decimals', () => {
    expect(formatDuration(5.123)).toBe('5.12s');
  });

  it('formats minutes + seconds', () => {
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('formats exact minutes without seconds', () => {
    expect(formatDuration(120)).toBe('2m');
  });

  it('formats hours + minutes', () => {
    expect(formatDuration(3725)).toBe('1h 2m');
  });

  it('formats zero as 0s', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats integer seconds without decimals', () => {
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(30)).toBe('30s');
  });
});

// ---------------------------------------------------------------------------
// formatCompact
// ---------------------------------------------------------------------------
describe('formatCompact', () => {
  it('returns small numbers as-is', () => {
    expect(formatCompact(42)).toMatch(/42/);
  });

  it('formats exactly 1000 as K', () => {
    expect(formatCompact(1000)).toBe('1K');
  });

  it('formats thousands as K', () => {
    expect(formatCompact(48291)).toBe('48.3K');
  });

  it('formats millions as M', () => {
    expect(formatCompact(18472093)).toBe('18.5M');
  });

  it('formats zero', () => {
    expect(formatCompact(0)).toMatch(/0/);
  });

  it('formats integer without decimals', () => {
    expect(formatCompact(8)).toBe('8');
    expect(formatCompact(12)).toBe('12');
    expect(formatCompact(999)).toBe('999');
  });

  it('formats non-integer with decimals', () => {
    expect(formatCompact(8.5)).toMatch(/8\.5/);
    expect(formatCompact(42.7)).toMatch(/42\.7/);
  });
});

// ---------------------------------------------------------------------------
// formatUSD
// ---------------------------------------------------------------------------
describe('formatUSD', () => {
  it('formats large values with 2 decimals', () => {
    expect(formatUSD(253.82)).toBe('$253.82');
  });

  it('formats sub-penny without trailing zeros', () => {
    expect(formatUSD(0.00526)).toBe('$0.0053');
    expect(formatUSD(0.005)).toBe('$0.005');
  });

  it('formats sub-dollar with 3 decimals', () => {
    expect(formatUSD(0.342)).toBe('$0.342');
  });

  it('formats zero', () => {
    expect(formatUSD(0)).toBe('$0');
  });

  it('formats integer without decimals', () => {
    expect(formatUSD(100)).toBe('$100');
    expect(formatUSD(1500)).toBe('$1,500');
  });
});

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------
describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toMatch(/1\.\d+ KB/);
  });

  it('formats megabytes', () => {
    expect(formatBytes(5242880)).toMatch(/5\.\d+ MB/);
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toMatch(/1\.\d+ GB/);
  });
});

// ---------------------------------------------------------------------------
// formatValue dispatcher
// ---------------------------------------------------------------------------
describe('formatValue', () => {
  it('formats reqps unit', () => {
    expect(formatValue(12.5, 'reqps')).toContain('req/s');
  });

  it('formats seconds unit via formatDuration', () => {
    expect(formatValue(0.345, 'seconds')).toBe('345ms');
  });

  it('formats percent unit', () => {
    expect(formatValue(2.34, 'percent')).toMatch(/2\.3%/);
  });

  it('formats short unit via formatCompact', () => {
    expect(formatValue(48291, 'short')).toBe('48.3K');
  });

  it('formats USD unit', () => {
    expect(formatValue(253.82, 'USD')).toBe('$253.82');
  });

  it('formats tokps unit', () => {
    expect(formatValue(95, 'tokps')).toContain('tok/s');
  });

  it('formats short integer without decimals', () => {
    expect(formatValue(8, 'short')).toBe('8');
    expect(formatValue(12, 'short')).toBe('12');
  });

  it('formats reqps integer without decimals', () => {
    expect(formatValue(95, 'reqps')).toBe('95 req/s');
  });

  it('formats tokps integer without decimals', () => {
    expect(formatValue(120, 'tokps')).toBe('120 tok/s');
  });

  it('formats tokps non-integer with decimals', () => {
    expect(formatValue(95.5, 'tokps')).toBe('95.5 tok/s');
  });

  it('formats seconds integer without decimals', () => {
    expect(formatValue(5, 'seconds')).toBe('5s');
  });

  it('formats USD integer without decimals', () => {
    expect(formatValue(100, 'USD')).toBe('$100');
  });

  it('formats percent integer without decimals', () => {
    expect(formatValue(100, 'percent')).toBe('100%');
  });

  it('formats bytes unit via formatBytes', () => {
    expect(formatValue(1048576, 'bytes')).toContain('MB');
  });

  it('formats tokens unit via formatCompact', () => {
    expect(formatValue(1500000, 'tokens')).toBe('1.5M');
  });
});
