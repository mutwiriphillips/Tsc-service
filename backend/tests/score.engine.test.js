const { computeReadiness, bandFor, median, timeScore, staffingScore, validateWeights } = require('../src/score/engine');
const { DEFAULTS } = require('../src/rules/defaults');

const cfg = { ...DEFAULTS };
const full = {
  establishment: 20,
  substantiveCount: 20,
  activeTeachers: 20,
  appraisalSubmitted: 20,
  registeredWithCompleteFile: 20,
  documentTurnaroundDays: [5, 7, 10],
  vacancyOpenDays: [10, 20],
  casesTotal: 2,
  casesOnTime: 2,
};

describe('score factors', () => {
  test('staffing: share filled when under establishment', () => {
    expect(staffingScore(15, 20)).toBe(75);
  });
  test('staffing: exactly at establishment scores 100', () => {
    expect(staffingScore(20, 20)).toBe(100);
  });
  test('staffing: over-staffing loses 2 points per 1% over', () => {
    expect(staffingScore(22, 20)).toBeCloseTo(80);
  });
  test('staffing: no establishment means no data, not zero', () => {
    expect(staffingScore(5, 0)).toBeNull();
  });
  test('time score: full marks at or under target', () => {
    expect(timeScore(14, 14)).toBe(100);
    expect(timeScore(3, 14)).toBe(100);
  });
  test('time score: falls linearly to zero at 4x target', () => {
    expect(timeScore(28, 14)).toBeCloseTo(66.67, 1);
    expect(timeScore(56, 14)).toBe(0);
    expect(timeScore(500, 14)).toBe(0);
  });
  test('time score: null when there is nothing to measure', () => {
    expect(timeScore(null, 14)).toBeNull();
  });
  test('median of odd and even lists', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('composite score', () => {
  test('a perfect school scores 100 and band AA', () => {
    const r = computeReadiness(full, cfg);
    expect(r.score).toBe(100);
    expect(r.band).toBe('AA');
    expect(r.coverage).toBe(100);
  });

  test('weights are applied as configured (20/20/20/15/15/10)', () => {
    // Only appraisal drops to 50%: loses 20 × 0.5 = 10 points.
    const r = computeReadiness({ ...full, appraisalSubmitted: 10 }, cfg);
    expect(r.score).toBe(90);
  });

  test('a factor with no data is excluded and its weight shared out, not scored zero', () => {
    const r = computeReadiness({ ...full, casesTotal: 0, casesOnTime: 0 }, cfg);
    const cases = r.factors.find((f) => f.factor === 'cases');
    expect(cases.status).toBe('no-data');
    expect(cases.score).toBeNull();
    expect(r.score).toBe(100);
    expect(r.coverage).toBe(90);
    // The other five now carry 100% between them: 20/90 ≈ 22.2%
    expect(r.factors.find((f) => f.factor === 'staffing').effectiveWeight).toBeCloseTo(22.2, 1);
  });

  test('renormalisation changes the result exactly as the formula says', () => {
    // No cases data; appraisal 0%. Appraisal carries 20/90 of the score.
    const r = computeReadiness({ ...full, casesTotal: 0, casesOnTime: 0, appraisalSubmitted: 0 }, cfg);
    expect(r.score).toBeCloseTo(100 - (20 / 90) * 100, 1);
  });

  test('contributions add up to the score', () => {
    const r = computeReadiness({ ...full, substantiveCount: 13, appraisalSubmitted: 15, documentTurnaroundDays: [30] }, cfg);
    const sum = r.factors.reduce((s, f) => s + f.contribution, 0);
    expect(Math.abs(sum - r.score)).toBeLessThan(0.5);
  });

  test('a school with no data at all has no score and no band', () => {
    const r = computeReadiness({ establishment: 0, activeTeachers: 0, documentTurnaroundDays: [], vacancyOpenDays: [], casesTotal: 0 }, cfg);
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
  });

  test('a struggling school lands in band D', () => {
    const r = computeReadiness(
      { establishment: 20, substantiveCount: 6, activeTeachers: 6, appraisalSubmitted: 1, registeredWithCompleteFile: 2, documentTurnaroundDays: [60], vacancyOpenDays: [200], casesTotal: 2, casesOnTime: 0 },
      cfg,
    );
    expect(r.band).toBe('D');
    expect(r.score).toBeLessThan(40);
  });

  test('custom weights from configuration are honoured', () => {
    const custom = { ...cfg, 'score.weights': { staffing: 100, appraisal: 0, records: 0, documents: 0, vacancies: 0, cases: 0 } };
    expect(computeReadiness({ ...full, substantiveCount: 10 }, custom).score).toBe(50);
  });
});

describe('bands', () => {
  test.each([
    [100, 'AA'],
    [85, 'AA'],
    [84.9, 'A'],
    [70, 'A'],
    [55, 'B'],
    [40, 'C'],
    [39.9, 'D'],
    [0, 'D'],
  ])('score %p is band %p', (score, band) => {
    expect(bandFor(score, cfg['score.bands'])).toBe(band);
  });
});

describe('weight validation', () => {
  test('the default weights are valid', () => {
    expect(validateWeights(cfg['score.weights'])).toEqual([]);
  });
  test('weights must sum to 100', () => {
    expect(validateWeights({ ...cfg['score.weights'], staffing: 30 })[0]).toMatch(/sum to 110/);
  });
  test('unknown, missing and negative factors are rejected', () => {
    const errs = validateWeights({ staffing: 120, appraisal: -20, records: 0, documents: 0, vacancies: 0, bonus: 0 });
    expect(errs.join(' ')).toMatch(/missing factors: cases/);
    expect(errs.join(' ')).toMatch(/unknown factors: bonus/);
    expect(errs.join(' ')).toMatch(/negative weights: appraisal/);
  });
});
