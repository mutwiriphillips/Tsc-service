/**
 * Built-in schedule for the compliance scan, so the system needs no external cron.
 *
 * Every hour while the API is running (and shortly after it starts), it checks
 * whether a scan has run in the last RULES_INTERVAL_HOURS (default 24). If not,
 * it claims the run inside a transaction holding a Postgres advisory lock and
 * writes a RULES_RUN_STARTED marker, so several API instances, or a restart
 * mid-check, never run the scan twice. Hosts that sleep when idle (such as
 * Render's free tier) simply catch up on the next wake-up.
 */
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { runRules } = require('./runner');

const LOCK_ID = 7340292;
const HOUR = 3600000;

function intervalHours() {
  const n = Number(process.env.RULES_INTERVAL_HOURS || 24);
  return Number.isFinite(n) && n >= 1 ? n : 24;
}

/** Returns true if this process claimed a due run. */
async function claimRun(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${LOCK_ID}) AS locked`;
    if (!locked) return false;
    const last = await tx.auditEvent.findFirst({
      where: { action: { in: ['RULES_RUN', 'RULES_RUN_STARTED'] }, actorType: 'SYSTEM' },
      orderBy: { id: 'desc' },
      select: { at: true },
    });
    if (last && now - last.at < intervalHours() * HOUR) return false;
    await audit.record(tx, { actorType: 'SYSTEM', action: 'RULES_RUN_STARTED', entityType: 'ComplianceFlag', detail: { trigger: 'schedule' } });
    return true;
  });
}

async function tick(log = console) {
  try {
    if (await claimRun()) {
      const summary = await runRules({ actor: { actorType: 'SYSTEM', actorId: null } });
      log.log(`Scheduled compliance scan complete: ${JSON.stringify(summary)}`);
    }
  } catch (e) {
    log.error('Scheduled compliance scan failed:', e.message || e);
  }
}

function startScheduler({ firstDelayMs = 30000, everyMs = HOUR } = {}) {
  if (process.env.RULES_SCHEDULER === 'off') return { stop() {} };
  const first = setTimeout(tick, firstDelayMs);
  const repeat = setInterval(tick, everyMs);
  first.unref();
  repeat.unref();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(repeat);
    },
  };
}

module.exports = { startScheduler, claimRun, tick };
