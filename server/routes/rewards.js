import {prepareApproval,createApproval,linkedApproval} from '../lib/approvals.js';
import {requestIsManager} from '../lib/accessControl.js';
import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { dbFetch, dbInsert, dbUpdate, dbDelete, dbFetchOne } from '../lib/supabase.js';

const router = express.Router();

// GET /api/rewards
// Returns rewards based on role
router.get('/', verifyToken, async (req, res) => {
  try {
    const adminRoles = ['boss', 'hr_manager', 'general_manager', 'admin'];
    const isAdmin = req.user && requestIsManager(req);

    let query = {};
    if (!isAdmin) {
      // Employees can only see their own claims
      query = { employee_id: req.user.employee_id };
    }

    let records = [];
    try {
      records = await dbFetch('rewards_and_claims', '*', query, { order: 'created_at', ascending: false });
    } catch (dbErr) {
      // Table might not exist yet
      console.warn("Table rewards_and_claims might not exist", dbErr.message);
    }

    // Attach employee names
    const employees = await dbFetch('Employees', 'id,Full_name,employee_id', { status: 'Active' });
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

    records.forEach(r => {
      const emp = empMap[r.employee_id] || {};
      r.employee_name = emp.Full_name || 'Unknown Employee';
    });

    return res.json({ success: true, rewards: records, employees: isAdmin ? employees : [] });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/rewards (Employee requesting a claim/reward)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { claim_type, custom_type, requested_amount, description, proof_image_url, currency } = req.body;
    if(claim_type==='Expense Claim')return res.status(400).json({error:'Use the complete Expense Request form with its four-stage approval workflow.'});
    const approvalStages = claim_type === 'Expense Claim' ? await prepareApproval('expense',req.user) : null;
    if(approvalStages && !['THB','MMK','USD'].includes(currency))return res.status(400).json({error:'Choose the expense currency.'});
    
    if (!req.user.employee_id) {
      return res.status(400).json({ error: 'Only mapped employees can submit a claim.' });
    }

    const payload = {
      employee_id: req.user.employee_id,
      claim_type,
      currency: currency || null,
      custom_type: custom_type || null,
      requested_amount: parseFloat(requested_amount) || 0,
      description: description || '',
      proof_image_url: proof_image_url || null,
      status: 'PENDING',
      requested_by: 'EMPLOYEE',
      created_at: new Date().toISOString()
    };

    const result = await dbInsert('rewards_and_claims', payload);

    if(approvalStages){
      try {await createApproval('expense',req.user,result.id,`${req.user.full_name}: ${description||'Expense claim'}`,{requested_amount:payload.requested_amount,currency,description,proof_image_url},approvalStages);}
      catch(error){await dbDelete('rewards_and_claims',result.id);throw error;}
    }
    // Notify Boss/HR
    await dbInsert('system_notifications', {
      recipient_role: 'hr_manager',
      title: `New Claim Submitted`,
      message: `An employee has submitted a new ${claim_type} claim for ${requested_amount}.`,
      link_url: '/payroll/rewards',
      is_read: false,
      created_at: new Date().toISOString()
    });

    return res.json({ success: true, reward: result });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/rewards/issue (Admin issuing a direct bonus)
router.post('/issue', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { employee_id, claim_type, custom_type, amount, description } = req.body;
    if(claim_type==='Expense Claim')return res.status(400).json({error:'Expenses require an employee request and the assigned approval workflow.'});
    
    const payload = {
      employee_id,
      claim_type,
      custom_type: custom_type || null,
      requested_amount: parseFloat(amount) || 0,
      approved_amount: parseFloat(amount) || 0,
      description: description || '',
      status: 'APPROVED',
      requested_by: 'ADMIN',
      approved_by: req.user.id,
      admin_remarks: 'Directly issued by Admin',
      created_at: new Date().toISOString()
    };

    const result = await dbInsert('rewards_and_claims', payload);

    // Notify Employee
    const user = await dbFetchOne('sys_users', 'id', { employee_id });
    if (user) {
      await dbInsert('system_notifications', {
        recipient_user_id: user.id,
        title: `Bonus/Reward Issued`,
        message: `You have received a ${claim_type} bonus of ${amount}.`,
        link_url: '/portal/rewards',
        is_read: false,
        created_at: new Date().toISOString()
      });
    }

    return res.json({ success: true, reward: result });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// PUT /api/rewards/:id/approve (Admin approving a claim)
router.put('/:id/approve', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if(await linkedApproval('expense',id))return res.status(409).json({error:'Use the Approvals inbox for this request. All configured stages are required.'});
    const { approved_amount, admin_remarks } = req.body;

    const target = await dbFetchOne('rewards_and_claims', '*', { id });
    if (!target) return res.status(404).json({ error: 'Claim not found' });
    if(target.employee_id===req.user.employee_id)return res.status(403).json({error:'You cannot decide your own claim.'});

    const updateData = {
      status: 'APPROVED',
      approved_amount: parseFloat(approved_amount) || target.requested_amount,
      admin_remarks: admin_remarks || '',
      approved_by: req.user.id
    };

    await dbUpdate('rewards_and_claims', id, updateData);

    // Notify Employee
    const user = await dbFetchOne('sys_users', 'id', { employee_id: target.employee_id });
    if (user) {
      await dbInsert('system_notifications', {
        recipient_user_id: user.id,
        title: `Claim Approved`,
        message: `Your ${target.claim_type} claim has been approved.`,
        link_url: '/portal/rewards',
        is_read: false,
        created_at: new Date().toISOString()
      });
    }

    return res.json({ success: true, status: 'APPROVED' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// PUT /api/rewards/:id/reject (Admin rejecting a claim)
router.put('/:id/reject', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if(await linkedApproval('expense',id))return res.status(409).json({error:'Use the Approvals inbox for this request. All configured stages are required.'});
    const { admin_remarks } = req.body;

    const target = await dbFetchOne('rewards_and_claims', '*', { id });
    if (!target) return res.status(404).json({ error: 'Claim not found' });
    if(target.employee_id===req.user.employee_id)return res.status(403).json({error:'You cannot decide your own claim.'});

    const updateData = {
      status: 'REJECTED',
      admin_remarks: admin_remarks || 'Rejected by Admin',
      approved_by: req.user.id
    };

    await dbUpdate('rewards_and_claims', id, updateData);

    // Notify Employee
    const user = await dbFetchOne('sys_users', 'id', { employee_id: target.employee_id });
    if (user) {
      await dbInsert('system_notifications', {
        recipient_user_id: user.id,
        title: `Claim Rejected`,
        message: `Your ${target.claim_type} claim has been rejected.`,
        link_url: '/portal/rewards',
        is_read: false,
        created_at: new Date().toISOString()
      });
    }

    return res.json({ success: true, status: 'REJECTED' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/rewards/:id
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    if(await linkedApproval('expense',req.params.id))return res.status(409).json({error:'Requests with approval history must be retained.'});
    await dbDelete('rewards_and_claims', req.params.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
