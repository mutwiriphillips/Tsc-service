/** Audit trail access (National Admin): search and full hash-chain verification. */
const express = require('express');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { paging, pageResult } = require('../lib/paging');

const router = express.Router();
router.use(requireRole('NATIONAL_ADMIN'));

router.get(
  '/audit',
  ah(async (req, res) => {
    const pg = paging(req.query);
    const where = {
      ...(req.query.entityType ? { entityType: String(req.query.entityType) } : {}),
      ...(req.query.entityId ? { entityId: String(req.query.entityId) } : {}),
      ...(req.query.actorId ? { actorId: String(req.query.actorId) } : {}),
      ...(req.query.action ? { action: String(req.query.action) } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({ where, orderBy: { id: 'desc' }, skip: pg.skip, take: pg.take }),
      prisma.auditEvent.count({ where }),
    ]);
    res.json(pageResult(items, total, pg));
  }),
);

router.get(
  '/audit/verify',
  ah(async (req, res) => {
    res.json(await audit.verifyChain());
  }),
);

module.exports = router;
