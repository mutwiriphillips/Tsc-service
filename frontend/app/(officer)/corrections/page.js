'use client';
import { useState } from 'react';
import Link from 'next/link';
import { officerApi } from '@/lib/api';
import { fmtDate, fullName } from '@/lib/format';
import { ErrorNotice, Loading, PageHead, SuccessNotice, useAction, useData } from '@/components/ui';

export default function Corrections() {
  const [status, setStatus] = useState('OPEN');
  const list = useData(() => officerApi.get(`/api/teachers/corrections?status=${status}`), [status]);
  const act = useAction();

  return (
    <div>
      <PageHead title="Correction requests" intro="Teachers can ask for their record to be corrected. Answer each request; the teacher sees your response in their portal." />
      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />
      <div className="toolbar">
        <div className="field">
          <label htmlFor="cr">Status</label>
          <select id="cr" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="OPEN">Open</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="DECLINED">Declined</option>
          </select>
        </div>
      </div>
      <ErrorNotice error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && list.data.length === 0 && <p className="muted">No {status.toLowerCase()} requests.</p>}
      <div className="stack">
        {(list.data || []).map((c) => (
          <Request key={c.id} c={c} act={act} onDone={list.reload} />
        ))}
      </div>
    </div>
  );
}

function Request({ c, act, onDone }) {
  const [response, setResponse] = useState('');
  return (
    <article className="panel">
      <div className="spread">
        <div>
          <Link href={`/teachers/view?id=${c.teacher.id}`}>{fullName(c.teacher)}</Link> <span className="small muted num">TSC {c.teacher.tscNumber}</span>
        </div>
        <span className="small muted">{fmtDate(c.createdAt)}</span>
      </div>
      <p style={{ marginTop: '0.5rem' }}>
        <strong>{c.field}</strong>: {c.requested}
      </p>
      {c.status === 'OPEN' ? (
        <div className="stack" style={{ marginTop: '0.75rem' }}>
          <textarea aria-label="Response to the teacher" value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Your response to the teacher" style={{ minHeight: '4rem' }} />
          <div className="row">
            <button className="btn small" disabled={response.trim().length < 3} onClick={() => act.run(async () => { await officerApi.post(`/api/teachers/corrections/${c.id}/resolve`, { status: 'ACCEPTED', response }); onDone(); }, 'Request accepted')}>
              Accept
            </button>
            <button className="btn danger small" disabled={response.trim().length < 3} onClick={() => act.run(async () => { await officerApi.post(`/api/teachers/corrections/${c.id}/resolve`, { status: 'DECLINED', response }); onDone(); }, 'Request declined')}>
              Decline
            </button>
          </div>
          <p className="small muted">Accepting records your answer. Make the correction itself on the teacher&rsquo;s record, or in the source system for imported data.</p>
        </div>
      ) : (
        <p className="small muted" style={{ marginTop: '0.5rem' }}>
          {c.status.toLowerCase()}: {c.response}
        </p>
      )}
    </article>
  );
}
