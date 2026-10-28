/* eslint-disable no-console */
/**
 * TEST FIXTURES — fictional data for the automated test suite and the browser
 * click-through only. Not part of the product: the seed never loads it, and this
 * script refuses to run when NODE_ENV=production.
 *
 *   node tests/fixtures/load.js        (against a development or test database)
 */
const bcrypt = require('bcryptjs');
const prisma = require('../../src/lib/prisma');
const env = require('../../src/config/env');
const { hashNationalId } = require('../../src/lib/crypto');
const audit = require('../../src/lib/audit');
const { DEFAULTS } = require('../../src/rules/defaults');
const { termWindows } = require('../../src/rules/engine');
const { seedBaseline } = require('../../prisma/seed');

// Deterministic pseudo-random numbers, so the demo data is the same on every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const FIRST = ['Wanjiru', 'Mwangi', 'Njeri', 'Kamau', 'Muthoni', 'Kariuki', 'Wambui', 'Njoroge', 'Nyambura', 'Mugo', 'Wairimu', 'Gitonga', 'Karimi', 'Ireri', 'Mbaka', 'Kagendo', 'Nyaga', 'Wanja', 'Mutua', 'Kinya'];
const LAST = ['Muriithi', 'Njiru', 'Kathuri', 'Mbogo', 'Gichuki', 'Nthiga', 'Ndwiga', 'Kinyua', 'Munene', 'Murage', 'Gitari', 'Kariithi', 'Mwaniki', 'Njue', 'Mutegi'];

const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);

