"""Cold start: an empty production-mode system, driven entirely through the browser.

Proves the product runs on its own: no sample data, no external requests, the
first admin from BOOTSTRAP_ADMIN_*, two-step sign-in, setup from inside the app,
and the built-in compliance schedule. Run against an EMPTY database:

  cd frontend && npm run build                       # exports the web app to frontend/out
  cd backend  && npx prisma migrate deploy && node prisma/seed.js
  PORT=4100 NODE_ENV=production MFA_REQUIRED=true \
    BOOTSTRAP_ADMIN_EMAIL=ray.admin@tsc.example BOOTSTRAP_ADMIN_PASSWORD=First-Admin-Pass-2026 \
    (plus the four secrets) node src/server.js
  python tests-e2e/coldstart.py /tmp/coldstart-shots
"""
import sys, re, time, hmac, hashlib, struct, base64
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

import os
BASE = os.environ.get('BASE_URL', 'http://localhost:4100')
OUT = sys.argv[1]
results, external, console_errors = [], [], []

def totp(secret, t=None):
    key = base64.b32decode(secret + '=' * (-len(secret) % 8))
    counter = int((t or time.time()) // 30)
    h = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    o = h[-1] & 15
    return str((struct.unpack('>I', h[o:o + 4])[0] & 0x7fffffff) % 1000000).zfill(6)

def pick(loc, pattern):
    value = loc.evaluate("(el, src) => { const r = new RegExp(src); const o = [...el.options].find((o) => r.test(o.textContent.trim())); return o ? o.value : null; }", pattern)
    assert value, f'no option matching {pattern}'
    loc.select_option(value)

def check(name, fn):
    try:
        fn()
        results.append(f'PASS  {name}')
    except Exception as e:
        results.append(f'FAIL  {name}: {str(e).splitlines()[0][:200]}')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900})
    page = ctx.new_page()
    page.on('request', lambda r: external.append(r.url) if urlparse(r.url).hostname not in ('localhost', '127.0.0.1') and not r.url.startswith('data:') else None)
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    state = {}

    def first_sign_in():
        page.goto(BASE + '/')
        page.wait_for_url('**/login/**')
        page.get_by_label('Work email').fill('ray.admin@tsc.example')
        page.get_by_label('Password').fill('First-Admin-Pass-2026')
        page.get_by_role('button', name='Sign in').click()
        expect(page.get_by_role('heading', name='Set up two-step sign-in')).to_be_visible()
        expect(page.get_by_alt_text('QR code for your authenticator app')).to_be_visible()
        page.get_by_text('Can’t scan? Enter the key instead').click()
        state['secret'] = page.locator('details code').inner_text().strip()
        page.screenshot(path=f'{OUT}/cold-1-enrol.png')
        page.get_by_label('6-digit code').fill(totp(state['secret']))
        page.get_by_role('button', name='Turn on and sign in').click()
        page.wait_for_url('**/dashboard/**')
        expect(page.get_by_role('heading', name='Set up your area')).to_be_visible()
        page.screenshot(path=f'{OUT}/cold-2-first-run.png', full_page=True)
    check('bootstrap admin signs in and must set up two-step sign-in; empty dashboard shows setup steps', first_sign_in)

    def add_subcounties():
        page.get_by_role('link', name='Add sub-counties').click()
        pick(page.locator('#gc'), '^14 Embu')
        page.get_by_label('Names').fill('Manyatta\nRunyenjes')
        page.get_by_role('button', name='Add to Embu').click()
        expect(page.get_by_role('cell', name='Manyatta')).to_be_visible()
        expect(page.get_by_role('cell', name='Runyenjes')).to_be_visible()
    check('admin adds sub-counties to a county', add_subcounties)

    def add_school():
        page.goto(BASE + '/schools/')
        page.get_by_role('button', name='Add school').click()
        page.get_by_label('School name').fill('Kiambere Secondary School')
        page.get_by_label('School code').fill('EMB-SEC-0001')
        page.locator('#slevel').select_option('SECONDARY')
        page.get_by_label('Approved teaching posts').fill('20')
        pick(page.locator('#scounty'), '^14 Embu')
        page.wait_for_timeout(800)
        pick(page.locator('#ssub'), '^Manyatta$')
        page.locator('form').get_by_role('button', name='Add school').click()
        expect(page.get_by_role('link', name='Kiambere Secondary School')).to_be_visible()
    check('admin adds a school', add_school)

    def add_officer():
        page.goto(BASE + '/officers/')
        page.get_by_role('button', name='Add an officer').click()
        page.get_by_label('Full name').fill('Embu County Director')
        page.get_by_label('Staff number').fill('CD-14-001')
        page.get_by_label('Work email').fill('cd.embu@tsc.example')
        page.get_by_label('Temporary password').fill('County-Temp-Pass-01')
        page.locator('#or').select_option('COUNTY_DIRECTOR')
        pick(page.locator('#ocou'), '^14 Embu')
        page.locator('form').get_by_role('button', name='Add officer').click()
        expect(page.get_by_text('cd.embu@tsc.example')).to_be_visible()
    check('admin adds a County Director', add_officer)

    def add_teacher():
        page.goto(BASE + '/teachers/')
        page.get_by_role('button', name='Register a teacher').click()
        page.get_by_label('TSC number').fill('500123')
        page.get_by_label('National ID number').fill('30111222')
        page.get_by_label('First name').fill('Grace')
        page.get_by_label('Last name').fill('Wanjiku')
        page.get_by_label('Registration status').select_option('ACTIVE')
        page.get_by_role('button', name='Register teacher').click()
        expect(page.get_by_role('button', name='Register a teacher')).to_be_visible()  # the form closes on success
        expect(page.locator('.notice.error')).to_have_count(0)
    check('admin registers a teacher', add_teacher)

    def post_teacher():
        page.goto(BASE + '/schools/')
        page.get_by_role('link', name='Kiambere Secondary School').click()
        page.get_by_label('TSC number').fill('500123')
        page.get_by_role('button', name='Find').click()
        page.get_by_role('button', name='Record posting').click()
        expect(page.get_by_text('Posting recorded')).to_be_visible()
        expect(page.get_by_role('link', name='Grace Wanjiku')).to_be_visible()
        state['school_url'] = page.url
    check('admin posts the teacher to the school', post_teacher)

    def document_file():
        page.goto(BASE + '/documents/')
        page.get_by_role('button', name='Submit a document').click()
        page.locator('#dt').select_option('APPOINTMENT_LETTER')
        page.get_by_label('Title').fill('Appointment letter, Grace Wanjiku')
        pick(page.locator('#dsc'), '^Kiambere Secondary School$')
        page.get_by_label('Scanned file').set_input_files({'name': 'letter.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4\n% cold start test\n'})
        page.get_by_role('button', name='Submit for review').click()
        page.locator('#dv').select_option('all')
        page.get_by_role('link', name='Appointment letter, Grace Wanjiku').click()
        with page.expect_download() as dl:
            page.get_by_role('button', name='Download letter.pdf').click()
        path = dl.value.path()
        assert open(path, 'rb').read().startswith(b'%PDF-1.4'), 'downloaded file does not match'
    check('a document file is stored in the database and downloads intact', document_file)

    def scheduled_rules():
        # The server started with an empty flag table; the built-in schedule runs ~30 s after start.
        deadline = time.time() + 90
        while time.time() < deadline:
            page.goto(BASE + '/compliance/')
            if page.get_by_text('Under-staffed').count():
                return
            time.sleep(5)
        raise AssertionError('no flag from the scheduled scan within 90 s')
    check('the built-in schedule runs the compliance scan with no cron', scheduled_rules)
    page.screenshot(path=f'{OUT}/cold-3-flags.png', full_page=True)

    def teacher_portal():
        t = b.new_context().new_page()
        t.on('request', lambda r: external.append(r.url) if urlparse(r.url).hostname not in ('localhost', '127.0.0.1') and not r.url.startswith('data:') else None)
        t.goto(BASE + '/portal/register/')
        t.get_by_label('TSC number').fill('500123')
        t.get_by_label('National ID number').fill('30111222')
        t.get_by_label('Choose a password').fill('Teacher-Pass-123')
        t.get_by_label('Type it again').fill('Teacher-Pass-123')
        t.get_by_role('button', name='Create account').click()
        t.wait_for_url('**/portal/**')
        expect(t.get_by_text('Kiambere Secondary School')).to_be_visible()
    check('the teacher registers on the portal and sees the posting', teacher_portal)

    def second_sign_in_needs_code():
        page.get_by_role('button', name='Sign out').click()
        page.wait_for_url('**/login/**')
        page.get_by_label('Work email').fill('ray.admin@tsc.example')
        page.get_by_label('Password').fill('First-Admin-Pass-2026')
        page.get_by_role('button', name='Sign in').click()
        expect(page.get_by_role('heading', name='Enter your sign-in code')).to_be_visible()
        page.get_by_label('6-digit code').fill(totp(state['secret']))
        page.get_by_role('button', name='Verify and sign in').click()
        page.wait_for_url('**/dashboard/**')
        expect(page.get_by_role('heading', name='Set up your area')).to_have_count(0)
    check('signing in again asks for the two-step code; dashboard now shows live data', second_sign_in_needs_code)
    page.screenshot(path=f'{OUT}/cold-4-dashboard.png', full_page=True)

    def deep_link():
        page.goto(state['school_url'])
        expect(page.get_by_role('heading', name='Kiambere Secondary School')).to_be_visible()
        r = page.goto(BASE + '/no-such-page/')
        assert r.status == 404, f'status {r.status}'
    check('detail pages open by direct link; unknown pages return 404', deep_link)
    b.close()

print('\n'.join(results))
print(f'external requests: {len(set(external))} {sorted(set(external))[:5]}')
print(f'console errors: {len(console_errors)} {console_errors[:3]}')
sys.exit(1 if any(r.startswith('FAIL') for r in results) or external else 0)
