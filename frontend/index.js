// session-branch plugin frontend — vanilla ES module, no build step.
// Contract: export mount(container, api) / unmount(container).

const STYLE_ID = 'session-branch-style';
const DEFAULT_VISIBLE_COUNT = 10;

const CSS = `
.sbr-root { height: 100%; overflow: auto; font-size: 13px; line-height: 1.5;
  background: var(--sbr-bg); color: var(--sbr-fg); padding: 16px; box-sizing: border-box; }
.sbr-root * { box-sizing: border-box; }
.sbr-light { --sbr-bg: #ffffff; --sbr-fg: #1f2328; --sbr-muted: #6b7280; --sbr-border: #e5e7eb;
  --sbr-card: #f9fafb; --sbr-accent: #2563eb; --sbr-accent-bg: #eff6ff; --sbr-danger: #dc2626;
  --sbr-danger-bg: #fef2f2; --sbr-ok: #16a34a; --sbr-ok-bg: #f0fdf4; }
.sbr-dark { --sbr-bg: #0d1117; --sbr-fg: #e6edf3; --sbr-muted: #8b949e; --sbr-border: #30363d;
  --sbr-card: #161b22; --sbr-accent: #58a6ff; --sbr-accent-bg: #121d2f; --sbr-danger: #f85149;
  --sbr-danger-bg: #2d1416; --sbr-ok: #3fb950; --sbr-ok-bg: #122117; }
.sbr-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.sbr-title { font-size: 15px; font-weight: 600; }
.sbr-sub { color: var(--sbr-muted); font-size: 12px; word-break: break-all; }
.sbr-btn { border: 1px solid var(--sbr-border); background: var(--sbr-card); color: var(--sbr-fg);
  border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
.sbr-btn:hover { border-color: var(--sbr-accent); color: var(--sbr-accent); }
.sbr-btn-danger:hover { border-color: var(--sbr-danger); color: var(--sbr-danger); }
.sbr-btn-primary { background: var(--sbr-accent); border-color: var(--sbr-accent); color: #fff; }
.sbr-btn-primary:hover { color: #fff; opacity: .9; }
.sbr-banner { border: 1px solid; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 12px; }
.sbr-banner-warn { border-color: var(--sbr-danger); background: var(--sbr-danger-bg); color: var(--sbr-danger); }
.sbr-banner-ok { border-color: var(--sbr-ok); background: var(--sbr-ok-bg); color: var(--sbr-ok); }
.sbr-banner-err { border-color: var(--sbr-danger); background: var(--sbr-danger-bg); color: var(--sbr-danger); }
.sbr-banner .sbr-btn { margin-left: 8px; }
.sbr-empty { color: var(--sbr-muted); padding: 48px 0; text-align: center; }
.sbr-list { display: flex; flex-direction: column; gap: 6px; max-width: 880px; }
.sbr-item { border: 1px solid var(--sbr-border); border-radius: 8px; padding: 8px 12px; background: var(--sbr-card); }
.sbr-item-user { border-left: 3px solid var(--sbr-accent); }
.sbr-item-dim { opacity: .65; }
.sbr-item-row { display: flex; align-items: baseline; gap: 8px; }
.sbr-role { font-size: 11px; font-weight: 600; flex-shrink: 0; width: 64px; }
.sbr-role-user { color: var(--sbr-accent); }
.sbr-role-assistant { color: var(--sbr-muted); }
.sbr-role-tool { color: var(--sbr-muted); }
.sbr-text { white-space: pre-wrap; word-break: break-word; flex: 1; }
.sbr-time { color: var(--sbr-muted); font-size: 11px; flex-shrink: 0; }
.sbr-actions { display: flex; gap: 6px; margin-top: 6px; }
.sbr-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex;
  align-items: center; justify-content: center; z-index: 9999; }
.sbr-dialog { background: var(--sbr-bg); color: var(--sbr-fg); border: 1px solid var(--sbr-border);
  border-radius: 12px; padding: 20px; width: min(520px, 90vw); max-height: 80vh; overflow: auto; }
.sbr-dialog h3 { margin: 0 0 8px; font-size: 14px; }
.sbr-dialog p { margin: 6px 0; font-size: 12px; color: var(--sbr-muted); }
.sbr-quote { border-left: 3px solid var(--sbr-border); padding: 4px 8px; margin: 8px 0;
  font-size: 12px; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow: auto; }
.sbr-dialog-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.sbr-radio { display: block; margin: 6px 0; font-size: 12px; cursor: pointer; }
.sbr-section { margin-top: 20px; max-width: 880px; }
.sbr-section summary { cursor: pointer; color: var(--sbr-muted); font-size: 12px; }
.sbr-backup { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 12px;
  border-bottom: 1px solid var(--sbr-border); }
.sbr-more-wrap { text-align: center; margin-bottom: 6px; }
.sbr-field { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 12px; }
.sbr-input { border: 1px solid var(--sbr-border); background: var(--sbr-card); color: var(--sbr-fg);
  border-radius: 6px; padding: 4px 8px; font-size: 12px; width: 90px; }
.sbr-spin { color: var(--sbr-muted); padding: 24px 0; text-align: center; }
`;

