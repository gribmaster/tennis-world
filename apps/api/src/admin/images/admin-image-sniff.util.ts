// ─────────────────────────────────────────────────────────────────────────────
// Magic-byte sniffing for court image uploads (TASK_73, decision 15). NEVER
// trust the client's `mimetype` or `originalname` — the stored object name is
// always `<random uuid>.<ext from THIS sniff>`, never the client's filename
// (closes the `../../x.png` path-traversal / content-type-spoofing vectors).
// ─────────────────────────────────────────────────────────────────────────────

export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface SniffedImage {
  type: SniffedImageType;
  /** File extension (no dot) derived from the sniffed type — never the client's. */
  ext: string;
}

/** JPEG: FF D8 FF. PNG: 89 50 4E 47 0D 0A 1A 0A. WebP: "RIFF"....."WEBP". */
export function sniffImageType(buffer: Buffer): SniffedImage | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { type: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { type: 'image/png', ext: 'png' };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { type: 'image/webp', ext: 'webp' };
  }
  return undefined;
}
