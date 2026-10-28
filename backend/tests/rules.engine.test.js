const E = require('../src/rules/engine');
const { DEFAULTS } = require('../src/rules/defaults');

const cfg = { ...DEFAULTS };
const DAY = 86400000;
const at = (iso) => new Date(`${iso}T12:00:00Z`);

describe('registration gate', () => {
  test('ACTIVE registration may be posted', () => {
    expect(E.checkRegistrationGate({ tscNumber: '1', registrationStatus: 'ACTIVE' }).allowed).toBe(true);
  });
  test.each(['PENDING', 'SUSPENDED', 'DEREGISTERED'])('%s registration is blocked with a reason', (status) => {
    const r = E.checkRegistrationGate({ tscNumber: '123', registrationStatus: status });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(status);
  });
  test('scan flags active postings held by non-active registrations only', () => {
    const flags = E.evaluateRegistration([
      { id: 'p1', status: 'ACTIVE', schoolId: 's', teacherId: 't1', teacher: { tscNumber: '1', registrationStatus: 'ACTIVE' } },
      { id: 'p2', status: 'ACTIVE', schoolId: 's', teacherId: 't2', teacher: { tscNumber: '2', registrationStatus: 'SUSPENDED' } },
      { id: 'p3', status: 'ENDED', schoolId: 's', teacherId: 't3', teacher: { tscNumber: '3', registrationStatus: 'SUSPENDED' } },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].entityId).toBe('p2');
    expect(flags[0].severity).toBe('BREACH');
  });
});

describe('appraisal cycle', () => {
  const deadlines = { 1: '04-30', 2: '08-31', 3: '11-30' };

  test('term windows: in October the last closed term is T2 and the next is T3', () => {
    const { previous, upcoming } = E.termWindows(deadlines, at('2026-10-15'));
    expect([previous.year, previous.term]).toEqual([2026, 2]);
    expect([upcoming.year, upcoming.term]).toEqual([2026, 3]);
  });
  test('term windows: in December the next term rolls into the new year', () => {
    const { previous, upcoming } = E.termWindows(deadlines, at('2026-12-10'));
    expect([previous.year, previous.term]).toEqual([2026, 3]);
    expect([upcoming.year, upcoming.term]).toEqual([2027, 1]);
  });
  test('term windows: in January the last closed term is the previous year T3', () => {
    const { previous } = E.termWindows(deadlines, at('2026-01-10'));
    expect([previous.year, previous.term]).toEqual([2025, 3]);
  });
  test('the deadline day itself is not yet overdue', () => {
    const { upcoming } = E.termWindows(deadlines, at('2026-08-31'));
    expect(upcoming.term).toBe(2);
  });

  const school = { id: 's1', name: 'Test School', activeTeacherIds: ['a', 'b', 'c'] };

  test('missing returns for the closed term raise an overdue BREACH with the count', () => {
    const submitted = new Set(['a:2026:2']);
    const flags = E.evaluateAppraisal([school], submitted, cfg, at('2026-10-01'));
    const breach = flags.find((f) => f.severity === 'BREACH');
    expect(breach.label).toBe('Appraisal Overdue — Action Required');
    expect(breach.message).toMatch(/2 of 3/);
  });
  test('all returns filed: no overdue flag', () => {
    const submitted = new Set(['a:2026:2', 'b:2026:2', 'c:2026:2']);
    expect(E.evaluateAppraisal([school], submitted, cfg, at('2026-10-01'))).toHaveLength(0);
  });
  test('within the due-soon window, outstanding returns raise "Appraisal Due"', () => {
    const submitted = new Set(['a:2026:2', 'b:2026:2', 'c:2026:2']);
    const flags = E.evaluateAppraisal([school], submitted, cfg, at('2026-11-20'));
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe('WARNING');
    expect(flags[0].label).toBe('Appraisal Due');
  });
  test('outside the due-soon window, no warning yet', () => {
    const submitted = new Set(['a:2026:2', 'b:2026:2', 'c:2026:2']);
    expect(E.evaluateAppraisal([school], submitted, cfg, at('2026-10-01'))).toHaveLength(0);
  });
  test('a school with no active teachers is never flagged', () => {
    expect(E.evaluateAppraisal([{ ...school, activeTeacherIds: [] }], new Set(), cfg, at('2026-10-01'))).toHaveLength(0);
  });
});

