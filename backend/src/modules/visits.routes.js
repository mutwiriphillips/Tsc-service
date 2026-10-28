/** Field quality assurance: CSO plans a visit → supervisor signs off → CSO files the report. */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, notFound, forbidden, conflict } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { schoolWhere } = require('../lib/scope');

const router = express.Router();
const APPROVERS = ['SUBCOUNTY_DIRECTOR', 'COUNTY_DIRECTOR'];

async function visitInScope(officer, id) {
  const v = await prisma.fieldVisit.findFirst({ where: { id, school: schoolWhere(officer) } });
  if (!v) throw notFound('Visit not found');
  return v;
}

router.get(
  '/',
  ah(async (req, res) => {
    const where = {
      school: schoolWhere(req.officer),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.schoolId ? { schoolId: String(req.query.schoolId) } : {}),
    };
    res.json(
      await prisma.fieldVisit.findMany({
        where,
        orderBy: { plannedDate: 'desc' },
        take: 300,
        include: { school: { select: { id: true, name: true } }, cso: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } },
      }),
    );
  }),
);

router.post(
  '/',
  requireRole('CSO'),
  ah(async (req, res) => {
    const body = parse(z.object({ schoolId: z.string(), plannedDate: z.coerce.date(), purpose: z.string().min(5).max(500) }), req.body);
    const assigned = await prisma.csoAssignment.findUnique({ where: { officerId_schoolId: { officerId: req.officer.id, schoolId: body.schoolId } } });
    if (!assigned) throw notFound('School not found');
    const v = await prisma.$transaction(async (tx) => {
      const created = await tx.fieldVisit.create({ data: { ...body, csoId: req.officer.id } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'VISIT_PLANNED', entityType: 'FieldVisit', entityId: created.id, detail: body });
      return created;
    });
    res.status(201).json(v);
  }),
);

router.post(
  '/:id/approve',
  requireRole(...APPROVERS),
  ah(async (req, res) => {
    const v = await visitInScope(req.officer, req.params.id);
    if (v.status !== 'PLANNED') throw conflict(`Visit is ${v.status.toLowerCase()}, not awaiting sign-off`);
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.fieldVisit.update({ where: { id: v.id }, data: { status: 'APPROVED', approvedById: req.officer.id } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'VISIT_APPROVED', entityType: 'FieldVisit', entityId: v.id });
      return updated;
    });
    res.json(u);
  }),
);

router.post(
  '/:id/complete',
  requireRole('CSO'),
  ah(async (req, res) => {
    const { report } = parse(z.object({ report: z.string().min(20, 'The report needs at least 20 characters').max(10000) }), req.body);
    const v = await visitInScope(req.officer, req.params.id);
    if (v.csoId !== req.officer.id) throw forbidden('Only the CSO who planned the visit can file its report');
    if (v.status !== 'APPROVED') throw conflict('A visit must be signed off before its report is filed');
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.fieldVisit.update({ where: { id: v.id }, data: { status: 'COMPLETED', report, completedAt: new Date() } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'VISIT_COMPLETED', entityType: 'FieldVisit', entityId: v.id });
      return updated;
    });
    res.json(u);
  }),
);

router.post(
  '/:id/cancel',
  requireRole('CSO', ...APPROVERS),
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().min(3).max(500) }), req.body);
    const v = await visitInScope(req.officer, req.params.id);
    if (req.officer.role === 'CSO' && v.csoId !== req.officer.id) throw forbidden();
    if (v.status === 'COMPLETED' || v.status === 'CANCELLED') throw conflict(`Visit is already ${v.status.toLowerCase()}`);
    const u = await prisma.$transaction(async (tx) => {
      const updated = await tx.fieldVisit.update({ where: { id: v.id }, data: { status: 'CANCELLED' } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'VISIT_CANCELLED', entityType: 'FieldVisit', entityId: v.id, detail: { reason } });
      return updated;
    });
    res.json(u);
  }),
);

module.exports = router;
