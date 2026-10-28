'use client';
import Link from 'next/link';
import { can } from './OfficerContext';

/**
 * Shown on the dashboard while the officer's jurisdiction has no schools.
 * Lists the setup steps in the order they depend on each other.
 */
export default function FirstRun({ officer }) {
  const canSetUp = can(officer, 'createSchool');
  if (!canSetUp) {
    return (
      <section className="panel stack">
        <h2>Nothing is assigned to you yet</h2>
        <p style={{ maxWidth: '65ch' }}>
          Your account is active, but no schools are in your area yet. Your County Director or the National Admin adds them; this page fills in as they do.
        </p>
      </section>
    );
  }
  const national = officer.role === 'NATIONAL_ADMIN';
  const steps = [
    ['/geography', 'Add sub-counties', national ? 'Counties are already loaded. Add the sub-counties for each county you are starting with.' : 'Add the sub-counties in your county.'],
    ['/schools', 'Add schools', 'Each school with its approved number of teaching posts.'],
    ['/officers', 'Add officers', national ? 'County Directors first; they can then add their own Sub-County Directors, CSOs and Heads.' : 'Sub-County Directors, Curriculum Support Officers and Heads of Institution.'],
    ['/teachers', national ? 'Register or import teachers' : 'Post teachers', national ? 'One at a time, or import the register export as a CSV from Rules and settings.' : 'From a school’s page, find each teacher by TSC number and record the posting.'],
    ['/settings', 'Confirm the rule thresholds', 'Every threshold starts as a placeholder until TSC confirms it.'],
  ];
  return (
    <section className="panel stack" aria-labelledby="setup-h">
      <h2 id="setup-h">Set up your area</h2>
      <p className="muted" style={{ maxWidth: '65ch' }}>
        There are no schools in your area yet. These steps get the system ready; each one depends on the one before.
      </p>
      <ol className="stack" style={{ paddingLeft: '1.3rem', margin: 0 }}>
        {steps.map(([href, title, body]) => (
          <li key={href}>
            <Link href={href}>
              <strong>{title}</strong>
            </Link>
            <div className="small">{body}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
