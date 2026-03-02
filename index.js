#!/usr/bin/env node

const MCPMySQLServer = require('./src/server');

const server = new MCPMySQLServer();

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

server.start();
