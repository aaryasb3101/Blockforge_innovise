/**
 * Run web dev server if web/package.json exists, otherwise idle cleanly
 */
const { existsSync } = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const webPkg = path.join(__dirname, '..', 'web', 'package.json');
if (existsSync(webPkg)) {
  console.log('[web] Starting web dev server...');
  const child = spawn('npm', ['--prefix', 'web', 'run', 'dev'], {
    shell: true,
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code || 0));
} else {
  console.log('[web] /web directory not landed yet. Standing by...');
  // Keep alive so concurrently doesn't trigger shutdown if -k is set
  setInterval(() => {}, 60000);
}
