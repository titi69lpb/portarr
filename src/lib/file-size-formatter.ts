// Split out of file-explorer.ts: that file imports fs/promises, so pulling
// formatFileSize from it directly into a client component ('use client')
// breaks the client bundle. This file has no such dependency.
const SIZE_UNITS = ['o', 'Ko', 'Mo', 'Go', 'To'];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${SIZE_UNITS[0]}`;

  let value = bytes / 1024;
  let unitIndex = 1;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(2)} ${SIZE_UNITS[unitIndex]}`;
}
