import type { PanelUnit } from '../types/views';

/**
 * Format a numeric value according to its unit type.
 */
export function formatValue(value: number, unit: PanelUnit): string {
  switch (unit) {
    case 'reqps':
      return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} req/s`;
    case 'seconds':
      return formatDuration(value);
    case 'bytes':
      return formatBytes(value);
    case 'percent':
      return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)}%`;
    case 'short':
      return formatCompact(value);
    case 'USD':
      return formatUSD(value);
    case 'tokens':
      return formatCompact(value);
    case 'tokps':
      return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)} tok/s`;
  }
}

/** Format a duration in seconds to a human-readable string */
export function formatDuration(seconds: number): string {
  if (seconds < 0.001) return `${(seconds * 1_000_000).toFixed(0)}µs`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(2)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Format bytes to human-readable (KB, MB, GB, etc.) */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${formatNumber(value)} ${units[i]}`;
}

/** Format a number with compact notation (K, M, B) */
export function formatCompact(value: number): string {
  if (Math.abs(value) < 1000) return formatNumber(value, Number.isInteger(value) ? 0 : undefined);
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(1)}K`;
  if (Math.abs(value) < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${(value / 1_000_000_000).toFixed(1)}B`;
}

/** Format as USD currency */
export function formatUSD(value: number): string {
  if (Math.abs(value) < 0.01) return `$${parseFloat(value.toFixed(4))}`;
  if (Math.abs(value) < 1) return `$${parseFloat(value.toFixed(3))}`;
  return `$${formatNumber(value, Number.isInteger(value) ? 0 : 2)}`;
}

/** Format a number with specified decimal places, adding commas */
function formatNumber(value: number, decimals?: number): string {
  const d = decimals ?? (value >= 100 ? 0 : value >= 10 ? 1 : 2);
  return value.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
