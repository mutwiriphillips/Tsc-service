"""Click-through of the main flows on the fictional TEST FIXTURES (not product data).

Run against a development database (it changes records):
  cd frontend && npm run build
  cd backend && npm run db:reset:local -- "$DATABASE_URL" && npm run fixtures:load && npm run rules:run
  NODE_ENV=development MFA_REQUIRED=false node src/server.js     # serves API and web on :4000
  curl -X POST localhost:4000/api/auth/teacher/register -H 'Content-Type: application/json' \\
       -d '{"tscNumber":"100001","nationalId":"2100001","password":"portal-pass-123"}'
  pip install playwright && playwright install chromium
  python tests-e2e/e2e.py /tmp/e2e-shots
"""
import sys
from playwright.sync_api import sync_playwright, expect

import os
WEB = os.environ.get('BASE_URL', 'http://localhost:4000')
OUT = sys.argv[1]
results = []

def check(name, fn):
    try:
        fn()
        results.append(f'PASS  {name}')
    except Exception as e:
        results.append(f'FAIL  {name}: {str(e).splitlines()[0]}')

with sync_playwright() as p:
    b = p.chromium.launch()

    # 1. Sub-County Director signs in through the form and approves a document.
    page = b.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    def sign_in(email):
        page.goto(f'{WEB}/login')
        page.get_by_label('Work email').fill(email)
        page.get_by_label('Password').fill('ChangeMe!2026')
        page.get_by_role('button', name='Sign in').click()
        page.wait_for_url('**/dashboard/**')
    check('officer signs in through the form', lambda: sign_in('scd.manyatta@tsc.demo'))

    def approve():
        page.goto(f'{WEB}/documents')
        page.get_by_role('link', name='Promotion file — Senior Teacher').click()
        page.get_by_role('button', name='Approve').click()
        expect(page.get_by_text('Awaiting county sign-off')).to_be_visible()
        expect(page.get_by_role('heading', name='Your decision: Sub-County review')).to_have_count(0)
    check('sub-county review approves and hands over to the county tier', approve)

    def reject_needs_reason():
        page.goto(f'{WEB}/documents')
        page.get_by_role('link', name='Appointment letter — new Mathematics teacher').click()
        expect(page.get_by_role('button', name='Reject')).to_be_disabled()
        page.get_by_label('Reason').fill('Wrong template used')
        expect(page.get_by_role('button', name='Reject')).to_be_enabled()
    check('reject stays disabled until a reason is given', reject_needs_reason)
    page.screenshot(path=f'{OUT}/e2e-1-document.png')

    # 2. County Director posts a PENDING teacher: blocked, then overrides with a reason.
    page.evaluate("sessionStorage.clear()")
    check('county director signs in', lambda: sign_in('cd.embu@tsc.demo'))

    def gate():
        page.goto(f'{WEB}/schools')
        page.get_by_role('link', name='Demo Kairuri Secondary').click()
        page.get_by_label('TSC number').fill('100001')
        page.get_by_role('button', name='Find').click()
        expect(page.get_by_text('already posted elsewhere')).to_be_visible()
        page.get_by_role('button', name='Record posting').click()
        expect(page.get_by_text('Blocked by the registration gate.')).to_be_visible()
        page.screenshot(path=f'{OUT}/e2e-2-gate.png', full_page=True)
        expect(page.get_by_role('button', name='Override and post')).to_be_disabled()
        page.get_by_label('Override reason').fill('Registration confirmed by the Board on 20 October; register update pending')
        page.get_by_role('button', name='Override and post').click()
        expect(page.get_by_text('Posting recorded')).to_be_visible()
        expect(page.get_by_role('link', name='Wanjiru Muriithi')).to_be_visible()
    check('registration gate blocks, then a reasoned override posts the teacher', gate)

    def overridden_visible():
        page.goto(f'{WEB}/compliance')
        page.get_by_label('Status').select_option('OVERRIDDEN')
        expect(page.get_by_text('Registration Gate Overridden')).to_be_visible()
        expect(page.get_by_text('Registration confirmed by the Board')).to_be_visible()
    check('the override is listed with its reason', overridden_visible)
    page.screenshot(path=f'{OUT}/e2e-3-overridden.png', full_page=True)

    # 3. A teacher token never opens officer pages.
    def teacher_cannot_enter():
        ctx = b.new_context()
        tp = ctx.new_page()
        tp.goto(f'{WEB}/portal/login')
        tp.get_by_label('TSC number').fill('100001')
        tp.get_by_label('Password').fill('portal-pass-123')
        tp.get_by_role('button', name='Sign in').click()
        tp.wait_for_url('**/portal/**')
        expect(tp.get_by_text('Demo Kairuri Secondary')).to_be_visible()  # the new posting shows to the teacher
        tp.goto(f'{WEB}/dashboard')
        tp.wait_for_url('**/login/**')
    check('teacher sees the new posting and is turned away from officer pages', teacher_cannot_enter)
    b.close()

print('\n'.join(results))
sys.exit(1 if any(r.startswith('FAIL') for r in results) else 0)