const states = new WeakMap();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmtTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

async function rpc(state, method, path, body) {
  const result = await state.api.rpc(method, path, body);
  if (result && result.ok === false) {
    throw new Error(result.error || 'Operation failed');
  }
  return result;
}

function scrollToBottom(state) {
  requestAnimationFrame(() => {
    state.root.scrollTop = state.root.scrollHeight;
  });
}

async function load(state) {
  const session = state.api.context.session;
  const project = state.api.context.project;
  state.data = null;
  state.error = null;
  state.result = null;
  if (!session) {
    render(state);
    return;
  }
  state.loading = true;
  render(state);
  try {
    if (!state.config) {
      try {
        state.config = (await rpc(state, 'GET', '/config')).config;
      } catch {
        state.config = { defaultVisibleCount: DEFAULT_VISIBLE_COUNT };
      }
    }
    const qs = `sessionId=${encodeURIComponent(session.id)}&projectPath=${encodeURIComponent(project ? project.path : '')}`;
    state.data = await rpc(state, 'GET', `/messages?${qs}`);
    state.backups = (await rpc(state, 'GET', `/backups?sessionId=${encodeURIComponent(session.id)}`)).backups;
    state.visibleCount = state.config.defaultVisibleCount || DEFAULT_VISIBLE_COUNT;
  } catch (err) {
    state.error = err.message || String(err);
  } finally {
    state.loading = false;
    render(state);
    scrollToBottom(state);
  }
}

async function doRewind(state, item) {
  const session = state.api.context.session;
  const project = state.api.context.project;
  state.busy = true;
  render(state);
  try {
    const result = await rpc(state, 'POST', '/rewind', {
      sessionId: session.id,
      projectPath: project ? project.path : '',
      turnStartIndex: item.turnStartIndex,
      fingerprint: state.data.fingerprint,
    });
    state.confirm = null;
    state.result = {
      kind: 'rewind',
      backupId: result.backupId,
      text: `Rewound: removed ${result.removedLines} lines. Switch to another session and back (or reload the page), then re-send your corrected message.`,
    };
    await load(state);
  } catch (err) {
    state.confirm = null;
    state.error = err.message || String(err);
  } finally {
    state.busy = false;
    render(state);
  }
}

