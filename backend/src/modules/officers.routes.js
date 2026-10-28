/**
 * Officer Access. National Admin manages every officer. A County Director may
 * create and manage Sub-County Directors, CSOs and Heads inside their own county.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, forbidden, notFound, badRequest } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { validateJurisdiction, schoolWhere } = require('../lib/scope');
const { paging, pageResult } = require('../lib/paging');

const router = express.Router();

const COUNTY_MANAGEABLE = ['SUBCOUNTY_DIRECTOR', 'CSO', 'HEAD_OF_INSTITUTION'];
const SAFE = { id: true, staffNumber: true, name: true, email: true, role: true, regionId: true, countyId: true, subCountyId: true, schoolId: true, mfaEnabled: true, active: true, createdAt: true };

/** Officers a manager may see/manage. */
function managedWhere(officer) {
  if (officer.role === 'NATIONAL_ADMIN') return {};
  if (officer.role === 'COUNTY_DIRECTOR') {
    return {
      role: { in: COUNTY_MANAGEABLE },
      OR: [
        { subCounty: { countyId: officer.countyId } },
        { school: { subCounty: { countyId: officer.countyId } } },
        { role: 'CSO', csoAssignments: { some: { school: { subCounty: { countyId: officer.countyId } } } } },
      ],
    };
  }
  return { id: '__none__' };
}

async function assertCanManage(manager, target) {
  if (manager.role === 'NATIONAL_ADMIN') return;
  const found = await prisma.officer.findFirst({ where: { AND: [{ id: target }, managedWhere(manager)] } });
  if (!found) throw notFound('Officer not found');
}

/** For County Directors: the jurisdiction being assigned must sit inside their county. */
async function assertJurisdictionInCounty(manager, scope) {
  if (manager.role === 'NATIONAL_ADMIN') return;
  if (scope.subCountyId) {
    const sc = await prisma.subCounty.findUnique({ where: { id: scope.subCountyId } });
    if (!sc || sc.countyId !== manager.countyId) throw forbidden('That sub-county is outside your county');
  }
  if (scope.schoolId) {
    const s = await prisma.school.findFirst({ where: { id: scope.schoolId, subCounty: { countyId: manager.countyId } } });
    if (!s) throw forbidden('That school is outside your county');
  }
}

router.get(
  '/',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const pg = paging(req.query);
    const q = (req.query.q || '').trim();
    const where = {
      AND: [
        managedWhere(req.officer),
        q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { staffNumber: { contains: q, mode: 'insensitive' } }] } : {},
        req.query.role ? { role: req.query.role } : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.officer.findMany({ where, select: { ...SAFE, county: { select: { name: true } }, subCounty: { select: { name: true } }, school: { select: { name: true } }, region: { select: { name: true } } }, orderBy: { name: 'asc' }, skip: pg.skip, take: pg.take }),
      prisma.officer.count({ where }),
    ]);
    res.json(pageResult(items, total, pg));
  }),
);

const createSchema = z.object({
  staffNumber: z.string().min(2).max(30),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(10).max(200),
  role: z.enum(['NATIONAL_ADMIN', 'REGIONAL_DIRECTOR', 'COUNTY_DIRECTOR', 'SUBCOUNTY_DIRECTOR', 'CSO', 'HEAD_OF_INSTITUTION']),
  regionId: z.string().optional(),
  countyId: z.string().optional(),
  subCountyId: z.string().optional(),
  schoolId: z.string().optional(),
  csoSchoolIds: z.array(z.string()).optional(),
});

