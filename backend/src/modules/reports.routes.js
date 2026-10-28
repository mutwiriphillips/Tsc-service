/**
 * Reports.
 *  /summary  — dashboard counts for the officer's jurisdiction.
 *  /staffing — the trickle-down view: National → Region → County → Sub-County → School,
 *              with each teacher posted there when a single school is requested.
 *              A date range selects postings active at any point in that range.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ah, parse } = require('../lib/http');
const { schoolWhere, canSeeSensitive, assertSchoolInScope } = require('../lib/scope');
const { scoreSchools } = require('../score/loader');
const { RULES } = require('../rules/engine');

const router = express.Router();
const BAND_LIMIT = 2000; // above this many schools, bands are computed by the nightly job, not per request

router.get(
  '/summary',
  ah(async (req, res) => {
    const sw = schoolWhere(req.officer);
    const schools = await prisma.school.findMany({ where: sw, select: { id: true, establishment: true } });
    const ids = schools.map((s) => s.id);
    const flagRule = canSeeSensitive(req.officer) ? {} : { rule: { not: RULES.CASE_TIMELINES } };
    const [teachers, substantive, acting, openVacancies, flags] = await Promise.all([
      prisma.teacher.count({ where: { postings: { some: { status: 'ACTIVE', schoolId: { in: ids } } } } }),
      prisma.posting.count({ where: { status: 'ACTIVE', type: 'SUBSTANTIVE', schoolId: { in: ids } } }),
      prisma.posting.count({ where: { status: 'ACTIVE', type: 'ACTING', schoolId: { in: ids } } }),
      prisma.vacancy.count({ where: { filledAt: null, schoolId: { in: ids } } }),
      prisma.complianceFlag.groupBy({ by: ['severity'], where: { status: 'OPEN', schoolId: { in: ids }, ...flagRule }, _count: { _all: true } }),
    ]);

    let bands = null;
    if (ids.length && ids.length <= BAND_LIMIT) {
      const scores = await scoreSchools(ids);
      bands = {};
      for (const s of scores.values()) {
        const b = s.band || 'No data';
        bands[b] = (bands[b] || 0) + 1;
      }
    }
    res.json({
      scope: req.officer.role,
      schools: ids.length,
      establishment: schools.reduce((n, s) => n + s.establishment, 0),
      teachers,
      substantive,
      acting,
      openVacancies,
      openFlags: Object.fromEntries(flags.map((f) => [f.severity, f._count._all])),
      bands,
    });
  }),
);

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  schoolId: z.string().optional(),
});

router.get(
  '/staffing',
  ah(async (req, res) => {
    const { from, to, schoolId } = parse(rangeSchema, req.query);
    const end = to || new Date();
    const start = from || end;
    const active = { startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] };

    if (schoolId) {
      // Leaf level: each teacher at one school.
      const school = await assertSchoolInScope(req.officer, schoolId);
      const postings = await prisma.posting.findMany({
        where: { schoolId, ...active },
        orderBy: [{ type: 'asc' }, { startDate: 'asc' }],
        include: { teacher: { select: { id: true, tscNumber: true, firstName: true, lastName: true, registrationStatus: true } } },
      });
      return res.json({ range: { from: start, to: end }, school: { id: school.id, name: school.name, establishment: school.establishment }, postings });
    }

    const schools = await prisma.school.findMany({
      where: schoolWhere(req.officer),
      select: {
        id: true,
        name: true,
        establishment: true,
        subCounty: { select: { id: true, name: true, county: { select: { id: true, name: true, code: true, region: { select: { id: true, name: true } } } } } },
      },
    });
    const counts = await prisma.posting.groupBy({
      by: ['schoolId', 'type'],
      where: { schoolId: { in: schools.map((s) => s.id) }, ...active },
      _count: { _all: true },
    });
    const bySchool = new Map();
    for (const c of counts) {
      const e = bySchool.get(c.schoolId) || { substantive: 0, acting: 0 };
      e[c.type === 'SUBSTANTIVE' ? 'substantive' : 'acting'] = c._count._all;
      bySchool.set(c.schoolId, e);
    }

    const node = (id, name, level) => ({ id, name, level, establishment: 0, substantive: 0, acting: 0, children: new Map() });
    const root = node('national', 'National', 'national');
    for (const s of schools) {
      const county = s.subCounty.county;
      const c = bySchool.get(s.id) || { substantive: 0, acting: 0 };
      const path = [
        [county.region.id, county.region.name, 'region'],
        [county.id, county.name, 'county'],
        [s.subCounty.id, s.subCounty.name, 'subCounty'],
        [s.id, s.name, 'school'],
      ];
      let cur = root;
      const chain = [root];
      for (const [id, name, level] of path) {
        if (!cur.children.has(id)) cur.children.set(id, node(id, name, level));
        cur = cur.children.get(id);
        chain.push(cur);
      }
      for (const n of chain) {
        n.establishment += s.establishment;
        n.substantive += c.substantive;
        n.acting += c.acting;
      }
    }
    const toJson = (n) => ({
      id: n.id,
      name: n.name,
      level: n.level,
      establishment: n.establishment,
      substantive: n.substantive,
      acting: n.acting,
      fillRate: n.establishment ? Math.round((n.substantive / n.establishment) * 1000) / 10 : null,
      children: [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name)).map(toJson),
    });
    res.json({ range: { from: start, to: end }, tree: toJson(root) });
  }),
);

module.exports = router;
