import Link from 'next/link';
import Logo from '@/components/Brand';
import HomeActions from '@/components/HomeActions';

export const metadata = {
  title: { absolute: 'Teacher Management & Governance System · Teachers Service Commission' },
  description: 'One verified record of every teacher, school and staffing action, with an audit trail behind each decision.',
};

const CHAIN = [
  ['Head of institution submits', 'A posting, return or promotion file goes in with its supporting document.'],
  ['Sub-County Director reviews', 'Checks the file against the school and the teacher’s record.'],
  ['County Director signs off', 'Confirms the decision for the county.'],
  ['National office approves', 'Added for promotion files only.'],
];

const MODULES = [
  ['Teacher and school registry', 'Every teacher by TSC number, every school with its approved establishment.'],
  ['Staffing ledger', 'Postings, acting appointments, transfers, exits and vacancies, checked against registration at the moment of posting.'],
  ['Document approvals', 'Review and sign-off in order, with a reason recorded for every rejection.'],
  ['Field quality assurance', 'Curriculum Support Officers plan visits, a supervisor signs off, the report is filed.'],
  ['Compliance rules', 'Registration, appraisal cycles, acting limits, staffing norms and case timelines, scanned daily.'],
  ['School readiness score', 'Six weighted factors per school, shown with the working behind the number.'],
  ['Teacher portal', 'Teachers see their own record, ask for a transfer or a correction, and download everything held about them.'],
  ['Audit trail', 'Every action recorded in a log the database will not let anyone edit or delete.'],
];

export default function Home() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>

      <header className="lp-top">
        <div className="lp-wrap lp-top-in">
          <Link href="/" className="lp-brand" aria-label="Teacher Management and Governance System home">
            <Logo size={64} />
            <span className="lp-brand-text">
              <b>Teachers Service Commission</b>
              <span>Teacher Management &amp; Governance System</span>
            </span>
          </Link>
          <nav className="lp-nav" aria-label="Sections">
            <a href="#what">What it keeps</a>
            <a href="#principles">How it decides</a>
            <a href="#enter">Sign in</a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <h1>One verified record of every teacher and every school.</h1>
              <p className="lp-lede">
                The Commission’s officers, from the head of an institution to the national office, work from the same
                facts, with an audit trail behind every decision.
              </p>
              <HomeActions />
              <p className="small lp-fine">Officers sign in with two-step verification. Teachers register with their TSC number and national ID.</p>
            </div>

            <figure className="lp-chain" aria-labelledby="chain-title">
              <figcaption id="chain-title">How a document is decided</figcaption>
              <ol>
                {CHAIN.map(([t, d], i) => (
                  <li key={t} style={{ '--i': i }}>
                    <b>{t}</b>
                    <span>{d}</span>
                  </li>
                ))}
              </ol>
              <p className="lp-chain-rule">No one decides a document they submitted. Nothing is rejected without a reason.</p>
            </figure>
          </div>
        </section>

        <section className="lp-people" aria-labelledby="people-title">
          <div className="lp-wrap lp-people-in">
            <div className="lp-people-copy">
              <h2 id="people-title" className="lp-h2">Every record starts in a classroom.</h2>
              <p>
                The system exists so that the teacher at the front of the room is posted, supported and heard: vacancies
                are seen early, appraisals are not missed, and a correction to a record reaches someone who can make it.
              </p>
            </div>
            <figure className="lp-photo lp-photo-wide">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/classroom-ict.jpg" width="736" height="705" loading="lazy" alt="A teacher in a blue tie leaning over a learner's shoulder in a computer lesson, with other learners at their screens." />
            </figure>
            <figure className="lp-photo lp-photo-tall">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/classroom-lesson.jpg" width="736" height="1103" loading="lazy" alt="A teacher holding a book in front of a whiteboard while primary school learners in sweaters sit at wooden desks." />
            </figure>
          </div>
        </section>

        <section id="what" className="lp-section">
          <div className="lp-wrap">
            <h2 className="lp-h2">What the system keeps</h2>
            <dl className="lp-modules">
              {MODULES.map(([t, d]) => (
                <div key={t}>
                  <dt>{t}</dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="principles" className="lp-band">
          <div className="lp-wrap lp-band-in">
            <p className="lp-statement">The system reports. Officers decide.</p>
            <ul className="lp-commit">
              <li>
                <b>It rates schools, never individual teachers.</b>
                <span>Rules raise flags for a named officer to act on. Nothing is approved, ranked or disciplined automatically.</span>
              </li>
              <li>
                <b>Officers see only their own jurisdiction.</b>
                <span>A record outside your region, county, sub-county or school is not shown to you, and its existence is not disclosed.</span>
              </li>
              <li>
                <b>Sensitive details are locked.</b>
                <span>National ID numbers are never stored in readable form. Health and disciplinary notes are encrypted and every read is logged.</span>
              </li>
            </ul>
          </div>
        </section>

        <section id="enter" className="lp-section">
          <div className="lp-wrap lp-doors">
            <div>
              <h2 className="lp-h2">For officers</h2>
              <p>Sign in to manage postings, review documents, plan field visits and act on compliance flags in your area.</p>
              <div className="row" style={{ marginTop: '1.25rem' }}>
                <Link className="btn lp-btn" href="/login">Officer sign in</Link>
              </div>
            </div>
            <div>
              <h2 className="lp-h2">For teachers</h2>
              <p>Register with your TSC number and national ID to see your posting, ask for a transfer or a correction, and download your record.</p>
              <div className="row" style={{ marginTop: '1.25rem' }}>
                <Link className="btn secondary lp-btn" href="/portal/register">Register</Link>
                <Link className="btn secondary lp-btn" href="/portal/login">Teacher sign in</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div className="lp-foot-brand">
            <Logo size={36} />
            <span>Pilot system prepared for the Teachers Service Commission.</span>
          </div>
          <p className="small">Personal data is handled under the Data Protection Act, 2019. Questions about your record go through the teacher portal.</p>
        </div>
      </footer>
    </div>
  );
}
