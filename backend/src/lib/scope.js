/**
 * Jurisdiction scoping. Every query that touches schools, teachers or anything
 * hanging off them is filtered through these helpers BEFORE it runs, so an
 * officer can never read outside their tier — scoped by design, not by menus.
 */
const prisma = require('./prisma');
const { notFound, badRequest } = require('./http');

const ROLE_SCOPE_FIELD = {
  NATIONAL_ADMIN: null,
  REGIONAL_DIRECTOR: 'regionId',
  COUNTY_DIRECTOR: 'countyId',
  SUBCOUNTY_DIRECTOR: 'subCountyId',
  CSO: null, // scoped by CsoAssignment rows
  HEAD_OF_INSTITUTION: 'schoolId',
};

/** Prisma `where` for School rows this officer may see. */
function schoolWhere(officer) {
  switch (officer.role) {
    case 'NATIONAL_ADMIN':
      return {};
    case 'REGIONAL_DIRECTOR':
      return { subCounty: { county: { regionId: officer.regionId } } };
    case 'COUNTY_DIRECTOR':
      return { subCounty: { countyId: officer.countyId } };
    case 'SUBCOUNTY_DIRECTOR':
      return { subCountyId: officer.subCountyId };
    case 'CSO':
      return { csoAssignments: { some: { officerId: officer.id } } };
    case 'HEAD_OF_INSTITUTION':
      return { id: officer.schoolId };
    default:
      return { id: '__none__' }; // unknown role sees nothing
  }
}

/** Teachers currently posted to a school in scope. */
function teacherWhere(officer) {
  if (officer.role === 'NATIONAL_ADMIN') return {};
  return { postings: { some: { status: 'ACTIVE', school: schoolWhere(officer) } } };
}

/**
 * Throws 404 (not 403) when the school is out of scope, so the API never
 * confirms that a record in another jurisdiction exists.
 */
async function assertSchoolInScope(officer, schoolId, client = prisma) {
  const school = await client.school.findFirst({ where: { AND: [{ id: schoolId }, schoolWhere(officer)] } });
  if (!school) throw notFound('School not found');
  return school;
}

async function assertTeacherInScope(officer, teacherId, client = prisma) {
  const teacher = await client.teacher.findFirst({ where: { AND: [{ id: teacherId }, teacherWhere(officer)] } });
  if (!teacher) throw notFound('Teacher not found');
  return teacher;
}

/** Health, disability and disciplinary data: County Director and National Admin only. */
function canSeeSensitive(officer) {
  return officer.role === 'NATIONAL_ADMIN' || officer.role === 'COUNTY_DIRECTOR';
}

/** The county an officer belongs to (null for national/regional/CSO). */
async function officerCountyId(officer, client = prisma) {
  if (officer.countyId) return officer.countyId;
  if (officer.subCountyId) {
    const sc = await client.subCounty.findUnique({ where: { id: officer.subCountyId } });
    return sc && sc.countyId;
  }
  if (officer.schoolId) {
    const s = await client.school.findUnique({ where: { id: officer.schoolId }, include: { subCounty: true } });
    return s && s.subCounty.countyId;
  }
  return null;
}

/** Validates that an officer record carries exactly the jurisdiction its role needs. */
function validateJurisdiction(role, scope) {
  const fields = ['regionId', 'countyId', 'subCountyId', 'schoolId'];
  const needed = ROLE_SCOPE_FIELD[role];
  for (const f of fields) {
    if (f === needed && !scope[f]) throw badRequest(`${role} requires ${f}`);
    if (f !== needed && scope[f]) throw badRequest(`${role} must not have ${f}`);
  }
}

module.exports = {
  schoolWhere,
  teacherWhere,
  assertSchoolInScope,
  assertTeacherInScope,
  canSeeSensitive,
  officerCountyId,
  validateJurisdiction,
  ROLE_SCOPE_FIELD,
};
