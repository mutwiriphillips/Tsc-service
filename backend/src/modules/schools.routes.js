/** School registry: scoped directory, detail with staffing and score, establishment changes. */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, forbidden } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { schoolWhere, assertSchoolInScope } = require('../lib/scope');
const { paging, pageResult } = require('../lib/paging');
const { scoreSchools } = require('../score/loader');

const router = express.Router();
const LEVELS = ['PRIMARY', 'JUNIOR_SCHOOL', 'SECONDARY', 'TEACHER_TRAINING', 'SPECIAL_NEEDS'];

router.get(
  '/',
  ah(async (req, res) => {
    const pg = paging(req.query);
    const q = (req.query.q || '').trim();
    const where = {
      AND: [
        schoolWhere(req.officer),
        q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] } : {},
        LEVELS.includes(req.query.level) ? { level: req.query.level } : {},
        req.query.subCountyId ? { subCountyId: String(req.query.subCountyId) } : {},
        req.query.countyId ? { subCounty: { countyId: String(req.query.countyId) } } : {},
      ],
    };
    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        where,
        include: {
          subCounty: { select: { name: true, county: { select: { name: true } } } },
          _count: { select: { postings: { where: { status: 'ACTIVE', type: 'SUBSTANTIVE' } }, flags: { where: { status: 'OPEN' } } } },
        },
        orderBy: { name: 'asc' },
        skip: pg.skip,
        take: pg.take,
      }),
      prisma.school.count({ where }),
    ]);
    const scores = req.query.withScore === 'false' ? new Map() : await scoreSchools(schools.map((s) => s.id));
    const items = schools.map((s) => {
      const sc = scores.get(s.id);
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        level: s.level,
        subCounty: s.subCounty.name,
        county: s.subCounty.county.name,
        establishment: s.establishment,
        substantive: s._count.postings,
        openFlags: s._count.flags,
        score: sc ? sc.score : null,
        band: sc ? sc.band : null,
      };
    });
    res.json(pageResult(items, total, pg));
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    await assertSchoolInScope(req.officer, req.params.id);
    const school = await prisma.school.findUnique({
      where: { id: req.params.id },
      include: {
        subCounty: { include: { county: { include: { region: true } } } },
        postings: {
          where: { status: 'ACTIVE' },
          orderBy: [{ type: 'asc' }, { startDate: 'asc' }],
          include: { teacher: { select: { id: true, tscNumber: true, firstName: true, lastName: true, registrationStatus: true, personnelFileComplete: true } } },
        },
        vacancies: { orderBy: { openedAt: 'desc' }, take: 50 },
        flags: { where: { status: 'OPEN' }, orderBy: [{ severity: 'desc' }, { raisedAt: 'desc' }] },
        csoAssignments: { include: { officer: { select: { id: true, name: true, email: true } } } },
      },
    });
    const score = (await scoreSchools([school.id])).get(school.id);
    res.json({ ...school, score });
  }),
);

const createSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(160),
  level: z.enum(LEVELS),
  subCountyId: z.string(),
  establishment: z.number().int().min(0).max(1000),
});

router.post(
  '/',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const body = parse(createSchema, req.body);
    if (req.officer.role === 'COUNTY_DIRECTOR') {
      const sc = await prisma.subCounty.findUnique({ where: { id: body.subCountyId } });
      if (!sc || sc.countyId !== req.officer.countyId) throw forbidden('That sub-county is outside your county');
    }
    const school = await prisma.$transaction(async (tx) => {
      const s = await tx.school.create({ data: body });
      await audit.record(tx, { ...audit.actorOf(req), action: 'SCHOOL_CREATED', entityType: 'School', entityId: s.id, detail: body });
      return s;
    });
    res.status(201).json(school);
  }),
);

router.patch(
  '/:id/establishment',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const { establishment, reason } = parse(z.object({ establishment: z.number().int().min(0).max(1000), reason: z.string().min(5).max(500) }), req.body);
    const before = await assertSchoolInScope(req.officer, req.params.id);
    const school = await prisma.$transaction(async (tx) => {
      const s = await tx.school.update({ where: { id: before.id }, data: { establishment } });
      await audit.record(tx, { ...audit.actorOf(req), action: 'ESTABLISHMENT_CHANGED', entityType: 'School', entityId: s.id, detail: { from: before.establishment, to: establishment, reason } });
      return s;
    });
    res.json(school);
  }),
);

module.exports = router;
