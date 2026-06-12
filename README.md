# session-branch — CloudCLI 会话分支与回退插件

在任意用户消息处**回退（rewind）**或**分支（fork）** Claude / Codex 会话。

- **回退**：说错了一句话？撤回这条消息及之后的全部内容，回到发送前的状态，重新发送即可。原文件自动备份，可一键撤销。
- **分支**：在某条消息处复制一份完整上下文为新会话，原会话不受影响，可以在分支里问别的事情。

## 支持范围

| Provider | 回退 | 分支 | 说明 |
|---|---|---|---|
| Claude | ✅ | ✅ | `~/.claude/projects/**/<sessionId>.jsonl` |
| Codex | ✅ | ✅ | `~/.codex/sessions/**/rollout-*.jsonl` |
| Cursor / OpenCode / Gemini | ❌ | ❌ | 存储格式不支持安全改写 |

## 安装

在 CloudCLI 的 Settings → Plugins → Install from Git URL 输入本仓库地址。

## 使用

1. 在左侧选中一个 Claude / Codex 会话
2. 切换到顶部的「会话分支」Tab
3. 在消息时间线中找到目标用户消息，点「回退到此处」或「从此处分支」
4. 回退后：切换会话再切回（或刷新页面），重新发送修正后的消息
5. 分支后：新会话约 10 秒内自动出现在左侧会话列表

## 安全设计

- 所有写操作前全量备份到 `~/.claude-code-ui/plugin-data/session-branch/backups/`，备份保留 30 天，支持一键恢复
- 永不删除会话文件（回退 = 备份 + 原子重写；分支 = 新建文件）
- 文件指纹乐观锁：会话在操作期间被写入会被拦截
- sessionId 白名单校验 + realpath 前缀校验，文件操作仅限 `~/.claude/projects`、`~/.codex/sessions` 与备份目录
- 会话一分钟内有写入时界面会显示"可能正在运行"警告

## 注意事项

- 请在会话**空闲时**操作（没有正在进行的对话）
- Codex 分支不会复制 `session_index.jsonl` 中的会话名称，新分支会以首条消息显示
- 回退后已打开的聊天界面不会自动刷新，需要重新进入会话
