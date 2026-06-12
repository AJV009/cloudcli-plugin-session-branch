import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Session ids are UUID-like: hex and dashes only, so they can never traverse paths. */
export const SESSION_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

export function claudeProjectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

export function codexSessionsRoot() {
  return path.join(os.homedir(), '.codex', 'sessions');
}

export function backupRoot() {
  return path.join(os.homedir(), '.claude-code-ui', 'plugin-data', 'session-branch', 'backups');
}

/** Mirror of the host's project-path encoding (claudecodeui server/index.js). */
export function encodeClaudeProjectDir(projectPath) {
  return String(projectPath || '').replace(/[^a-zA-Z0-9-]/g, '-');
}

function realRoots() {
  const roots = [];
  for (const r of [claudeProjectsRoot(), codexSessionsRoot(), backupRoot()]) {
    try {
      roots.push(fs.realpathSync(r));
    } catch {
      /* root may not exist on this machine */
    }
  }
  return roots;
}

/**
 * Resolve symlinks and require the result to live under one of the allowed
 * roots (~/.claude/projects, ~/.codex/sessions, or the plugin backup dir).
 */
export function assertSafePath(filePath) {
  const real = fs.realpathSync(filePath);
  const ok = realRoots().some((root) => real === root || real.startsWith(root + path.sep));
  if (!ok) {
    throw new Error(`Path escapes allowed roots: ${filePath}`);
  }
  return real;
}

/** Same check for a file that may not exist yet: validate its parent directory. */
export function assertSafeTarget(filePath) {
  const dirReal = fs.realpathSync(path.dirname(filePath));
  const real = path.join(dirReal, path.basename(filePath));
  const ok = realRoots().some((root) => real === root || real.startsWith(root + path.sep));
  if (!ok) {
    throw new Error(`Path escapes allowed roots: ${filePath}`);
  }
  return real;
}

function findClaudeFile(sessionId, projectPath) {
  const root = claudeProjectsRoot();
  if (!fs.existsSync(root)) return null;

  if (projectPath) {
    const direct = path.join(root, encodeClaudeProjectDir(projectPath), `${sessionId}.jsonl`);
    if (fs.existsSync(direct)) return direct;
  }

  for (const dir of fs.readdirSync(root)) {
    const candidate = path.join(root, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findCodexFile(sessionId) {
  const root = codexSessionsRoot();
  if (!fs.existsSync(root)) return null;
  const suffix = `-${sessionId}.jsonl`;

  const subdirs = (p) => {
    try {
      return fs.readdirSync(p)
        .filter((f) => {
          try { return fs.statSync(path.join(p, f)).isDirectory(); } catch { return false; }
        })
        .sort()
        .reverse(); // newest first
    } catch {
      return [];
    }
  };

  for (const year of subdirs(root)) {
    for (const month of subdirs(path.join(root, year))) {
      for (const day of subdirs(path.join(root, year, month))) {
        const dayDir = path.join(root, year, month, day);
        for (const f of fs.readdirSync(dayDir)) {
          if (f.endsWith(suffix)) return path.join(dayDir, f);
        }
      }
    }
  }
  return null;
}

const ACTIVE_RISK_WINDOW_MS = 60_000;

/**
 * Locate a session file and detect its provider. The plugin api.context has no
 * provider field, so whichever storage contains the sessionId wins.
 */
export function resolveSession(sessionId, projectPath) {
  if (!SESSION_ID_RE.test(String(sessionId || ''))) {
    throw new Error('Invalid sessionId');
  }

  let provider = 'claude';
  let filePath = findClaudeFile(sessionId, projectPath);
  if (!filePath) {
    provider = 'codex';
    filePath = findCodexFile(sessionId);
  }
  if (!filePath) return null;

  const real = assertSafePath(filePath);
  const st = fs.statSync(real);
  return {
    provider,
    filePath: real,
    sizeBytes: st.size,
    mtimeMs: st.mtimeMs,
    activeRisk: Date.now() - st.mtimeMs < ACTIVE_RISK_WINDOW_MS,
  };
}
