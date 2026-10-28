'use client';
import { useState } from 'react';
import Link from 'next/link';
import { officerApi, qs } from '@/lib/api';
import { LEVEL } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, PageHead, Pager, Stamp, SuccessNotice, useAction, useData } from '@/components/ui';

export default function Schools() {
  const officer = useOfficer();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const list = useData(() => officerApi.get(`/api/schools${qs({ q, level, page, pageSize: 25 })}`), [q, level, page]);

  return (
    <div>
      <PageHead title="Schools" intro="Every school in your jurisdiction, with staffing against establishment and its readiness band.">
        {can(officer, 'createSchool') && (
          <button className="btn" onClick={() => setAdding(!adding)}>
            {adding ? 'Close' : 'Add school'}
          </button>
        )}
      </PageHead>

      {adding && <AddSchool onDone={() => { setAdding(false); list.reload(); }} />}

      <div className="toolbar">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input id="q" placeholder="Name or code" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <div className="field">
          <label htmlFor="level">Level</label>
          <select id="level" value={level} onChange={(e) => { setPage(1); setLevel(e.target.value); }}>
            <option value="">All levels</option>
            {Object.entries(LEVEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ErrorNotice error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>School</th>
                  <th>Location</th>
                  <th className="num">Posts filled</th>
                  <th className="num">Open flags</th>
                  <th className="num">Score</th>
                  <th>Band</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      No schools match. Clear the search to see all.
                    </td>
                  </tr>
                )}
                {list.data.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/schools/view?id=${s.id}`}>{s.name}</Link>
                      <div className="small muted">
                        {s.code} · {LEVEL[s.level]}
                      </div>
                    </td>
                    <td>
                      {s.subCounty}
                      <div className="small muted">{s.county}</div>
                    </td>
                    <td className="num">
                      {s.substantive} / {s.establishment}
                    </td>
                    <td className="num">{s.openFlags || '—'}</td>
                    <td className="num">{s.score ?? '—'}</td>
                    <td>
                      <Stamp band={s.band} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={list.data} page={page} setPage={setPage} />
        </>
      )}
    </div>
  );
}

function AddSchool({ onDone }) {
  const officer = useOfficer();
  const geo = useData(() => officerApi.get('/api/geo/regions'));
  const [countyId, setCountyId] = useState('');
  const subs = useData(() => (countyId ? officerApi.get(`/api/geo/counties/${countyId}/sub-counties`) : Promise.resolve([])), [countyId]);
  const [form, setForm] = useState({ code: '', name: '', level: 'PRIMARY', subCountyId: '', establishment: 10 });
  const { busy, error, success, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="panel"
      style={{ marginBottom: '1.5rem' }}
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await officerApi.post('/api/schools', { ...form, establishment: Number(form.establishment) });
          onDone();
        }, 'School added');
      }}
    >
      <h2 style={{ marginBottom: '1rem' }}>Add a school</h2>
      <ErrorNotice error={error} />
      <SuccessNotice message={success} />
      <div className="grid-2">
        <Field label="School name" id="sname">
          <input id="sname" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="School code" id="scode">
          <input id="scode" value={form.code} onChange={set('code')} required />
        </Field>
        <Field label="Level" id="slevel">
          <select id="slevel" value={form.level} onChange={set('level')}>
            {Object.entries(LEVEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Approved teaching posts" hint="The school's establishment" id="sest">
          <input id="sest" type="number" min={0} value={form.establishment} onChange={set('establishment')} required />
        </Field>
        <Field label="County" id="scounty">
          <select id="scounty" value={countyId} onChange={(e) => setCountyId(e.target.value)} required>
            <option value="">Choose a county</option>
            {(geo.data || []).flatMap((r) => r.counties).filter((c) => officer.role !== 'COUNTY_DIRECTOR' || c.id === officer.countyId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sub-county" hint={countyId && subs.data && subs.data.length === 0 ? 'This county has no sub-counties yet. Add them under Sub-counties first.' : undefined} id="ssub">
          <select id="ssub" value={form.subCountyId} onChange={set('subCountyId')} required>
            <option value="">Choose a sub-county</option>
            {(subs.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button className="btn" disabled={busy}>
        Add school
      </button>
    </form>
  );
}
