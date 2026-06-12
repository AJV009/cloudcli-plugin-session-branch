// Sync the plugin source into the local CloudCLI plugins directory for dev.
// Usage: node scripts/sync-to-plugins.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(os.homedir(), '.claude-code-ui', 'plugins', 'session-branch');

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (p) => !p.includes('.git') && !p.includes('node_modules'),
});
console.log(`synced -> ${dest}`);
console.log('前端改动：切出/切回插件 Tab 即生效；后端改动：在 Settings → Plugins 中 disable→enable 重启子进程。');
