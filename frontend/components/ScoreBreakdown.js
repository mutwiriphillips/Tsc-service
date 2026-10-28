'use client';
import { FACTOR_LABEL } from '@/lib/format';
import { Stamp } from './ui';

/** The readiness score shown as its working, so anyone can see why a school got its band. */
export default function ScoreBreakdown({ score }) {
  if (!score) return null;
  return (
    <div className="stack">
      <div className="row" style={{ gap: '1.25rem' }}>
        <Stamp band={score.band} large />
        <div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }} className="num">
            {score.score ?? '—'}
            <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>
              {' '}
              / 100
            </span>
          </div>
          <p className="small muted">
            Readiness score. Appraisal measured for {score.appraisalTerm.year} Term {score.appraisalTerm.term}.
            {score.coverage < 100 && ` Based on ${score.coverage}% of the weighting; factors with no data are left out.`}
          </p>
        </div>
      </div>
      <div>
        {score.factors.map((f) => (
          <div key={f.factor} className={`factor${f.score == null ? ' nodata' : ''}`}>
            <div>
              <div>{FACTOR_LABEL[f.factor]}</div>
              <div className="small muted">
                {f.score == null ? 'No data in this period' : `Weight ${f.effectiveWeight}% · adds ${f.contribution}`}
              </div>
            </div>
            <div className="bar" role="img" aria-label={f.score == null ? 'No data' : `${f.score} out of 100`}>
              {f.score != null && <span style={{ width: `${f.score}%` }} />}
            </div>
            <div className="num" style={{ textAlign: 'right' }}>
              {f.score ?? '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
