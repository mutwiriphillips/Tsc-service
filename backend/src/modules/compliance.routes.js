/** Compliance flags, overrides, on-demand rule runs, and rule settings. */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, notFound, conflict, badRequest } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { schoolWhere, canSeeSensitive } = require('../lib/scope');
const { paging, pageResult } = require('../lib/paging');
const { runRules } = require('../rules/runner');
const { RULES } = require('../rules/engine');
const { validateWeights } = require('../score/engine');

const router = express.Router();

/** Case-timeline flags reveal disciplinary matters, so they follow the sensitive-data wall. */
function flagWhere(officer) {
  return {
    school: schoolWhere(officer),
    ...(canSeeSensitive(officer) ? {} : { rule: { not: RULES.CASE_TIMELINES } }),
  };
}

router.get(
  '/flags',
  ah(async (req, res) => {
    const pg = paging(req.query);
    const where = {
      AND: [
        flagWhere(req.officer),
        ['OPEN', 'RESOLVED', 'OVERRIDDEN'].includes(req.query.status) ? { status: req.query.status } : { status: 'OPEN' },
        req.query.rule ? { rule: String(req.query.rule) } : {},
        ['WARNING', 'BREACH'].includes(req.query.severity) ? { severity: req.query.severity } : {},
        req.query.schoolId ? { schoolId: String(req.query.schoolId) } : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.complianceFlag.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { raisedAt: 'asc' }],
        skip: pg.skip,
        take: pg.take,
        include: { school: { select: { id: true, name: true } }, overriddenBy: { select: { name: true } } },
      }),
      prisma.complianceFlag.count({ where }),
    ]);
    res.json(pageResult(items, total, pg));
  }),
);

router.post(
  '/flags/:id/override',
  requireRole('COUNTY_DIRECTOR', 'NATIONAL_ADMIN'),
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().min(10, 'Give a reason of at least 10 characters').max(1000) }), req.body);
    const flag = await prisma.complianceFlag.findFirst({ where: { id: req.params.id, ...flagWhere(req.officer) } });
    if (!flag) throw notFound('Flag not found');
    if (flag.status !== 'OPEN') throw conflict(`Flag is already ${flag.status.toLowerCase()}`);
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.complianceFlag.update({ where: { id: flag.id }, data: { status: 'OVERRIDDEN', overriddenById: req.officer.id, overrideReason: reason } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'RULE_OVERRIDE', entityType: 'ComplianceFlag', entityId: flag.id, detail: { rule: flag.rule, severity: flag.severity, reason } });
      return updated;
    });
    res.json(u);
  }),
);

router.post(
  '/run',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    let schoolIds;
    if (req.officer.role !== 'NATIONAL_ADMIN') {
      schoolIds = (await prisma.school.findMany({ where: schoolWhere(req.officer), select: { id: true } })).map((s) => s.id);
    }
    res.json(await runRules({ schoolIds, actor: audit.actorOf(req) }));
  }),
);

// ── Rule settings ──

router.get(
  '/rules',
  ah(async (req, res) => {
    res.json(await prisma.ruleConfig.findMany({ orderBy: { key: 'asc' } }));
  }),
);

const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'use MM-DD');
const VALUE_SCHEMAS = {
  'appraisal.termDeadlines': z.object({ 1: mmdd, 2: mmdd, 3: mmdd }),
  'appraisal.dueSoonDays': z.number().int().min(1).max(90),
  'acting.maxMonths': z.number().int().min(1).max(36),
  'acting.warnDays': z.number().int().min(1).max(180),
  'staffing.tolerance': z.object({ under: z.number().min(0).max(1), over: z.number().min(1).max(3) }),
  'transfer.minYearsAtStation': z.number().min(0).max(30),
  'case.windowDays': z.number().int().min(7).max(730),
  'score.weights': z.object({ staffing: z.number(), appraisal: z.number(), records: z.number(), documents: z.number(), vacancies: z.number(), cases: z.number() }).strict(),
  'score.targets': z.object({ documentTurnaroundDays: z.number().positive(), vacancyFillDays: z.number().positive(), lookbackDays: z.number().int().min(30).max(1095) }),
  'score.bands': z
    .array(z.object({ band: z.string().min(1).max(4), min: z.number().min(0).max(100) }))
    .min(2)
    .refine((b) => b.some((x) => x.min === 0), 'one band must start at 0'),
};

router.put(
  '/rules/:key',
  requireRole('NATIONAL_ADMIN'),
  ah(async (req, res) => {
    const schema = VALUE_SCHEMAS[req.params.key];
    if (!schema) throw notFound('Unknown rule setting');
    const body = parse(z.object({ value: schema, confirmed: z.boolean().optional() }), req.body);
    if (req.params.key === 'score.weights') {
      const errors = validateWeights(body.value);
      if (errors.length) throw badRequest('Invalid weights', errors);
    }
    const before = await prisma.ruleConfig.findUnique({ where: { key: req.params.key } });
    if (!before) throw notFound('Unknown rule setting');
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.ruleConfig.update({
        where: { key: req.params.key },
        data: { value: body.value, confirmed: body.confirmed ?? before.confirmed, updatedById: req.officer.id },
      });
      await audit.record(tx, { ...audit.actorOf(req), action: 'RULE_CONFIG_CHANGED', entityType: 'RuleConfig', entityId: req.params.key, detail: { from: before.value, to: body.value, confirmed: u.confirmed } });
      return u;
    });
    res.json(updated);
  }),
);

module.exports = router;
