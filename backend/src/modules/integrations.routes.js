const express = require('express');
const audit = require('../lib/audit');
const { ah, badRequest } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { importTeachers, importAppraisals } = require('../integrations/importers');
const adapters = require('../integrations/adapters');

const router = express.Router();
const csvBody = express.text({ type: ['text/csv', 'text/plain'], limit: '20mb' });

function textOrFail(req) {
  if (typeof req.body !== 'string' || !req.body.trim()) throw badRequest('Send the CSV file as the request body with Content-Type: text/csv');
  return req.body;
}

router.get('/status', (req, res) => {
  res.json(
    Object.fromEntries(
      ['registration', 'appraisal', 'payroll', 'identity'].map((k) => [k, { name: adapters[k].name, configured: adapters[k].configured, fallback: 'CSV import' }]),
    ),
  );
});

router.post(
  '/import/teachers',
  requireRole('NATIONAL_ADMIN'),
  csvBody,
  ah(async (req, res) => {
    const result = await importTeachers(textOrFail(req), audit.actorOf(req), { dryRun: req.query.dryRun === 'true' });
    res.status(result.errors.length ? 422 : 200).json(result);
  }),
);

router.post(
  '/import/appraisals',
  requireRole('NATIONAL_ADMIN', 'COUNTY_DIRECTOR'),
  csvBody,
  ah(async (req, res) => {
    const result = await importAppraisals(textOrFail(req), req.officer, audit.actorOf(req), { dryRun: req.query.dryRun === 'true' });
    res.status(result.errors.length ? 422 : 200).json(result);
  }),
);

module.exports = router;
