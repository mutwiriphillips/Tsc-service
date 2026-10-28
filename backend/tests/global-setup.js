const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://tsc:tsc_dev_pw@localhost:5432/tsc_test?schema=public';
  const root = path.join(__dirname, '..');
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: url };
  execSync(`./scripts/db-reset-local.sh "${url}"`, { cwd: root, env, stdio: 'pipe' });
  // Test-only fictional data; the product seed never loads it.
  execSync('node tests/fixtures/load.js', { cwd: root, env, stdio: 'pipe' });
};
