/**
 * Cross-platform installer for all sub-packages
 */
const { existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const dirs = ['contracts', 'shared', 'scripts', 'backend', 'core', 'web'];

console.log('--- Installing dependencies across TrustMesh sub-packages ---');
for (const dir of dirs) {
  const pkgPath = path.join(__dirname, '..', dir, 'package.json');
  if (existsSync(pkgPath)) {
    console.log(`\n>>> Installing in /${dir}...`);
    try {
      execSync(`npm --prefix ${dir} install`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`Failed to install in ${dir}:`, err.message);
      process.exit(1);
    }
  } else {
    console.log(`\n(Skipping /${dir}: not created yet)`);
  }
}
console.log('\n--- All existing packages installed successfully ---');
