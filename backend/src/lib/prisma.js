const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const env = require('../config/env');

// BigInt ids (audit trail) must survive JSON responses.
// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function toJSON() {
  return this.toString();
};

const connectionString = env.DATABASE_URL.replace(/\?schema=[^&]*/, '');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

module.exports = prisma;
