const crypto = require('crypto');
const prisma = require('./prisma');

const GENESIS = 'GENESIS';
// Any fixed 64-bit number works; it serialises writers to the hash chain.
const AUDIT_LOCK_ID = 7340291;

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(',')}}`;
}

function computeHash(prevHash, e) {
  const body = canonical({
    at: e.at.toISOString(),
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    detail: e.detail ?? null,
  });
  return crypto.createHash('sha256').update(`${prevHash}|${body}`).digest('hex');
}

/**
 * Append one event to the audit trail. Pass `tx` to make the audit write part of
 * the same transaction as the change it records — if either fails, neither lands.
 */
async function record(tx, { actorType, actorId, action, entityType, entityId, detail }) {
  const run = async (client) => {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_ID})`;
    const last = await client.auditEvent.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last ? last.hash : GENESIS;
    const event = {
      at: new Date(),
      actorType,
      actorId: actorId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      // Round-trip through JSON so the hashed form equals what JSONB stores (Dates → strings).
      detail: detail == null ? null : JSON.parse(JSON.stringify(detail)),
    };
    const hash = computeHash(prevHash, event);
    return client.auditEvent.create({ data: { ...event, detail: event.detail ?? undefined, prevHash, hash } });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/** Recompute the whole chain; returns the first broken link, if any. */
async function verifyChain() {
  let prevHash = GENESIS;
  let checked = 0;
  let cursor;
  for (;;) {
    const batch = await prisma.auditEvent.findMany({
      orderBy: { id: 'asc' },
      take: 1000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!batch.length) break;
    for (const e of batch) {
      if (e.prevHash !== prevHash || computeHash(prevHash, e) !== e.hash) {
        return { valid: false, checked, brokenAt: e.id.toString() };
      }
      prevHash = e.hash;
      checked += 1;
    }
    cursor = batch[batch.length - 1].id;
  }
  return { valid: true, checked };
}

/** Helper: actor fields from a request. */
function actorOf(req) {
  if (req.officer) return { actorType: 'OFFICER', actorId: req.officer.id };
  if (req.teacher) return { actorType: 'TEACHER', actorId: req.teacher.id };
  return { actorType: 'SYSTEM', actorId: null };
}

module.exports = { record, verifyChain, actorOf, computeHash, GENESIS };
