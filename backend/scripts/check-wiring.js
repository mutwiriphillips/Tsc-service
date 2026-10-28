/* eslint-disable no-console */
/**
 * Verification step 1 — syntax and wiring.
 * Loads every backend file, builds the app, and lists every mounted route,
 * confirming each officer route sits behind requireOfficer and each portal
 * route behind requireTeacher, before anything runs against data.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../src');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (f.endsWith('.js')) files.push(full);
  }
})(root);

let failed = 0;
for (const f of files) {
  if (f.endsWith('server.js')) continue; // starts listening; covered by app.js
  try {
    require(f);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${path.relative(root, f)}: ${e.message}`);
  }
}
console.log(`Loaded ${files.length - 1 - failed}/${files.length - 1} modules`);

const { createApp } = require('../src/app');
const app = createApp();
const stack = app._router.stack;

const routes = [];
for (const layer of stack) {
  if (!layer.regexp || !layer.handle || !layer.handle.stack) continue;
  const mount = layer.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
  for (const r of layer.handle.stack) {
    if (r.route) {
      for (const m of Object.keys(r.route.methods)) routes.push({ method: m.toUpperCase(), path: `/${mount}${r.route.path === '/' ? '' : r.route.path}`.replace('//', '/') });
    }
  }
}

// Every mount except /api/auth must be behind an identity check.
const mounts = stack.filter((l) => l.name === 'router' || (l.handle && l.handle.stack));
let unguarded = 0;
for (let i = 0; i < stack.length; i += 1) {
  const l = stack[i];
  if (!(l.handle && l.handle.stack)) continue;
  const src = l.regexp.source;
  if (src.includes('auth')) continue;
  const prev = stack[i - 1];
  const guard = prev && prev.regexp.source === src ? prev.name : null;
  const expected = src.includes('portal') ? 'requireTeacher' : 'requireOfficer';
  if (guard !== expected) {
    unguarded += 1;
    console.error(`✗ ${src} is not guarded by ${expected} (found ${guard})`);
  }
}

console.log(`Mounted ${mounts.length} routers, ${routes.length} routes`);
for (const r of routes) console.log(`  ${r.method.padEnd(6)} ${r.path}`);
if (failed || unguarded) {
  console.error(`FAILED: ${failed} module errors, ${unguarded} unguarded routers`);
  process.exit(1);
}
console.log('Wiring check passed: every router is guarded by the right identity check');
process.exit(0);
