const prisma = require('../lib/prisma');
const { DEFAULTS } = require('./defaults');

/** Load every rule setting, falling back to defaults for anything missing. */
async function loadRuleConfig(client = prisma) {
  const rows = await client.ruleConfig.findMany();
  const cfg = { ...DEFAULTS };
  for (const r of rows) cfg[r.key] = r.value;
  return cfg;
}

module.exports = { loadRuleConfig };
