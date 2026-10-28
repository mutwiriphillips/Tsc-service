/* eslint-disable no-console */
/**
 * Seed — runs on every start and is safe to repeat.
 *  1. Reference data: regions, all 47 counties, rule thresholds (never overwrites
 *     a threshold TSC has already changed).
 *  2. First National Admin, only when the database has no officers at all, from
 *     BOOTSTRAP_ADMIN_* environment variables. Every other officer is created
 *     from inside the system by that admin.
 * There is no sample or demo data in the product.
 */
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const audit = require('../src/lib/audit');
const { DEFAULT_RULES } = require('../src/rules/defaults');

// Regions follow the former provinces as a working grouping — confirm against TSC's regional offices.
const REGIONS = [
  ['COAST', 'Coast', [['01', 'Mombasa'], ['02', 'Kwale'], ['03', 'Kilifi'], ['04', 'Tana River'], ['05', 'Lamu'], ['06', 'Taita-Taveta']]],
  ['NORTH_EASTERN', 'North Eastern', [['07', 'Garissa'], ['08', 'Wajir'], ['09', 'Mandera']]],
  ['EASTERN', 'Eastern', [['10', 'Marsabit'], ['11', 'Isiolo'], ['12', 'Meru'], ['13', 'Tharaka-Nithi'], ['14', 'Embu'], ['15', 'Kitui'], ['16', 'Machakos'], ['17', 'Makueni']]],
  ['CENTRAL', 'Central', [['18', 'Nyandarua'], ['19', 'Nyeri'], ['20', 'Kirinyaga'], ['21', "Murang'a"], ['22', 'Kiambu']]],
  ['RIFT_VALLEY', 'Rift Valley', [['23', 'Turkana'], ['24', 'West Pokot'], ['25', 'Samburu'], ['26', 'Trans Nzoia'], ['27', 'Uasin Gishu'], ['28', 'Elgeyo-Marakwet'], ['29', 'Nandi'], ['30', 'Baringo'], ['31', 'Laikipia'], ['32', 'Nakuru'], ['33', 'Narok'], ['34', 'Kajiado'], ['35', 'Kericho'], ['36', 'Bomet']]],
  ['WESTERN', 'Western', [['37', 'Kakamega'], ['38', 'Vihiga'], ['39', 'Bungoma'], ['40', 'Busia']]],
  ['NYANZA', 'Nyanza', [['41', 'Siaya'], ['42', 'Kisumu'], ['43', 'Homa Bay'], ['44', 'Migori'], ['45', 'Kisii'], ['46', 'Nyamira']]],
  ['NAIROBI', 'Nairobi', [['47', 'Nairobi']]],
];

async function seedBaseline() {
  for (const [code, name, counties] of REGIONS) {
    const region = await prisma.region.upsert({ where: { code }, update: { name }, create: { code, name } });
    for (const [cCode, cName] of counties) {
      await prisma.county.upsert({
        where: { code: cCode },
        update: { name: cName, regionId: region.id },
        create: { code: cCode, name: cName, regionId: region.id },
      });
    }
  }
  for (const r of DEFAULT_RULES) {
    // Never overwrite a value TSC has already set or confirmed.
    await prisma.ruleConfig.upsert({
      where: { key: r.key },
      update: {},
      create: { key: r.key, value: r.value, description: r.description, confirmed: false },
    });
  }
  console.log(`Baseline: ${REGIONS.length} regions, 47 counties, ${DEFAULT_RULES.length} rule settings`);
}

async function bootstrapAdmin() {
  const officers = await prisma.officer.count();
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (officers > 0) {
    if (email || password) console.log('Officers already exist; BOOTSTRAP_ADMIN_* is ignored and can be removed from the environment.');
    return;
  }
  if (!email || !password) {
    console.warn('No officers exist yet. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, then restart, to create the first National Admin.');
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL is not a valid email address');
  if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');
  const admin = await prisma.officer.create({
    data: {
      staffNumber: (process.env.BOOTSTRAP_ADMIN_STAFF_NUMBER || 'HQ-0001').trim(),
      name: (process.env.BOOTSTRAP_ADMIN_NAME || 'National Administrator').trim(),
      email,
      role: 'NATIONAL_ADMIN',
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  await audit.record(null, { actorType: 'SYSTEM', action: 'BOOTSTRAP_ADMIN_CREATED', entityType: 'Officer', entityId: admin.id, detail: { email } });
  console.log(`First National Admin created for ${email}. Sign in, set up two-step sign-in, change the password, then remove BOOTSTRAP_ADMIN_PASSWORD from the environment.`);
}

async function main() {
  await seedBaseline();
  await bootstrapAdmin();
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e.message || e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedBaseline, bootstrapAdmin, REGIONS };
