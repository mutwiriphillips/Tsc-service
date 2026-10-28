export const ROLE_LABEL = {
  NATIONAL_ADMIN: 'National Admin',
  REGIONAL_DIRECTOR: 'Regional Director',
  COUNTY_DIRECTOR: 'County Director',
  SUBCOUNTY_DIRECTOR: 'Sub-County Director',
  CSO: 'Curriculum Support Officer',
  HEAD_OF_INSTITUTION: 'Head of Institution',
};

export const DOC_TYPE = {
  APPOINTMENT_LETTER: 'Appointment letter',
  TRANSFER_REQUEST: 'Transfer request',
  PROMOTION_FILE: 'Promotion file',
  APPRAISAL_RETURN: 'Appraisal return',
  OTHER: 'Other',
};

export const DOC_STATUS = {
  SUBMITTED: 'Awaiting sub-county review',
  SUBCOUNTY_REVIEWED: 'Awaiting county sign-off',
  COUNTY_APPROVED: 'Approved by county',
  NATIONAL_APPROVED: 'Approved nationally',
  REJECTED: 'Rejected',
};

export const TIER_LABEL = { SUBCOUNTY: 'Sub-County review', COUNTY: 'County sign-off', NATIONAL: 'National approval' };

export const LEVEL = {
  PRIMARY: 'Primary',
  JUNIOR_SCHOOL: 'Junior school',
  SECONDARY: 'Secondary',
  TEACHER_TRAINING: 'Teacher training',
  SPECIAL_NEEDS: 'Special needs',
};

export const FACTOR_LABEL = {
  staffing: 'Staffing against establishment',
  appraisal: 'Appraisal completion',
  records: 'Registration and records',
  documents: 'Document turnaround',
  vacancies: 'Vacancy fill time',
  cases: 'Case timeliness',
};

export const RULE_LABEL = {
  REGISTRATION_GATE: 'Registration gate',
  APPRAISAL_CYCLE: 'Appraisal cycle',
  ACTING_LIMIT: 'Acting appointment limit',
  STAFFING_NORMS: 'Staffing norms',
  TRANSFER_ELIGIBILITY: 'Transfer eligibility',
  CASE_TIMELINES: 'Case timelines',
};

const DATE_FMT = new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
const DATETIME_FMT = new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

export const fmtDate = (d) => (d ? DATE_FMT.format(new Date(d)) : '—');
export const fmtDateTime = (d) => (d ? DATETIME_FMT.format(new Date(d)) : '—');
export const fullName = (t) => (t ? `${t.firstName} ${t.lastName}` : '—');
export const pct = (n) => (n == null ? '—' : `${Math.round(n)}%`);
export const today = () => new Date().toISOString().slice(0, 10);

export function docStatusTag(status) {
  if (status === 'REJECTED') return 'breach';
  if (status === 'COUNTY_APPROVED' || status === 'NATIONAL_APPROVED') return 'ok';
  return 'info';
}
