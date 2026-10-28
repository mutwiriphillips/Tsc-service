/** Gathers each school's inputs from the database and runs the pure score engine. */
const prisma = require('../lib/prisma');
const { loadRuleConfig } = require('../rules/config');
const { termWindows } = require('../rules/engine');
const { computeReadiness } = require('./engine');

const DAY = 86400000;
const days = (a, b) => (new Date(b) - new Date(a)) / DAY;

async function scoreSchools(schoolIds, { now = new Date(), cfg } = {}) {
  const config = cfg || (await loadRuleConfig());
  if (!schoolIds.length) return new Map();
  const lookback = new Date(now - Number(config['score.targets'].lookbackDays) * DAY);
  const caseWindow = Number(config['case.windowDays']);
  const { previous } = termWindows(config['appraisal.termDeadlines'], now);

  const [schools, postings, docs, vacancies, cases] = await Promise.all([
    prisma.school.findMany({ where: { id: { in: schoolIds } }, select: { id: true, establishment: true } }),
    prisma.posting.findMany({
      where: { schoolId: { in: schoolIds }, status: 'ACTIVE' },
      select: { schoolId: true, teacherId: true, type: true, teacher: { select: { registrationStatus: true, personnelFileComplete: true } } },
    }),
    prisma.document.findMany({
      where: { schoolId: { in: schoolIds }, decidedAt: { gte: lookback } },
      select: { schoolId: true, submittedAt: true, decidedAt: true },
    }),
    prisma.vacancy.findMany({
      where: { schoolId: { in: schoolIds }, OR: [{ filledAt: null }, { filledAt: { gte: lookback } }] },
      select: { schoolId: true, openedAt: true, filledAt: true },
    }),
    prisma.disciplinaryCase.findMany({
      where: { schoolId: { in: schoolIds }, OR: [{ status: 'OPEN' }, { closedAt: { gte: lookback } }] },
      select: { schoolId: true, openedAt: true, closedAt: true, status: true },
    }),
  ]);

  const teacherIds = [...new Set(postings.map((p) => p.teacherId))];
  const returns = teacherIds.length
    ? await prisma.appraisalReturn.findMany({
        where: { teacherId: { in: teacherIds }, year: previous.year, term: previous.term, complete: true },
        select: { teacherId: true, schoolId: true },
      })
    : [];
  const filed = new Set(returns.map((r) => r.teacherId));

  const results = new Map();
  for (const s of schools) {
    const sp = postings.filter((p) => p.schoolId === s.id);
    const teachers = new Map();
    for (const p of sp) teachers.set(p.teacherId, p.teacher);
    const ids = [...teachers.keys()];

    const schoolCases = cases.filter((c) => c.schoolId === s.id);
    // A case counts once it is decided (closed) or once it is overdue while still open.
    const counted = schoolCases.filter((c) => c.status === 'CLOSED' || days(c.openedAt, now) > caseWindow);
    const onTime = counted.filter((c) => c.status === 'CLOSED' && days(c.openedAt, c.closedAt) <= caseWindow);

    const inputs = {
      establishment: s.establishment,
      substantiveCount: sp.filter((p) => p.type === 'SUBSTANTIVE').length,
      activeTeachers: ids.length,
      appraisalSubmitted: ids.filter((id) => filed.has(id)).length,
      registeredWithCompleteFile: ids.filter((id) => {
        const t = teachers.get(id);
        return t.registrationStatus === 'ACTIVE' && t.personnelFileComplete;
      }).length,
      documentTurnaroundDays: docs.filter((d) => d.schoolId === s.id).map((d) => days(d.submittedAt, d.decidedAt)),
      vacancyOpenDays: vacancies.filter((v) => v.schoolId === s.id).map((v) => days(v.openedAt, v.filledAt || now)),
      casesTotal: counted.length,
      casesOnTime: onTime.length,
    };
    results.set(s.id, { ...computeReadiness(inputs, config), inputs, appraisalTerm: { year: previous.year, term: previous.term } });
  }
  return results;
}

module.exports = { scoreSchools };
