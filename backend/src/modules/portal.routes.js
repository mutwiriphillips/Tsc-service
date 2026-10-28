/**
 * Teacher portal. A teacher sees their own record and nothing else: every query
 * here is keyed on req.teacher.id, which comes only from a teacher token.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, conflict, unauthorized } = require('../lib/http');
const { loadRuleConfig } = require('../rules/config');
const { checkTransferEligibility, actingExpiry } = require('../rules/engine');

const router = express.Router();

const PROFILE = { id: true, tscNumber: true, firstName: true, lastName: true, gender: true, registrationStatus: true, registeredAt: true, personnelFileComplete: true, portalActivatedAt: true };

router.get(
  '/me',
  ah(async (req, res) => {
    const cfg = await loadRuleConfig();
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.teacher.id },
      select: {
        ...PROFILE,
        postings: {
          where: { status: 'ACTIVE' },
          include: { school: { select: { name: true, code: true, subCounty: { select: { name: true, county: { select: { name: true } } } } } } },
        },
      },
    });
    const postings = teacher.postings.map((p) => ({
      id: p.id,
      type: p.type,
      designation: p.designation,
      startDate: p.startDate,
      school: p.school.name,
      subCounty: p.school.subCounty.name,
      county: p.school.subCounty.county.name,
      actingEndsOn: p.type === 'ACTING' ? actingExpiry(p, cfg) : null,
    }));
    res.json({ ...teacher, postings });
  }),
);

router.get(
  '/postings',
  ah(async (req, res) => {
    res.json(
      await prisma.posting.findMany({
        where: { teacherId: req.teacher.id },
        orderBy: { startDate: 'desc' },
        select: { id: true, type: true, designation: true, startDate: true, endDate: true, status: true, endReason: true, school: { select: { name: true } } },
      }),
    );
  }),
);

router.get(
  '/appraisals',
  ah(async (req, res) => {
    res.json(await prisma.appraisalReturn.findMany({ where: { teacherId: req.teacher.id }, orderBy: [{ year: 'desc' }, { term: 'desc' }] }));
  }),
);

router.get(
  '/documents',
  ah(async (req, res) => {
    res.json(
      await prisma.document.findMany({
        where: { teacherId: req.teacher.id },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, type: true, title: true, status: true, submittedAt: true, decidedAt: true, approvals: { select: { tier: true, decision: true, at: true, reason: true } } },
      }),
    );
  }),
);

router.post(
  '/transfer-requests',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        reason: z.string().min(10, 'Explain the request in at least 10 characters').max(2000),
        preferredCountyId: z.string().optional(),
        preferredSchoolId: z.string().optional(),
      }),
      req.body,
    );
    const current = await prisma.posting.findFirst({ where: { teacherId: req.teacher.id, status: 'ACTIVE', type: 'SUBSTANTIVE' } });
    if (!current) throw conflict('You have no active substantive posting to transfer from');
    const pending = await prisma.document.findFirst({
      where: { teacherId: req.teacher.id, type: 'TRANSFER_REQUEST', status: { in: ['SUBMITTED', 'SUBCOUNTY_REVIEWED'] } },
    });
    if (pending) throw conflict('You already have a transfer request under review');
    const eligibility = checkTransferEligibility(current, await loadRuleConfig(), new Date());
    const doc = await prisma.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: {
          type: 'TRANSFER_REQUEST',
          title: 'Teacher transfer request',
          schoolId: current.schoolId,
          teacherId: req.teacher.id,
          submittedByTeacher: true,
          meta: { reason: body.reason, preferredCountyId: body.preferredCountyId || null, preferredSchoolId: body.preferredSchoolId || null, eligibility },
        },
      });
      await audit.record(tx, { ...audit.actorOf(req), action: 'TRANSFER_REQUESTED', entityType: 'Document', entityId: d.id, detail: { eligible: eligibility.eligible } });
      return d;
    });
    res.status(201).json({ document: { id: doc.id, status: doc.status }, eligibility });
  }),
);

/** Data-subject right to correction. */
router.post(
  '/corrections',
  ah(async (req, res) => {
    const body = parse(z.object({ field: z.string().min(2).max(80), requested: z.string().min(2).max(1000) }), req.body);
    const cr = await prisma.$transaction(async (tx) => {
      const c = await tx.correctionRequest.create({ data: { teacherId: req.teacher.id, ...body } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'CORRECTION_REQUESTED', entityType: 'CorrectionRequest', entityId: c.id, detail: { field: body.field } });
      return c;
    });
    res.status(201).json(cr);
  }),
);

router.get(
  '/corrections',
  ah(async (req, res) => {
    res.json(await prisma.correctionRequest.findMany({ where: { teacherId: req.teacher.id }, orderBy: { createdAt: 'desc' } }));
  }),
);

/** Data-subject right of access: an export of what the system holds about this teacher. */
router.get(
  '/my-data',
  ah(async (req, res) => {
    const data = await prisma.teacher.findUnique({
      where: { id: req.teacher.id },
      select: {
        ...PROFILE,
        postings: { include: { school: { select: { name: true, code: true } } } },
        appraisals: true,
        documents: { select: { id: true, type: true, title: true, status: true, submittedAt: true, decidedAt: true, meta: true } },
        correctionRequests: true,
        cases: { select: { caseType: true, openedAt: true, closedAt: true, status: true } },
        sensitiveRecords: { select: { kind: true, createdAt: true } },
      },
    });
    await audit.record(null, { ...audit.actorOf(req), action: 'DATA_EXPORTED', entityType: 'Teacher', entityId: req.teacher.id });
    res.setHeader('Content-Disposition', `attachment; filename="my-tsc-record-${data.tscNumber}.json"`);
    res.json({
      exportedAt: new Date(),
      note: 'This is the record the TSC Teacher Management & Governance System holds about you. Sensitive records are listed by type; their content is available on written request to the TSC Data Protection Officer. The national ID is not stored in readable form.',
      record: data,
    });
  }),
);

router.post(
  '/change-password',
  ah(async (req, res) => {
    const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string(), newPassword: z.string().min(10).max(200) }), req.body);
    if (!(await bcrypt.compare(currentPassword, req.teacher.portalPasswordHash || ''))) throw unauthorized('Current password is incorrect');
    await prisma.teacher.update({ where: { id: req.teacher.id }, data: { portalPasswordHash: await bcrypt.hash(newPassword, 12) } });
    await audit.record(null, { ...audit.actorOf(req), action: 'PASSWORD_CHANGED', entityType: 'Teacher', entityId: req.teacher.id });
    res.json({ ok: true });
  }),
);

module.exports = router;
