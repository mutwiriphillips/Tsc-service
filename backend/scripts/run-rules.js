/* eslint-disable no-console */
/**
 * Scheduled compliance scan. Run nightly (cron, systemd timer or the host's scheduler):
 *   0 2 * * *  cd /srv/tsc-tmgs/backend && npm run rules:run
 */
const prisma = require('../src/lib/prisma');
const { runRules } = require('../src/rules/runner');

runRules()
  .then((summary) => console.log('Rules run complete:', JSON.stringify(summary)))
  .catch((e) => {
    console.error('Rules run failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
