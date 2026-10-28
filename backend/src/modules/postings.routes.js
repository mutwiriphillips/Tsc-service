/**
 * Staffing ledger. Postings, transfers, exits and vacancies.
 * The registration gate is enforced here, at the moment of posting: a teacher
 * whose registration is not ACTIVE cannot be posted unless a County Director or
 * National Admin logs a justified override (recorded as an OVERRIDDEN flag + audit).
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, notFound, conflict, unprocessable, badRequest } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { schoolWhere, assertSchoolInScope } = require('../lib/scope');
const { checkRegistrationGate, RULES } = require('../rules/engine');

const router = express.Router();
const POSTERS = ['NATIONAL_ADMIN', 'COUNTY_DIRECTOR'];

const overrideSchema = z.object({ reason: z.string().min(10, 'Give a reason of at least 10 characters').max(1000) }).optional();

/** Applies the registration gate inside a transaction; returns override details if used. */
async function gate(tx, req, teacher, schoolId, override) {
  const result = checkRegistrationGate(teacher);
  if (result.allowed) return null;
  if (!override) {
    throw unprocessable(result.reason, { rule: RULES.REGISTRATION_GATE, overridable: true, overrideRoles: POSTERS });
  }
  const key = `${RULES.REGISTRATION_GATE}:Teacher:${teacher.id}:OVERRIDE:${Date.now()}`;
  await tx.complianceFlag.create({
    data: {
      dedupeKey: key,
      rule: RULES.REGISTRATION_GATE,
      severity: 'BREACH',
      status: 'OVERRIDDEN',
      label: 'Registration Gate Overridden',
      message: result.reason,
      schoolId,
      teacherId: teacher.id,
      entityType: 'Teacher',
      entityId: teacher.id,
      overriddenById: req.officer.id,
      overrideReason: override.reason,
    },
  });
  await audit.record(tx, { ...audit.actorOf(req), action: 'RULE_OVERRIDE', entityType: 'Teacher', entityId: teacher.id, detail: { rule: RULES.REGISTRATION_GATE, reason: override.reason, schoolId } });
  return { overridden: true, reason: override.reason };
}

router.get(
  '/',
  ah(async (req, res) => {
    const where = {
      school: schoolWhere(req.officer),
      ...(req.query.schoolId ? { schoolId: String(req.query.schoolId) } : {}),
      ...(req.query.teacherId ? { teacherId: String(req.query.teacherId) } : {}),
      ...(['ACTIVE', 'ENDED'].includes(req.query.status) ? { status: req.query.status } : {}),
      ...(['SUBSTANTIVE', 'ACTING'].includes(req.query.type) ? { type: req.query.type } : {}),
    };
    res.json(
      await prisma.posting.findMany({
        where,
        orderBy: { startDate: 'desc' },
        take: 500,
        include: {
          teacher: { select: { id: true, tscNumber: true, firstName: true, lastName: true } },
          school: { select: { id: true, name: true } },
        },
      }),
    );
  }),
);

const postingSchema = z.object({
  teacherId: z.string(),
  schoolId: z.string(),
  type: z.enum(['SUBSTANTIVE', 'ACTING']).default('SUBSTANTIVE'),
  designation: z.string().min(2).max(120),
  startDate: z.coerce.date(),
  vacancyId: z.string().optional(),
  override: overrideSchema,
});

router.post(
  '/',
  requireRole(...POSTERS),
  ah(async (req, res) => {
    const body = parse(postingSchema, req.body);
    await assertSchoolInScope(req.officer, body.schoolId);
    const result = await prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.findUnique({ where: { id: body.teacherId } });
      if (!teacher) throw notFound('Teacher not found');
      if (body.type === 'SUBSTANTIVE') {
        const existing = await tx.posting.findFirst({ where: { teacherId: teacher.id, status: 'ACTIVE', type: 'SUBSTANTIVE' } });
        if (existing) throw conflict('Teacher already holds a substantive posting. Use a transfer instead.', { postingId: existing.id });
      }
      const overrideInfo = await gate(tx, req, teacher, body.schoolId, body.override);
      const posting = await tx.posting.create({
        data: { teacherId: teacher.id, schoolId: body.schoolId, type: body.type, designation: body.designation, startDate: body.startDate, createdById: req.officer.id },
      });
      if (body.vacancyId) {
        const v = await tx.vacancy.findUnique({ where: { id: body.vacancyId } });
        if (!v || v.schoolId !== body.schoolId) throw badRequest('Vacancy does not belong to this school');
        if (v.filledAt) throw conflict('Vacancy is already filled');
        await tx.vacancy.update({ where: { id: v.id }, data: { filledAt: body.startDate, postingId: posting.id } });
      }
      await audit.record(tx, { ...audit.actorOf(req), action: 'POSTING_CREATED', entityType: 'Posting', entityId: posting.id, detail: { teacherId: teacher.id, schoolId: body.schoolId, type: body.type, designation: body.designation, vacancyId: body.vacancyId || null, override: overrideInfo } });
      return { posting, override: overrideInfo };
    });
    res.status(201).json(result);
  }),
);

