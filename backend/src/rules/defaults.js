/**
 * Default rule thresholds. Every value is a PLACEHOLDER until TSC confirms it
 * against current policy; the seed stores them with confirmed=false and the
 * Rules settings screen shows them as unconfirmed.
 */
const DEFAULT_RULES = [
  {
    key: 'appraisal.termDeadlines',
    value: { 1: '04-30', 2: '08-31', 3: '11-30' },
    description: 'Appraisal return deadline per term (MM-DD). [Confirm against the TSC appraisal calendar]',
  },
  {
    key: 'appraisal.dueSoonDays',
    value: 14,
    description: 'Days before a term deadline that a school is flagged "Appraisal Due".',
  },
  {
    key: 'acting.maxMonths',
    value: 6,
    description: 'Maximum length of an acting appointment, in months. [Confirm]',
  },
  {
    key: 'acting.warnDays',
    value: 30,
    description: 'Days before an acting appointment lapses that it is flagged.',
  },
  {
    key: 'staffing.tolerance',
    value: { under: 0.9, over: 1.1 },
    description: 'Posted teachers ÷ establishment outside this band flags a school as under- or over-staffed. [Confirm against current staffing norms]',
  },
  {
    key: 'transfer.minYearsAtStation',
    value: 5,
    description: 'Minimum years at current station before a teacher-initiated transfer, below which a warning is shown. [Confirm]',
  },
  {
    key: 'case.windowDays',
    value: 90,
    description: 'Days a disciplinary case may stay open before it is escalated. [Confirm per case type]',
  },
  {
    key: 'score.weights',
    value: { staffing: 20, appraisal: 20, records: 20, documents: 15, vacancies: 15, cases: 10 },
    description: 'Readiness score factor weights (must sum to 100). Proposal — validate with Staffing and Quality Assurance.',
  },
  {
    key: 'score.targets',
    value: { documentTurnaroundDays: 14, vacancyFillDays: 30, lookbackDays: 180 },
    description: 'Targets that earn a full factor score; score falls to zero at four times the target.',
  },
  {
    key: 'score.bands',
    value: [
      { band: 'AA', min: 85 },
      { band: 'A', min: 70 },
      { band: 'B', min: 55 },
      { band: 'C', min: 40 },
      { band: 'D', min: 0 },
    ],
    description: 'Score bands, highest first.',
  },
];

const DEFAULTS = Object.fromEntries(DEFAULT_RULES.map((r) => [r.key, r.value]));

module.exports = { DEFAULT_RULES, DEFAULTS };
