/**
 * Geography. Regions and the 47 counties are reference data loaded by the seed.
 * Sub-counties are added from inside the system: by the National Admin anywhere,
 * or by a County Director in their own county.
 */
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, forbidden, notFound } = require('../lib/http');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/regions',
  ah(async (req, res) => {
    res.json(
      await prisma.region.findMany({
        orderBy: { name: 'asc' },
        include: { counties: { orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, _count: { select: { subCounties: true } } } } },
      }),
    );
  }),
);

router.get(
  '/counties/:id/sub-counties',
  ah(async (req, res) => {
    res.json(
      await prisma.subCounty.findMany({
        where: { countyId: req.params.id },
        orderBy: { name: 'asc' },
        include: { _count: { select: { schools: true } } },
      }),
    );
  }),
);

/** Add one or more sub-counties to a county. Names already present are skipped, not duplicated. */
router.post(
  '/counties/:id/sub-counties',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  ah(async (req, res) => {
    const { names } = parse(
      z.object({ names: z.array(z.string().trim().min(2, 'Each name needs at least 2 characters').max(80)).min(1).max(100) }),
      req.body,
    );
    const county = await prisma.county.findUnique({ where: { id: req.params.id } });
    if (!county) throw notFound('County not found');
    if (req.officer.role === 'COUNTY_DIRECTOR' && req.officer.countyId !== county.id) throw forbidden('You can add sub-counties to your own county only');

    // Keep the first spelling of each name (case-insensitive).
    const firstSpelling = new Map();
    for (const n of names) if (!firstSpelling.has(n.toLowerCase())) firstSpelling.set(n.toLowerCase(), n);
    const unique = [...firstSpelling.values()];
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.subCounty.findMany({ where: { countyId: county.id }, select: { name: true } });
      const have = new Set(existing.map((e) => e.name.toLowerCase()));
      const toCreate = unique.filter((n) => !have.has(n.toLowerCase()));
      if (toCreate.length) await tx.subCounty.createMany({ data: toCreate.map((name) => ({ name, countyId: county.id })) });
      await audit.record(tx, { ...audit.actorOf(req), action: 'SUBCOUNTIES_ADDED', entityType: 'County', entityId: county.id, detail: { added: toCreate, skipped: unique.length - toCreate.length } });
      return { added: toCreate, skipped: unique.filter((n) => have.has(n.toLowerCase())) };
    });
    res.status(201).json(result);
  }),
);

module.exports = router;
