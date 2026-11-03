import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

export const JWT_SECRET = process.env.JWT_SECRET?.trim().replace(/^["']|["']$/g, '');

if (!JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is missing.');
  process.exit(1);
}
export function hashPassword(plainText) {
  return crypto.createHash('sha256').update(plainText).digest('hex');
}

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      employee_id: user.employee_id,
      must_change_password: Boolean(user.must_change_password),
      token_type: 'access',
      sid: user.session_id,
    },
    JWT_SECRET,
    { expiresIn: '2h' } // Access token: 2h is safe for internal enterprise tools
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, sid: user.session_id, token_type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' } // Long-lived refresh token
  );
}

export async function verifyToken(req, res, next) {
  if (req.accessVerified) return next();
  const isMobile = req.headers['x-client']?.toLowerCase() === 'mobile';
  let token = null;

  if (isMobile) {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
  } else {
    token = req.cookies?.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.token_type !== 'access') throw new Error('Access token required');
    const {verifyAuthSession}=await import('../../lib/authSessions.js');
    await verifyAuthSession(decoded);
    const {loadAccount,authorizeRequest}=await import('../../lib/accessControl.js');
    req.user=await loadAccount(decoded.id);
    req.authSessionId=decoded.sid;
    req.accessVerified=true;
    if(!authorizeRequest(req)) return res.status(403).json({error:'The owner has not granted access to this action.'});
    
    // Server-side enforcement of must_change_password
    if (req.user.must_change_password) {
      if (!['/api/auth/change-password','/api/auth/logout','/api/auth/me'].includes(new URL(req.originalUrl,'http://local').pathname)) {
        return res.status(403).json({ error: 'You must change your temporary password before accessing the system.', must_change_password: true });
      }
    }
    
    next();
  } catch (e) {
    return res.status(e.status||401).json({ error: e.status?e.message:'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.is_owner || (req.accessVerified && req.accessContext?.module)) return next();
  return res.status(403).json({error:'The owner has not granted management access to this action.'});
}

export function requireBoss(req, res, next) {
  if (req.user?.is_owner || (req.accessVerified && req.accessContext?.module)) return next();
  return res.status(403).json({error:'The owner has not granted management access to this action.'});
}

export function requireFinance(req, res, next) {
  if (req.user?.is_owner || (req.accessVerified && req.accessContext?.module)) return next();
  return res.status(403).json({error:'The owner has not granted management access to this action.'});
}
