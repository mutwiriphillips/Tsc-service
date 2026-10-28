/**
 * Compliance rules — pure evaluators. Each takes plain data + config + `now`
 * and returns flags. No database access here, so every rule is unit-testable.
 *
 * A flag: { dedupeKey, rule, severity, label, message, schoolId, teacherId, entityType, entityId }
 * The dedupeKey includes severity, so a WARNING that escalates to a BREACH raises
 * a new flag (an override of the warning never silences the breach).
 */

const DAY = 86400000;

const RULES = {
  REGISTRATION_GATE: 'REGISTRATION_GATE',
  APPRAISAL_CYCLE: 'APPRAISAL_CYCLE',
  ACTING_LIMIT: 'ACTING_LIMIT',
  STAFFING_NORMS: 'STAFFING_NORMS',
  TRANSFER_ELIGIBILITY: 'TRANSFER_ELIGIBILITY',
  CASE_TIMELINES: 'CASE_TIMELINES',
};

function flag(rule, severity, entityType, entityId, extra) {
  return { dedupeKey: `${rule}:${entityType}:${entityId}:${severity}`, rule, severity, entityType, entityId, ...extra };
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / DAY);

// ── 1. Registration gate ──
/** Used at posting time: may this teacher be posted? */
function checkRegistrationGate(teacher) {
  if (teacher.registrationStatus === 'ACTIVE') return { allowed: true };
  return {
    allowed: false,
    reason: `Teacher ${teacher.tscNumber} has registration status ${teacher.registrationStatus}. Only ACTIVE registrations may be posted.`,
  };
}

/** Scan: active postings held by teachers who are no longer actively registered. */
function evaluateRegistration(postings) {
  return postings
    .filter((p) => p.status === 'ACTIVE' && p.teacher.registrationStatus !== 'ACTIVE')
    .map((p) =>
      flag(RULES.REGISTRATION_GATE, 'BREACH', 'Posting', p.id, {
        label: 'Registration Not Active — Action Required',
        message: `TSC ${p.teacher.tscNumber} holds an active posting but registration is ${p.teacher.registrationStatus}.`,
        schoolId: p.schoolId,
        teacherId: p.teacherId,
      }),
    );
}

// ── 2. Appraisal cycle ──
/** Deadlines as UTC end-of-day; returns the last passed term and the next upcoming one. */
function termWindows(deadlines, now) {
  const build = (year) =>
    Object.entries(deadlines)
      .map(([term, mmdd]) => {
        const [m, d] = mmdd.split('-').map(Number);
        return { year, term: Number(term), deadline: new Date(Date.UTC(year, m - 1, d, 23, 59, 59)) };
      })
      .sort((a, b) => a.deadline - b.deadline);
  const y = now.getUTCFullYear();
  const all = [...build(y - 1), ...build(y), ...build(y + 1)];
  const upcoming = all.find((t) => t.deadline >= now);
  const passed = all.filter((t) => t.deadline < now);
  return { upcoming, previous: passed[passed.length - 1] };
}

/**
 * schools: [{ id, name, activeTeacherIds: [..] }]
 * returns: Map key `${teacherId}:${year}:${term}` -> true for submitted returns
 */
function evaluateAppraisal(schools, submitted, cfg, now) {
  const { upcoming, previous } = termWindows(cfg['appraisal.termDeadlines'], now);
  const dueSoonDays = Number(cfg['appraisal.dueSoonDays']);
  const out = [];
  for (const s of schools) {
    if (!s.activeTeacherIds.length) continue;
    const missing = (t) => s.activeTeacherIds.filter((id) => !submitted.has(`${id}:${t.year}:${t.term}`)).length;

    const overdue = missing(previous);
    if (overdue > 0) {
      out.push(
        flag(RULES.APPRAISAL_CYCLE, 'BREACH', 'School', `${s.id}:${previous.year}-T${previous.term}`, {
          label: 'Appraisal Overdue — Action Required',
          message: `${overdue} of ${s.activeTeacherIds.length} teachers at ${s.name} have no appraisal return for ${previous.year} Term ${previous.term}.`,
          schoolId: s.id,
        }),
      );
    }
    const daysLeft = daysBetween(now, upcoming.deadline);
    const due = missing(upcoming);
    if (daysLeft <= dueSoonDays && due > 0) {
      out.push(
        flag(RULES.APPRAISAL_CYCLE, 'WARNING', 'School', `${s.id}:${upcoming.year}-T${upcoming.term}`, {
          label: 'Appraisal Due',
          message: `${due} returns outstanding at ${s.name} for ${upcoming.year} Term ${upcoming.term}; deadline in ${daysLeft} days.`,
          schoolId: s.id,
        }),
      );
    }
  }
  return out;
}