describe('acting appointment limit', () => {
  const posting = (start) => ({ id: 'p', type: 'ACTING', status: 'ACTIVE', startDate: at(start), designation: 'Deputy (Acting)', schoolId: 's', teacherId: 't', teacher: { tscNumber: '9' } });

  test('expiry is start + configured months, clamped to month end', () => {
    expect(E.actingExpiry(posting('2026-01-31'), cfg).toISOString().slice(0, 10)).toBe('2026-07-31');
    expect(E.addMonths(at('2026-08-31'), 6).toISOString().slice(0, 10)).toBe('2027-02-28');
  });
  test('more than 30 days left: no flag', () => {
    expect(E.evaluateActing([posting('2026-01-01')], cfg, at('2026-05-15'))).toHaveLength(0);
  });
  test('30 days or less left: "Acting Term Expiring" WARNING', () => {
    const f = E.evaluateActing([posting('2026-01-01')], cfg, at('2026-06-10'));
    expect(f[0].severity).toBe('WARNING');
    expect(f[0].label).toBe('Acting Term Expiring');
  });
  test('on the day it lapses: BREACH', () => {
    const f = E.evaluateActing([posting('2026-01-01')], cfg, new Date(E.actingExpiry(posting('2026-01-01'), cfg).getTime() + 1));
    expect(f[0].severity).toBe('BREACH');
    expect(f[0].label).toBe('Acting Term Expired — Action Required');
  });
  test('warning and breach have different dedupe keys, so an override of one never hides the other', () => {
    const w = E.evaluateActing([posting('2026-01-01')], cfg, at('2026-06-10'))[0];
    const b = E.evaluateActing([posting('2026-01-01')], cfg, at('2026-08-10'))[0];
    expect(w.dedupeKey).not.toBe(b.dedupeKey);
  });
  test('substantive and ended postings are ignored', () => {
    expect(E.evaluateActing([{ ...posting('2025-01-01'), type: 'SUBSTANTIVE' }, { ...posting('2025-01-01'), status: 'ENDED' }], cfg, at('2026-06-10'))).toHaveLength(0);
  });
  test('the limit follows configuration', () => {
    const twelve = { ...cfg, 'acting.maxMonths': 12 };
    expect(E.evaluateActing([posting('2026-01-01')], twelve, at('2026-08-10'))).toHaveLength(0);
  });
});

describe('staffing norms', () => {
  const s = (count) => ({ id: 's', name: 'S', establishment: 20, substantiveCount: count });
  test('inside the tolerance band: no flag', () => {
    expect(E.evaluateStaffing([s(18), s(20), s(22)], cfg)).toHaveLength(0);
  });
  test('below 90%: under-staffed', () => {
    expect(E.evaluateStaffing([s(17)], cfg)[0].label).toBe('Under-staffed');
  });
  test('above 110%: over-staffed', () => {
    expect(E.evaluateStaffing([s(23)], cfg)[0].label).toBe('Over-staffed');
  });
  test('a school with no establishment is skipped', () => {
    expect(E.evaluateStaffing([{ ...s(5), establishment: 0 }], cfg)).toHaveLength(0);
  });
});

describe('transfer eligibility', () => {
  const now = at('2026-10-27');
  test('enough years at station: eligible, no warning', () => {
    const r = E.checkTransferEligibility({ startDate: new Date(now - 6 * 365.25 * DAY) }, cfg, now);
    expect(r.eligible).toBe(true);
    expect(r.warning).toBeNull();
  });
  test('too few years: a warning, never a block', () => {
    const r = E.checkTransferEligibility({ startDate: new Date(now - 2 * 365.25 * DAY) }, cfg, now);
    expect(r.eligible).toBe(false);
    expect(r.warning).toMatch(/can still be submitted/);
  });
});

describe('case timelines', () => {
  const now = at('2026-10-27');
  const c = (daysOpen, status = 'OPEN') => ({ id: `c${daysOpen}`, status, caseType: 'Absenteeism', openedAt: new Date(now - daysOpen * DAY), schoolId: 's', teacherId: 't' });
  test('open inside the window: no flag', () => {
    expect(E.evaluateCases([c(60)], cfg, now)).toHaveLength(0);
  });
  test('open past the window: escalated BREACH', () => {
    const f = E.evaluateCases([c(120)], cfg, now);
    expect(f[0].label).toBe('Case Overdue — Escalated');
  });
  test('closed cases never flag', () => {
    expect(E.evaluateCases([c(400, 'CLOSED')], cfg, now)).toHaveLength(0);
  });
});
