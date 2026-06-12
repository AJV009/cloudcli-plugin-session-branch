import { safeParse } from './jsonl.js';

const PREVIEW_LIMIT = 400;

function textOfUserResponseItem(o) {
  if (!o || o.type !== 'response_item' || !o.payload) return null;
  if (o.payload.type !== 'message' || o.payload.role !== 'user') return null;
  const content = o.payload.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
  }
  return '';
}

/**
 * Find where a user turn actually starts in a rollout. Observed line order:
 *   event_msg/task_started → [response_item <environment_context> copy]
 *   → turn_context → response_item user-message copy → event_msg/user_message
 * Walking upward we absorb only the exact user-text copy, environment-context
 * copies, turn_context and task_started — never anything whose text differs
 * (so first-turn prefixes like AGENTS.md / permissions instructions survive).
 */
function computeTurnStart(parsed, umIndex) {
  const um = parsed[umIndex];
  const msgText = String(um.payload.message ?? '');
  let start = umIndex;
  let k = umIndex - 1;

  const copyText = textOfUserResponseItem(parsed[k]);
  if (copyText !== null && copyText === msgText) {
    start = k;
    k -= 1;
  }

  while (k >= 1) {
    const o = parsed[k];
    if (!o) break;
    const isTurnContext = o.type === 'turn_context';
    const isTaskStarted = o.type === 'event_msg' && o.payload && o.payload.type === 'task_started';
    const envText = textOfUserResponseItem(o);
    const isEnvContext = envText !== null && envText.trimStart().startsWith('<environment_context>');

    if (isTurnContext || isEnvContext) {
      start = k;
      k -= 1;
      continue;
    }
    if (isTaskStarted) {
      start = k;
      break;
    }
    break;
  }

  return start; // never 0: line 0 is session_meta and the k >= 1 guard protects it
}

export function parseCodexMessages(lines) {
  const parsed = lines.map(safeParse);
  const items = [];

  const pushTool = (i, label, timestamp) => {
    const last = items[items.length - 1];
    if (last && last.role === 'tool') {
      last.count = (last.count || 1) + 1;
      return;
    }
    items.push({ lineIndex: i, role: 'tool', text: label, timestamp, isCandidate: false, count: 1 });
  };

  parsed.forEach((o, i) => {
    if (!o) return;
    if (o.type === 'event_msg' && o.payload) {
      if (o.payload.type === 'user_message') {
        items.push({
          lineIndex: i,
          role: 'user',
          text: String(o.payload.message ?? '').slice(0, PREVIEW_LIMIT),
          timestamp: o.timestamp || null,
          isCandidate: true,
          turnStartIndex: computeTurnStart(parsed, i),
        });
      } else if (o.payload.type === 'agent_message') {
        items.push({
          lineIndex: i,
          role: 'assistant',
          text: String(o.payload.message ?? '').slice(0, PREVIEW_LIMIT),
          timestamp: o.timestamp || null,
          isCandidate: false,
        });
      }
      return;
    }
    if (o.type === 'response_item' && o.payload) {
      if (o.payload.type === 'function_call') {
        pushTool(i, o.payload.name || 'tool', o.timestamp || null);
      } else if (o.payload.type === 'web_search_call') {
        pushTool(i, 'web_search', o.timestamp || null);
      }
    }
  });

  const candidates = items.filter((it) => it.isCandidate);
  candidates.forEach((c, k) => {
    c.nextTurnStartIndex = k + 1 < candidates.length ? candidates[k + 1].turnStartIndex : lines.length;
  });

  return items;
}

export function truncateCodexLines(lines, cutIndex) {
  return lines.slice(0, cutIndex);
}

/**
 * Build a forked rollout: clone session_meta with the new id, keep everything
 * else verbatim. Codex resolves sessions by scanning for the id embedded in
 * the filename, so the name format must match `rollout-<stamp>-<id>.jsonl`.
 */
export function buildCodexFork(keptLines, newId, now = new Date()) {
  const first = safeParse(keptLines[0]);
  if (!first || first.type !== 'session_meta' || !first.payload) {
    throw new Error('Invalid rollout file: first line is not session_meta');
  }
  first.payload = { ...first.payload, id: newId };
  const iso = now.toISOString();
  if ('timestamp' in first) first.timestamp = iso;
  if ('timestamp' in first.payload) first.payload.timestamp = iso;

  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  return {
    lines: [JSON.stringify(first), ...keptLines.slice(1)],
    relDir: [String(now.getFullYear()), pad(now.getMonth() + 1), pad(now.getDate())],
    fileName: `rollout-${stamp}-${newId}.jsonl`,
  };
}