// ── 3. Acting appointment limit ──
function actingExpiry(posting, cfg) {
  return addMonths(posting.startDate, Number(cfg['acting.maxMonths']));
}

function evaluateActing(postings, cfg, now) {
  const warnDays = Number(cfg['acting.warnDays']);
  const out = [];
  for (const p of postings) {
    if (p.type !== 'ACTING' || p.status !== 'ACTIVE') continue;
    const expiry = actingExpiry(p, cfg);
    const left = daysBetween(now, expiry);
    const base = { schoolId: p.schoolId, teacherId: p.teacherId };
    if (now >= expiry) {
      out.push(
        flag(RULES.ACTING_LIMIT, 'BREACH', 'Posting', p.id, {
          ...base,
          label: 'Acting Term Expired — Action Required',
          message: `${p.designation} for TSC ${p.teacher.tscNumber} passed its ${cfg['acting.maxMonths']}-month limit on ${expiry.toISOString().slice(0, 10)}.`,
        }),
      );
    } else if (left <= warnDays) {
      out.push(
        flag(RULES.ACTING_LIMIT, 'WARNING', 'Posting', p.id, {
          ...base,
          label: 'Acting Term Expiring',
          message: `${p.designation} for TSC ${p.teacher.tscNumber} lapses in ${left} days (${expiry.toISOString().slice(0, 10)}).`,
        }),
      );
    }
  }
  return out;
}

// ── 4. Staffing norms ──
/** schools: [{ id, name, establishment, substantiveCount }] */
function evaluateStaffing(schools, cfg) {
  const { under, over } = cfg['staffing.tolerance'];
  const out = [];
  for (const s of schools) {
    if (!s.establishment) continue;
    const ratio = s.substantiveCount / s.establishment;
    if (ratio < under) {
      out.push(
        flag(RULES.STAFFING_NORMS, 'WARNING', 'School', s.id, {
          label: 'Under-staffed',
          message: `${s.name} has ${s.substantiveCount} of ${s.establishment} approved posts filled (${Math.round(ratio * 100)}%).`,
          schoolId: s.id,
        }),
      );
    } else if (ratio > over) {
      out.push(
        flag(RULES.STAFFING_NORMS, 'WARNING', 'School', s.id, {
          label: 'Over-staffed',
          message: `${s.name} has ${s.substantiveCount} teachers against ${s.establishment} approved posts (${Math.round(ratio * 100)}%).`,
          schoolId: s.id,
        }),
      );
    }
  }
  return out;
}

// ── 5. Transfer eligibility (checked on submission; a warning, never a block) ──
function checkTransferEligibility(currentPosting, cfg, now) {
  const minYears = Number(cfg['transfer.minYearsAtStation']);
  if (!currentPosting) return { eligible: true, warning: null };
  const years = (now - new Date(currentPosting.startDate)) / (365.25 * DAY);
  if (years >= minYears) return { eligible: true, warning: null, yearsAtStation: Number(years.toFixed(1)) };
  return {
    eligible: false,
    yearsAtStation: Number(years.toFixed(1)),
    warning: `${years.toFixed(1)} years at current station; the minimum before a teacher-initiated transfer is ${minYears}. The request can still be submitted for consideration.`,
  };
}

// ── 6. Case timelines ──
function evaluateCases(cases, cfg, now) {
  const window = Number(cfg['case.windowDays']);
  return cases
    .filter((c) => c.status === 'OPEN' && daysBetween(new Date(c.openedAt), now) > window)
    .map((c) =>
      flag(RULES.CASE_TIMELINES, 'BREACH', 'DisciplinaryCase', c.id, {
        label: 'Case Overdue — Escalated',
        message: `A ${c.caseType} case has been open ${daysBetween(new Date(c.openedAt), now)} days (window ${window}). Escalated to County Director.`,
        schoolId: c.schoolId,
        teacherId: c.teacherId,
      }),
    );
}

module.exports = {
  RULES,
  addMonths,
  termWindows,
  checkRegistrationGate,
  evaluateRegistration,
  evaluateAppraisal,
  actingExpiry,
  evaluateActing,
  evaluateStaffing,
  checkTransferEligibility,
  evaluateCases,
};
