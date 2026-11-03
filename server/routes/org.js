import {publicAppUrl} from '../lib/publicAppUrl.js';
import express from 'express';
import { openingIsOpen } from '../lib/jobOpenings.js';
import multer from 'multer';
import { dbFetch, dbInsert, dbUpdate, dbDelete, dbFetchOne } from '../lib/supabase.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import {
  getFacebookConnectionStatus,
  generatePositionCaption,
  getPublishedPositionOpening,
  publishPositionToFacebook,
} from '../lib/positionFacebook.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = express.Router();
router.use(verifyToken);

// Departments
router.get('/departments', async (req, res) => {
  try {
    const [depts, employees] = await Promise.all([
      dbFetch('Departments', '*', {}, { order: 'Department_name', ascending: true }),
      dbFetch('Employees', 'id,Dept_id,Full_name,employee_id,avatar_url', { status: 'Active' }),
    ]);
    const empsMap = {};
    employees.forEach(e => {
      if (!empsMap[e.Dept_id]) empsMap[e.Dept_id] = [];
      empsMap[e.Dept_id].push(e);
    });
    depts.forEach(d => {
      d.staff = empsMap[d.id] || [];
      d.emp_count = d.staff.length;
    });
    return res.json({ departments: depts });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/departments', requireAdmin, async (req, res) => {
  try {
    const d = req.body;
    await dbInsert('Departments', {
      Department_name: d.Department_name,
      Descriptions: d.Descriptions
    });
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      action: 'CREATE',
      module: 'Departments',
      details: `Created department ${d.Department_name}`,
      ip_address: req.ip || '0.0.0.0'
    });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.put('/departments/:id', requireAdmin, async (req, res) => {
  try {
    const d = req.body;
    await dbUpdate('Departments', req.params.id, {
      Department_name: d.Department_name,
      Descriptions: d.Descriptions
    });
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      action: 'UPDATE',
      module: 'Departments',
      details: `Updated department ${d.Department_name}`,
      ip_address: req.ip || '0.0.0.0'
    });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.delete('/departments/:id', requireAdmin, async (req, res) => {
  try {
    await dbDelete('Departments', req.params.id);
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      action: 'DELETE',
      module: 'Departments',
      details: `Deleted department ID: ${req.params.id}`,
      ip_address: req.ip || '0.0.0.0'
    });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Positions
router.get('/positions', async (req, res) => {
  try {
    const [positions, employees, openings] = await Promise.all([
      dbFetch('positions', '*', {}, { order: 'title', ascending: true }),
      dbFetch('Employees', 'id,position_id,Full_name,employee_id,avatar_url', { status: 'Active' }),
      dbFetch('job_openings','id,status,published_snapshot',{status:'published'}),
    ]);
    const empsMap = {};
    employees.forEach(e => {
      if (!empsMap[e.position_id]) empsMap[e.position_id] = [];
      empsMap[e.position_id].push(e);
    });
    positions.forEach(p => {
      p.staff = empsMap[p.id] || [];
      p.emp_count = p.staff.length;
      p.is_hiring = openings.some(o => o.published_snapshot?.position_id === p.id && openingIsOpen(o));
    });

    return res.json({ positions });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/positions', requireAdmin, async (req, res) => {
  try {
    const d = req.body;
    const result = await dbInsert('positions', { title: d.title, level: d.level || 'Mid', team: d.department || null, base_salary: parseFloat(d.base_salary || 0), is_hiring: d.is_hiring === 'true' || d.is_hiring === true, created_at: new Date().toISOString() });
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      action: 'CREATE',
      module: 'positions',
      details: `Created position ${d.title}`,
      ip_address: req.ip || '0.0.0.0'
    });
    return res.json({ success: !!result, position: result });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.put('/positions/:id', requireAdmin, async (req, res) => {
  try {
    const d = req.body;
    const updateData = { title: d.title, level: d.level, base_salary: parseFloat(d.base_salary || 0) };
    if (d.is_hiring !== undefined) {
      updateData.is_hiring = d.is_hiring === 'true' || d.is_hiring === true;
    }
    await dbUpdate('positions', req.params.id, updateData);
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      action: 'UPDATE',
      module: 'positions',
      details: `Updated position ${d.title}`,
      ip_address: req.ip || '0.0.0.0'
    });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.delete('/positions/:id', requireAdmin, async (req, res) => {
  try {
    await dbDelete('positions', req.params.id);
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      action: 'DELETE',
      module: 'positions',
      details: `Deleted position ID: ${req.params.id}`,
      ip_address: req.ip || '0.0.0.0'
    });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// GET /api/positions/facebook-connection — Zernio / Graph status
router.get('/positions/facebook-connection', requireAdmin, async (req, res) => {
  try {
    const status = await getFacebookConnectionStatus();
    return res.json(status);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/positions/:id/generate-caption — AI draft for announcement
router.post('/positions/:id/generate-caption', requireAdmin, async (req, res) => {
  try {
    const pos = await dbFetchOne('positions', '*', { id: req.params.id });
    if (!pos) return res.status(404).json({ error: 'Position not found' });
    await getPublishedPositionOpening(pos.id);

    const appUrl = publicAppUrl();
    const caption = await generatePositionCaption(pos, appUrl);
    return res.json({ caption });
  } catch (e) {
    console.error('Generate caption error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/positions/:id/publish-facebook — publish with caption + optional image (Zernio flow)
router.post('/positions/:id/publish-facebook', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const posId = req.params.id;
    const pos = await dbFetchOne('positions', '*', { id: posId });
    if (!pos) return res.status(404).json({ error: 'Position not found' });
    await getPublishedPositionOpening(pos.id);

    const caption = (req.body.caption || '').trim();
    if (!caption) return res.status(400).json({ error: 'Caption is required.' });

    let imageBuffer = null;
    let imageMeta = null;
    if (req.file) {
      imageBuffer = req.file.buffer;
      imageMeta = { filename: req.file.originalname, mimetype: req.file.mimetype };
    }

    const result = await publishPositionToFacebook(caption, imageBuffer, imageMeta);

    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      action: 'CREATE',
      module: 'positions',
      details: `Published hiring announcement for ${pos.title} via ${result.provider}. Post: ${result.zernioPostId || result.postId}`,
      ip_address: req.ip || '0.0.0.0'
    });

    return res.json({
      success: true,
      caption,
      provider: result.provider,
      zernio_post_id: result.zernioPostId,
      facebook_post_url: result.facebookUrl,
      post_id: result.postId,
    });
  } catch (e) {
    console.error('Publish Facebook error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// Legacy: quick AI post (text only, no preview) — redirects to generate + graph/zernio
router.post('/positions/:id/post-to-facebook', requireAdmin, async (req, res) => {
  try {
    const pos = await dbFetchOne('positions', '*', { id: req.params.id });
    if (!pos) return res.status(404).json({ error: 'Position not found' });
    await getPublishedPositionOpening(pos.id);

    const appUrl = publicAppUrl();
    const caption = await generatePositionCaption(pos, appUrl);
    const result = await publishPositionToFacebook(caption, null, null);

    return res.json({ success: true, message: caption, post_id: result.postId, facebook_post_url: result.facebookUrl });
  } catch (e) {
    console.error('FB Auto Post Error:', e);
    return res.status(500).json({ error: e.message });
  }
});


// ─── ORGANIZATION CHART ──────────────────────────────────────────────────────

// GET /api/org/chart — full employee hierarchy tree
router.get('/org/chart', async (req, res) => {
  try {
    const [empRows, positions, depts] = await Promise.all([
      dbFetch('Employees', 'id,Full_name,employee_id,position_id,Dept_id,Manager_id,status,avatar_url,email,hire_date', {}, {}),
      dbFetch('positions', 'id,title,level'),
      dbFetch('Departments', 'id,Department_name'),
    ]);

    const posMap  = Object.fromEntries((positions || []).map(p => [p.id, p]));
    const deptMap = Object.fromEntries((depts     || []).map(d => [d.id, d]));

    // Enrich employees
    const employees = (empRows || [])
      .filter(e => e.status !== 'Inactive' && !e.deleted_at)
      .map(e => {
        const code = (e.employee_id || '').toLowerCase();
        const name = (e.Full_name || '').toLowerCase();
        const rawPosTitle = posMap[e.position_id]?.title;
        const rawPosLvl   = posMap[e.position_id]?.level;
        const rawDeptName = deptMap[e.Dept_id]?.Department_name;

        const isBoss = code.includes('boss') || code.includes('ceo') || name.includes('boss') || (rawPosTitle || '').toLowerCase().includes('ceo') || (rawPosTitle || '').toLowerCase().includes('managing director');

        return {
          id:            e.id,
          name:          e.Full_name || '—',
          employee_code: e.employee_id || '—',
          position:      rawPosTitle || (isBoss ? 'Managing Director & CEO' : 'Staff'),
          level:         isBoss ? 'Executive' : (rawPosLvl || 'Mid'),
          department:    rawDeptName || (isBoss ? 'Executive Board' : 'General'),
          manager_id:    e.Manager_id || null,
          avatar_url:    e.avatar_url || null,
          email:         e.email || null,
          hire_date:     e.hire_date || null,
          children:      [],
        };
      });

    // Build id → node map
    const nodeMap = Object.fromEntries(employees.map(e => [e.id, e]));

    // Find CEO/Boss — employee whose Manager_id is null OR manager is not in active list
    const roots = [];
    employees.forEach(emp => {
      if (!emp.manager_id || !nodeMap[emp.manager_id]) {
        roots.push(emp);
      } else {
        nodeMap[emp.manager_id].children.push(emp);
      }
    });

    // Sort children by position level hierarchy
    const levelOrder = { 'Executive': 0, 'Senior': 1, 'Manager': 2, 'Supervisor': 3, 'Mid': 4, 'Junior': 5 };
    function sortChildren(node) {
      node.children.sort((a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9) || a.name.localeCompare(b.name));
      node.children.forEach(sortChildren);
    }
    roots.forEach(sortChildren);

    return res.json({ tree: roots, total: employees.length, departments: depts, positions });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT /api/org/update-manager — reassign an employee's direct manager
router.put('/org/update-manager', requireAdmin, async (req, res) => {
  try {
    const { employee_id, new_manager_id } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });

    // Prevent circular hierarchy: new_manager cannot be a subordinate of employee_id
    if (new_manager_id) {
      const allEmps = await dbFetch('Employees', 'id,Manager_id');
      const empMap = Object.fromEntries(allEmps.map(e => [e.id, e.Manager_id]));
      // Walk up new_manager's chain — if we hit employee_id, it's circular
      let cursor = new_manager_id;
      let depth = 0;
      while (cursor && depth < 20) {
        if (cursor === employee_id) {
          return res.status(400).json({ error: 'Circular hierarchy detected: the selected manager is a subordinate of this employee.' });
        }
        cursor = empMap[cursor];
        depth++;
      }
    }

    await dbUpdate('Employees', employee_id, {
      Manager_id: new_manager_id || null,
      updated_at: new Date().toISOString(),
    });

    await dbInsert('sys_audit_logs', {
      user_id:    req.user.id,
      action:     'UPDATE',
      module:     'OrgChart',
      details:    `Reassigned manager for employee ${employee_id} → ${new_manager_id || 'None (Root)'}`,
      ip_address: req.ip || '0.0.0.0',
    });

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