async function doFork(state, item, mode) {
  const session = state.api.context.session;
  const project = state.api.context.project;
  state.busy = true;
  render(state);
  try {
    const cutIndex = mode === 'after' ? item.nextTurnStartIndex : item.turnStartIndex;
    const result = await rpc(state, 'POST', '/fork', {
      sessionId: session.id,
      projectPath: project ? project.path : '',
      cutIndex,
      fingerprint: state.data.fingerprint,
    });
    state.confirm = null;
    state.result = {
      kind: 'fork',
      text: `Branch created (new session ${result.newSessionId}). It appears in the session list on the left within about 10 seconds — open it to carry on. The original session is unaffected.`,
    };
  } catch (err) {
    state.confirm = null;
    state.error = err.message || String(err);
  } finally {
    state.busy = false;
    render(state);
  }
}

async function doRestore(state, backupId) {
  state.busy = true;
  render(state);
  try {
    await rpc(state, 'POST', '/restore', { backupId });
    state.result = { kind: 'restore', text: 'Session file restored from backup. Switch sessions or reload the page to see it.' };
    await load(state);
  } catch (err) {
    state.error = err.message || String(err);
  } finally {
    state.busy = false;
    render(state);
  }
}

function renderConfirm(state) {
  const { item, action } = state.confirm;
  const overlay = el('div', 'sbr-overlay');
  const dialog = el('div', 'sbr-dialog');

  const removedRows = state.data.items.filter((it) => it.lineIndex >= item.turnStartIndex).length;
  const keptRows = state.data.items.length - removedRows;

  if (action === 'rewind') {
    dialog.appendChild(el('h3', '', 'Rewind to here'));
    dialog.appendChild(el('p', '', `This removes this message and everything after it (${removedRows} entries), keeping the ${keptRows} before it. The original file is backed up first and can be restored at any time.`));
    const quote = el('div', 'sbr-quote', item.text);
    dialog.appendChild(quote);
    if (state.data.activeRisk) {
      dialog.appendChild(el('div', 'sbr-banner sbr-banner-warn', '⚠ This session was written to in the last minute and may be running a task. Make sure no conversation is in progress before continuing.'));
    }
    const btns = el('div', 'sbr-dialog-btns');
    const cancel = el('button', 'sbr-btn', 'Cancel');
    cancel.onclick = () => { state.confirm = null; render(state); };
    const ok = el('button', 'sbr-btn sbr-btn-primary', state.busy ? 'Working…' : 'Confirm rewind');
    ok.disabled = state.busy;
    ok.onclick = () => doRewind(state, item);
    btns.append(cancel, ok);
    dialog.appendChild(btns);
  } else {
    dialog.appendChild(el('h3', '', 'Branch from here'));
    dialog.appendChild(el('p', '', 'Copies the full context into a new session. The original is unaffected. Choose what the branch includes:'));
    const quote = el('div', 'sbr-quote', item.text);
    dialog.appendChild(quote);

    let mode = 'after';
    const mkRadio = (value, label) => {
      const wrap = el('label', 'sbr-radio');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'sbr-fork-mode';
      input.checked = value === mode;
      input.onchange = () => { mode = value; };
      wrap.append(input, document.createTextNode(' ' + label));
      return wrap;
    };
    dialog.appendChild(mkRadio('after', 'Include this message and its reply (continue after it)'));
    dialog.appendChild(mkRadio('before', 'Exclude this message (return to the state before it was sent)'));

    const btns = el('div', 'sbr-dialog-btns');
    const cancel = el('button', 'sbr-btn', 'Cancel');
    cancel.onclick = () => { state.confirm = null; render(state); };
    const ok = el('button', 'sbr-btn sbr-btn-primary', state.busy ? 'Working…' : 'Create branch');
    ok.disabled = state.busy;
    ok.onclick = () => doFork(state, item, mode);
    btns.append(cancel, ok);
    dialog.appendChild(btns);
  }

  overlay.appendChild(dialog);
  overlay.onclick = (event) => {
    if (event.target === overlay && !state.busy) {
      state.confirm = null;
      render(state);
    }
  };
  return overlay;
}

