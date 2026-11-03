import express from 'express';
import {receiveHrFile} from '../lib/hrUploads.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { handoverModule } from '../modules/handover/index.js';

const router = express.Router();

router.use(verifyToken);

// GET /api/handover — admin list with filters
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status = 'all', trigger_type, employee_id, limit = '50', offset = '0' } = req.query;
    const result = await handoverModule.getHandoversList({ status, trigger_type, employee_id, limit, offset });
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/handover/portal/history/outgoing
router.get('/portal/history/outgoing', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.json({ handovers: [] });
    const handovers = await handoverModule.getOutgoingHistory(empId);
    return res.json({ handovers });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/handover/portal/history/incoming
router.get('/portal/history/incoming', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.json({ handovers: [] });
    const handovers = await handoverModule.getIncomingHistory(empId);
    return res.json({ handovers });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/handover/employee/:employeeId
router.get('/employee/:employeeId', requireAdmin, async (req, res) => {
  try {
    const data = await handoverModule.getEmployeeHandoverHistory(req.params.employeeId);
    if (!data.employee) return res.status(404).json({ error: 'Employee not found' });
    return res.json(data);
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/handover/portal/outgoing
router.get('/portal/outgoing', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.json({ handovers: [], handover: null, items: [], attachments: [] });
    const data = await handoverModule.getActiveOutgoing(empId);
    return res.json(data);
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/handover/portal/incoming
router.get('/portal/incoming', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.json({ handovers: [] });
    const result = await handoverModule.getActiveIncoming(empId);
    return res.json({ handovers: result });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/handover/offboarding/:offboardingId
router.get('/offboarding/:offboardingId', requireAdmin, async (req, res) => {
  try {
    const detail = await handoverModule.getHandoverForOffboarding(req.params.offboardingId, req);
    if (detail.error === 'Offboarding not found') return res.status(404).json({ error: detail.error });
    return res.json(detail);
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/handover/offboarding/:offboardingId/create
router.post('/offboarding/:offboardingId/create', requireAdmin, async (req, res) => {
  try {
    const detail = await handoverModule.backfillOffboardingHandover(req, req.params.offboardingId);
    if (detail.error) {
      if (detail.error === 'Offboarding not found') return res.status(404).json({ error: detail.error });
      return res.status(500).json({ error: detail.error });
    }
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/handover/leave/:leaveId
router.get('/leave/:leaveId', requireAdmin, async (req, res) => {
  try {
    const data = await handoverModule.getHandoverForLeave(req.params.leaveId, req);
    if (data.error === 'Leave request not found') return res.status(404).json({ error: data.error });
    return res.json(data);
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/handover/leave/:leaveId/coverage
router.post('/leave/:leaveId/coverage', requireAdmin, async (req, res) => {
  try {
    const { successor_employee_id } = req.body;
    const detail = await handoverModule.createLeaveCoverage(req, req.params.leaveId, successor_employee_id);
    if (detail.error === 'Leave request not found') return res.status(404).json({ error: detail.error });
    if (detail.error) return res.status(400).json({ error: detail.error });
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/handover/leave/:leaveId/return
router.post('/leave/:leaveId/return', requireAdmin, async (req, res) => {
  try {
    const detail = await handoverModule.createLeaveReturn(req, req.params.leaveId);
    if (detail.error === 'Leave request not found' || detail.error === 'Coverage handover not found') {
      return res.status(404).json({ error: detail.error });
    }
    if (detail.error) return res.status(400).json({ error: detail.error });
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// GET /api/handover/:id
router.get('/:id', async (req, res) => {
  try {
    const detail = await handoverModule.getHandoverDetailSecured(req, req.params.id);
    if (detail.error === 'Not found' || detail.error === 'Item not found') return res.status(404).json({ error: detail.error });
    if (detail.error === 'Access denied') return res.status(403).json({ error: detail.error });
    return res.json(detail);
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// PUT /api/handover/:id/successor
router.put('/:id/successor', requireAdmin, async (req, res) => {
  try {
    const detail = await handoverModule.assignSuccessor(req, req.params.id, req.body);
    if (detail.error === 'Not found' || detail.error === 'Item not found') return res.status(404).json({ error: detail.error });
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// PUT /api/handover/:id/items/:itemId
router.put('/:id/items/:itemId', async (req, res) => {
  try {
    const detail = await handoverModule.updateItem(req, req.params.id, req.params.itemId, req.body);
    if (detail.error === 'Not found' || detail.error === 'Item not found') return res.status(404).json({ error: detail.error });
    if (detail.error === 'Only outgoing employee or admin can edit items') return res.status(403).json({ error: detail.error });
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/handover/:id/items/:itemId/acknowledge
router.post('/:id/items/:itemId/acknowledge', async (req, res) => {
  try {
    const detail = await handoverModule.acknowledgeItem(req, req.params.id, req.params.itemId);
    if (detail.error === 'Not found' || detail.error === 'Item not found') return res.status(404).json({ error: detail.error });
    if (detail.error === 'Only successor can acknowledge') return res.status(403).json({ error: detail.error });
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/handover/:id/submit
router.post('/:id/submit', async (req, res) => {
  try {
    const detail = await handoverModule.submitHandover(req, req.params.id);
    if (detail.error === 'Not found' || detail.error === 'Item not found') return res.status(404).json({ error: detail.error });
    if (detail.error === 'Only outgoing employee can submit') return res.status(403).json({ error: detail.error });
    if (detail.error) return res.status(400).json({ error: detail.error });
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/handover/:id/approve
router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const detail = await handoverModule.approveHandover(req, req.params.id);
    if (detail.error === 'Not found' || detail.error === 'Item not found') return res.status(404).json({ error: detail.error });
    if (detail.error) return res.status(400).json({
      error: detail.error,
      ...(detail.successor_ack ? { successor_ack: detail.successor_ack } : {})
    });
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/handover/:id/waive
router.post('/:id/waive', requireAdmin, async (req, res) => {
  try {
    const detail = await handoverModule.waiveHandover(req, req.params.id, req.body.reason);
    if (detail.error === 'Waiver reason required') return res.status(400).json({ error: detail.error });
    if (detail.error === 'Not found' || detail.error === 'Item not found') return res.status(404).json({ error: detail.error });
    return res.json({ success: true, ...detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

// POST /api/handover/:id/upload
router.post('/:id/upload', receiveHrFile('file'), async (req, res) => {
  try {
    const detail = await handoverModule.uploadFile(req, req.params.id, req.file, req.body.handover_item_id);
    if (detail.error === 'Not found' || detail.error === 'Item not found') return res.status(404).json({ error: detail.error });
    if (detail.error === 'Access denied') return res.status(403).json({ error: detail.error });
    if (detail.error === 'No file uploaded') return res.status(400).json({ error: detail.error });
    if (detail.error === 'Failed to upload file to storage') return res.status(500).json({ error: detail.error });

    return res.json({ success: true, attachment: detail.attachment, ...detail.detail });
  } catch (e) {
    return res.status(e.status||(e.code==='23514'?409:500)).json({ error: e.message });
  }
});

export default router;
