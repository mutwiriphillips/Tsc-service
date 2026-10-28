// Tests always run against a separate database, never the development one.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://tsc:tsc_dev_pw@localhost:5432/tsc_test?schema=public';
process.env.MFA_REQUIRED = 'false';