function renderSettings(state) {
  const overlay = el('div', 'sbr-overlay');
  const dialog = el('div', 'sbr-dialog');
  dialog.appendChild(el('h3', '', 'Plugin settings'));

  const field = el('label', 'sbr-field');
  field.appendChild(document.createTextNode('Recent messages shown by default'));
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '1000';
  input.className = 'sbr-input';
  input.value = String(state.config ? state.config.defaultVisibleCount : DEFAULT_VISIBLE_COUNT);
  field.appendChild(input);
  dialog.appendChild(field);
  dialog.appendChild(el('p', '', 'Earlier messages can be expanded at any time with the "Show earlier messages" button at the top of the list.'));

  const errorBox = el('p', '');
  errorBox.style.color = 'var(--sbr-danger)';
  dialog.appendChild(errorBox);

  const btns = el('div', 'sbr-dialog-btns');
  const cancel = el('button', 'sbr-btn', 'Cancel');
  cancel.onclick = () => { state.settingsOpen = false; render(state); };
  const save = el('button', 'sbr-btn sbr-btn-primary', 'Save');
  save.onclick = async () => {
    save.disabled = true;
    try {
      const result = await rpc(state, 'POST', '/config', { defaultVisibleCount: Number(input.value) });
      state.config = result.config;
      state.visibleCount = state.config.defaultVisibleCount;
      state.settingsOpen = false;
      render(state);
      scrollToBottom(state);
    } catch (err) {
      errorBox.textContent = err.message || String(err);
      save.disabled = false;
    }
  };
  btns.append(cancel, save);
  dialog.appendChild(btns);

  overlay.appendChild(dialog);
  overlay.onclick = (event) => {
    if (event.target === overlay) {
      state.settingsOpen = false;
      render(state);
    }
  };
  return overlay;
}

