'use client';
import Link from 'next/link';
import { officerApi } from '@/lib/api';
import { DOC_TYPE, DOC_STATUS, fmtDate, fullName } from '@/lib/format';
import { useOfficer, jurisdictionLabel, can } from '@/components/OfficerContext';
import { ErrorNotice, Loading, PageHead, SeverityTag, Stamp, useData } from '@/components/ui';
import FirstRun from '@/components/FirstRun';

const BAND_ORDER = ['AA', 'A', 'B', 'C', 'D', 'No data'];

export default function Dashboard() {
  const officer = useOfficer();
  const summary = useData(() => officerApi.get('/api/reports/summary'));
  const flags = useData(() => officerApi.get('/api/compliance/flags?severity=BREACH&pageSize=6'));
  const docs = useData(() => (can(officer, 'decideDocuments') ? officerApi.get('/api/documents?awaiting=me&pageSize=5') : Promise.resolve(null)));
  const schools = useData(() => officerApi.get('/api/schools?pageSize=200'));

  const s = summary.data;
  const weakest = schools.data ? [...schools.data.items].filter((x) => x.score != null).sort((a, b) => a.score - b.score).slice(0, 6) : [];

  return (
    <div className="stack-lg">
      <PageHead title={`Good ${greeting()}`} intro={`What needs attention in ${jurisdictionLabel(officer)} today.`} />

      <ErrorNotice error={summary.error} />
      {summary.loading && !s && <Loading />}
      {s && s.schools === 0 && <FirstRun officer={officer} />}
      {s && s.schools > 0 && (
        <section aria-label="Key figures" className="ledger">
          <div>
            <Link href="/compliance?severity=BREACH">
              <div className="fig red">{s.openFlags.BREACH || 0}</div>
              <div className="lab">Breaches needing action</div>
            </Link>
          </div>
          <div>
            <Link href="/compliance?severity=WARNING">
              <div className="fig amber">{s.openFlags.WARNING || 0}</div>
              <div className="lab">Warnings</div>
            </Link>
          </div>
          {docs.data && (
            <div>
              <Link href="/documents?awaiting=me">
                <div className="fig">{docs.data.total}</div>
                <div className="lab">Documents waiting for you</div>
              </Link>
            </div>
          )}
          <div>
            <div className="fig">
              {s.substantive}
              <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}> / {s.establishment}</span>
            </div>
            <div className="lab">Posts filled</div>
          </div>
          <div>
            <div className="fig">{s.openVacancies}</div>
            <div className="lab">Open vacancies</div>
          </div>
          <div>
            <div className="fig">{s.acting}</div>
            <div className="lab">Acting appointments</div>
          </div>
        </section>
      )}

      {s && s.schools > 0 && (
      <div className="grid-2">
        <section className="panel" aria-labelledby="breaches-h">
          <div className="panel-head">
            <h2 id="breaches-h">Breaches</h2>
            <Link href="/compliance?severity=BREACH" className="small">
              See all
            </Link>
          </div>
          <ErrorNotice error={flags.error} />
          {flags.data && flags.data.items.length === 0 && <p className="muted">No open breaches. Nothing here needs action.</p>}
          {flags.data && (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {flags.data.items.map((f) => (
                <li key={f.id}>
                  <div className="row">
                    <SeverityTag severity={f.severity} />
                    <strong>{f.label}</strong>
                  </div>
                  <p className="small" style={{ marginTop: '0.25rem' }}>
                    {f.message}{' '}
                    {f.school && (
                      <Link href={`/schools/view?id=${f.school.id}`} className="muted">
                        {f.school.name}
                      </Link>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="bands-h">
          <div className="panel-head">
            <h2 id="bands-h">School readiness</h2>
            <Link href="/schools" className="small">
              All schools
            </Link>
          </div>
          {s && s.bands && (
            <div className="row" style={{ gap: '1.25rem', marginBottom: '1.25rem' }}>
              {BAND_ORDER.filter((b) => s.bands[b]).map((b) => (
                <div key={b} className="row" style={{ gap: '0.5rem' }}>
                  <Stamp band={b === 'No data' ? null : b} />
                  <span className="num">{s.bands[b]}</span>
                </div>
              ))}
            </div>
          )}
          {s && !s.bands && <p className="muted small">Bands for more than 2,000 schools are calculated overnight.</p>}
          {weakest.length > 0 && (
            <>
              <h3 style={{ marginBottom: '0.5rem' }}>Lowest scores first</h3>
              <table>
                <tbody>
                  {weakest.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Link href={`/schools/view?id=${x.id}`}>{x.name}</Link>
                        <div className="small muted">{x.subCounty}</div>
                      </td>
                      <td className="num">{x.score}</td>
                      <td style={{ width: '4rem' }}>
                        <Stamp band={x.band} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
      )}

      {docs.data && docs.data.items.length > 0 && (
        <section className="panel" aria-labelledby="docs-h">
          <div className="panel-head">
            <h2 id="docs-h">Waiting for your decision</h2>
            <Link href="/documents?awaiting=me" className="small">
              Open the queue
            </Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>School</th>
                <th>Teacher</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {docs.data.items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/documents/view?id=${d.id}`}>{d.title}</Link>
                    <div className="small muted">
                      {DOC_TYPE[d.type]} · {DOC_STATUS[d.status]}
                    </div>
                  </td>
                  <td>{d.school.name}</td>
                  <td>{fullName(d.teacher)}</td>
                  <td>{fmtDate(d.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-KE', { hour: 'numeric', hour12: false, timeZone: 'Africa/Nairobi' }).format(new Date()));
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
