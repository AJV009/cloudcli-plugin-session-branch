// Sync the plugin source into the local CloudCLI plugins directory for dev.
// Usage: node scripts/sync-to-plugins.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(os.homedir(), '.claude-code-ui', 'plugins', 'session-branch');

// The dir can be locked while the host has the plugin subprocess running
// (its cwd lives here on Windows) — fall back to overwrite-copy in that case.
try {
  fs.rmSync(dest, { recursive: true, force: true });
} catch {
  console.log('Target directory is in use; skipping the wipe and copying over it instead (deleted files will not be cleaned up)');
}
fs.cpSync(src, dest, {
  recursive: true,
  force: true,
  filter: (p) => !p.includes('.git') && !p.includes('node_modules'),
});
console.log(`synced -> ${dest}`);
console.log('Frontend changes take effect by switching away from the plugin tab and back. Backend changes need a disable/enable in Settings > Plugins to restart the child process.');
