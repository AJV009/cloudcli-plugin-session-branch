// E2E test for the session-branch plugin backend.
// Creates throwaway fixture sessions inside the real provider roots (required
// by the path-safety checks), exercises rewind/restore/fork, then cleans up.
// Usage: node scripts/test-e2e.mjs <port>

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert';

const port = process.argv[2];
if (!port) throw new Error('usage: node scripts/test-e2e.mjs <port>');
const base = `http://127.0.0.1:${port}`;

const api = async (method, route, body) => {
  const res = await fetch(base + route, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
};

const home = os.homedir();
const claudeDir = path.join(home, '.claude', 'projects', 'D--sbtest-fixture');
const codexDir = path.join(home, '.codex', 'sessions', '2020', '01', '01');
const cleanupPaths = [];
let failures = 0;

const check = (name, cond, extra = '') => {
  if (cond) {
    console.log(`  PASS ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name} ${extra}`);
  }
};

// ---------------------------------------------------------------- fixtures

const claudeId = crypto.randomUUID();
const codexId = crypto.randomUUID();

function claudeLine(obj) {
  return JSON.stringify({ sessionId: claudeId, cwd: 'D:\\sbtest\\fixture', version: '2.0.0', ...obj });
}

const u = (n) => `uuid-${n}`;
const claudeLines = [
  claudeLine({ type: 'summary', summary: 'old summary', leafUuid: u(6) }),
  claudeLine({ type: 'user', uuid: u(1), parentUuid: null, timestamp: '2020-01-01T00:00:01Z', message: { role: 'user', content: '第一轮：暗号是苹果' } }),
  claudeLine({ type: 'assistant', uuid: u(2), parentUuid: u(1), timestamp: '2020-01-01T00:00:02Z', message: { role: 'assistant', content: [{ type: 'text', text: '记住了：苹果' }] } }),
  claudeLine({ type: 'user', uuid: u(3), parentUuid: u(2), timestamp: '2020-01-01T00:00:03Z', message: { role: 'user', content: '第二轮：暗号改成香蕉' } }),
  claudeLine({ type: 'assistant', uuid: u(4), parentUuid: u(3), timestamp: '2020-01-01T00:00:04Z', message: { role: 'assistant', content: [{ type: 'text', text: '已改：香蕉' }] } }),
  claudeLine({ type: 'user', uuid: u(5), parentUuid: u(4), timestamp: '2020-01-01T00:00:05Z', message: { role: 'user', content: '第三轮：说错了的那句话' } }),
  claudeLine({ type: 'assistant', uuid: u(6), parentUuid: u(5), timestamp: '2020-01-01T00:00:06Z', message: { role: 'assistant', content: [{ type: 'text', text: '基于错误输入的回答' }] } }),
];
const claudeFile = path.join(claudeDir, `${claudeId}.jsonl`);
fs.mkdirSync(claudeDir, { recursive: true });
fs.writeFileSync(claudeFile, claudeLines.join('\n') + '\n');
cleanupPaths.push(claudeFile);

const codexLines = [
  JSON.stringify({ timestamp: '2020-01-01T00:00:00Z', type: 'session_meta', payload: { id: codexId, timestamp: '2020-01-01T00:00:00Z', cwd: 'D:\\sbtest\\fixture', originator: 'test', cli_version: '0.0.0' } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:01Z', type: 'event_msg', payload: { type: 'task_started' } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:01Z', type: 'turn_context', payload: { cwd: 'D:\\sbtest\\fixture' } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '第一轮：暗号是苹果' }] } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:01Z', type: 'event_msg', payload: { type: 'user_message', message: '第一轮：暗号是苹果' } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:02Z', type: 'event_msg', payload: { type: 'agent_message', message: '记住了：苹果' } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:03Z', type: 'event_msg', payload: { type: 'task_started' } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:03Z', type: 'turn_context', payload: { cwd: 'D:\\sbtest\\fixture' } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:03Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '第二轮：说错了的话' }] } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:03Z', type: 'event_msg', payload: { type: 'user_message', message: '第二轮：说错了的话' } }),
  JSON.stringify({ timestamp: '2020-01-01T00:00:04Z', type: 'event_msg', payload: { type: 'agent_message', message: '基于错误输入的回答' } }),
];
const codexFile = path.join(codexDir, `rollout-2020-01-01T00-00-00-${codexId}.jsonl`);
fs.mkdirSync(codexDir, { recursive: true });
fs.writeFileSync(codexFile, codexLines.join('\n') + '\n');
cleanupPaths.push(codexFile);

// ---------------------------------------------------------------- tests

