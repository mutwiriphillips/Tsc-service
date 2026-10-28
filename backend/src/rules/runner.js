/**
 * Loads data, runs every scan rule, and reconciles ComplianceFlag rows:
 *  - new findings are raised,
 *  - existing ones are refreshed (an OVERRIDDEN flag stays overridden),
 *  - OPEN flags that no longer apply are marked RESOLVED.
 */
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { loadRuleConfig } = require('./config');
const E = require('./engine');

const SCAN_RULES = [E.RULES.REGISTRATION_GATE, E.RULES.APPRAISAL_CYCLE, E.RULES.ACTING_LIMIT, E.RULES.STAFFING_NORMS, E.RULES.CASE_TIMELINES];

async function evaluate({ schoolIds, now = new Date() } = {}) {
  const cfg = await loadRuleConfig();
  const schoolFilter = schoolIds ? { id: { in: schoolIds } } : {};

  const schools = await prisma.school.findMany({
    where: schoolFilter,
    select: {
      id: true,
      name: true,
      establishment: true,
      postings: { where: { status: 'ACTIVE' }, include: { teacher: true } },
    },
  });

  const postings = schools.flatMap((s) => s.postings);
  const shaped = schools.map((s) => ({
    id: s.id,
    name: s.name,
    establishment: s.establishment,
    substantiveCount: s.postings.filter((p) => p.type === 'SUBSTANTIVE').length,
    activeTeacherIds: [...new Set(s.postings.map((p) => p.teacherId))],
  }));

  const { upcoming, previous } = E.termWindows(cfg['appraisal.termDeadlines'], now);
  const teacherIds = [...new Set(postings.map((p) => p.teacherId))];
  const returns = teacherIds.length
    ? await prisma.appraisalReturn.findMany({
        where: {
          teacherId: { in: teacherIds },
          complete: true,
          OR: [
            { year: upcoming.year, term: upcoming.term },
            { year: previous.year, term: previous.term },
          ],
        },
        select: { teacherId: true, year: true, term: true },
      })
    : [];
  const submitted = new Set(returns.map((r) => `${r.teacherId}:${r.year}:${r.term}`));

  const cases = await prisma.disciplinaryCase.findMany({
    where: { status: 'OPEN', ...(schoolIds ? { schoolId: { in: schoolIds } } : {}) },
  });

  return [
    ...E.evaluateRegistration(postings),
    ...E.evaluateAppraisal(shaped, submitted, cfg, now),
    ...E.evaluateActing(postings, cfg, now),
    ...E.evaluateStaffing(shaped, cfg),
    ...E.evaluateCases(cases, cfg, now),
  ];
}

async function runRules({ schoolIds, now = new Date(), actor = { actorType: 'SYSTEM', actorId: null } } = {}) {
  const findings = await evaluate({ schoolIds, now });
  const keys = new Set(findings.map((f) => f.dedupeKey));
  let raised = 0;
  let refreshed = 0;

  for (const f of findings) {
    const existing = await prisma.complianceFlag.findUnique({ where: { dedupeKey: f.dedupeKey } });
    const data = {
      rule: f.rule,
      severity: f.severity,
      label: f.label,
      message: f.message,
      schoolId: f.schoolId ?? null,
      teacherId: f.teacherId ?? null,
      entityType: f.entityType,
      entityId: String(f.entityId),
    };
    if (!existing) {
      await prisma.complianceFlag.create({ data: { ...data, dedupeKey: f.dedupeKey } });
      raised += 1;
    } else {
      const reopen = existing.status === 'RESOLVED' ? { status: 'OPEN', resolvedAt: null } : {};
      await prisma.complianceFlag.update({ where: { id: existing.id }, data: { ...data, ...reopen } });
      refreshed += 1;
    }
  }

  const stale = await prisma.complianceFlag.findMany({
    where: {
      status: 'OPEN',
      rule: { in: SCAN_RULES },
      ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
    },
    select: { id: true, dedupeKey: true },
  });
  const toResolve = stale.filter((s) => !keys.has(s.dedupeKey)).map((s) => s.id);
  if (toResolve.length) {
    await prisma.complianceFlag.updateMany({ where: { id: { in: toResolve } }, data: { status: 'RESOLVED', resolvedAt: now } });
  }

  const summary = { raised, refreshed, resolved: toResolve.length, findings: findings.length, scope: schoolIds ? schoolIds.length : 'all' };
  await audit.record(null, { ...actor, action: 'RULES_RUN', entityType: 'ComplianceFlag', detail: summary });
  return summary;
}

module.exports = { evaluate, runRules, SCAN_RULES };