router.post(
  '/:id/end',
  requireRole(...POSTERS),
  ah(async (req, res) => {
    const { endDate, reason } = parse(z.object({ endDate: z.coerce.date(), reason: z.string().min(3).max(500) }), req.body);
    const p = await prisma.posting.findUnique({ where: { id: req.params.id } });
    if (!p) throw notFound('Posting not found');
    await assertSchoolInScope(req.officer, p.schoolId);
    if (p.status !== 'ACTIVE') throw conflict('Posting has already ended');
    if (endDate < p.startDate) throw badRequest('End date is before the start date');
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.posting.update({ where: { id: p.id }, data: { status: 'ENDED', endDate, endReason: reason } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'POSTING_ENDED', entityType: 'Posting', entityId: p.id, detail: { endDate, reason } });
      return u;
    });
    res.json(updated);
  }),
);

/** Transfer = end the current substantive posting and open a new one, atomically. */
router.post(
  '/transfer',
  requireRole(...POSTERS),
  ah(async (req, res) => {
    const body = parse(
      z.object({
        teacherId: z.string(),
        toSchoolId: z.string(),
        startDate: z.coerce.date(),
        designation: z.string().min(2).max(120).default('Teacher'),
        reason: z.string().min(3).max(500),
        documentId: z.string().optional(),
        override: overrideSchema,
      }),
      req.body,
    );
    const current = await prisma.posting.findFirst({ where: { teacherId: body.teacherId, status: 'ACTIVE', type: 'SUBSTANTIVE' } });
    if (!current) throw conflict('Teacher has no active substantive posting to transfer from');
    // A County Director can only transfer within their county; inter-county moves are national.
    await assertSchoolInScope(req.officer, current.schoolId);
    await assertSchoolInScope(req.officer, body.toSchoolId);
    if (current.schoolId === body.toSchoolId) throw badRequest('Teacher is already posted to that school');

    const result = await prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.findUnique({ where: { id: body.teacherId } });
      const overrideInfo = await gate(tx, req, teacher, body.toSchoolId, body.override);
      await tx.posting.update({ where: { id: current.id }, data: { status: 'ENDED', endDate: body.startDate, endReason: `Transfer: ${body.reason}` } });
      const posting = await tx.posting.create({
        data: { teacherId: teacher.id, schoolId: body.toSchoolId, type: 'SUBSTANTIVE', designation: body.designation, startDate: body.startDate, createdById: req.officer.id },
      });
      await audit.record(tx, { ...audit.actorOf(req), action: 'TRANSFER', entityType: 'Teacher', entityId: teacher.id, detail: { from: current.schoolId, to: body.toSchoolId, endedPostingId: current.id, newPostingId: posting.id, reason: body.reason, documentId: body.documentId || null, override: overrideInfo } });
      return { posting, endedPostingId: current.id, override: overrideInfo };
    });
    res.status(201).json(result);
  }),
);

// ───────────── Vacancies ─────────────

const vacancies = express.Router();

vacancies.get(
  '/',
  ah(async (req, res) => {
    const where = {
      school: schoolWhere(req.officer),
      ...(req.query.schoolId ? { schoolId: String(req.query.schoolId) } : {}),
      ...(req.query.status === 'open' ? { filledAt: null } : req.query.status === 'filled' ? { NOT: { filledAt: null } } : {}),
    };
    res.json(await prisma.vacancy.findMany({ where, orderBy: { openedAt: 'asc' }, take: 500, include: { school: { select: { id: true, name: true } } } }));
  }),
);

vacancies.post(
  '/',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR', 'HEAD_OF_INSTITUTION'),
  ah(async (req, res) => {
    const body = parse(z.object({ schoolId: z.string(), designation: z.string().min(2).max(120), openedAt: z.coerce.date().optional() }), req.body);
    await assertSchoolInScope(req.officer, body.schoolId);
    const v = await prisma.$transaction(async (tx) => {
      const created = await tx.vacancy.create({ data: { schoolId: body.schoolId, designation: body.designation, openedAt: body.openedAt || new Date() } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'VACANCY_DECLARED', entityType: 'Vacancy', entityId: created.id, detail: body });
      return created;
    });
    res.status(201).json(v);
  }),
);

module.exports = { postings: router, vacancies };