async function loadFixtures() {
  const already = await prisma.officer.count();
  if (already > 0) {
    console.log('Fixtures already present — skipping (reset the database to reload).');
    return;
  }
  const rand = rng(2026);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const password = await bcrypt.hash('ChangeMe!2026', 10);

  const eastern = await prisma.region.findUnique({ where: { code: 'EASTERN' } });
  const embu = await prisma.county.findUnique({ where: { code: '14' } });
  const meru = await prisma.county.findUnique({ where: { code: '12' } });

  const sc = {};
  for (const name of ['Manyatta', 'Runyenjes', 'Mbeere North', 'Mbeere South']) {
    sc[name] = await prisma.subCounty.create({ data: { name, countyId: embu.id } });
  }
  const imenti = await prisma.subCounty.create({ data: { name: 'Imenti North', countyId: meru.id } });

  const schoolSpecs = [
    ['DEMO-EMB-001', 'Demo Kiambere Secondary', 'SECONDARY', 'Manyatta', 24],
    ['DEMO-EMB-002', 'Demo Gakwegori Primary', 'PRIMARY', 'Manyatta', 14],
    ['DEMO-EMB-003', 'Demo Kianjokoma Junior School', 'JUNIOR_SCHOOL', 'Runyenjes', 10],
    ['DEMO-EMB-004', 'Demo Kairuri Secondary', 'SECONDARY', 'Runyenjes', 18],
    ['DEMO-EMB-005', 'Demo Siakago Primary', 'PRIMARY', 'Mbeere North', 12],
    ['DEMO-EMB-006', 'Demo Kiritiri Secondary', 'SECONDARY', 'Mbeere South', 16],
  ];
  const schools = [];
  for (const [code, name, level, scName, establishment] of schoolSpecs) {
    schools.push(await prisma.school.create({ data: { code, name, level, establishment, subCountyId: sc[scName].id } }));
  }
  const meruSchool = await prisma.school.create({
    data: { code: 'DEMO-MRU-001', name: 'Demo Kaaga Secondary', level: 'SECONDARY', establishment: 20, subCountyId: imenti.id },
  });

  const mk = (staffNumber, name, email, role, scope) =>
    prisma.officer.create({ data: { staffNumber, name, email, role, passwordHash: password, ...scope } });
  const admin = await mk('HQ-0001', 'Demo National Admin', 'admin@tsc.demo', 'NATIONAL_ADMIN', {});
  await mk('REG-EAS-01', 'Demo Eastern Regional Director', 'rd.eastern@tsc.demo', 'REGIONAL_DIRECTOR', { regionId: eastern.id });
  const cdEmbu = await mk('CD-14-01', 'Demo Embu County Director', 'cd.embu@tsc.demo', 'COUNTY_DIRECTOR', { countyId: embu.id });
  await mk('CD-12-01', 'Demo Meru County Director', 'cd.meru@tsc.demo', 'COUNTY_DIRECTOR', { countyId: meru.id });
  const scdManyatta = await mk('SCD-14-01', 'Demo Manyatta Sub-County Director', 'scd.manyatta@tsc.demo', 'SUBCOUNTY_DIRECTOR', { subCountyId: sc.Manyatta.id });
  await mk('SCD-14-02', 'Demo Runyenjes Sub-County Director', 'scd.runyenjes@tsc.demo', 'SUBCOUNTY_DIRECTOR', { subCountyId: sc.Runyenjes.id });
  const cso = await mk('CSO-14-01', 'Demo Curriculum Support Officer', 'cso.manyatta@tsc.demo', 'CSO', {});
  const head = await mk('HOI-EMB-001', 'Demo Head, Kiambere Secondary', 'head.kiambere@tsc.demo', 'HEAD_OF_INSTITUTION', { schoolId: schools[0].id });
  await prisma.csoAssignment.createMany({
    data: [
      { officerId: cso.id, schoolId: schools[0].id },
      { officerId: cso.id, schoolId: schools[1].id },
    ],
  });

  // Teachers and postings. Fill each school below its establishment so staffing varies.
  const fill = [0.92, 0.71, 1.0, 0.83, 0.58, 1.13, 0.9];
  const allSchools = [...schools, meruSchool];
  let seq = 100001;
  const teachers = [];
  for (let i = 0; i < allSchools.length; i += 1) {
    const school = allSchools[i];
    const count = Math.round(school.establishment * fill[i]);
    for (let j = 0; j < count; j += 1) {
      const tscNumber = String(seq);
      seq += 1;
      const unregistered = rand() < 0.06;
      const t = await prisma.teacher.create({
        data: {
          tscNumber,
          nationalIdHash: hashNationalId(`2${tscNumber}`),
          firstName: pick(FIRST),
          lastName: pick(LAST),
          gender: rand() < 0.55 ? 'F' : 'M',
          registrationStatus: unregistered ? 'PENDING' : 'ACTIVE',
          registeredAt: unregistered ? null : daysAgo(400 + Math.floor(rand() * 4000)),
          personnelFileComplete: rand() > 0.15,
        },
      });
      const start = daysAgo(60 + Math.floor(rand() * 3000));
      await prisma.posting.create({
        data: { teacherId: t.id, schoolId: school.id, designation: 'Teacher', startDate: start, createdById: admin.id },
      });
      teachers.push({ teacher: t, school });
    }
  }

  // Acting appointments: one near its limit, one already past it.
  await prisma.posting.create({
    data: { teacherId: teachers[1].teacher.id, schoolId: schools[0].id, type: 'ACTING', designation: 'Deputy Principal (Acting)', startDate: daysAgo(165), createdById: cdEmbu.id },
  });
  await prisma.posting.create({
    data: { teacherId: teachers[25].teacher.id, schoolId: teachers[25].school.id, type: 'ACTING', designation: 'Senior Teacher (Acting)', startDate: daysAgo(220), createdById: cdEmbu.id },
  });

  // Appraisal returns: the last closed term mostly filed, the current term partly filed,
  // so both the overdue rule and the due-soon rule have realistic work to do.
  const { previous, upcoming } = termWindows(DEFAULTS['appraisal.termDeadlines'], new Date());
  for (const { teacher, school } of teachers) {
    const schoolRate = 0.75 + (school.establishment % 5) * 0.05; // varies by school, 75–95%
    if (rand() < schoolRate) {
      await prisma.appraisalReturn.create({ data: { teacherId: teacher.id, schoolId: school.id, year: previous.year, term: previous.term, submittedAt: new Date(previous.deadline - Math.floor(rand() * 20) * DAY) } });
    }
    if (rand() < 0.4) {
      await prisma.appraisalReturn.create({ data: { teacherId: teacher.id, schoolId: school.id, year: upcoming.year, term: upcoming.term, submittedAt: daysAgo(Math.floor(rand() * 10)) } });
    }
  }

  // Vacancies: some filled, some open.
  for (let i = 0; i < schools.length; i += 1) {
    await prisma.vacancy.create({ data: { schoolId: schools[i].id, designation: 'Teacher (Mathematics)', openedAt: daysAgo(20 + i * 25) } });
    await prisma.vacancy.create({ data: { schoolId: schools[i].id, designation: 'Teacher (English)', openedAt: daysAgo(150), filledAt: daysAgo(150 - (15 + i * 12)) } });
  }

  // Disciplinary cases: one closed in time, one overdue.
  await prisma.disciplinaryCase.create({ data: { teacherId: teachers[3].teacher.id, schoolId: teachers[3].school.id, caseType: 'Absenteeism', openedAt: daysAgo(200), closedAt: daysAgo(150), status: 'CLOSED' } });
  await prisma.disciplinaryCase.create({ data: { teacherId: teachers[30].teacher.id, schoolId: teachers[30].school.id, caseType: 'Misconduct', openedAt: daysAgo(120) } });

  // Documents at different approval stages.
  await prisma.document.create({ data: { type: 'APPOINTMENT_LETTER', title: 'Appointment letter — new Mathematics teacher', schoolId: schools[0].id, teacherId: teachers[2].teacher.id, submittedByOfficerId: head.id, submittedAt: daysAgo(3) } });
  await prisma.document.create({ data: { type: 'PROMOTION_FILE', title: 'Promotion file — Senior Teacher', schoolId: schools[1].id, teacherId: teachers[24].teacher.id, submittedByOfficerId: cso.id, submittedAt: daysAgo(9) } });

  // A completed two-tier approval, so the document-turnaround factor has history.
  const decided = await prisma.document.create({
    data: { type: 'APPOINTMENT_LETTER', title: 'Appointment letter — Chemistry teacher', schoolId: schools[0].id, teacherId: teachers[4].teacher.id, submittedByOfficerId: head.id, submittedAt: daysAgo(40), status: 'COUNTY_APPROVED', decidedAt: daysAgo(29) },
  });
  await prisma.approval.createMany({
    data: [
      { documentId: decided.id, tier: 'SUBCOUNTY', decision: 'APPROVED', officerId: scdManyatta.id, at: daysAgo(35) },
      { documentId: decided.id, tier: 'COUNTY', decision: 'APPROVED', officerId: cdEmbu.id, at: daysAgo(29) },
    ],
  });

  // A planned field visit awaiting sign-off.
  await prisma.fieldVisit.create({ data: { csoId: cso.id, schoolId: schools[1].id, plannedDate: new Date(Date.now() + 5 * DAY), purpose: 'Curriculum delivery review, Grade 6' } });

  await audit.record(null, { actorType: 'SYSTEM', action: 'TEST_FIXTURES_LOADED', entityType: 'System', detail: { schools: allSchools.length, teachers: teachers.length } });

  console.log(`Test fixtures: ${allSchools.length} schools, ${teachers.length} teachers. Officer password for every fixture account: ChangeMe!2026`);
  console.log(`Fixture teacher portal: TSC number ${teachers[0].teacher.tscNumber}, national ID 2${teachers[0].teacher.tscNumber}`);
}


async function main() {
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to load test fixtures into a production environment.');
    process.exitCode = 1;
    return;
  }
  await seedBaseline();
  await loadFixtures();
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { loadFixtures };
