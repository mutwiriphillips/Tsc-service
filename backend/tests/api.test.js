/**
 * Verification steps 2 and 3 — access control and live endpoints.
 * Real HTTP requests, real tokens for every role, a real PostgreSQL database
 * seeded with Embu (pilot) and Meru (isolation) data.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const prisma = require('../src/lib/prisma');
const { encrypt, generateTotpSecret, totpAt } = require('../src/lib/crypto');
const { runRules } = require('../src/rules/runner');
const { claimRun } = require('../src/rules/scheduler');

const app = createApp();
const api = () => request(app);
const PW = 'ChangeMe!2026';
const tokens = {};
let ids = {};

async function login(email) {
  const res = await api().post('/api/auth/officer/login').send({ email, password: PW });
  if (!res.body.token) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.token;
}
const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  const emails = {
    admin: 'admin@tsc.demo',
    rd: 'rd.eastern@tsc.demo',
    cdEmbu: 'cd.embu@tsc.demo',
    cdMeru: 'cd.meru@tsc.demo',
    scdManyatta: 'scd.manyatta@tsc.demo',
    scdRunyenjes: 'scd.runyenjes@tsc.demo',
    cso: 'cso.manyatta@tsc.demo',
    head: 'head.kiambere@tsc.demo',
  };
  for (const [k, e] of Object.entries(emails)) tokens[k] = await login(e);

  const school = (code) => prisma.school.findUnique({ where: { code } });
  const [kiambere, gakwegori, kianjokoma, kairuri, kaaga] = await Promise.all(['DEMO-EMB-001', 'DEMO-EMB-002', 'DEMO-EMB-003', 'DEMO-EMB-004', 'DEMO-MRU-001'].map(school));
  const embuTeacher = await prisma.teacher.findFirst({ where: { postings: { some: { schoolId: kiambere.id, status: 'ACTIVE', type: 'SUBSTANTIVE' } }, registrationStatus: 'ACTIVE' } });
  const meruTeacher = await prisma.teacher.findFirst({ where: { postings: { some: { schoolId: kaaga.id, status: 'ACTIVE' } } } });
  ids = { kiambere, gakwegori, kianjokoma, kairuri, kaaga, embuTeacher, meruTeacher };
  await runRules();
});

afterAll(() => prisma.$disconnect());

describe('health and wiring', () => {
  test('health check reaches the database', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
  });
  test('unknown routes return 404 JSON', async () => {
    const res = await api().get('/api/nope').set(as('admin'));
    expect(res.status).toBe(404);
  });
  test('responses are not cacheable', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('officer authentication', () => {
  test('wrong password is rejected without saying which part was wrong', async () => {
    const res = await api().post('/api/auth/officer/login').send({ email: 'admin@tsc.demo', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Incorrect email or password');
  });
  test('unknown email gets the same answer', async () => {
    const res = await api().post('/api/auth/officer/login').send({ email: 'nobody@tsc.demo', password: 'whatever-pass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Incorrect email or password');
  });
  test('no token, or a forged token, is rejected', async () => {
    expect((await api().get('/api/schools')).status).toBe(401);
    const forged = jwt.sign({ typ: 'officer' }, 'not-the-real-secret-not-the-real-secret', { subject: 'x', audience: 'tsc-officer' });
    expect((await api().get('/api/schools').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });
  test('only credential checks are rate-limited, not the session lookup every page makes', async () => {
    const login = await api().post('/api/auth/officer/login').send({ email: 'admin@tsc.demo', password: PW });
    expect(login.headers.ratelimit || login.headers['ratelimit-policy']).toBeTruthy();
    const me = await api().get('/api/auth/officer/me').set(as('admin'));
    expect(me.status).toBe(200);
    expect(me.headers.ratelimit).toBeUndefined();
    expect(me.headers['ratelimit-policy']).toBeUndefined();
  });
  test('two-factor sign-in: password alone is not enough once MFA is on', async () => {
    const secret = generateTotpSecret();
    const o = await prisma.officer.create({
      data: { staffNumber: 'MFA-T1', name: 'MFA Test', email: 'mfa.test@tsc.demo', role: 'CSO', passwordHash: (await prisma.officer.findFirst()).passwordHash, mfaEnabled: true, mfaSecret: encrypt(secret) },
    });
    const step1 = await api().post('/api/auth/officer/login').send({ email: 'mfa.test@tsc.demo', password: PW });
    expect(step1.body.token).toBeUndefined();
    expect(step1.body.mfaRequired).toBe(true);
    // The pending token cannot be used as a session.
    expect((await api().get('/api/schools').set('Authorization', `Bearer ${step1.body.pendingToken}`)).status).toBe(401);
    const bad = await api().post('/api/auth/officer/mfa/verify').send({ pendingToken: step1.body.pendingToken, code: '000000' });
    expect(bad.status).toBe(401);
    const good = await api().post('/api/auth/officer/mfa/verify').send({ pendingToken: step1.body.pendingToken, code: totpAt(secret) });
    expect(good.status).toBe(200);
    expect(good.body.token).toBeTruthy();
    expect(good.body.officer.passwordHash).toBeUndefined();
    expect(good.body.officer.mfaSecret).toBeUndefined();
    await prisma.officer.update({ where: { id: o.id }, data: { active: false } });
  });
  test('a deactivated officer cannot use an existing token', async () => {
    const o = await prisma.officer.findUnique({ where: { email: 'mfa.test@tsc.demo' } });
    const t = jwt.sign({ typ: 'officer', role: 'CSO' }, process.env.JWT_OFFICER_SECRET, { subject: o.id, audience: 'tsc-officer', expiresIn: '1h' });
    expect((await api().get('/api/schools').set('Authorization', `Bearer ${t}`)).status).toBe(401);
  });
});

describe('jurisdiction scoping — each role sees only its tier', () => {
  const codes = async (who) => (await api().get('/api/schools?pageSize=100&withScore=false').set(as(who))).body.items.map((s) => s.code).sort();

  test('National Admin sees every school', async () => {
    expect(await codes('admin')).toHaveLength(7);
  });
  test('Eastern Regional Director sees Embu and Meru (both Eastern)', async () => {
    expect(await codes('rd')).toHaveLength(7);
  });
  test('Embu County Director sees only Embu schools', async () => {
    const c = await codes('cdEmbu');
    expect(c).toHaveLength(6);
    expect(c.every((x) => x.startsWith('DEMO-EMB'))).toBe(true);
  });
  test('Meru County Director sees only Meru schools', async () => {
    expect(await codes('cdMeru')).toEqual(['DEMO-MRU-001']);
  });
  test('Manyatta Sub-County Director sees only Manyatta schools', async () => {
    expect(await codes('scdManyatta')).toEqual(['DEMO-EMB-001', 'DEMO-EMB-002']);
  });
  test('CSO sees only assigned schools', async () => {
    expect(await codes('cso')).toEqual(['DEMO-EMB-001', 'DEMO-EMB-002']);
  });
  test('Head of Institution sees only their own school', async () => {
    expect(await codes('head')).toEqual(['DEMO-EMB-001']);
  });
  test('cross-county school detail is 404, not 403 (existence is not confirmed)', async () => {
    expect((await api().get(`/api/schools/${ids.kaaga.id}`).set(as('cdEmbu'))).status).toBe(404);
    expect((await api().get(`/api/schools/${ids.kiambere.id}`).set(as('cdMeru'))).status).toBe(404);
  });
  test('cross-county teacher detail is 404', async () => {
    expect((await api().get(`/api/teachers/${ids.meruTeacher.id}`).set(as('cdEmbu'))).status).toBe(404);
    expect((await api().get(`/api/teachers/${ids.embuTeacher.id}`).set(as('cdMeru'))).status).toBe(404);
    expect((await api().get(`/api/teachers/${ids.embuTeacher.id}`).set(as('cdEmbu'))).status).toBe(200);
  });
  test('sub-county peers cannot see each other', async () => {
    expect((await api().get(`/api/schools/${ids.kiambere.id}`).set(as('scdRunyenjes'))).status).toBe(404);
    expect((await api().get(`/api/schools/${ids.kianjokoma.id}`).set(as('scdManyatta'))).status).toBe(404);
  });
  test('teacher lists are scoped too', async () => {
    const all = (await api().get('/api/teachers?pageSize=200').set(as('cdMeru'))).body;
    const meruCount = await prisma.teacher.count({ where: { postings: { some: { status: 'ACTIVE', schoolId: ids.kaaga.id } } } });
    expect(all.total).toBe(meruCount);
  });
});

describe('sensitive data wall', () => {
  test('a Sub-County Director cannot read sensitive records', async () => {
    expect((await api().get(`/api/teachers/${ids.embuTeacher.id}/sensitive`).set(as('scdManyatta'))).status).toBe(403);
  });
  test('teacher detail omits sensitive fields below County Director', async () => {
    const res = await api().get(`/api/teachers/${ids.embuTeacher.id}`).set(as('scdManyatta'));
    expect(res.status).toBe(200);
    expect(res.body.sensitiveRecords).toBeUndefined();
    expect(res.body.cases).toBeUndefined();
    expect(res.body.nationalIdHash).toBeUndefined();
    expect(res.body.portalPasswordHash).toBeUndefined();
  });
  test('a County Director can add and read them, encrypted at rest, and every read is audited', async () => {
    const add = await api().post(`/api/teachers/${ids.embuTeacher.id}/sensitive`).set(as('cdEmbu')).send({ kind: 'HEALTH', content: 'Test medical note' });
    expect(add.status).toBe(201);
    const raw = await prisma.sensitiveRecord.findUnique({ where: { id: add.body.id } });
    expect(raw.ciphertext).not.toMatch(/medical/i);
    const read = await api().get(`/api/teachers/${ids.embuTeacher.id}/sensitive`).set(as('cdEmbu'));
    expect(read.body[0].content).toBe('Test medical note');
    const logged = await prisma.auditEvent.findFirst({ where: { action: 'SENSITIVE_READ', entityId: ids.embuTeacher.id } });
    expect(logged).toBeTruthy();
    const added = await prisma.auditEvent.findFirst({ where: { action: 'SENSITIVE_ADDED', entityId: ids.embuTeacher.id } });
    expect(JSON.stringify(added.detail)).not.toMatch(/medical/i);
  });
  test('a County Director cannot read another county’s sensitive records', async () => {
    expect((await api().get(`/api/teachers/${ids.embuTeacher.id}/sensitive`).set(as('cdMeru'))).status).toBe(404);
  });
  test('disciplinary-case flags are hidden below County Director', async () => {
    const scd = await api().get('/api/compliance/flags?rule=CASE_TIMELINES').set(as('scdManyatta'));
    expect(scd.body.total).toBe(0);
    const cd = await api().get('/api/compliance/flags?rule=CASE_TIMELINES').set(as('cdEmbu'));
    expect(cd.body.total).toBeGreaterThan(0);
  });
  test('the cases register is County Director and above only', async () => {
    expect((await api().get('/api/cases').set(as('scdManyatta'))).status).toBe(403);
    expect((await api().get('/api/cases').set(as('cdEmbu'))).status).toBe(200);
  });
});

describe('staffing ledger and the registration gate', () => {
  let pending;
  beforeAll(async () => {
    pending = await prisma.teacher.create({ data: { tscNumber: 'T-PENDING-1', nationalIdHash: 'x', firstName: 'Pending', lastName: 'Teacher', registrationStatus: 'PENDING' } });
  });

  test('posting a teacher whose registration is not ACTIVE is blocked', async () => {
    const res = await api().post('/api/postings').set(as('cdEmbu')).send({ teacherId: pending.id, schoolId: ids.kairuri.id, designation: 'Teacher', startDate: '2026-11-01' });
    expect(res.status).toBe(422);
    expect(res.body.details.rule).toBe('REGISTRATION_GATE');
  });
  test('a justified override lets it through, logged as an OVERRIDDEN flag and in the audit trail', async () => {
    const res = await api()
      .post('/api/postings')
      .set(as('cdEmbu'))
      .send({ teacherId: pending.id, schoolId: ids.kairuri.id, designation: 'Teacher', startDate: '2026-11-01', override: { reason: 'Registration approved by Board on 20 Oct; register update pending' } });
    expect(res.status).toBe(201);
    expect(res.body.override.overridden).toBe(true);
    const flag = await prisma.complianceFlag.findFirst({ where: { teacherId: pending.id, status: 'OVERRIDDEN' } });
    expect(flag.overriddenById).toBeTruthy();
    expect(await prisma.auditEvent.findFirst({ where: { action: 'RULE_OVERRIDE', entityId: pending.id } })).toBeTruthy();
  });
  test('a second substantive posting is refused — that is a transfer', async () => {
    const res = await api().post('/api/postings').set(as('cdEmbu')).send({ teacherId: pending.id, schoolId: ids.kiambere.id, designation: 'Teacher', startDate: '2026-11-02', override: { reason: 'Registration approved by Board on 20 Oct' } });
    expect(res.status).toBe(409);
  });
  test('Sub-County Directors and Heads cannot post teachers', async () => {
    expect((await api().post('/api/postings').set(as('scdManyatta')).send({})).status).toBe(403);
    expect((await api().post('/api/postings').set(as('head')).send({})).status).toBe(403);
  });
  test('a County Director cannot transfer a teacher into another county', async () => {
    const res = await api().post('/api/postings/transfer').set(as('cdEmbu')).send({ teacherId: ids.embuTeacher.id, toSchoolId: ids.kaaga.id, startDate: '2026-11-05', reason: 'Request' });
    expect(res.status).toBe(404);
  });
  test('an in-county transfer ends the old posting and opens the new one atomically', async () => {
    const res = await api().post('/api/postings/transfer').set(as('cdEmbu')).send({ teacherId: ids.embuTeacher.id, toSchoolId: ids.kianjokoma.id, startDate: '2026-11-05', reason: 'Approved transfer request' });
    expect(res.status).toBe(201);
    const old = await prisma.posting.findUnique({ where: { id: res.body.endedPostingId } });
    expect(old.status).toBe('ENDED');
    const active = await prisma.posting.findMany({ where: { teacherId: ids.embuTeacher.id, status: 'ACTIVE', type: 'SUBSTANTIVE' } });
    expect(active).toHaveLength(1);
    expect(active[0].schoolId).toBe(ids.kianjokoma.id);
  });
  test('filling a vacancy closes it', async () => {
    const v = await api().post('/api/vacancies').set(as('head')).send({ schoolId: ids.kiambere.id, designation: 'Teacher (Kiswahili)' });
    expect(v.status).toBe(201);
    const t = await prisma.teacher.create({ data: { tscNumber: 'T-NEW-1', nationalIdHash: 'x', firstName: 'New', lastName: 'Hire', registrationStatus: 'ACTIVE' } });
    const p = await api().post('/api/postings').set(as('cdEmbu')).send({ teacherId: t.id, schoolId: ids.kiambere.id, designation: 'Teacher (Kiswahili)', startDate: '2026-11-03', vacancyId: v.body.id });
    expect(p.status).toBe(201);
    const filled = await prisma.vacancy.findUnique({ where: { id: v.body.id } });
    expect(filled.postingId).toBe(p.body.posting.id);
  });
  test('posting roles can look up an unposted teacher by exact TSC number only', async () => {
    const r = await api().get('/api/teachers/lookup?tscNumber=T-PENDING-1').set(as('cdMeru'));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['firstName', 'holdsSubstantivePosting', 'id', 'lastName', 'registrationStatus', 'tscNumber']);
    expect((await api().get('/api/teachers/lookup?tscNumber=T-PEND').set(as('cdMeru'))).status).toBe(404);
    expect((await api().get('/api/teachers/lookup?tscNumber=T-PENDING-1').set(as('scdManyatta'))).status).toBe(403);
  });
  test('a Head cannot declare a vacancy at another school', async () => {
    expect((await api().post('/api/vacancies').set(as('head')).send({ schoolId: ids.gakwegori.id, designation: 'Teacher' })).status).toBe(404);
  });
});

describe('two-tier document approval', () => {
  let docId;
  test('a Head submits an appointment letter for their school', async () => {
    const t = await prisma.posting.findFirst({ where: { schoolId: ids.kiambere.id, status: 'ACTIVE' } });
    const res = await api().post('/api/documents').set(as('head')).send({ type: 'APPOINTMENT_LETTER', title: 'Test appointment', schoolId: ids.kiambere.id, teacherId: t.teacherId });
    expect(res.status).toBe(201);
    expect(res.body.nextTier).toBe('SUBCOUNTY');
    docId = res.body.id;
  });
  test('a Head cannot approve anything', async () => {
    expect((await api().post(`/api/documents/${docId}/decide`).set(as('head')).send({ decision: 'APPROVED' })).status).toBe(403);
  });
  test('the County Director cannot skip the sub-county tier', async () => {
    const res = await api().post(`/api/documents/${docId}/decide`).set(as('cdEmbu')).send({ decision: 'APPROVED' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/subcounty director/);
  });
  test('another sub-county’s director cannot see it', async () => {
    expect((await api().post(`/api/documents/${docId}/decide`).set(as('scdRunyenjes')).send({ decision: 'APPROVED' })).status).toBe(404);
  });
  test('the right Sub-County Director reviews it, then the County Director signs it off', async () => {
    const r1 = await api().post(`/api/documents/${docId}/decide`).set(as('scdManyatta')).send({ decision: 'APPROVED' });
    expect(r1.body.status).toBe('SUBCOUNTY_REVIEWED');
    expect(r1.body.decidedAt).toBeNull();
    const r2 = await api().post(`/api/documents/${docId}/decide`).set(as('cdEmbu')).send({ decision: 'APPROVED' });
    expect(r2.body.status).toBe('COUNTY_APPROVED');
    expect(r2.body.decidedAt).toBeTruthy();
    expect(r2.body.nextTier).toBeNull();
  });
  test('a final document cannot be decided again', async () => {
    expect((await api().post(`/api/documents/${docId}/decide`).set(as('cdEmbu')).send({ decision: 'REJECTED', reason: 'Changed mind' })).status).toBe(409);
  });
  test('promotion files need a third, national approval', async () => {
    const promo = await prisma.document.findFirst({ where: { type: 'PROMOTION_FILE' } });
    await api().post(`/api/documents/${promo.id}/decide`).set(as('scdManyatta')).send({ decision: 'APPROVED' });
    const r = await api().post(`/api/documents/${promo.id}/decide`).set(as('cdEmbu')).send({ decision: 'APPROVED' });
    expect(r.body.status).toBe('COUNTY_APPROVED');
    expect(r.body.nextTier).toBe('NATIONAL');
    expect(r.body.decidedAt).toBeNull();
    const n = await api().post(`/api/documents/${promo.id}/decide`).set(as('admin')).send({ decision: 'APPROVED' });
    expect(n.body.status).toBe('NATIONAL_APPROVED');
  });
  test('rejection needs a reason', async () => {
    const d = await api().post('/api/documents').set(as('head')).send({ type: 'OTHER', title: 'Needs reason', schoolId: ids.kiambere.id });
    const r = await api().post(`/api/documents/${d.body.id}/decide`).set(as('scdManyatta')).send({ decision: 'REJECTED' });
    expect(r.status).toBe(400);
    const ok = await api().post(`/api/documents/${d.body.id}/decide`).set(as('scdManyatta')).send({ decision: 'REJECTED', reason: 'Wrong form used' });
    expect(ok.body.status).toBe('REJECTED');
  });
  test('four-eyes: nobody decides a document they submitted', async () => {
    const d = await api().post('/api/documents').set(as('scdManyatta')).send({ type: 'OTHER', title: 'Own submission', schoolId: ids.kiambere.id });
    const r = await api().post(`/api/documents/${d.body.id}/decide`).set(as('scdManyatta')).send({ decision: 'APPROVED' });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/submitted/);
  });
  test('"awaiting me" shows each officer only their tier’s queue', async () => {
    const r = await api().get('/api/documents?awaiting=me').set(as('scdManyatta'));
    expect(r.body.items.every((d) => d.status === 'SUBMITTED')).toBe(true);
  });
  test('a PDF can be attached by the submitter and read back within scope only', async () => {
    const d = await api().post('/api/documents').set(as('head')).send({ type: 'OTHER', title: 'With file', schoolId: ids.kiambere.id });
    const pdf = Buffer.from('%PDF-1.4\n% test file\n');
    const up = await api().put(`/api/documents/${d.body.id}/file?fileName=test.pdf`).set(as('head')).set('Content-Type', 'application/pdf').send(pdf);
    expect(up.status).toBe(200);
    const back = await api().get(`/api/documents/${d.body.id}/file`).set(as('scdManyatta')).buffer(true).parse((res, cb) => { const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(back.status).toBe(200);
    expect(back.headers['content-type']).toMatch(/application\/pdf/);
    expect(Buffer.compare(back.body, pdf)).toBe(0); // stored in the database, returned byte for byte
    expect((await api().get(`/api/documents/${d.body.id}/file`).set(as('cdMeru'))).status).toBe(404);
  });
});

describe('field quality assurance', () => {
  let visitId;
  test('a CSO plans a visit only at an assigned school', async () => {
    expect((await api().post('/api/visits').set(as('cso')).send({ schoolId: ids.kairuri.id, plannedDate: '2026-11-10', purpose: 'Lesson observation' })).status).toBe(404);
    const ok = await api().post('/api/visits').set(as('cso')).send({ schoolId: ids.kiambere.id, plannedDate: '2026-11-10', purpose: 'Lesson observation' });
    expect(ok.status).toBe(201);
    visitId = ok.body.id;
  });
  test('the report cannot be filed before sign-off', async () => {
    expect((await api().post(`/api/visits/${visitId}/complete`).set(as('cso')).send({ report: 'Observed three lessons; schemes of work up to date.' })).status).toBe(409);
  });
  test('a CSO cannot sign off their own visit; the Sub-County Director can', async () => {
    expect((await api().post(`/api/visits/${visitId}/approve`).set(as('cso'))).status).toBe(403);
    const r = await api().post(`/api/visits/${visitId}/approve`).set(as('scdManyatta'));
    expect(r.body.status).toBe('APPROVED');
  });
  test('the CSO files the report', async () => {
    expect((await api().post(`/api/visits/${visitId}/complete`).set(as('cso')).send({ report: 'short' })).status).toBe(400);
    const r = await api().post(`/api/visits/${visitId}/complete`).set(as('cso')).send({ report: 'Observed three lessons; schemes of work up to date.' });
    expect(r.body.status).toBe('COMPLETED');
  });
});

describe('compliance rules and settings', () => {
  test('flags are raised by the scan and scoped to jurisdiction', async () => {
    const meru = await api().get('/api/compliance/flags?pageSize=200').set(as('cdMeru'));
    expect(meru.body.items.every((f) => f.schoolId === ids.kaaga.id)).toBe(true);
  });
  test('a rerun does not duplicate flags', async () => {
    const before = await prisma.complianceFlag.count();
    await api().post('/api/compliance/run').set(as('admin'));
    await api().post('/api/compliance/run').set(as('admin'));
    const after = await prisma.complianceFlag.count();
    expect(after - before).toBeLessThanOrEqual(2); // only genuinely new findings from earlier tests
  });
  test('an override needs a reason and a County Director or above', async () => {
    const f = await prisma.complianceFlag.findFirst({ where: { status: 'OPEN', schoolId: ids.kiambere.id } });
    expect((await api().post(`/api/compliance/flags/${f.id}/override`).set(as('scdManyatta')).send({ reason: 'A long enough reason' })).status).toBe(403);
    expect((await api().post(`/api/compliance/flags/${f.id}/override`).set(as('cdEmbu')).send({ reason: 'short' })).status).toBe(400);
    const ok = await api().post(`/api/compliance/flags/${f.id}/override`).set(as('cdEmbu')).send({ reason: 'Reviewed with the school; plan agreed' });
    expect(ok.body.status).toBe('OVERRIDDEN');
  });
  test('an overridden flag stays overridden after a rerun', async () => {
    const f = await prisma.complianceFlag.findFirst({ where: { status: 'OVERRIDDEN', schoolId: ids.kiambere.id, overrideReason: 'Reviewed with the school; plan agreed' } });
    await api().post('/api/compliance/run').set(as('admin'));
    expect((await prisma.complianceFlag.findUnique({ where: { id: f.id } })).status).toBe('OVERRIDDEN');
  });
  test('only the National Admin changes rule settings; weights must sum to 100', async () => {
    const good = { staffing: 25, appraisal: 20, records: 20, documents: 15, vacancies: 10, cases: 10 };
    expect((await api().put('/api/compliance/rules/score.weights').set(as('cdEmbu')).send({ value: good })).status).toBe(403);
    const bad = await api().put('/api/compliance/rules/score.weights').set(as('admin')).send({ value: { ...good, staffing: 40 } });
    expect(bad.status).toBe(400);
    const ok = await api().put('/api/compliance/rules/score.weights').set(as('admin')).send({ value: good, confirmed: true });
    expect(ok.status).toBe(200);
    expect(ok.body.confirmed).toBe(true);
    expect(await prisma.auditEvent.findFirst({ where: { action: 'RULE_CONFIG_CHANGED', entityId: 'score.weights' } })).toBeTruthy();
  });
  test('malformed rule values are refused', async () => {
    expect((await api().put('/api/compliance/rules/appraisal.termDeadlines').set(as('admin')).send({ value: { 1: '4-30', 2: '08-31', 3: '11-30' } })).status).toBe(400);
    expect((await api().put('/api/compliance/rules/no.such.rule').set(as('admin')).send({ value: 1 })).status).toBe(404);
  });
});

describe('readiness score and reports', () => {
  test('school detail carries a full, transparent score breakdown', async () => {
    const r = await api().get(`/api/schools/${ids.kiambere.id}`).set(as('cdEmbu'));
    expect(r.body.score.factors).toHaveLength(6);
    expect(['AA', 'A', 'B', 'C', 'D']).toContain(r.body.score.band);
  });
  test('the trickle-down tree for a County Director contains only their county', async () => {
    const r = await api().get('/api/reports/staffing').set(as('cdEmbu'));
    const regions = r.body.tree.children;
    expect(regions).toHaveLength(1);
    expect(regions[0].children.map((c) => c.name)).toEqual(['Embu']);
  });
  test('drilling to a school lists each teacher posted there', async () => {
    const r = await api().get(`/api/reports/staffing?schoolId=${ids.kiambere.id}`).set(as('cdEmbu'));
    expect(r.body.postings.length).toBeGreaterThan(5);
    expect((await api().get(`/api/reports/staffing?schoolId=${ids.kiambere.id}`).set(as('cdMeru'))).status).toBe(404);
  });
  test('the dashboard summary is scoped', async () => {
    const r = await api().get('/api/reports/summary').set(as('head'));
    expect(r.body.schools).toBe(1);
  });
});

describe('teacher portal — a separate identity', () => {
  let teacherToken;
  const tsc = '100001';

  test('registration with the wrong national ID gets a generic answer', async () => {
    const r = await api().post('/api/auth/teacher/register').send({ tscNumber: tsc, nationalId: '99999999', password: 'portal-pass-123' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/could not match/);
  });
  test('registration with matching TSC number and national ID succeeds', async () => {
    const r = await api().post('/api/auth/teacher/register').send({ tscNumber: tsc, nationalId: `2${tsc}`, password: 'portal-pass-123' });
    expect(r.status).toBe(201);
    teacherToken = r.body.token;
  });
  test('a portal cannot be registered twice', async () => {
    expect((await api().post('/api/auth/teacher/register').send({ tscNumber: tsc, nationalId: `2${tsc}`, password: 'another-pass-123' })).status).toBe(400);
  });
  test('a teacher token is useless on officer routes, and an officer token on the portal', async () => {
    expect((await api().get('/api/schools').set('Authorization', `Bearer ${teacherToken}`)).status).toBe(401);
    expect((await api().get('/api/portal/me').set(as('admin'))).status).toBe(401);
  });
  test('a teacher sees their own record', async () => {
    const r = await api().get('/api/portal/me').set('Authorization', `Bearer ${teacherToken}`);
    expect(r.body.tscNumber).toBe(tsc);
    expect(r.body.nationalIdHash).toBeUndefined();
    expect(r.body.postings.length).toBeGreaterThan(0);
  });
  test('a transfer request carries its eligibility check, and a duplicate is refused', async () => {
    const r = await api().post('/api/portal/transfer-requests').set('Authorization', `Bearer ${teacherToken}`).send({ reason: 'Family relocation to Meru County' });
    expect(r.status).toBe(201);
    expect(typeof r.body.eligibility.eligible).toBe('boolean');
    expect((await api().post('/api/portal/transfer-requests').set('Authorization', `Bearer ${teacherToken}`).send({ reason: 'Family relocation to Meru County' })).status).toBe(409);
  });
  test('the right of access: a full export of the teacher’s own data', async () => {
    const r = await api().get('/api/portal/my-data').set('Authorization', `Bearer ${teacherToken}`);
    expect(r.status).toBe(200);
    expect(r.body.record.tscNumber).toBe(tsc);
    expect(JSON.stringify(r.body)).not.toMatch(/nationalIdHash|portalPasswordHash/);
  });
  test('the right to correction: a request reaches officers in scope', async () => {
    const r = await api().post('/api/portal/corrections').set('Authorization', `Bearer ${teacherToken}`).send({ field: 'lastName', requested: 'Spelling should be Muriithi' });
    expect(r.status).toBe(201);
    const list = await api().get('/api/teachers/corrections').set(as('cdEmbu'));
    expect(list.body.some((c) => c.id === r.body.id)).toBe(true);
    const meru = await api().get('/api/teachers/corrections').set(as('cdMeru'));
    expect(meru.body.some((c) => c.id === r.body.id)).toBe(false);
  });
});

describe('officer management', () => {
  test('a County Director cannot create a National Admin', async () => {
    const r = await api().post('/api/officers').set(as('cdEmbu')).send({ staffNumber: 'X1', name: 'Escalate', email: 'x1@tsc.demo', password: 'long-password-1', role: 'NATIONAL_ADMIN' });
    expect(r.status).toBe(403);
  });
  test('a County Director cannot assign a CSO to another county’s school', async () => {
    const r = await api().post('/api/officers').set(as('cdEmbu')).send({ staffNumber: 'X2', name: 'CSO', email: 'x2@tsc.demo', password: 'long-password-1', role: 'CSO', csoSchoolIds: [ids.kaaga.id] });
    expect(r.status).toBe(403);
    expect(await prisma.officer.findUnique({ where: { email: 'x2@tsc.demo' } })).toBeNull(); // rolled back
  });
  test('jurisdiction must match the role', async () => {
    const r = await api().post('/api/officers').set(as('admin')).send({ staffNumber: 'X3', name: 'Bad', email: 'x3@tsc.demo', password: 'long-password-1', role: 'COUNTY_DIRECTOR' });
    expect(r.status).toBe(400);
  });
  test('a County Director creates a CSO for their own schools', async () => {
    const r = await api().post('/api/officers').set(as('cdEmbu')).send({ staffNumber: 'X4', name: 'New CSO', email: 'x4@tsc.demo', password: 'long-password-1', role: 'CSO', csoSchoolIds: [ids.kairuri.id] });
    expect(r.status).toBe(201);
    expect(r.body.passwordHash).toBeUndefined();
  });
});

describe('integrations', () => {
  test('appraisal import refuses rows outside the importer’s county, and applies nothing', async () => {
    const t = await prisma.teacher.findFirst({ where: { postings: { some: { schoolId: ids.kaaga.id } } } });
    const csv = `tscNumber,schoolCode,year,term\n${t.tscNumber},DEMO-MRU-001,2026,3\n`;
    const r = await api().post('/api/integrations/import/appraisals').set(as('cdEmbu')).set('Content-Type', 'text/csv').send(csv);
    expect(r.status).toBe(422);
    expect(r.body.applied).toBe(false);
  });
  test('a valid import is applied and audited', async () => {
    const t = await prisma.teacher.findFirst({ where: { postings: { some: { schoolId: ids.kairuri.id, status: 'ACTIVE' } } } });
    const csv = `tscNumber,schoolCode,year,term,complete\n${t.tscNumber},DEMO-EMB-004,2025,1,yes\n`;
    const r = await api().post('/api/integrations/import/appraisals').set(as('cdEmbu')).set('Content-Type', 'text/csv').send(csv);
    expect(r.status).toBe(200);
    expect(r.body.rows).toBe(1);
  });
  test('malformed CSV is a 400, not a crash', async () => {
    const r = await api().post('/api/integrations/import/teachers').set(as('admin')).set('Content-Type', 'text/csv').send('tscNumber,"unclosed\n1,2');
    expect(r.status).toBe(400);
  });
  test('teacher register import: a dry run validates without writing', async () => {
    const csv = 'tscNumber,nationalId,firstName,lastName,gender,registrationStatus\nIMP-1,11112222,Imported,Teacher,F,ACTIVE\n';
    const dry = await api().post('/api/integrations/import/teachers?dryRun=true').set(as('admin')).set('Content-Type', 'text/csv').send(csv);
    expect(dry.body.applied).toBe(false);
    expect(await prisma.teacher.findUnique({ where: { tscNumber: 'IMP-1' } })).toBeNull();
    const real = await api().post('/api/integrations/import/teachers').set(as('admin')).set('Content-Type', 'text/csv').send(csv);
    expect(real.body.created).toBe(1);
  });
});


describe('geography: sub-counties are added from inside the system', () => {
  let embuId;
  let meruId;
  beforeAll(async () => {
    embuId = (await prisma.county.findUnique({ where: { code: '14' } })).id;
    meruId = (await prisma.county.findUnique({ where: { code: '12' } })).id;
  });
  test('a County Director adds sub-counties to their own county; existing names are skipped', async () => {
    const r = await api().post(`/api/geo/counties/${embuId}/sub-counties`).set(as('cdEmbu')).send({ names: ['Embu West', 'Manyatta', 'embu west'] });
    expect(r.status).toBe(201);
    expect(r.body.added).toEqual(['Embu West']);
    expect(r.body.skipped).toEqual(['Manyatta']);
    expect(await prisma.auditEvent.findFirst({ where: { action: 'SUBCOUNTIES_ADDED', entityId: embuId } })).toBeTruthy();
  });
  test('a County Director cannot add to another county', async () => {
    expect((await api().post(`/api/geo/counties/${meruId}/sub-counties`).set(as('cdEmbu')).send({ names: ['Tigania West'] })).status).toBe(403);
  });
  test('the National Admin can add anywhere; lower roles cannot add at all', async () => {
    expect((await api().post(`/api/geo/counties/${meruId}/sub-counties`).set(as('admin')).send({ names: ['Tigania West'] })).status).toBe(201);
    expect((await api().post(`/api/geo/counties/${embuId}/sub-counties`).set(as('scdManyatta')).send({ names: ['X Y'] })).status).toBe(403);
  });
  test('names are validated', async () => {
    expect((await api().post(`/api/geo/counties/${embuId}/sub-counties`).set(as('admin')).send({ names: ['A'] })).status).toBe(400);
    expect((await api().post(`/api/geo/counties/${embuId}/sub-counties`).set(as('admin')).send({ names: [] })).status).toBe(400);
  });
});

describe('built-in rules schedule', () => {
  test('a scan is not due right after one has run', async () => {
    await runRules();
    expect(await claimRun(new Date())).toBe(false);
  });
  test('a scan is due once the interval has passed, and the claim is recorded', async () => {
    const later = new Date(Date.now() + 48 * 3600000);
    expect(await claimRun(later)).toBe(true);
    expect(await prisma.auditEvent.findFirst({ where: { action: 'RULES_RUN_STARTED' }, orderBy: { id: 'desc' } })).toBeTruthy();
    expect(await claimRun(new Date())).toBe(false);
  });
});

describe('audit trail', () => {
  test('the hash chain verifies end to end', async () => {
    const r = await api().get('/api/admin/audit/verify').set(as('admin'));
    expect(r.body.valid).toBe(true);
    expect(r.body.checked).toBeGreaterThan(20);
  });
  test('only the National Admin can read it', async () => {
    expect((await api().get('/api/admin/audit').set(as('cdEmbu'))).status).toBe(403);
  });
  test('the database refuses to UPDATE or DELETE audit rows', async () => {
    await expect(prisma.$executeRawUnsafe('UPDATE "AuditEvent" SET action = \'X\'')).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('DELETE FROM "AuditEvent"')).rejects.toThrow(/append-only/);
  });
});
