/**
 * Teacher registry. Registration itself is a national function (National Admin);
 * officers see teachers currently posted inside their jurisdiction.
 * Sensitive records are walled off: listed by kind only, and decrypted on an
 * explicit, audited request by a County Director or National Admin.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, notFound } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { teacherWhere, assertTeacherInScope, canSeeSensitive, schoolWhere } = require('../lib/scope');
const { paging, pageResult } = require('../lib/paging');
const { hashNationalId, encrypt, decrypt } = require('../lib/crypto');

const router = express.Router();
const STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'DEREGISTERED'];
const PUBLIC = { id: true, tscNumber: true, firstName: true, lastName: true, gender: true, registrationStatus: true, registeredAt: true, personnelFileComplete: true, portalActivatedAt: true, createdAt: true };

router.get(
  '/',
  ah(async (req, res) => {
    const pg = paging(req.query);
    const q = (req.query.q || '').trim();
    const where = {
      AND: [
        teacherWhere(req.officer),
        q
          ? { OR: [{ tscNumber: { contains: q } }, { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] }
          : {},
        STATUSES.includes(req.query.registrationStatus) ? { registrationStatus: req.query.registrationStatus } : {},
        req.query.schoolId ? { postings: { some: { status: 'ACTIVE', schoolId: String(req.query.schoolId) } } } : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.teacher.findMany({
        where,
        select: { ...PUBLIC, postings: { where: { status: 'ACTIVE' }, select: { id: true, type: true, designation: true, school: { select: { id: true, name: true } } } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: pg.skip,
        take: pg.take,
      }),
      prisma.teacher.count({ where }),
    ]);
    res.json(pageResult(items, total, pg));
  }),
);

/**
 * Exact TSC-number lookup for officers who post teachers. A new appointee is not
 * yet in anyone's jurisdiction, so the scoped list cannot find them. This returns
 * only what is needed to post: name, registration status and whether a substantive
 * posting is already held — and never by partial match. Each lookup is audited.
 */
router.get(
  '/lookup',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const { tscNumber } = parse(z.object({ tscNumber: z.string().min(3).max(20) }), req.query);
    const t = await prisma.teacher.findUnique({
      where: { tscNumber: tscNumber.trim() },
      select: { id: true, tscNumber: true, firstName: true, lastName: true, registrationStatus: true, postings: { where: { status: 'ACTIVE', type: 'SUBSTANTIVE' }, select: { id: true } } },
    });
    await audit.record(null, { ...audit.actorOf(req), action: 'TEACHER_LOOKUP', entityType: 'Teacher', entityId: t ? t.id : null, detail: { found: Boolean(t) } });
    if (!t) throw notFound('No teacher with that TSC number');
    const { postings, ...rest } = t;
    res.json({ ...rest, holdsSubstantivePosting: postings.length > 0 });
  }),
);

router.get(
  '/corrections',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const where = { teacher: teacherWhere(req.officer), ...(req.query.status ? { status: String(req.query.status) } : {}) };
    res.json(
      await prisma.correctionRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { teacher: { select: { id: true, tscNumber: true, firstName: true, lastName: true } } },
        take: 200,
      }),
    );
  }),
);

router.post(
  '/corrections/:id/resolve',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const { status, response } = parse(z.object({ status: z.enum(['ACCEPTED', 'DECLINED']), response: z.string().min(3).max(1000) }), req.body);
    const cr = await prisma.correctionRequest.findUnique({ where: { id: req.params.id } });
    if (!cr) throw notFound();
    await assertTeacherInScope(req.officer, cr.teacherId);
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.correctionRequest.update({ where: { id: cr.id }, data: { status, response, resolvedAt: new Date() } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'CORRECTION_RESOLVED', entityType: 'CorrectionRequest', entityId: cr.id, detail: { status } });
      return u;
    });
    res.json(updated);
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    await assertTeacherInScope(req.officer, req.params.id);
    const sensitive = canSeeSensitive(req.officer);
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.params.id },
      select: {
        ...PUBLIC,
        postings: { orderBy: { startDate: 'desc' }, include: { school: { select: { id: true, name: true, code: true } } } },
        appraisals: { orderBy: [{ year: 'desc' }, { term: 'desc' }], take: 12 },
        documents: { where: { school: schoolWhere(req.officer) }, orderBy: { submittedAt: 'desc' }, take: 50, select: { id: true, type: true, title: true, status: true, submittedAt: true } },
        correctionRequests: { orderBy: { createdAt: 'desc' } },
        ...(sensitive
          ? {
              sensitiveRecords: { select: { id: true, kind: true, createdAt: true } },
              cases: { orderBy: { openedAt: 'desc' } },
            }
          : {}),
      },
    });
    res.json(teacher);
  }),
);

