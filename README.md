# session-branch — Session Branching & Rewind Plugin for CloudCLI

**English** | [简体中文](./README.zh-CN.md)

**Rewind** or **fork** Claude / Codex sessions at any user message.

- **Rewind**: said something wrong? Retract that message and everything after it, returning to the state right before it was sent — then just resend. The original file is backed up automatically and can be restored with one click.
- **Fork**: copy the full context at any message into a new session. The original session is untouched, so you can explore a different direction in the branch.

## Supported Providers

| Provider | Rewind | Fork | Storage |
|---|---|---|---|
| Claude | ✅ | ✅ | `~/.claude/projects/**/<sessionId>.jsonl` |
| Codex | ✅ | ✅ | `~/.codex/sessions/**/rollout-*.jsonl` |
| Cursor / OpenCode / Gemini | ❌ | ❌ | Storage formats are not safe to rewrite |

## Installation

In CloudCLI, go to **Settings → Plugins → Install from Git URL** and enter this repository's URL:

```
https://github.com/pipipigu/cloudcli-plugin-session-branch
```

## Usage

1. Select a Claude / Codex session in the sidebar
2. Switch to the **Session Branch** tab at the top
3. The timeline shows the most recent messages (default 10, configurable via the ⚙ Settings button) and scrolls to the bottom; click "Show earlier messages" to expand
4. Find the target user message and click **Rewind to here** or **Fork from here**
5. After a rewind: switch away from the session and back (or refresh the page), then resend your corrected message
6. After a fork: the new session appears in the sidebar within ~10 seconds

## Safety Design

- Every write operation is preceded by a full backup to `~/.claude-code-ui/plugin-data/session-branch/backups/`; backups are kept for 30 days and can be restored with one click
- Session files are never deleted (rewind = backup + atomic rewrite; fork = new file)
- Optimistic locking via file fingerprints: operations are blocked if the session is written to concurrently
- sessionId allowlist validation + realpath containment checks; file operations are restricted to `~/.claude/projects`, `~/.codex/sessions`, and the backup directory
- A "possibly running" warning is shown when the session was written to within the last minute

## Notes

- Operate on **idle** sessions only (no conversation in progress)
- Codex forks do not copy the session name from `session_index.jsonl`; the new branch will be titled by its first message
- An already-open chat view does not refresh automatically after a rewind — re-enter the session
