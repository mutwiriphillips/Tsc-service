/**
 * CSV importers for nightly exports from TSC systems. Each import is validated
 * row by row, applied in one transaction (all or nothing), and audited.
 */
const { parse: parseCsv } = require('csv-parse/sync');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { hashNationalId } = require('../lib/crypto');
const { schoolWhere } = require('../lib/scope');
const { badRequest } = require('../lib/http');

const MAX_ROWS = 50000;

function readCsv(text) {
  let rows;
  try {
    rows = parseCsv(text, { columns: (h) => h.map((c) => c.trim()), skip_empty_lines: true, trim: true, bom: true });
  } catch (e) {
    throw badRequest(`The CSV could not be read: ${e.message}`);
  }
  if (rows.length > MAX_ROWS) throw badRequest(`Too many rows (${rows.length}); split the file below ${MAX_ROWS}`);
  return rows;
}

function validateRows(rows, schema) {
  const valid = [];
  const errors = [];
  rows.forEach((row, i) => {
    const r = schema.safeParse(row);
    if (r.success) valid.push(r.data);
    else errors.push({ line: i + 2, issues: r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`) });
  });
  return { valid, errors };
}

const bool = z
  .string()
  .transform((v) => ['true', 'yes', '1', 'y'].includes(v.toLowerCase()))
  .or(z.boolean());

const teacherRow = z.object({
  tscNumber: z.string().min(3).max(20),
  nationalId: z.string().min(4).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  gender: z.enum(['F', 'M', '']).optional(),
  registrationStatus: z.enum(['ACTIVE', 'PENDING', 'SUSPENDED', 'DEREGISTERED']),
  personnelFileComplete: bool.optional(),
});

/** Teacher register import (National Admin). Upserts by TSC number. */
async function importTeachers(text, actor, { dryRun = false } = {}) {
  const { valid, errors } = validateRows(readCsv(text), teacherRow);
  if (errors.length || dryRun) return { applied: false, rows: valid.length, errors };
  let created = 0;
  let updated = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const r of valid) {
        const existing = await tx.teacher.findUnique({ where: { tscNumber: r.tscNumber } });
        const data = {
          firstName: r.firstName,
          lastName: r.lastName,
          gender: r.gender || null,
          registrationStatus: r.registrationStatus,
          nationalIdHash: hashNationalId(r.nationalId),
          ...(r.personnelFileComplete === undefined ? {} : { personnelFileComplete: r.personnelFileComplete }),
        };
        if (existing) {
          await tx.teacher.update({ where: { id: existing.id }, data: { ...data, registeredAt: existing.registeredAt || (r.registrationStatus === 'ACTIVE' ? new Date() : null) } });
          updated += 1;
        } else {
          await tx.teacher.create({ data: { tscNumber: r.tscNumber, ...data, registeredAt: r.registrationStatus === 'ACTIVE' ? new Date() : null } });
          created += 1;
        }
      }
      await audit.record(tx, { ...actor, action: 'IMPORT_TEACHERS', entityType: 'Teacher', detail: { created, updated } });
    },
    { timeout: 120000 },
  );
  return { applied: true, rows: valid.length, created, updated, errors: [] };
}

const appraisalRow = z.object({
  tscNumber: z.string().min(3),
  schoolCode: z.string().min(2),
  year: z.coerce.number().int().min(2000).max(2100),
  term: z.coerce.number().int().min(1).max(3),
  complete: bool.optional(),
});

/** Appraisal returns import. A County Director may import only rows for schools in their county. */
async function importAppraisals(text, officer, actor, { dryRun = false } = {}) {
  const { valid, errors } = validateRows(readCsv(text), appraisalRow);
  const tsc = [...new Set(valid.map((r) => r.tscNumber))];
  const codes = [...new Set(valid.map((r) => r.schoolCode))];
  const [teachers, schools] = await Promise.all([
    prisma.teacher.findMany({ where: { tscNumber: { in: tsc } }, select: { id: true, tscNumber: true } }),
    prisma.school.findMany({ where: { AND: [{ code: { in: codes } }, schoolWhere(officer)] }, select: { id: true, code: true } }),
  ]);
  const tMap = new Map(teachers.map((t) => [t.tscNumber, t.id]));
  const sMap = new Map(schools.map((s) => [s.code, s.id]));
  const ready = [];
  valid.forEach((r, i) => {
    const teacherId = tMap.get(r.tscNumber);
    const schoolId = sMap.get(r.schoolCode);
    if (!teacherId) errors.push({ line: i + 2, issues: [`unknown TSC number ${r.tscNumber}`] });
    else if (!schoolId) errors.push({ line: i + 2, issues: [`school ${r.schoolCode} not found in your jurisdiction`] });
    else ready.push({ teacherId, schoolId, year: r.year, term: r.term, complete: r.complete ?? true });
  });
  if (errors.length || dryRun) return { applied: false, rows: ready.length, errors };
  await prisma.$transaction(
    async (tx) => {
      for (const r of ready) {
        await tx.appraisalReturn.upsert({
          where: { teacherId_year_term: { teacherId: r.teacherId, year: r.year, term: r.term } },
          update: { complete: r.complete, schoolId: r.schoolId, source: 'import' },
          create: { ...r, source: 'import' },
        });
      }
      await audit.record(tx, { ...actor, action: 'IMPORT_APPRAISALS', entityType: 'AppraisalReturn', detail: { rows: ready.length } });
    },
    { timeout: 120000 },
  );
  return { applied: true, rows: ready.length, errors: [] };
}

module.exports = { importTeachers, importAppraisals, readCsv };
