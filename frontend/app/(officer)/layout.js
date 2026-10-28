'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getToken, officerApi, setToken } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';
import { OfficerContext, can, jurisdictionLabel } from '@/components/OfficerContext';
import { Loading } from '@/components/ui';

function navFor(o) {
  const items = [
    ['Overview', [
      ['/dashboard', 'Dashboard'],
      ['/compliance', 'Compliance flags'],
      ['/documents', 'Documents'],
    ]],
    ['Registry', [
      ['/schools', 'Schools'],
      ['/teachers', 'Teachers'],
      ['/staffing', 'Staffing report'],
      ['/visits', 'Field visits'],
    ]],
  ];
  const admin = [];
  if (can(o, 'manageOfficers')) admin.push(['/officers', 'Officers']);
  if (can(o, 'createSchool')) admin.push(['/geography', 'Sub-counties']);
  if (can(o, 'seeSensitive')) admin.push(['/cases', 'Disciplinary cases']);
  if (can(o, 'handleCorrections')) admin.push(['/corrections', 'Correction requests']);
  admin.push(['/settings', 'Rules and settings']);
  if (can(o, 'readAudit')) admin.push(['/audit', 'Audit trail']);
  items.push(['Administration', admin]);
  return items;
}

export default function OfficerLayout({ children }) {
  const router = useRouter();
  const path = usePathname();
  const [officer, setOfficer] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!getToken('officer')) {
      router.replace('/login');
      return;
    }
    officerApi
      .get('/api/auth/officer/me')
      .then(setOfficer)
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => setOpen(false), [path]);

  if (!officer) {
    return (
      <div className="main">
        <Loading label="Opening your workspace" />
      </div>
    );
  }

  const signOut = () => {
    setToken('officer', null);
    router.replace('/login');
  };

  return (
    <OfficerContext.Provider value={officer}>
      <div className="shell">
        <nav className="nav" aria-label="Main" data-open={open ? 'true' : 'false'}>
          <div className="spread">
            <div className="nav-brand">
              <strong>TSC TMGS</strong>
              <span>Teacher Management &amp; Governance</span>
            </div>
            <button className="btn quiet small menu-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
              Menu
            </button>
          </div>
          <div className="nav-who">
            <b>{officer.name}</b>
            {ROLE_LABEL[officer.role]}
            <br />
            {jurisdictionLabel(officer)}
          </div>
          {navFor(officer).map(([group, links]) => (
            <div key={group} className="nav-section">
              <div className="nav-group">{group}</div>
              <ul>
                {links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} aria-current={path === href || path.startsWith(`${href}/`) ? 'page' : undefined}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="nav-foot">
            <button className="btn quiet" onClick={signOut}>
              Sign out
            </button>
          </div>
        </nav>
        <main className="main" id="main">
          {children}
        </main>
      </div>
    </OfficerContext.Provider>
  );
}
