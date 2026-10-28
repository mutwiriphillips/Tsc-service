const env = require('./config/env');
const prisma = require('./lib/prisma');
const { createApp } = require('./app');
const { startScheduler } = require('./rules/scheduler');

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`TSC TMGS API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
const scheduler = startScheduler();

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  scheduler.stop();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
