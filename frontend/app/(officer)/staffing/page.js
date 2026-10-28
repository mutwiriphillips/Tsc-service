'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { officerApi, qs } from '@/lib/api';
import { fmtDate, fullName, today } from '@/lib/format';
import { ErrorNotice, Loading, PageHead, useData } from '@/components/ui';

const LEVEL_NAME = { national: 'National', region: 'Region', county: 'County', subCounty: 'Sub-county', school: 'School' };

function Node({ node, depth, onSchool }) {
  const [open, setOpen] = useState(depth < 2);
  const isSchool = node.level === 'school';
  return (
    <li>
      <div className="tree-row">
        {isSchool ? (
          <button className="leaf" onClick={() => onSchool(node.id)} aria-label={`Show teachers at ${node.name}`}>
            {node.name}
          </button>
        ) : (
          <button onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? '▾' : '▸'} {node.name}{' '}
            {LEVEL_NAME[node.level] !== node.name && <span className="small muted" style={{ fontWeight: 400 }}>{LEVEL_NAME[node.level]}</span>}
          </button>
        )}
        <span className="num" style={{ textAlign: 'right' }}>{node.substantive}</span>
        <span className="num hide-sm" style={{ textAlign: 'right' }}>{node.establishment}</span>
        <span className="num hide-sm" style={{ textAlign: 'right' }}>{node.acting}</span>
        <span className="num" style={{ textAlign: 'right' }}>{node.fillRate == null ? '—' : `${node.fillRate}%`}</span>
      </div>
      {!isSchool && open && node.children.length > 0 && (
        <ul className="tree">
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} onSchool={onSchool} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Open the tree at the officer's own level: skip levels that hold a single area. */
function startNode(tree) {
  let n = tree;
  while (n.children.length === 1 && n.level !== 'subCounty' && n.children[0].level !== 'school') n = n.children[0];
  return n;
}

function StaffingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const schoolId = params.get('schoolId') || '';
  const [from, setFrom] = useState(params.get('from') || today());
  const [to, setTo] = useState(params.get('to') || today());
  const report = useData(() => officerApi.get(`/api/reports/staffing${qs({ from, to, schoolId })}`), [from, to, schoolId]);
  const openSchool = (id) => router.push(`/staffing${qs({ schoolId: id, from, to })}`);

  return (
    <div>
      <PageHead title="Staffing report" intro="From the whole jurisdiction down to each teacher. Choose a date range to see everyone posted at any point within it." />
      <div className="toolbar">
        <div className="field">
          <label htmlFor="rf">From</label>
          <input id="rf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rt">To</label>
          <input id="rt" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {schoolId && (
          <Link className="btn secondary" href={`/staffing${qs({ from, to })}`}>
            Back to all areas
          </Link>
        )}
      </div>
      <ErrorNotice error={report.error} />
      {report.loading && !report.data && <Loading />}
      {report.data && report.data.tree && (
        <div className="panel">
          <div className="tree-row small muted" style={{ fontWeight: 700 }}>
            <span>Area</span>
            <span style={{ textAlign: 'right' }}>Substantive</span>
            <span className="hide-sm" style={{ textAlign: 'right' }}>Posts</span>
            <span className="hide-sm" style={{ textAlign: 'right' }}>Acting</span>
            <span style={{ textAlign: 'right' }}>Filled</span>
          </div>
          <ul className="tree">
            <Node node={startNode(report.data.tree)} depth={0} onSchool={openSchool} />
          </ul>
        </div>
      )}
      {report.data && report.data.school && (
        <div className="stack">
          <h2>
            <Link href={`/schools/view?id=${report.data.school.id}`}>{report.data.school.name}</Link>
          </h2>
          <p className="muted">
            {report.data.postings.length} posting(s) active between {fmtDate(report.data.range.from)} and {fmtDate(report.data.range.to)} · establishment {report.data.school.establishment}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Designation</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {report.data.postings.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/teachers/view?id=${p.teacher.id}`}>{fullName(p.teacher)}</Link>
                      <div className="small muted num">TSC {p.teacher.tscNumber}</div>
                    </td>
                    <td>
                      {p.designation} {p.type === 'ACTING' && <span className="tag warning">Acting</span>}
                    </td>
                    <td>{fmtDate(p.startDate)}</td>
                    <td>{p.endDate ? fmtDate(p.endDate) : 'Current'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Staffing() {
  return (
    <Suspense fallback={<Loading />}>
      <StaffingInner />
    </Suspense>
  );
}
