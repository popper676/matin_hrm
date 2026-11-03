import {integrityRpc} from '../lib/integrityRpc.js';
import express from 'express';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { lifecycleModule } from '../modules/lifecycle/index.js';

const router = express.Router();
router.use(verifyToken);

// Onboarding
router.get('/onboarding', async (req, res) => {
  try {
    const data = await lifecycleModule.getOnboardingList();
    return res.json(data);
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.get('/onboarding/:id', async (req, res) => {
  try {
    const data = await lifecycleModule.getOnboardingDetail(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.post('/onboarding', requireAdmin, async (req, res) => {
  try {
    const result = await lifecycleModule.createOnboarding(req.body);
    return res.json({ success: !!result, onboarding: result });
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.put('/onboarding/:id', requireAdmin, async (req, res) => {
  try {
    await lifecycleModule.updateOnboarding(req.params.id, req.body);
    return res.json({ success: true });
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.post('/onboarding/:id/task/:assign_id/complete', requireAdmin, async (req, res) => {
  try {
    const result = await lifecycleModule.toggleOnboardingTask(req.params.id, req.params.assign_id);
    return res.json({ success: true, ...result });
  } catch (e) {
    if (e.message === 'Task not found') return res.status(404).json({ error: e.message });
    return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// Offboarding
router.get('/offboarding', async (req, res) => {
  try {
    const data = await lifecycleModule.getOffboardingList();
    return res.json(data);
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.get('/offboarding/:id/detail', async (req, res) => {
  try {
    const data = await lifecycleModule.getOffboardingDetail(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.get('/offboarding/:id', async (req, res) => {
  try {
    const data = await lifecycleModule.getOffboardingSimple(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.post('/offboarding', requireAdmin, async (req, res) => {
  try {
    const result = await lifecycleModule.createOffboarding(req.body, req.user?.id);
    return res.json({ success: !!result, offboarding: result });
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.put('/offboarding/:id', requireAdmin, async (req, res) => {
  try {
    if(req.body.settlement_status!=='Hold')return res.status(409).json({error:'Use the dedicated settlement release action after completing clearance and handover.'});
    await lifecycleModule.updateOffboardingStatus(req.params.id, req.body);
    return res.json({ success: true });
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

// Toggle individual clearance field
router.patch('/offboarding/:id/clearance', requireAdmin, async (req, res) => {
  try {
    await lifecycleModule.toggleClearanceField(req.params.id, req.body.field, req.body.value);
    return res.json({ success: true });
  } catch (e) {
    if (e.message === 'Invalid field') return res.status(400).json({ error: e.message });
    return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// Release final settlement
router.patch('/offboarding/:id/release', requireAdmin, async (req, res) => {
  try {
    await integrityRpc('hr_release_settlement',{p_actor:req.user.id,p_case:req.params.id});
    return res.json({ success: true });
  } catch (e) {
    if (e.message === 'Not found') return res.status(404).json({ error: e.message });
    if (e.message.includes('tasks before releasing') || e.message.includes('completed or waived')) {
      return res.status(400).json({ error: e.message });
    }
    return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// Toggle a task complete/pending
router.post('/offboarding/:id/task/:taskId/toggle', requireAdmin, async (req, res) => {
  try {
    await lifecycleModule.toggleOffboardingTask(req.params.id, req.params.taskId);
    return res.json({ success: true });
  } catch (e) {
    if (e.message === 'Task not found') return res.status(404).json({ error: e.message });
    return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// Save exit interview
router.post('/offboarding/:id/exit-interview', requireAdmin, async (req, res) => {
  try {
    await lifecycleModule.saveExitInterview(req.params.id, req.body);
    return res.json({ success: true });
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

// Portal: Exit Survey
router.get('/exit-survey', async (req, res) => {
  try {
    const data = await lifecycleModule.getExitSurvey(req.user.employee_id);
    return res.json(data);
  } catch (e) { return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message }); }
});

router.post('/exit-survey', async (req, res) => {
  try {
    await lifecycleModule.submitExitSurvey(req.user.employee_id, req.body);
    return res.json({ success: true, message: 'Exit Survey submitted successfully!' });
  } catch (e) {
    if (e.message === 'No employee profile' || e.message === 'No offboarding record found for you') {
      return res.status(400).json({ error: e.message });
    }
    return res.status(e.status || (e.code==='23514'?409:500)).json({ error: e.message });
  }
});

export default router;
