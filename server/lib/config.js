import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULTS = {
  defaultVisibleCount: 10, // how many recent timeline rows to show on open
};

function configPath() {
  return path.join(os.homedir(), '.claude-code-ui', 'plugin-data', 'session-branch', 'config.json');
}

export function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(partial) {
  const config = loadConfig();
  if (partial && partial.defaultVisibleCount !== undefined) {
    const n = Number(partial.defaultVisibleCount);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      throw new Error('默认显示条数必须是 1-1000 的整数');
    }
    config.defaultVisibleCount = n;
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  return config;
}
