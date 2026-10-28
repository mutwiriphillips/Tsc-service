/**
 * Document management with tiered approval:
 *   every document:   Sub-County Director review → County Director sign-off
 *   promotion files:  … → National Admin approval
 * Rules: each tier is acted on only by its role, inside its jurisdiction;
 * nobody decides a document they submitted (four-eyes); rejection needs a reason.
 * Approval of a transfer request does NOT move the teacher — the system is an
 * evidence layer; an officer records the transfer as a separate, audited act.
 */
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, notFound, forbidden, conflict, badRequest } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { schoolWhere, assertSchoolInScope } = require('../lib/scope');
const { paging, pageResult } = require('../lib/paging');

const router = express.Router();
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

const TIER_ROLE = { SUBCOUNTY: 'SUBCOUNTY_DIRECTOR', COUNTY: 'COUNTY_DIRECTOR', NATIONAL: 'NATIONAL_ADMIN' };
const ROLE_TIER = Object.fromEntries(Object.entries(TIER_ROLE).map(([t, r]) => [r, t]));

function nextTier(doc) {
  if (doc.status === 'SUBMITTED') return 'SUBCOUNTY';
  if (doc.status === 'SUBCOUNTY_REVIEWED') return 'COUNTY';
  if (doc.status === 'COUNTY_APPROVED' && doc.type === 'PROMOTION_FILE') return 'NATIONAL';
  return null; // final
}

function statusAfterApproval(doc, tier) {
  if (tier === 'SUBCOUNTY') return 'SUBCOUNTY_REVIEWED';
  if (tier === 'COUNTY') return 'COUNTY_APPROVED';
  return 'NATIONAL_APPROVED';
}

const isFinal = (doc, status) => status === 'REJECTED' || status === 'NATIONAL_APPROVED' || (status === 'COUNTY_APPROVED' && doc.type !== 'PROMOTION_FILE');

/** Which document statuses are waiting on this officer's tier. */
function awaitingWhere(officer) {
  const tier = ROLE_TIER[officer.role];
  if (tier === 'SUBCOUNTY') return { status: 'SUBMITTED' };
  if (tier === 'COUNTY') return { status: 'SUBCOUNTY_REVIEWED' };
  if (tier === 'NATIONAL') return { status: 'COUNTY_APPROVED', type: 'PROMOTION_FILE' };
  return { id: '__none__' };
}

router.get(
  '/',
  ah(async (req, res) => {
    const pg = paging(req.query);
    const where = {
      AND: [
        { school: schoolWhere(req.officer) },
        req.query.awaiting === 'me' ? awaitingWhere(req.officer) : {},
        req.query.status ? { status: String(req.query.status) } : {},
        req.query.type ? { type: String(req.query.type) } : {},
        req.query.schoolId ? { schoolId: String(req.query.schoolId) } : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip: pg.skip,
        take: pg.take,
        include: {
          school: { select: { id: true, name: true } },
          teacher: { select: { id: true, tscNumber: true, firstName: true, lastName: true } },
          approvals: { orderBy: { at: 'asc' }, include: { officer: { select: { name: true, role: true } } } },
        },
      }),
      prisma.document.count({ where }),
    ]);
    res.json(pageResult(items.map((d) => ({ ...d, nextTier: nextTier(d) })), total, pg));
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, school: schoolWhere(req.officer) },
      include: {
        school: { select: { id: true, name: true } },
        teacher: { select: { id: true, tscNumber: true, firstName: true, lastName: true } },
        submittedByOfficer: { select: { id: true, name: true, role: true } },
        approvals: { orderBy: { at: 'asc' }, include: { officer: { select: { id: true, name: true, role: true } } } },
      },
    });
    if (!doc) throw notFound('Document not found');
    res.json({ ...doc, nextTier: nextTier(doc) });
  }),
);

const createSchema = z.object({
  type: z.enum(['APPOINTMENT_LETTER', 'TRANSFER_REQUEST', 'PROMOTION_FILE', 'APPRAISAL_RETURN', 'OTHER']),
  title: z.string().min(3).max(200),
  schoolId: z.string(),
  teacherId: z.string().optional(),
  meta: z.record(z.string(), z.any()).optional(),
});

router.post(
  '/',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR', 'CSO', 'HEAD_OF_INSTITUTION'),
  ah(async (req, res) => {
    const body = parse(createSchema, req.body);
    await assertSchoolInScope(req.officer, body.schoolId);
    if (body.teacherId) {
      const posted = await prisma.posting.findFirst({ where: { teacherId: body.teacherId, schoolId: body.schoolId, status: 'ACTIVE' } });
      if (!posted) throw badRequest('That teacher is not currently posted to this school');
    }
    const doc = await prisma.$transaction(async (tx) => {
      const d = await tx.document.create({ data: { ...body, submittedByOfficerId: req.officer.id } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'DOCUMENT_SUBMITTED', entityType: 'Document', entityId: d.id, detail: { type: d.type, schoolId: d.schoolId, teacherId: d.teacherId } });
      return d;
    });
    res.status(201).json({ ...doc, nextTier: nextTier(doc) });
  }),
);

