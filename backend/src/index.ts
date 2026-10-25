import { buildServer } from './server.js';
import { config } from './config.js';
import { indexer } from './services/indexer.js';
import { snapshotService } from './services/snapshot.js';

async function main() {
  const server = await buildServer();

  try {
    await server.listen({ port: config.port, host: config.host });
    console.log(`TrustMesh backend running at http://${config.host}:${config.port}`);
    console.log(`Interactive API documentation at http://${config.host}:${config.port}/docs`);

    // Start background indexer
    await indexer.start();

    // Start periodic snapshot publisher if publisher key exists
    snapshotService.startPeriodicPublisher();
  } catch (err) {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
}

main();
