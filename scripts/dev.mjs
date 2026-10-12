import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  UNDERSTOOD_TIER: 'local',
  UNDERSTOOD_AI_MODE: 'synthetic',
  UNDERSTOOD_ACCESS_MODE: 'demo',
};
const children = [];

function stop() {
  for (const child of children) child.kill();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

function start(args, ipc = false) {
  const child = spawn(process.execPath, args, { stdio: ipc ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit', env });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); stop(); process.exitCode = 1; });
  child.on('exit', (code) => { if (code) { stop(); process.exitCode = code; } });
  return child;
}

const api = start(['server/index.mjs'], true);
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API startup timed out')), 15000);
    api.once('message', (message) => { clearTimeout(timer); message?.type === 'ready' ? resolve() : reject(new Error('API startup failed')); });
    api.once('exit', () => { clearTimeout(timer); reject(new Error('API exited before readiness')); });
    api.once('error', () => { clearTimeout(timer); reject(new Error('API could not start')); });
  });
  start(['server/worker.mjs']);
  start(['node_modules/vite/bin/vite.js']);
} catch (error) { console.error(error.message); stop(); process.exitCode = 1; }
