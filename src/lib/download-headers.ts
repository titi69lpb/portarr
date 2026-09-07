export interface ByteRange {
  start: number;
  end: number;
}

export function parseRange(rangeHeader: string | null | undefined, fileSize: number): ByteRange | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return null;

  let start: number;
  let end: number;
  if (startStr === '') {
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? fileSize - 1 : Number(endStr);
    end = Math.min(end, fileSize - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= fileSize || start > end) {
    return null;
  }
  return { start, end };
}

export function isUnsatisfiableRange(rangeHeader: string | null | undefined, fileSize: number): boolean {
  if (!rangeHeader) return false;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return false;
  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return false;
  if (startStr === '') return false; // suffix range is never "unsatisfiable" by start-position
  const start = Number(startStr);
  return Number.isFinite(start) && start >= fileSize;
}

export function buildContentDispositionHeader(fileName: string): string {
  const sanitized = fileName.replace(/"/g, '');
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}
