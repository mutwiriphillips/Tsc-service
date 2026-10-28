/**
 * School readiness score — pure and transparent.
 *
 * Rates SCHOOLS, never individual teachers: an individual score used in
 * promotion or discipline would be a solely automated decision about a person.
 *
 * Six factors, each 0–100. A factor with no data (e.g. no disciplinary cases)
 * is reported as "no data" and its weight is shared among the others, so a
 * school is never penalised or rewarded for an empty record.
 */

const FACTORS = ['staffing', 'appraisal', 'records', 'documents', 'vacancies', 'cases'];

const clamp = (n) => Math.max(0, Math.min(100, n));
const round1 = (n) => Math.round(n * 10) / 10;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Full marks at or under target, falling linearly to zero at 4× target. */
function timeScore(days, target) {
  if (days == null) return null;
  if (days <= target) return 100;
  return clamp(100 - ((days - target) / (3 * target)) * 100);
}

/** Posted ÷ establishment. Under-staffing scores the share filled; over-staffing loses 2 points per 1% over. */
function staffingScore(substantive, establishment) {
  if (!establishment) return null;
  const r = substantive / establishment;
  return r <= 1 ? clamp(r * 100) : clamp(100 - (r - 1) * 200);
}

const share = (part, whole) => (whole ? clamp((part / whole) * 100) : null);

/**
 * inputs: {
 *   establishment, substantiveCount, activeTeachers,
 *   appraisalSubmitted,              // returns filed for the last closed term
 *   registeredWithCompleteFile,      // active registration AND complete file
 *   documentTurnaroundDays: [],      // decided documents in the lookback window
 *   vacancyOpenDays: [],             // per vacancy: days open (to fill, or to now)
 *   casesTotal, casesOnTime,         // cases closed (or due) in the window
 * }
 */
function computeReadiness(inputs, cfg) {
  const weights = cfg['score.weights'];
  const targets = cfg['score.targets'];
  const bands = cfg['score.bands'];

  const raw = {
    staffing: staffingScore(inputs.substantiveCount, inputs.establishment),
    appraisal: share(inputs.appraisalSubmitted, inputs.activeTeachers),
    records: share(inputs.registeredWithCompleteFile, inputs.activeTeachers),
    documents: timeScore(median(inputs.documentTurnaroundDays || []), targets.documentTurnaroundDays),
    vacancies: timeScore(median(inputs.vacancyOpenDays || []), targets.vacancyFillDays),
    cases: share(inputs.casesOnTime, inputs.casesTotal),
  };

  const withData = FACTORS.filter((f) => raw[f] != null);
  const weightWithData = withData.reduce((s, f) => s + Number(weights[f] || 0), 0);

  const factors = FACTORS.map((f) => {
    const w = Number(weights[f] || 0);
    const has = raw[f] != null;
    const effective = has && weightWithData ? (w / weightWithData) * 100 : 0;
    return {
      factor: f,
      weight: w,
      effectiveWeight: round1(effective),
      score: has ? round1(raw[f]) : null,
      contribution: has ? round1((raw[f] * effective) / 100) : 0,
      status: has ? 'ok' : 'no-data',
    };
  });

  if (!weightWithData) {
    return { score: null, band: null, factors, coverage: 0 };
  }
  const score = round1(withData.reduce((s, f) => s + (raw[f] * Number(weights[f])) / weightWithData, 0));
  const band = bandFor(score, bands);
  return { score, band, factors, coverage: round1((weightWithData / FACTORS.reduce((s, f) => s + Number(weights[f] || 0), 0)) * 100) };
}

function bandFor(score, bands) {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  const hit = sorted.find((b) => score >= b.min);
  return hit ? hit.band : sorted[sorted.length - 1].band;
}

function validateWeights(weights) {
  const keys = Object.keys(weights);
  const missing = FACTORS.filter((f) => !keys.includes(f));
  const extra = keys.filter((k) => !FACTORS.includes(k));
  const total = FACTORS.reduce((s, f) => s + Number(weights[f] || 0), 0);
  const negative = FACTORS.filter((f) => Number(weights[f]) < 0);
  const errors = [];
  if (missing.length) errors.push(`missing factors: ${missing.join(', ')}`);
  if (extra.length) errors.push(`unknown factors: ${extra.join(', ')}`);
  if (negative.length) errors.push(`negative weights: ${negative.join(', ')}`);
  if (Math.abs(total - 100) > 0.001) errors.push(`weights sum to ${total}, must be 100`);
  return errors;
}

module.exports = { FACTORS, computeReadiness, bandFor, median, timeScore, staffingScore, validateWeights };
