// =============================================================================
// FE-034: Zero value renders as "0", not blank
// FE-035: Very small cost renders with precision
// Additional edge cases from test scenarios spec
// =============================================================================

import { describe, it, expect } from 'vitest';
import { formatValue, formatUSD, formatCompact } from '../formatters';

// FE-034: Zero value renders as "0", not blank
describe('FE-034: zero value formatting', () => {
  it('formatValue(0, "short") returns "0"', () => {
    expect(formatValue(0, 'short')).toBe('0');
  });

  it('formatValue(0, "percent") returns "0%"', () => {
    expect(formatValue(0, 'percent')).toBe('0%');
  });

  it('formatValue(0, "reqps") returns "0 req/s"', () => {
    expect(formatValue(0, 'reqps')).toBe('0 req/s');
  });

  it('formatValue(0, "USD") returns "$0"', () => {
    expect(formatValue(0, 'USD')).toBe('$0');
  });

  it('formatValue(0, "tokens") returns "0"', () => {
    expect(formatValue(0, 'tokens')).toBe('0');
  });

  it('formatValue(0, "tokps") returns "0 tok/s"', () => {
    expect(formatValue(0, 'tokps')).toBe('0 tok/s');
  });
});

// FE-035: Very small cost renders with precision
describe('FE-035: very small cost precision', () => {
  it('$0.00042 renders as "$0.0004" not "$0"', () => {
    expect(formatUSD(0.00042)).toBe('$0.0004');
  });

  it('$0.001 renders with precision', () => {
    expect(formatUSD(0.001)).toBe('$0.001');
  });

  it('$0.0099 renders as "$0.0099"', () => {
    expect(formatUSD(0.0099)).toBe('$0.0099');
  });

  it('$0.00001 rounds to "$0" at 4 decimal precision', () => {
    // 0.00001.toFixed(4) = "0.0000" → parseFloat → 0 → "$0"
    expect(formatUSD(0.00001)).toBe('$0');
  });
});

// Additional edge cases
describe('formatting edge cases', () => {
  it('negative percentage', () => {
    expect(formatValue(-5.2, 'percent')).toBe('-5.2%');
  });

  it('very large token count', () => {
    const result = formatValue(14800000, 'tokens');
    expect(result).toBe('14.8M');
  });

  it('formatCompact handles exactly 1M', () => {
    expect(formatCompact(1000000)).toBe('1M');
  });

  it('formatCompact handles billions', () => {
    expect(formatCompact(2500000000)).toBe('2.5B');
  });
});
