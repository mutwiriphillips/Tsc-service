const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const prisma = require('./lib/prisma');
const { errorHandler, notFound } = require('./lib/http');
const { requireOfficer, requireTeacher } = require('./middleware/auth');

const authRoutes = require('./modules/auth.routes');
const geoRoutes = require('./modules/geo.routes');
const officerRoutes = require('./modules/officers.routes');
const schoolRoutes = require('./modules/schools.routes');
const teacherRoutes = require('./modules/teachers.routes');
const { postings, vacancies } = require('./modules/postings.routes');
const { router: documentRoutes } = require('./modules/documents.routes');
const visitRoutes = require('./modules/visits.routes');
const complianceRoutes = require('./modules/compliance.routes');
const { appraisals, cases } = require('./modules/records.routes');
const reportRoutes = require('./modules/reports.routes');
const portalRoutes = require('./modules/portal.routes');
const adminRoutes = require('./modules/admin.routes');
const integrationRoutes = require('./modules/integrations.routes');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // The exported web app hydrates with small inline scripts; everything else is same-origin.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  // Personal data must not sit in shared caches.
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'unreachable' });
    }
  });

  app.use('/api/auth', authRoutes);

  // Officer side — every route below requires an officer token.
  app.use('/api/geo', requireOfficer, geoRoutes);
  app.use('/api/officers', requireOfficer, officerRoutes);
  app.use('/api/schools', requireOfficer, schoolRoutes);
  app.use('/api/teachers', requireOfficer, teacherRoutes);
  app.use('/api/postings', requireOfficer, postings);
  app.use('/api/vacancies', requireOfficer, vacancies);
  app.use('/api/documents', requireOfficer, documentRoutes);
  app.use('/api/visits', requireOfficer, visitRoutes);
  app.use('/api/compliance', requireOfficer, complianceRoutes);
  app.use('/api/appraisals', requireOfficer, appraisals);
  app.use('/api/cases', requireOfficer, cases);
  app.use('/api/reports', requireOfficer, reportRoutes);
  app.use('/api/admin', requireOfficer, adminRoutes);
  app.use('/api/integrations', requireOfficer, integrationRoutes);

  // Teacher side — a separate identity, a separate prefix, a separate token type.
  app.use('/api/portal', requireTeacher, portalRoutes);

  // The web app: static files exported from frontend/ (npm run build there), served on the same address.
  const webDir = path.resolve(process.env.WEB_DIR || path.join(__dirname, '../../frontend/out'));
  if (fs.existsSync(path.join(webDir, 'index.html'))) {
    app.use(
      express.static(webDir, {
        index: 'index.html',
        setHeaders(res, file) {
          // Hashed build assets never change; pages are always revalidated.
          if (file.includes(`${path.sep}_next${path.sep}static${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.status(404).sendFile(path.join(webDir, '404.html'));
    });
  } else {
    app.get('/', (req, res) => res.json({ service: 'TSC Teacher Management & Governance System API', health: '/api/health', web: 'not built: run npm run build in frontend/' }));
  }

  app.use((req, res, next) => next(notFound(`No route for ${req.method} ${req.path}`)));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