router.post(
  '/:id/decide',
  requireRole('SUBCOUNTY_DIRECTOR', 'COUNTY_DIRECTOR', 'NATIONAL_ADMIN'),
  ah(async (req, res) => {
    const { decision, reason } = parse(
      z
        .object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(1000).optional() })
        .refine((v) => v.decision === 'APPROVED' || (v.reason && v.reason.trim().length >= 5), { message: 'A rejection needs a reason (at least 5 characters)', path: ['reason'] }),
      req.body,
    );
    const result = await prisma.$transaction(async (tx) => {
      // Lock the row so two officers cannot decide the same tier at once.
      await tx.$executeRaw`SELECT 1 FROM "Document" WHERE id = ${req.params.id} FOR UPDATE`;
      const doc = await tx.document.findFirst({ where: { id: req.params.id, school: schoolWhere(req.officer) }, include: { approvals: true } });
      if (!doc) throw notFound('Document not found');
      const tier = nextTier(doc);
      if (!tier) throw conflict(`Document is already final (${doc.status})`);
      if (TIER_ROLE[tier] !== req.officer.role) throw forbidden(`This document is waiting for ${TIER_ROLE[tier].replace(/_/g, ' ').toLowerCase()} action`);
      if (doc.submittedByOfficerId === req.officer.id) throw forbidden('You cannot decide a document you submitted');
      if (doc.approvals.some((a) => a.officerId === req.officer.id)) throw forbidden('You have already acted on this document at another tier');

      const status = decision === 'REJECTED' ? 'REJECTED' : statusAfterApproval(doc, tier);
      await tx.approval.create({ data: { documentId: doc.id, tier, decision, officerId: req.officer.id, reason: reason || null } });
      const updated = await tx.document.update({
        where: { id: doc.id },
        data: { status, decidedAt: isFinal(doc, status) ? new Date() : null },
        include: { approvals: { orderBy: { at: 'asc' } } },
      });
      await audit.record(tx, { ...audit.actorOf(req), action: decision === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED', entityType: 'Document', entityId: doc.id, detail: { tier, from: doc.status, to: status, reason: reason || null } });
      return updated;
    });
    res.json({ ...result, nextTier: nextTier(result) });
  }),
);

// ── File attachment: stored in the database, streamed back only within scope ──
router.put(
  '/:id/file',
  express.raw({ type: Object.keys(ALLOWED_TYPES), limit: MAX_FILE_BYTES }),
  ah(async (req, res) => {
    const doc = await prisma.document.findFirst({ where: { id: req.params.id, school: schoolWhere(req.officer) } });
    if (!doc) throw notFound('Document not found');
    if (doc.submittedByOfficerId !== req.officer.id) throw forbidden('Only the submitting officer can attach the file');
    if (doc.status !== 'SUBMITTED') throw conflict('The file cannot change once review has started');
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
    const ext = ALLOWED_TYPES[contentType];
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Send a PDF, JPEG or PNG file as the request body');
    const sha256 = crypto.createHash('sha256').update(req.body).digest('hex');
    const fileName = String(req.query.fileName || `document${ext}`).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    const updated = await prisma.$transaction(async (tx) => {
      const data = { contentType, sizeBytes: req.body.length, sha256, bytes: req.body, uploadedAt: new Date() };
      await tx.documentFile.upsert({ where: { documentId: doc.id }, update: data, create: { documentId: doc.id, ...data } });
      const u = await tx.document.update({ where: { id: doc.id }, data: { storageKey: `db:${sha256}`, fileName } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'DOCUMENT_FILE_ATTACHED', entityType: 'Document', entityId: doc.id, detail: { sha256, bytes: req.body.length } });
      return u;
    });
    res.json({ id: updated.id, fileName: updated.fileName, sha256 });
  }),
);

router.get(
  '/:id/file',
  ah(async (req, res) => {
    const doc = await prisma.document.findFirst({ where: { id: req.params.id, school: schoolWhere(req.officer) }, include: { file: true } });
    if (!doc || !doc.file) throw notFound('File not found');
    await audit.record(null, { ...audit.actorOf(req), action: 'DOCUMENT_FILE_READ', entityType: 'Document', entityId: doc.id });
    res.setHeader('Content-Type', doc.file.contentType);
    res.setHeader('Content-Length', doc.file.sizeBytes);
    res.setHeader('Content-Disposition', `attachment; filename="${(doc.fileName || 'document').replace(/"/g, '')}"`);
    res.end(Buffer.from(doc.file.bytes));
  }),
);

module.exports = { router, nextTier, statusAfterApproval, isFinal };