/** Decrypts sensitive content. Every read is written to the audit trail. */
router.get(
  '/:id/sensitive',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    await assertTeacherInScope(req.officer, req.params.id);
    const records = await prisma.sensitiveRecord.findMany({ where: { teacherId: req.params.id }, orderBy: { createdAt: 'desc' } });
    await audit.record(null, { ...audit.actorOf(req), action: 'SENSITIVE_READ', entityType: 'Teacher', entityId: req.params.id, detail: { records: records.length } });
    res.json(records.map((r) => ({ id: r.id, kind: r.kind, createdAt: r.createdAt, content: decrypt(r.ciphertext) })));
  }),
);

router.post(
  '/:id/sensitive',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const { kind, content } = parse(z.object({ kind: z.enum(['HEALTH', 'DISABILITY', 'DISCIPLINARY_NOTE']), content: z.string().min(1).max(5000) }), req.body);
    await assertTeacherInScope(req.officer, req.params.id);
    const rec = await prisma.$transaction(async (tx) => {
      const r = await tx.sensitiveRecord.create({ data: { teacherId: req.params.id, kind, ciphertext: encrypt(content), createdById: req.officer.id } });
      // Audit records the fact and kind only — never the content.
      await audit.record(tx, { ...audit.actorOf(req), action: 'SENSITIVE_ADDED', entityType: 'Teacher', entityId: req.params.id, detail: { kind } });
      return r;
    });
    res.status(201).json({ id: rec.id, kind: rec.kind, createdAt: rec.createdAt });
  }),
);

const createSchema = z.object({
  tscNumber: z.string().min(3).max(20),
  nationalId: z.string().min(4).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  gender: z.enum(['F', 'M']).optional(),
  registrationStatus: z.enum(STATUSES).default('PENDING'),
  personnelFileComplete: z.boolean().default(false),
});

router.post(
  '/',
  requireRole('NATIONAL_ADMIN'),
  ah(async (req, res) => {
    const body = parse(createSchema, req.body);
    const teacher = await prisma.$transaction(async (tx) => {
      const t = await tx.teacher.create({
        data: {
          tscNumber: body.tscNumber.trim(),
          nationalIdHash: hashNationalId(body.nationalId),
          firstName: body.firstName,
          lastName: body.lastName,
          gender: body.gender,
          registrationStatus: body.registrationStatus,
          registeredAt: body.registrationStatus === 'ACTIVE' ? new Date() : null,
          personnelFileComplete: body.personnelFileComplete,
        },
        select: PUBLIC,
      });
      await audit.record(tx, { ...audit.actorOf(req), action: 'TEACHER_CREATED', entityType: 'Teacher', entityId: t.id, detail: { tscNumber: t.tscNumber, registrationStatus: t.registrationStatus } });
      return t;
    });
    res.status(201).json(teacher);
  }),
);

router.patch(
  '/:id/registration',
  requireRole('NATIONAL_ADMIN'),
  ah(async (req, res) => {
    const { status, reason } = parse(z.object({ status: z.enum(STATUSES), reason: z.string().min(5).max(500) }), req.body);
    const before = await prisma.teacher.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Teacher not found');
    const t = await prisma.$transaction(async (tx) => {
      const u = await tx.teacher.update({
        where: { id: before.id },
        data: { registrationStatus: status, registeredAt: status === 'ACTIVE' && !before.registeredAt ? new Date() : before.registeredAt },
        select: PUBLIC,
      });
      await audit.record(tx, { ...audit.actorOf(req), action: 'REGISTRATION_CHANGED', entityType: 'Teacher', entityId: u.id, detail: { from: before.registrationStatus, to: status, reason } });
      return u;
    });
    res.json(t);
  }),
);

router.patch(
  '/:id/personnel-file',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const { complete, note } = parse(z.object({ complete: z.boolean(), note: z.string().max(500).optional() }), req.body);
    await assertTeacherInScope(req.officer, req.params.id);
    const t = await prisma.$transaction(async (tx) => {
      const u = await tx.teacher.update({ where: { id: req.params.id }, data: { personnelFileComplete: complete }, select: PUBLIC });
      await audit.record(tx, { ...audit.actorOf(req), action: 'PERSONNEL_FILE_UPDATED', entityType: 'Teacher', entityId: u.id, detail: { complete, note } });
      return u;
    });
    res.json(t);
  }),
);

module.exports = router;
