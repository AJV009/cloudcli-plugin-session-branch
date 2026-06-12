import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolveSession,
  codexSessionsRoot,
  assertSafeTarget,
} from './lib/resolve.js';
import {
  readLines,
  atomicWriteLines,
  fingerprintOf,
  fingerprintMatches,
  uuidv4,
  uuidv7,
} from './lib/jsonl.js';
import {
  parseClaudeMessages,
  truncateClaudeLines,
  rewriteClaudeSessionId,
} from './lib/claude.js';
import {
  parseCodexMessages,
  truncateCodexLines,
  buildCodexFork,
} from './lib/codex.js';
import {
  createBackup,
  listBackups,
  restoreBackup,
  cleanupOldBackups,
} from './lib/backup.js';
import { loadConfig, saveConfig } from './lib/config.js';

const MAX_BODY_BYTES = 1024 * 1024;

function parseMessagesFor(provider, lines, sessionId) {
  return provider === 'claude'
    ? parseClaudeMessages(lines, sessionId)
    : parseCodexMessages(lines);
}

function loadSession(query) {
  const sessionId = query.get('sessionId') || '';
  const projectPath = query.get('projectPath') || '';
  const resolved = resolveSession(sessionId, projectPath);
  if (!resolved) {
    throw new Error(`未找到该会话的存储文件（仅支持 Claude / Codex 会话）: ${sessionId}`);
  }
  return { sessionId, projectPath, resolved };
}

/**
 * A cut index is only accepted if it equals some candidate's turnStartIndex
 * (or, for fork "after" mode, a nextTurnStartIndex). This guarantees every
 * mutation lands on a turn boundary, no matter what the client sends.
 */
function validateCutIndex(items, cutIndex, { allowTurnEnd = false } = {}) {
  const idx = Number(cutIndex);
  if (!Number.isInteger(idx) || idx <= 0) {
    throw new Error('Invalid cut index');
  }
  for (const item of items) {
    if (!item.isCandidate) continue;
    if (item.turnStartIndex === idx) return idx;
    if (allowTurnEnd && item.nextTurnStartIndex === idx) return idx;
  }
  throw new Error('截断点不是有效的消息边界，请刷新消息列表后重试');
}

// ---------------------------------------------------------------- handlers

function handleResolve(query) {
  const { resolved } = loadSession(query);
  return { ok: true, ...resolved };
}

function handleMessages(query) {
  const { sessionId, resolved } = loadSession(query);
  const lines = readLines(resolved.filePath);
  const items = parseMessagesFor(resolved.provider, lines, sessionId);
  return {
    ok: true,
    provider: resolved.provider,
    filePath: resolved.filePath,
    activeRisk: resolved.activeRisk,
    fingerprint: fingerprintOf(resolved.filePath, lines.length),
    items,
  };
}

function handleRewind(body) {
  const query = new URLSearchParams({
    sessionId: String(body.sessionId || ''),
    projectPath: String(body.projectPath || ''),
  });
  const { sessionId, resolved } = loadSession(query);

  if (!fingerprintMatches(resolved.filePath, body.fingerprint)) {
    throw new Error('会话文件已发生变化（可能正在运行），请刷新消息列表后重试');
  }

  const lines = readLines(resolved.filePath);
  const items = parseMessagesFor(resolved.provider, lines, sessionId);
  const cutIndex = validateCutIndex(items, body.turnStartIndex);

  const backupId = createBackup(resolved.filePath, {
    action: 'rewind',
    provider: resolved.provider,
    sessionId,
    cutIndex,
  });

  const kept = resolved.provider === 'claude'
    ? truncateClaudeLines(lines, cutIndex)
    : truncateCodexLines(lines, cutIndex);
  atomicWriteLines(resolved.filePath, kept);

  return {
    ok: true,
    backupId,
    keptLines: kept.length,
    removedLines: lines.length - cutIndex,
  };
}

function handleFork(body) {
  const query = new URLSearchParams({
    sessionId: String(body.sessionId || ''),
    projectPath: String(body.projectPath || ''),
  });
  const { sessionId, resolved } = loadSession(query);

  if (!fingerprintMatches(resolved.filePath, body.fingerprint)) {
    throw new Error('会话文件已发生变化（可能正在运行），请刷新消息列表后重试');
  }

  const lines = readLines(resolved.filePath);
  const items = parseMessagesFor(resolved.provider, lines, sessionId);

  let cutIndex = lines.length; // null cut = fork the full session
  if (body.cutIndex !== null && body.cutIndex !== undefined) {
    cutIndex = validateCutIndex(items, body.cutIndex, { allowTurnEnd: true });
  }

  if (resolved.provider === 'claude') {
    const kept = truncateClaudeLines(lines, cutIndex);
    const newId = uuidv4();
    const rewritten = rewriteClaudeSessionId(kept, newId);
    const newPath = path.join(path.dirname(resolved.filePath), `${newId}.jsonl`);
    if (fs.existsSync(newPath)) {
      throw new Error('UUID collision, please retry');
    }
    atomicWriteLines(assertSafeTarget(newPath), rewritten);
    return { ok: true, provider: 'claude', newSessionId: newId, newFilePath: newPath };
  }

  const kept = truncateCodexLines(lines, cutIndex);
  const newId = uuidv7();
  const fork = buildCodexFork(kept, newId);
  const dayDir = path.join(codexSessionsRoot(), ...fork.relDir);
  fs.mkdirSync(dayDir, { recursive: true });
  const newPath = path.join(dayDir, fork.fileName);
  atomicWriteLines(assertSafeTarget(newPath), fork.lines);
  return { ok: true, provider: 'codex', newSessionId: newId, newFilePath: newPath };
}

function handleBackups(query) {
  const sessionId = query.get('sessionId') || null;
  return { ok: true, backups: listBackups(sessionId) };
}

function handleRestore(body) {
  const result = restoreBackup(String(body.backupId || ''));
  return { ok: true, ...result };
}

// ---------------------------------------------------------------- server

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const route = `${req.method} ${url.pathname}`;

  const send = (status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  };

  try {
    switch (route) {
      case 'GET /health':
        return send(200, { ok: true, plugin: 'session-branch' });
      case 'GET /resolve':
        return send(200, handleResolve(url.searchParams));
      case 'GET /messages':
        return send(200, handleMessages(url.searchParams));
      case 'POST /rewind':
        return send(200, handleRewind(await readBody(req)));
      case 'POST /fork':
        return send(200, handleFork(await readBody(req)));
      case 'GET /backups':
        return send(200, handleBackups(url.searchParams));
      case 'POST /restore':
        return send(200, handleRestore(await readBody(req)));
      case 'GET /config':
        return send(200, { ok: true, config: loadConfig() });
      case 'POST /config':
        return send(200, { ok: true, config: saveConfig(await readBody(req)) });
      default:
        return send(404, { ok: false, error: `Unknown route: ${route}` });
    }
  } catch (err) {
    // Business errors travel as 200 + ok:false — the host frontend's rpc()
    // throws a bare "RPC error <status>" on non-2xx, hiding the message.
    return send(200, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(0, '127.0.0.1', () => {
  console.log(JSON.stringify({ ready: true, port: server.address().port }));
  setTimeout(() => {
    try {
      cleanupOldBackups();
    } catch {
      /* best effort */
    }
  }, 3000);
});
