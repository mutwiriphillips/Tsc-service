const { ZodError } = require('zod');

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg);
const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, msg);
const notFound = (msg = 'Not found') => new HttpError(404, msg);
const conflict = (msg, details) => new HttpError(409, msg, details);
const unprocessable = (msg, details) => new HttpError(422, msg, details);

/** Wrap async route handlers so thrown errors reach the error middleware. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validate req[part] against a zod schema, replacing it with the parsed value. */
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(
      'Validation failed',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.issues });
  }
  if (err && err.code === 'P2002') return res.status(409).json({ error: 'A record with these details already exists' });
  if (err && err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable, ah, parse, errorHandler };