function render(state) {
  const root = state.root;
  root.className = `sbr-root ${state.api.context.theme === 'dark' ? 'sbr-dark' : 'sbr-light'}`;
  root.replaceChildren();

  const session = state.api.context.session;

  const head = el('div', 'sbr-head');
  head.appendChild(el('div', 'sbr-title', 'Session Branch & Rewind'));
  if (session && state.data) {
    head.appendChild(el('div', 'sbr-sub', `${session.title || session.id} · ${state.data.provider}`));
  }
  const refresh = el('button', 'sbr-btn', 'Refresh');
  refresh.onclick = () => load(state);
  head.appendChild(refresh);
  const settingsBtn = el('button', 'sbr-btn', '⚙ Settings');
  settingsBtn.onclick = () => { state.settingsOpen = true; render(state); };
  head.appendChild(settingsBtn);
  root.appendChild(head);

  if (state.error) {
    root.appendChild(el('div', 'sbr-banner sbr-banner-err', state.error));
  }
  if (state.result) {
    const banner = el('div', 'sbr-banner sbr-banner-ok');
    banner.appendChild(document.createTextNode(state.result.text));
    if (state.result.kind === 'rewind' && state.result.backupId) {
      const undo = el('button', 'sbr-btn', 'Undo rewind');
      undo.onclick = () => doRestore(state, state.result.backupId);
      banner.appendChild(undo);
    }
    root.appendChild(banner);
  }

  if (!session) {
    root.appendChild(el('div', 'sbr-empty', 'Select a session on the left first (Claude / Codex sessions only).'));
    return;
  }
  if (state.loading) {
    root.appendChild(el('div', 'sbr-spin', 'Loading…'));
    return;
  }
  if (!state.data) return;

  if (state.data.activeRisk) {
    root.appendChild(el('div', 'sbr-banner sbr-banner-warn', '⚠ This session was written to in the last minute and may be running a task. Acting on a running session is risky.'));
  }

  const allItems = state.data.items;
  const visibleCount = state.visibleCount || DEFAULT_VISIBLE_COUNT;
  const startIndex = Math.max(0, allItems.length - visibleCount);

  const list = el('div', 'sbr-list');
  if (startIndex > 0) {
    const moreWrap = el('div', 'sbr-more-wrap');
    const moreBtn = el('button', 'sbr-btn', `Show ${startIndex} earlier messages`);
    moreBtn.onclick = () => {
      const prevHeight = state.root.scrollHeight;
      const prevTop = state.root.scrollTop;
      state.visibleCount = allItems.length;
      render(state);
      // keep the viewport anchored on what the user was looking at
      requestAnimationFrame(() => {
        state.root.scrollTop = state.root.scrollHeight - prevHeight + prevTop;
      });
    };
    moreWrap.appendChild(moreBtn);
    list.appendChild(moreWrap);
  }
  for (const item of allItems.slice(startIndex)) {
    const card = el('div', `sbr-item${item.role === 'user' && item.isCandidate ? ' sbr-item-user' : ' sbr-item-dim'}`);
    const row = el('div', 'sbr-item-row');
    const roleLabel = item.role === 'user' ? 'User' : item.role === 'assistant' ? 'Assistant' : 'Tool';
    row.appendChild(el('span', `sbr-role sbr-role-${item.role}`, roleLabel));
    const text = item.role === 'tool'
      ? `${item.text}${item.count > 1 ? ` ×${item.count}` : ''}`
      : item.text;
    row.appendChild(el('span', 'sbr-text', text));
    row.appendChild(el('span', 'sbr-time', fmtTime(item.timestamp)));
    card.appendChild(row);

    if (item.isCandidate) {
      const actions = el('div', 'sbr-actions');
      const rewindBtn = el('button', 'sbr-btn sbr-btn-danger', '⟲ Rewind to here');
      rewindBtn.onclick = () => { state.confirm = { item, action: 'rewind' }; render(state); };
      const forkBtn = el('button', 'sbr-btn', '⑂ Branch from here');
      forkBtn.onclick = () => { state.confirm = { item, action: 'fork' }; render(state); };
      actions.append(rewindBtn, forkBtn);
      card.appendChild(actions);
    }
    list.appendChild(card);
  }
  if (state.data.items.length === 0) {
    root.appendChild(el('div', 'sbr-empty', 'This session has no messages to show.'));
  }
  root.appendChild(list);
  if (state.backups && state.backups.length > 0) {
    const section = document.createElement('details');
    section.className = 'sbr-section';
    const summary = el('summary', '', `Backups (${state.backups.length})`);
    section.appendChild(summary);
    for (const backup of state.backups) {
      const row = el('div', 'sbr-backup');
      row.appendChild(el('span', '', `${backup.createdAt || backup.backupId} · ${backup.action || ''}`));
      const restoreBtn = el('button', 'sbr-btn', 'Restore this backup');
      restoreBtn.onclick = () => doRestore(state, backup.backupId);
      row.appendChild(restoreBtn);
      section.appendChild(row);
    }
    root.appendChild(section);
  }

  if (state.confirm) {
    root.appendChild(renderConfirm(state));
  }
  if (state.settingsOpen) {
    root.appendChild(renderSettings(state));
  }
}

export function mount(container, api) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = el('div');
  container.replaceChildren(root);

  const state = {
    api,
    root,
    loading: false,
    busy: false,
    data: null,
    backups: null,
    error: null,
    result: null,
    confirm: null,
    config: null,
    visibleCount: DEFAULT_VISIBLE_COUNT,
    settingsOpen: false,
    unsubscribe: null,
  };
  states.set(container, state);

  let lastSessionId = api.context.session ? api.context.session.id : null;
  state.unsubscribe = api.onContextChange((ctx) => {
    const nextId = ctx.session ? ctx.session.id : null;
    if (nextId !== lastSessionId) {
      lastSessionId = nextId;
      load(state);
    } else {
      render(state); // theme change etc.
    }
  });

  load(state);
}

export function unmount(container) {
  const state = states.get(container);
  if (state) {
    if (state.unsubscribe) {
      try { state.unsubscribe(); } catch { /* ignore */ }
    }
    states.delete(container);
  }
  container.replaceChildren();
}
