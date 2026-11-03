import { AsyncLocalStorage } from 'async_hooks';

export const auditContext = new AsyncLocalStorage();

export const auditMiddleware = (req, res, next) => {
  auditContext.run(req, () => {
    next();
  });
};
