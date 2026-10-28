'use client';
import { useState } from 'react';
import { officerApi } from '@/lib/api';
import { useOfficer } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, PageHead, SuccessNotice, useAction, useData } from '@/components/ui';

export default function Geography() {
  const officer = useOfficer();
  const regions = useData(() => officerApi.get('/api/geo/regions'));
  const [countyId, setCountyId] = useState(officer.role === 'COUNTY_DIRECTOR' ? officer.countyId : '');
  const subs = useData(() => (countyId ? officerApi.get(`/api/geo/counties/${countyId}/sub-counties`) : Promise.resolve(null)), [countyId]);
  const [text, setText] = useState('');
  const { busy, error, success, run } = useAction();

  const counties = (regions.data || []).flatMap((r) => r.counties.map((c) => ({ ...c, region: r.name })));
  const county = counties.find((c) => c.id === countyId);

  return (
    <div className="stack-lg">
      <PageHead title="Sub-counties" intro="Counties are fixed reference data. Add each county's sub-counties here before adding its schools." />

      {officer.role === 'NATIONAL_ADMIN' && (
        <div className="toolbar">
          <div className="field" style={{ minWidth: 280 }}>
            <label htmlFor="gc">County</label>
            <select id="gc" value={countyId} onChange={(e) => { setCountyId(e.target.value); setText(''); }}>
              <option value="">Choose a county</option>
              {counties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name} ({c._count.subCounties} sub-counties)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <ErrorNotice error={regions.error || subs.error} />
      {regions.loading && <Loading />}

      {county && (
        <div className="grid-2">
          <section className="panel">
            <h2 style={{ marginBottom: '1rem' }}>
              {county.name} County
            </h2>
            {subs.data && subs.data.length === 0 && <p className="muted">No sub-counties yet. Add them on the right.</p>}
            {subs.data && subs.data.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Sub-county</th>
                    <th className="num">Schools</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.data.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="num">{s._count.schools}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <form
            className="panel stack"
            onSubmit={(e) => {
              e.preventDefault();
              const names = text.split('\n').map((n) => n.trim()).filter(Boolean);
              run(async () => {
                const r = await officerApi.post(`/api/geo/counties/${county.id}/sub-counties`, { names });
                setText('');
                subs.reload();
                regions.reload();
                return r;
              }, 'Sub-counties saved. Names that already existed were left as they were.');
            }}
          >
            <h2>Add sub-counties</h2>
            <ErrorNotice error={error} />
            <SuccessNotice message={success} />
            <Field label="Names" hint="One per line, as TSC records them" id="gnames">
              <textarea id="gnames" value={text} onChange={(e) => setText(e.target.value)} required style={{ minHeight: '9rem' }} />
            </Field>
            <div>
              <button className="btn" disabled={busy || !text.trim()}>
                Add to {county.name}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