try {
  console.log('--- Claude: /messages ---');
  let r = await api('GET', `/messages?sessionId=${claudeId}&projectPath=${encodeURIComponent('D:\\sbtest\\fixture')}`);
  check('resolve via encoded projectPath', r.ok && r.provider === 'claude', JSON.stringify(r).slice(0, 200));
  let cands = r.items.filter((i) => i.isCandidate);
  check('3 candidates', cands.length === 3, `got ${cands.length}`);
  const turn3 = cands[2];
  check('turn3 boundary', turn3.turnStartIndex === 5 && turn3.nextTurnStartIndex === 7, JSON.stringify(turn3));

  console.log('--- Claude: /rewind rejects bad input ---');
  let bad = await api('POST', '/rewind', { sessionId: claudeId, projectPath: 'D:\\sbtest\\fixture', turnStartIndex: 4, fingerprint: r.fingerprint });
  check('non-boundary cut rejected', bad.ok === false, JSON.stringify(bad));
  bad = await api('POST', '/rewind', { sessionId: claudeId, projectPath: 'D:\\sbtest\\fixture', turnStartIndex: 5, fingerprint: { size: 1, mtimeMs: 1, lineCount: 1 } });
  check('stale fingerprint rejected', bad.ok === false, JSON.stringify(bad));

  console.log('--- Claude: /rewind turn 3 ---');
  const beforeBytes = fs.readFileSync(claudeFile, 'utf8');
  let rw = await api('POST', '/rewind', { sessionId: claudeId, projectPath: 'D:\\sbtest\\fixture', turnStartIndex: 5, fingerprint: r.fingerprint });
  check('rewind ok', rw.ok === true, JSON.stringify(rw));
  const afterLines = fs.readFileSync(claudeFile, 'utf8').split(/\r?\n/).filter(Boolean);
  check('kept 4 lines (summary with dangling leafUuid dropped)', afterLines.length === 4, `got ${afterLines.length}`);
  check('no summary line remains', !afterLines.some((l) => JSON.parse(l).type === 'summary'));
  check('last line is turn-2 assistant', JSON.parse(afterLines[afterLines.length - 1]).uuid === u(4));

  console.log('--- Claude: /restore ---');
  let rs = await api('POST', '/restore', { backupId: rw.backupId });
  check('restore ok', rs.ok === true, JSON.stringify(rs));
  check('bytes identical after restore', fs.readFileSync(claudeFile, 'utf8') === beforeBytes);

  console.log('--- Claude: /fork after turn 2 ---');
  r = await api('GET', `/messages?sessionId=${claudeId}&projectPath=${encodeURIComponent('D:\\sbtest\\fixture')}`);
  cands = r.items.filter((i) => i.isCandidate);
  let fk = await api('POST', '/fork', { sessionId: claudeId, projectPath: 'D:\\sbtest\\fixture', cutIndex: cands[1].nextTurnStartIndex, fingerprint: r.fingerprint });
  check('fork ok', fk.ok === true, JSON.stringify(fk));
  if (fk.ok) {
    cleanupPaths.push(fk.newFilePath);
    const forkLines = fs.readFileSync(fk.newFilePath, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    check('fork has 4 content lines (summary dropped)', forkLines.length === 4, `got ${forkLines.length}`);
    check('all sessionIds rewritten', forkLines.every((o) => o.sessionId === fk.newSessionId));
    check('uuid chain preserved', forkLines[forkLines.length - 1].uuid === u(4));
    check('original untouched', fs.readFileSync(claudeFile, 'utf8') === beforeBytes);
    const viaApi = await api('GET', `/messages?sessionId=${fk.newSessionId}&projectPath=${encodeURIComponent('D:\\sbtest\\fixture')}`);
    check('forked session readable via /messages', viaApi.ok && viaApi.items.filter((i) => i.isCandidate).length === 2);
  }

  console.log('--- Codex: /messages ---');
  r = await api('GET', `/messages?sessionId=${codexId}`);
  check('codex resolve', r.ok && r.provider === 'codex', JSON.stringify(r).slice(0, 200));
  cands = r.items.filter((i) => i.isCandidate);
  check('2 candidates', cands.length === 2, `got ${cands.length}`);
  check('turn2 absorbs copy+turn_context+task_started', cands[1].turnStartIndex === 6, JSON.stringify(cands[1]));
  check('turn1 stops before session_meta', cands[0].turnStartIndex === 1, JSON.stringify(cands[0]));

  console.log('--- Codex: /rewind turn 2 ---');
  const codexBefore = fs.readFileSync(codexFile, 'utf8');
  let crw = await api('POST', '/rewind', { sessionId: codexId, turnStartIndex: 6, fingerprint: r.fingerprint });
  check('rewind ok', crw.ok === true, JSON.stringify(crw));
  const codexAfter = fs.readFileSync(codexFile, 'utf8').split(/\r?\n/).filter(Boolean);
  check('kept 6 lines', codexAfter.length === 6, `got ${codexAfter.length}`);
  check('last kept line is turn-1 agent_message', JSON.parse(codexAfter[5]).payload.type === 'agent_message');

  console.log('--- Codex: /restore + /fork ---');
  rs = await api('POST', '/restore', { backupId: crw.backupId });
  check('restore ok', rs.ok === true && fs.readFileSync(codexFile, 'utf8') === codexBefore);
  r = await api('GET', `/messages?sessionId=${codexId}`);
  fk = await api('POST', '/fork', { sessionId: codexId, cutIndex: 6, fingerprint: r.fingerprint });
  check('fork ok', fk.ok === true, JSON.stringify(fk));
  if (fk.ok) {
    cleanupPaths.push(fk.newFilePath);
    const forkLines = fs.readFileSync(fk.newFilePath, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    check('fork meta id rewritten', forkLines[0].payload.id === fk.newSessionId);
    check('fork filename embeds new id', path.basename(fk.newFilePath).includes(fk.newSessionId));
    check('uuidv7 shape', /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(fk.newSessionId), fk.newSessionId);
    check('original untouched', fs.readFileSync(codexFile, 'utf8') === codexBefore);
    const viaApi = await api('GET', `/messages?sessionId=${fk.newSessionId}`);
    check('forked codex session readable', viaApi.ok && viaApi.items.filter((i) => i.isCandidate).length === 1);
  }

  console.log('--- backups list ---');
  const bl = await api('GET', `/backups?sessionId=${claudeId}`);
  check('backups listed for claude fixture', bl.ok && bl.backups.length >= 1, JSON.stringify(bl).slice(0, 200));
} finally {
  for (const p of cleanupPaths) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  try { fs.rmdirSync(claudeDir); } catch { /* ignore */ }
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
