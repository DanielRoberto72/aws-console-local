import { createAwsClients, createEmulatorAgent, createProbeAgent } from './aws/clients.js';
import { probeEmulator } from './aws/emulatorProbe.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';

const config = loadConfig();
const db = createPool(config.databaseUrl);
await migrate(db);

const agent = createEmulatorAgent();
const probeAgent = createProbeAgent();
const { app, sync, forwarding } = await buildApp({
  db,
  clients: createAwsClients(config.emulatorEndpoint, config.region, agent),
  emulatorEndpoint: config.emulatorEndpoint,
  region: config.region,
  emulatorAgent: agent,
  probe: () => probeEmulator(config.emulatorEndpoint, probeAgent),
  syncIntervalMs: config.syncIntervalMs,
  webDistDir: config.webDistDir,
  forwarding: config.forwardPorts ? { ports: config.forwardPorts, listenHost: config.host } : undefined,
});

const shutdown = async () => {
  sync.stop();
  await forwarding?.stop();
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: config.host, port: config.port });
sync.start();
forwarding?.start();
