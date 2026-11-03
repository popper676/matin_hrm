import { z } from 'zod';

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Map Zod errors into a readable message
      const messages = (error.errors || []).map(err => {
        const path = (err.path || []).join('.');
        return `${path}: ${err.message}`;
      });
      return res.status(400).json({ error: 'Validation Error', details: messages });
    }
    return res.status(500).json({ error: 'Internal Server Error during validation' });
  }
};
