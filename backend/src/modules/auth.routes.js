const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const env = require('../config/env');
const prisma = require('../lib/prisma');
const audit = require('../lib/audit');
const { ah, parse, unauthorized, badRequest } = require('../lib/http');
const { encrypt, decrypt, generateTotpSecret, verifyTotp, totpUri, nationalIdMatches } = require('../lib/crypto');
const {
  signOfficer,
  signOfficerMfaPending,
  signTeacher,
  verifyMfaPending,
  requireOfficer,
} = require('../middleware/auth');

const router = express.Router();

// Brute-force protection on credential checks only (sign-in, two-step codes, portal
// registration). Session lookups such as /officer/me run on every page and are not limited.
const attempts = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});

const PASSWORD = z.string().min(10, 'Password must be at least 10 characters').max(200);
// A bcrypt hash of a random string, so failed lookups take as long as real ones.
const DUMMY_HASH = bcrypt.hashSync(`unused-${Math.random()}`, 10);

function publicOfficer(o) {
  const { passwordHash, mfaSecret, ...rest } = o;
  void passwordHash;
  void mfaSecret;
  return rest;
}

// ───────────── Officers ─────────────

router.post(
  '/officer/login',
  attempts,
  ah(async (req, res) => {
    const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const officer = await prisma.officer.findUnique({ where: { email: email.toLowerCase() } });
    const ok = await bcrypt.compare(password, officer ? officer.passwordHash : DUMMY_HASH);
    if (!officer || !ok || !officer.active) {
      await audit.record(null, {
        actorType: 'OFFICER',
        actorId: officer ? officer.id : null,
        action: 'LOGIN_FAILED',
        entityType: 'Officer',
        entityId: officer ? officer.id : null,
      });
      throw unauthorized('Incorrect email or password');
    }
    if (officer.mfaEnabled) {
      return res.json({ mfaRequired: true, pendingToken: signOfficerMfaPending(officer) });
    }
    if (env.MFA_REQUIRED) {
      return res.json({ mfaSetupRequired: true, pendingToken: signOfficerMfaPending(officer) });
    }
    await audit.record(null, { actorType: 'OFFICER', actorId: officer.id, action: 'LOGIN', entityType: 'Officer', entityId: officer.id });
    return res.json({ token: signOfficer(officer), officer: publicOfficer(officer) });
  }),
);

/** Start MFA enrolment: with a pending token (first sign-in) or a full session. */
router.post(
  '/officer/mfa/setup',
  attempts,
  ah(async (req, res) => {
    const { pendingToken } = parse(z.object({ pendingToken: z.string() }), req.body);
    const p = verifyMfaPending(pendingToken);
    if (!p) throw unauthorized('Sign-in step expired. Sign in again.');
    const officer = await prisma.officer.findUnique({ where: { id: p.sub } });
    if (!officer || !officer.active) throw unauthorized();
    if (officer.mfaEnabled) throw badRequest('Two-factor sign-in is already set up');
    const secret = generateTotpSecret();
    await prisma.officer.update({ where: { id: officer.id }, data: { mfaSecret: encrypt(secret) } });
    res.json({ secret, otpauthUri: totpUri(secret, officer.email) });
  }),
);

router.post(
  '/officer/mfa/verify',
  attempts,
  ah(async (req, res) => {
    const { pendingToken, code } = parse(z.object({ pendingToken: z.string(), code: z.string() }), req.body);
    const p = verifyMfaPending(pendingToken);
    if (!p) throw unauthorized('Sign-in step expired. Sign in again.');
    const officer = await prisma.officer.findUnique({ where: { id: p.sub } });
    if (!officer || !officer.active || !officer.mfaSecret) throw unauthorized();
    if (!verifyTotp(decrypt(officer.mfaSecret), code)) {
      await audit.record(null, { actorType: 'OFFICER', actorId: officer.id, action: 'MFA_FAILED', entityType: 'Officer', entityId: officer.id });
      throw unauthorized('Incorrect code');
    }
    let current = officer;
    if (!officer.mfaEnabled) {
      current = await prisma.officer.update({ where: { id: officer.id }, data: { mfaEnabled: true } });
      await audit.record(null, { actorType: 'OFFICER', actorId: officer.id, action: 'MFA_ENROLLED', entityType: 'Officer', entityId: officer.id });
    }
    await audit.record(null, { actorType: 'OFFICER', actorId: officer.id, action: 'LOGIN', entityType: 'Officer', entityId: officer.id, detail: { mfa: true } });
    res.json({ token: signOfficer(current), officer: publicOfficer(current) });
  }),
);

