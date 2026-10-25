/**
 * Wait for local chain RPC, then deploy and seed
 */
const http = require('http');
const { execSync } = require('child_process');

async function isRpcReady(url = 'http://127.0.0.1:8545') {
  return new Promise((resolve) => {
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 1000,
      },
      (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 400);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }));
    req.end();
  });
}

async function main() {
  console.log('[orchestrator] Waiting for Hardhat node to come up on port 8545...');
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await isRpcReady();
    if (ready) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!ready) {
    console.error('[orchestrator] Hardhat node did not respond within 40s.');
    process.exit(1);
  }

  console.log('[orchestrator] Hardhat node is ready! Running deploy & bootstrap...');
  try {
    execSync('npm --prefix scripts run deploy', { stdio: 'inherit' });
    console.log('[orchestrator] Deploy completed! Running credential seed...');
    execSync('npm --prefix scripts run seed', { stdio: 'inherit' });
    console.log('[orchestrator] Deploy and seeding completed successfully!');
  } catch (err) {
    console.warn('[orchestrator] Note: Seeding may succeed after core lands:', err.message);
  }

  // Keep alive so concurrently doesn't trigger shutdown if -k is set
  setInterval(() => {}, 60000);
}


main().catch((err) => {
  console.error('[orchestrator] Error:', err);
});
