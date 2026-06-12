import fs from 'node:fs';
import path from 'node:path';

import { backupRoot, assertSafeTarget } from './resolve.js';

const BACKUP_ID_RE = /^[0-9A-Za-z._-]+$/;
const DEFAULT_RETENTION_DAYS = 30;

/** Copy the session file (plus metadata) into the plugin's backup store. */
export function createBackup(filePath, meta) {
  const root = backupRoot();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `${stamp}-${String(meta.sessionId || 'unknown').slice(0, 8)}`;
  const dir = path.join(root, backupId);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(filePath, path.join(dir, 'original.jsonl'));
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ ...meta, filePath, createdAt: new Date().toISOString() }, null, 2),
  );
  return backupId;
}

export function listBackups(sessionId) {
  const root = backupRoot();
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const dirName of fs.readdirSync(root)) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(root, dirName, 'meta.json'), 'utf8'));
      if (!sessionId || meta.sessionId === sessionId) {
        out.push({ backupId: dirName, ...meta });
      }
    } catch {
      /* not a valid backup dir — skip */
    }
  }
  out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return out;
}

/**
 * Restore a session file from a backup. The current state is snapshotted into
 * the backup dir first (`pre-restore.jsonl`) so even a restore is reversible.
 */
export function restoreBackup(backupId) {
  if (!BACKUP_ID_RE.test(String(backupId || ''))) {
    throw new Error('Invalid backupId');
  }
  const dir = path.join(backupRoot(), backupId);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const target = assertSafeTarget(meta.filePath);

  if (fs.existsSync(target)) {
    fs.copyFileSync(target, path.join(dir, 'pre-restore.jsonl'));
  }
  fs.copyFileSync(path.join(dir, 'original.jsonl'), target);
  return { restoredTo: target, meta };
}

export function cleanupOldBackups(days = DEFAULT_RETENTION_DAYS) {
  const root = backupRoot();
  if (!fs.existsSync(root)) return 0;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const dirName of fs.readdirSync(root)) {
    const dir = path.join(root, dirName);
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      const created = Date.parse(meta.createdAt || '');
      if (Number.isFinite(created) && created < cutoff) {
        fs.rmSync(dir, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      /* skip unparseable dirs — never delete what we don't understand */
    }
  }
  return removed;
}