router.post(
  '/',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const body = parse(createSchema, req.body);
    if (req.officer.role === 'COUNTY_DIRECTOR' && !COUNTY_MANAGEABLE.includes(body.role)) {
      throw forbidden('County Directors may create Sub-County Directors, CSOs and Heads of Institution only');
    }
    const scope = { regionId: body.regionId, countyId: body.countyId, subCountyId: body.subCountyId, schoolId: body.schoolId };
    validateJurisdiction(body.role, scope);
    await assertJurisdictionInCounty(req.officer, scope);
    if (body.role !== 'CSO' && body.csoSchoolIds && body.csoSchoolIds.length) throw badRequest('Only CSOs take school assignments');
    if (body.role === 'CSO' && req.officer.role === 'COUNTY_DIRECTOR' && !(body.csoSchoolIds || []).length) {
      throw badRequest('Assign the CSO to at least one school in your county');
    }

    const created = await prisma.$transaction(async (tx) => {
      const officer = await tx.officer.create({
        data: {
          staffNumber: body.staffNumber,
          name: body.name,
          email: body.email.toLowerCase(),
          role: body.role,
          passwordHash: await bcrypt.hash(body.password, 12),
          ...scope,
        },
        select: SAFE,
      });
      if (body.role === 'CSO' && body.csoSchoolIds) {
        const allowed = await tx.school.findMany({ where: { AND: [{ id: { in: body.csoSchoolIds } }, schoolWhere(req.officer)] }, select: { id: true } });
        if (allowed.length !== new Set(body.csoSchoolIds).size) throw forbidden('One or more schools are outside your jurisdiction');
        await tx.csoAssignment.createMany({ data: allowed.map((s) => ({ officerId: officer.id, schoolId: s.id })) });
      }
      await audit.record(tx, { ...audit.actorOf(req), action: 'OFFICER_CREATED', entityType: 'Officer', entityId: officer.id, detail: { role: body.role, ...scope, csoSchoolIds: body.csoSchoolIds } });
      return officer;
    });
    res.status(201).json(created);
  }),
);

router.put(
  '/:id/cso-schools',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const { schoolIds } = parse(z.object({ schoolIds: z.array(z.string()) }), req.body);
    const target = await prisma.officer.findUnique({ where: { id: req.params.id } });
    if (!target || target.role !== 'CSO') throw notFound('CSO not found');
    if (req.officer.role === 'COUNTY_DIRECTOR') {
      // A County Director may only change this CSO's assignments inside their own county.
      const allowed = await prisma.school.findMany({ where: { AND: [{ id: { in: schoolIds } }, schoolWhere(req.officer)] }, select: { id: true } });
      if (allowed.length !== new Set(schoolIds).size) throw forbidden('One or more schools are outside your county');
    }
    await prisma.$transaction(async (tx) => {
      const keepOutside =
        req.officer.role === 'COUNTY_DIRECTOR'
          ? { school: { NOT: { subCounty: { countyId: req.officer.countyId } } } }
          : { schoolId: '__none__' };
      await tx.csoAssignment.deleteMany({ where: { officerId: target.id, NOT: keepOutside } });
      await tx.csoAssignment.createMany({ data: [...new Set(schoolIds)].map((schoolId) => ({ officerId: target.id, schoolId })), skipDuplicates: true });
      await audit.record(tx, { ...audit.actorOf(req), action: 'CSO_ASSIGNMENTS_SET', entityType: 'Officer', entityId: target.id, detail: { schoolIds } });
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/deactivate',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().max(500).optional() }), req.body || {});
    if (req.params.id === req.officer.id) throw badRequest('You cannot deactivate your own account');
    await assertCanManage(req.officer, req.params.id);
    const o = await prisma.$transaction(async (tx) => {
      const updated = await tx.officer.update({ where: { id: req.params.id }, data: { active: false }, select: SAFE });
      await audit.record(tx, { ...audit.actorOf(req), action: 'OFFICER_DEACTIVATED', entityType: 'Officer', entityId: updated.id, detail: { reason: reason || null } });
      return updated;
    });
    res.json(o);
  }),
);

router.post(
  '/:id/reset-mfa',
  requireRole('NATIONAL_ADMIN'),
  ah(async (req, res) => {
    const o = await prisma.$transaction(async (tx) => {
      const updated = await tx.officer.update({ where: { id: req.params.id }, data: { mfaEnabled: false, mfaSecret: null }, select: SAFE });
      await audit.record(tx, { ...audit.actorOf(req), action: 'OFFICER_MFA_RESET', entityType: 'Officer', entityId: updated.id });
      return updated;
    });
    res.json(o);
  }),
);

module.exports = router;
