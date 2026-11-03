import demoRouter from './routes/demo.js';
import brandingRouter from './routes/branding.js';
import ownerSetupRouter from './routes/owner_setup.js';
import { supabaseAdmin } from './lib/supabase.js';
import { assertFreshInstance } from './config/freshInstance.js';
process.env.TZ = 'Asia/Bangkok';

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { auditMiddleware } from './middleware/auditContext.js';
dotenv.config();
process.env.TZ = 'Asia/Bangkok'; // Ensure Bangkok (UTC+7) timezone across all server operations


import { startBirthdayCron, checkAndNotifyBirthdays } from './cron/birthdays.js';

// Routes
import { verifyToken, requireAdmin } from './middleware/auth.js';
import hrFilesRouter from './routes/hr_files.js';
import authRouter from './routes/auth.js';
import accessRouter from './routes/access.js';
import approvalsRouter from './routes/approvals.js';
import operationsRouter from './routes/hr_operations.js';
import {startOperationsCron} from './cron/operations.js';
import warningsRouter from './routes/warnings.js';
import probationRouter from './routes/probation.js';
import employeeInformationRouter from './routes/employee_information.js';
import dashboardRouter from './routes/dashboard.js';
import employeesRouter from './routes/employees.js';
import attendanceRouter from './routes/attendance.js';
import overtimeRouter from './routes/overtime.js';
import leaveRouter from './routes/leave.js';
import payrollRouter from './routes/payroll.js';
import payrollEngineRouter from './routes/payroll_engine.js';
import payrollPolicyRouter from './routes/payroll_policy.js';
import bossRouter from './routes/api_boss.js';
import orgRouter from './routes/org.js';
import recruitmentRouter from './routes/recruitment.js';
import jobOpeningsRouter from './routes/job_openings.js';
import lifecycleRouter from './routes/lifecycle.js';
import handoverRouter from './routes/handover.js';
import miscRouter from './routes/misc.js';
import publicRouter from './routes/public.js';
import financeRouter from './routes/finance.js';
import rewardsRouter from './routes/rewards.js';
import expenseFormsRouter from './routes/expense_forms.js';
import performanceRouter from './routes/performance.js';
import manualRouter from './routes/manual.js';

const app = express();
export const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// ── Security & Middleware ──────────────────────────────────────
// Only explicitly trusted proxy addresses may supply forwarded client IPs.
// Default covers local Nginx on the same host; set TRUSTED_PROXY_CIDRS for other trusted proxies.
app.set('trust proxy', process.env.TRUSTED_PROXY_CIDRS || 'loopback');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://*.cloudflareinsights.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "https://*.supabase.co"],
      connectSrc: ["'self'", "https:", "wss:", "ws:", "https://*.supabase.co"],
      mediaSrc: ["'self'", "data:", "blob:", "https:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
}));

const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    let allowedOrigins = defaultAllowedOrigins;
    if (process.env.ALLOWED_ORIGINS) {
      const customOrigins = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
      allowedOrigins = Array.from(new Set([...allowedOrigins, ...customOrigins]));
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Client', 'X-HR-Portal'],
}));

// Webhooks (Must be before express.json() to allow raw body for signature verification)

app.use(express.json({ limit: '50mb' })); // Increased for video
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(auditMiddleware);
app.use('/api/uploads', verifyToken, express.static('uploads')); // Serve safely under /api path
app.use('/uploads', verifyToken, express.static('uploads')); // Serve uploaded files

// DEBUG ROUTE REMOVED — Never expose stack traces or internal tooling in production.

// Auth-specific rate limiter: stricter, applied only to login/refresh
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Allow login attempts
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skip: (req) => req.path === '/me', // /api/auth/me is never rate-limited (it's read-only)
});

// General API rate limiter: generous, excludes auth routes (they have their own)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: (req) => req.path.includes('auth'), // Auth has its own limiter
});
app.use('/api/', limiter);

