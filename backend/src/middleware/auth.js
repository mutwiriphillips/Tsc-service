/**
 * Dual-tier authentication. Officers and teachers are two token types signed
 * with two different secrets and checked by two different middlewares, so a
 * teacher token can never be replayed against an officer route (or vice versa).
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../lib/prisma');
const { unauthorized, forbidden } = require('../lib/http');

const OFFICER = 'officer';
const OFFICER_MFA_PENDING = 'officer-mfa-pending';
const TEACHER = 'teacher';

function signOfficer(officer) {
  return jwt.sign({ typ: OFFICER, role: officer.role }, env.JWT_OFFICER_SECRET, {
    subject: officer.id,
    expiresIn: env.OFFICER_TOKEN_TTL,
    audience: 'tsc-officer',
  });
}

function signOfficerMfaPending(officer) {
  return jwt.sign({ typ: OFFICER_MFA_PENDING }, env.JWT_OFFICER_SECRET, {
    subject: officer.id,
    expiresIn: '5m',
    audience: 'tsc-officer-mfa',
  });
}

function signTeacher(teacher) {
  return jwt.sign({ typ: TEACHER }, env.JWT_TEACHER_SECRET, {
    subject: teacher.id,
    expiresIn: env.TEACHER_TOKEN_TTL,
    audience: 'tsc-teacher',
  });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const [kind, token] = h.split(' ');
  return kind === 'Bearer' && token ? token : null;
}

function verify(token, secret, audience, typ) {
  try {
    const payload = jwt.verify(token, secret, { audience, algorithms: ['HS256'] });
    return payload.typ === typ ? payload : null;
  } catch {
    return null;
  }
}

async function requireOfficer(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const payload = verify(token, env.JWT_OFFICER_SECRET, 'tsc-officer', OFFICER);
    if (!payload) throw unauthorized('Invalid or expired session');
    const officer = await prisma.officer.findUnique({ where: { id: payload.sub } });
    if (!officer || !officer.active) throw unauthorized('Account is not active');
    req.officer = officer;
    next();
  } catch (e) {
    next(e);
  }
}

function verifyMfaPending(token) {
  return verify(token, env.JWT_OFFICER_SECRET, 'tsc-officer-mfa', OFFICER_MFA_PENDING);
}

async function requireTeacher(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const payload = verify(token, env.JWT_TEACHER_SECRET, 'tsc-teacher', TEACHER);
    if (!payload) throw unauthorized('Invalid or expired session');
    const teacher = await prisma.teacher.findUnique({ where: { id: payload.sub } });
    if (!teacher || !teacher.portalActivatedAt || teacher.registrationStatus === 'DEREGISTERED') {
      throw unauthorized('Portal access is not active');
    }
    req.teacher = teacher;
    next();
  } catch (e) {
    next(e);
  }
}

const requireRole =
  (...roles) =>
  (req, res, next) =>
    req.officer && roles.includes(req.officer.role) ? next() : next(forbidden());

module.exports = {
  signOfficer,
  signOfficerMfaPending,
  signTeacher,
  verifyMfaPending,
  requireOfficer,
  requireTeacher,
  requireRole,
};
