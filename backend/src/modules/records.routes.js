/** Appraisal returns and disciplinary cases (cases are sensitive: County Director and National Admin only). */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, notFound, conflict, badRequest } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { schoolWhere, assertSchoolInScope } = require('../lib/scope');

// ───────────── Appraisals ─────────────
const appraisals = express.Router();

appraisals.get(
  '/',
  ah(async (req, res) => {
    const where = {
      school: schoolWhere(req.officer),
      ...(req.query.schoolId ? { schoolId: String(req.query.schoolId) } : {}),
      ...(req.query.year ? { year: Number(req.query.year) } : {}),
      ...(req.query.term ? { term: Number(req.query.term) } : {}),
    };
    res.json(
      await prisma.appraisalReturn.findMany({
        where,
        orderBy: [{ year: 'desc' }, { term: 'desc' }],
        take: 1000,
        include: { teacher: { select: { id: true, tscNumber: true, firstName: true, lastName: true } } },
      }),
    );
  }),
);

appraisals.post(
  '/',
  requireRole('HEAD_OF_INSTITUTION', 'SUBCOUNTY_DIRECTOR', 'COUNTY_DIRECTOR', 'NATIONAL_ADMIN'),
  ah(async (req, res) => {
    const body = parse(
      z.object({ teacherId: z.string(), schoolId: z.string(), year: z.number().int().min(2000).max(2100), term: z.number().int().min(1).max(3), complete: z.boolean().default(true) }),
      req.body,
    );
    await assertSchoolInScope(req.officer, body.schoolId);
    const posted = await prisma.posting.findFirst({ where: { teacherId: body.teacherId, schoolId: body.schoolId, status: 'ACTIVE' } });
    if (!posted) throw badRequest('That teacher is not currently posted to this school');
    const r = await prisma.$transaction(async (tx) => {
      const saved = await tx.appraisalReturn.upsert({
        where: { teacherId_year_term: { teacherId: body.teacherId, year: body.year, term: body.term } },
        update: { complete: body.complete, schoolId: body.schoolId, submittedAt: new Date() },
        create: { ...body, source: 'manual' },
      });
      await audit.record(tx, { ...audit.actorOf(req), action: 'APPRAISAL_RECORDED', entityType: 'AppraisalReturn', entityId: saved.id, detail: body });
      return saved;
    });
    res.status(201).json(r);
  }),
);

// ───────────── Disciplinary cases (sensitive) ─────────────
const cases = express.Router();
cases.use(requireRole('COUNTY_DIRECTOR', 'NATIONAL_ADMIN'));

cases.get(
  '/',
  ah(async (req, res) => {
    const schools = await prisma.school.findMany({ where: schoolWhere(req.officer), select: { id: true } });
    const where = {
      schoolId: { in: schools.map((s) => s.id) },
      ...(['OPEN', 'CLOSED'].includes(req.query.status) ? { status: req.query.status } : {}),
    };
    const list = await prisma.disciplinaryCase.findMany({
      where,
      orderBy: { openedAt: 'asc' },
      take: 500,
      include: { teacher: { select: { id: true, tscNumber: true, firstName: true, lastName: true } } },
    });
    await audit.record(null, { ...audit.actorOf(req), action: 'CASES_LISTED', entityType: 'DisciplinaryCase', detail: { count: list.length } });
    res.json(list);
  }),
);

cases.post(
  '/',
  ah(async (req, res) => {
    const body = parse(z.object({ teacherId: z.string(), schoolId: z.string(), caseType: z.string().min(3).max(120), openedAt: z.coerce.date().optional() }), req.body);
    await assertSchoolInScope(req.officer, body.schoolId);
    const c = await prisma.$transaction(async (tx) => {
      const created = await tx.disciplinaryCase.create({ data: { ...body, openedAt: body.openedAt || new Date() } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'CASE_OPENED', entityType: 'DisciplinaryCase', entityId: created.id, detail: { teacherId: body.teacherId, caseType: body.caseType } });
      return created;
    });
    res.status(201).json(c);
  }),
);

cases.post(
  '/:id/close',
  ah(async (req, res) => {
    const { outcome } = parse(z.object({ outcome: z.string().min(3).max(500) }), req.body);
    const c = await prisma.disciplinaryCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound('Case not found');
    await assertSchoolInScope(req.officer, c.schoolId);
    if (c.status === 'CLOSED') throw conflict('Case is already closed');
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.disciplinaryCase.update({ where: { id: c.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'CASE_CLOSED', entityType: 'DisciplinaryCase', entityId: c.id, detail: { outcome } });
      return updated;
    });
    res.json(u);
  }),
);

module.exports = { appraisals, cases };
