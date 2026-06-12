import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Read a JSONL file as an array of non-empty raw lines. */
export function readLines(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.split(/\r?\n/).filter((line) => line.trim() !== '');
}

export function safeParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Atomically replace a file's content. The temp file uses a `.tmp` suffix so
 * the host's session watcher (which ignores **\/*.tmp) never indexes it.
 */
export function atomicWriteLines(filePath, lines) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, lines.join('\n') + '\n', 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

export function fingerprintOf(filePath, lineCount) {
  const st = fs.statSync(filePath);
  return { size: st.size, mtimeMs: st.mtimeMs, lineCount };
}

export function fingerprintMatches(filePath, fingerprint) {
  if (!fingerprint || typeof fingerprint !== 'object') return false;
  let st;
  try {
    st = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (Number(fingerprint.size) !== st.size) return false;
  if (Number(fingerprint.mtimeMs) !== st.mtimeMs) return false;
  return Number(fingerprint.lineCount) === readLines(filePath).length;
}

export function uuidv4() {
  return crypto.randomUUID();
}

/** UUIDv7: 48-bit millisecond timestamp + version/variant bits + random. */
export function uuidv7(now = Date.now()) {
  const bytes = crypto.randomBytes(16);
  const ts = BigInt(now);
  for (let i = 0; i < 6; i += 1) {
    bytes[5 - i] = Number((ts >> BigInt(8 * i)) & 0xffn);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