// ── Routes ─────────────────────────────────────────────────────
// Health Check must be at the top to avoid being blocked by global middlewares in other routers
app.get('/api/health', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('hr_instance').select('id').limit(1);
    if (error || !data?.length) throw new Error('HR database unavailable');
    return res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0', application: 'lm-hr', database_verified: true });
  } catch (error) {
    console.error('[HEALTH] Database readiness check failed:', error.message);
    return res.status(503).json({ status: 'unavailable', timestamp: new Date().toISOString(), version: '1.0.0', application: 'lm-hr', database_verified: false });
  }
});

// Auth routes get their own rate limiter — NOT the general one
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/branding', brandingRouter);
app.use('/api/owner-setup', ownerSetupRouter);
app.use('/api/demo', demoRouter);
app.use('/api/access', accessRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/employee-information', employeeInformationRouter);
app.use('/api/hr-files', hrFilesRouter);
app.use('/api/public', publicRouter); // /api/public/jobs, /api/public/apply
app.use('/api/dashboard', dashboardRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/overtime', overtimeRouter);
app.use('/api/leave', leaveRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/expense-forms', verifyToken, expenseFormsRouter);
app.use('/api/hr-operations', verifyToken, operationsRouter);
app.use('/api/warnings', verifyToken, warningsRouter);
app.use('/api/probation', verifyToken, probationRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/payroll-engine', payrollEngineRouter);
app.use('/api/payroll-policy', payrollPolicyRouter);
app.use('/api', orgRouter);           // /api/departments, /api/positions
app.use('/api/recruitment', recruitmentRouter);
app.use('/api/job-openings', jobOpeningsRouter);
app.use('/api', lifecycleRouter);     // /api/onboarding, /api/offboarding
app.use('/api/handover', handoverRouter);
app.use('/api/boss', bossRouter);
app.use('/api/finance', financeRouter);
app.use('/api', miscRouter);          // /api/notifications, /api/portal, /api/sops, etc.
app.use('/api/performance', performanceRouter);
app.use('/api/manual', manualRouter);
// ── Test Endpoints (Admin-Only) ─────────────────────────────────────────────
// These endpoints are protected by requireAdmin to prevent unauthorized Cron triggering.
app.post('/api/test/trigger-birthdays', verifyToken, requireAdmin, async (req, res) => {
  const result = await checkAndNotifyBirthdays();
  res.json(result);
});




// ── Serve React Frontend (Single-Container Deployment) ───────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '../hrm-client/dist')));

// Fallback all non-API routes to React's index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../hrm-client/dist/index.html'));
});

// ── 404 for API ────────────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Process-Level Error Handlers (Fail-Safe) ───────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

// ── Error Handler ──────────────────────────────────────────────
// SECURITY: Never expose stack traces or internal error details to the client.
// Stack traces reveal file paths, library versions, and server internals to attackers.
app.use((err, req, res, next) => {
  // Check if it's a Zod validation error
  if (err.name === 'ZodError' || err.errors) {
    console.error(`[VALIDATION ERROR] ${req.method} ${req.originalUrl}`);
    return res.status(400).json({ error: 'Validation Error', details: err.errors });
  }

  // Always log the full error server-side for debugging.
  console.error(`[SERVER ERROR] ${req.method} ${req.originalUrl}`, err.stack || err);

  // Only send a safe, generic message to the client.
  const proposed = Number(err.status || err.statusCode);
  const statusCode = Number.isInteger(proposed) && proposed >= 400 && proposed < 500 ? proposed : 500;
  res.status(statusCode).json({ error: statusCode === 500 ? 'Internal server error' : (err.message || 'Request failed') });
});

try { await assertFreshInstance(supabaseAdmin); } catch (error) {
  console.error('[HR STARTUP BLOCKED]', error.message);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`\n🚀 Unlock Your Future HR API Server running on http://localhost:${PORT}`);
  console.log(`📋 Health: http://localhost:${PORT}/api/health`);


  // Start background jobs
  if (process.env.NODE_ENV !== 'test') {startBirthdayCron();startOperationsCron();}
});

// Triggered restart to load new .env variables