router.get(
  '/officer/me',
  requireOfficer,
  ah(async (req, res) => {
    const o = await prisma.officer.findUnique({
      where: { id: req.officer.id },
      include: { region: true, county: true, subCounty: true, school: true, csoAssignments: { include: { school: true } } },
    });
    res.json(publicOfficer(o));
  }),
);

router.post(
  '/officer/change-password',
  attempts,
  requireOfficer,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string(), newPassword: PASSWORD }), req.body);
    if (!(await bcrypt.compare(currentPassword, req.officer.passwordHash))) throw unauthorized('Current password is incorrect');
    await prisma.officer.update({ where: { id: req.officer.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    await audit.record(null, { actorType: 'OFFICER', actorId: req.officer.id, action: 'PASSWORD_CHANGED', entityType: 'Officer', entityId: req.officer.id });
    res.json({ ok: true });
  }),
);

// ───────────── Teachers (separate identity) ─────────────

const GENERIC_REG_ERROR = 'We could not match those details to an active TSC record. Check them, or contact your Sub-County office.';

/** Registration: TSC number + national ID must match the registry, as farmers match membership records. */
router.post(
  '/teacher/register',
  attempts,
  ah(async (req, res) => {
    const { tscNumber, nationalId, password } = parse(
      z.object({ tscNumber: z.string().min(3).max(20), nationalId: z.string().min(4).max(20), password: PASSWORD }),
      req.body,
    );
    const teacher = await prisma.teacher.findUnique({ where: { tscNumber: tscNumber.trim() } });
    const valid =
      teacher &&
      !teacher.portalActivatedAt &&
      teacher.registrationStatus !== 'DEREGISTERED' &&
      nationalIdMatches(nationalId, teacher.nationalIdHash);
    if (!valid) {
      await audit.record(null, { actorType: 'TEACHER', actorId: teacher ? teacher.id : null, action: 'PORTAL_REGISTER_FAILED', entityType: 'Teacher', entityId: teacher ? teacher.id : null });
      throw badRequest(GENERIC_REG_ERROR);
    }
    const updated = await prisma.teacher.update({
      where: { id: teacher.id },
      data: { portalPasswordHash: await bcrypt.hash(password, 12), portalActivatedAt: new Date() },
    });
    await audit.record(null, { actorType: 'TEACHER', actorId: teacher.id, action: 'PORTAL_REGISTERED', entityType: 'Teacher', entityId: teacher.id });
    res.status(201).json({ token: signTeacher(updated) });
  }),
);

router.post(
  '/teacher/login',
  attempts,
  ah(async (req, res) => {
    const { tscNumber, password } = parse(z.object({ tscNumber: z.string(), password: z.string() }), req.body);
    const teacher = await prisma.teacher.findUnique({ where: { tscNumber: tscNumber.trim() } });
    const ok = await bcrypt.compare(password, (teacher && teacher.portalPasswordHash) || DUMMY_HASH);
    if (!teacher || !ok || !teacher.portalActivatedAt || teacher.registrationStatus === 'DEREGISTERED') {
      throw unauthorized('Incorrect TSC number or password');
    }
    await audit.record(null, { actorType: 'TEACHER', actorId: teacher.id, action: 'LOGIN', entityType: 'Teacher', entityId: teacher.id });
    res.json({ token: signTeacher(teacher) });
  }),
);

module.exports = router;
