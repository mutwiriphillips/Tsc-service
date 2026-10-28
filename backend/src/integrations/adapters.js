/**
 * Integration adapters — "integrate, don't duplicate".
 *
 * The platform reads from TSC's systems of record rather than re-keying data.
 * Until TSC confirms which systems expose an API, data arrives as nightly CSV
 * exports through /api/integrations/import/* (see importers.js).
 *
 * Each adapter below is the contract an API connection must meet. Implement
 * `fetchChangedSince(date)` against the real system once access is agreed, then
 * schedule `scripts/sync.js` (to be added with the first live adapter).
 */

class NotConfiguredError extends Error {
  constructor(name) {
    super(`${name} adapter is not configured. Use the CSV import until API access is agreed with TSC.`);
    this.status = 501;
  }
}

const adapter = (name) => ({
  name,
  configured: false,
  /** @returns {Promise<Array<object>>} records changed since `date` */
  async fetchChangedSince() {
    throw new NotConfiguredError(name);
  },
});

module.exports = {
  NotConfiguredError,
  /** Teacher registration register: tscNumber, names, registration status. */
  registration: adapter('Registration'),
  /** Appraisal returns: tscNumber, school, year, term, complete. */
  appraisal: adapter('Appraisal'),
  /** Payroll: used read-only to reconcile postings against who is actually paid where. */
  payroll: adapter('Payroll'),
  /** National ID verification (e.g. IPRS): confirms identity at portal registration. */
  identity: adapter('Identity verification'),
};
