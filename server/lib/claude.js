import { safeParse } from './jsonl.js';

const PREVIEW_LIMIT = 400;

// User lines whose text starts with these are host/CLI internals, not things
// the user typed — they cannot serve as rewind anchors.
const NON_CANDIDATE_PREFIXES = [
  '<system-reminder>',
  'Caveat:',
  '[Request interrupted',
  '<local-command-stdout>',
  '<local-command-caveat>',
];

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('\n');
  }
  return '';
}

function hasToolResult(content) {
  return Array.isArray(content) && content.some((p) => p && p.type === 'tool_result');
}

/**
 * Parse a Claude project JSONL into display items. Truncation candidates are
 * real user prompts: cutting at such a line always removes whole turns, so
 * tool_use/tool_result pairs are never split.
 */
export function parseClaudeMessages(lines, sessionId) {
  const items = [];

  const pushTool = (i, label, timestamp) => {
    const last = items[items.length - 1];
    if (last && last.role === 'tool') {
      last.count = (last.count || 1) + 1;
      return;
    }
    items.push({ lineIndex: i, role: 'tool', text: label, timestamp, isCandidate: false, count: 1 });
  };

  lines.forEach((line, i) => {
    const o = safeParse(line);
    if (!o) return;
    if (o.sessionId && sessionId && o.sessionId !== sessionId) return;

    if (o.type === 'user' && o.message && o.message.role === 'user') {
      if (o.isMeta || o.isSidechain || o.isCompactSummary) return;
      if (hasToolResult(o.message.content)) {
        pushTool(i, 'tool_result', o.timestamp || null);
        return;
      }

      let text = textFromContent(o.message.content).trim();
      let isCandidate = true;

      const cmdMatch = text.match(/<command-name>([^<]*)<\/command-name>/);
      if (cmdMatch) {
        const argsMatch = text.match(/<command-args>([^<]*)<\/command-args>/);
        text = `${cmdMatch[1].trim()} ${argsMatch ? argsMatch[1].trim() : ''}`.trim();
      } else if (!text || NON_CANDIDATE_PREFIXES.some((p) => text.startsWith(p))) {
        isCandidate = false;
      }
      if (!text) return;

      items.push({
        lineIndex: i,
        role: 'user',
        text: text.slice(0, PREVIEW_LIMIT),
        timestamp: o.timestamp || null,
        isCandidate,
        turnStartIndex: isCandidate ? i : undefined,
      });
      return;
    }

    if (o.type === 'assistant' && o.message) {
      const parts = Array.isArray(o.message.content) ? o.message.content : [];
      const text = parts
        .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text)
        .join('\n')
        .trim();
      const tools = parts.filter((p) => p && p.type === 'tool_use').map((p) => p.name);
      if (!text && tools.length === 0) return;
      if (!text) {
        pushTool(i, tools.join(', '), o.timestamp || null);
        return;
      }
      items.push({
        lineIndex: i,
        role: 'assistant',
        text: text.slice(0, PREVIEW_LIMIT),
        timestamp: o.timestamp || null,
        isCandidate: false,
      });
    }
  });

  const candidates = items.filter((it) => it.isCandidate);
  candidates.forEach((c, k) => {
    c.nextTurnStartIndex = k + 1 < candidates.length ? candidates[k + 1].turnStartIndex : lines.length;
  });

  return items;
}

/**
 * Keep lines[0, cutIndex), then drop summary lines whose leafUuid points at a
 * removed line (a dangling leafUuid confuses the CLI's resume path).
 */
export function truncateClaudeLines(lines, cutIndex) {
  const kept = lines.slice(0, cutIndex);
  const keptUuids = new Set();
  for (const line of kept) {
    const o = safeParse(line);
    if (o && o.uuid) keptUuids.add(o.uuid);
  }
  return kept.filter((line) => {
    const o = safeParse(line);
    if (o && o.type === 'summary' && o.leafUuid && !keptUuids.has(o.leafUuid)) return false;
    return true;
  });
}

/**
 * The host (and the CLI) select lines by `entry.sessionId === <file's id>`, so
 * a fork must rewrite the top-level sessionId on every line that carries one.
 * uuid/parentUuid chains stay untouched. Unparseable lines pass through as-is.
 */
export function rewriteClaudeSessionId(lines, newId) {
  return lines.map((line) => {
    const o = safeParse(line);
    if (o && typeof o === 'object' && !Array.isArray(o) && 'sessionId' in o) {
      o.sessionId = newId;
      return JSON.stringify(o);
    }
    return line;
  });
}
