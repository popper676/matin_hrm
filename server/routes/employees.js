import {randomBytes, randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {validateAvatarImage} from '../lib/avatarUpload.js';
import {scoped} from '../lib/operationsAccess.js';
import {UUID} from '../../shared/accessPolicy.js';
import {employeeSalary} from '../lib/employeeSalary.js';
import {integrityRpc} from '../lib/integrityRpc.js';
import {bkkDayBounds,getBkkDateString} from '../lib/dateUtils.js';
import {requestIsManager} from '../lib/accessControl.js';
import { hrFileUrl } from '../lib/hrStorage.js';
import express from 'express';
import { dbFetch, dbFetchOne, dbInsert, dbUpdate, dbDelete } from '../lib/supabase.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createEmployeeSchema } from '../schemas/index.js';
import { supabase } from '../lib/supabase.js';
import multer from 'multer';
import { hrmModule } from '../modules/hrm/index.js';
import { payrollModule } from '../modules/payroll/index.js';
import { identityModule } from '../modules/identity/index.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

const router = express.Router();
router.use(verifyToken);

async function enrichEmployees(employees) {
  const [depts, positions] = await Promise.all([
    dbFetch('Departments', 'id,Department_name'),
    dbFetch('positions', 'id,title'),
  ]);
  const deptMap = Object.fromEntries(depts.map(d => [d.id, d.Department_name]));
  const posMap = Object.fromEntries(positions.map(p => [p.id, p.title]));
  return employees.map(e => ({
    ...e,
    dept_name: deptMap[e.Dept_id] || '—',
    pos_title: posMap[e.position_id] || '—',
  }));
}

// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50; // Use high limit by default for legacy UI compat, but can be scaled
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let q = supabase
      .from('Employees')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .eq('employment_status', 'Active')
      .order('created_at', { ascending: false })
      .range(from, to);

    let { data: employees, count, error } = await q;

    // Fallback if the employment_status column doesn't exist yet (migration not run)
    if (error && error.code === '42703' && error.message.includes('employment_status')) {
      const fallbackQuery = supabase
        .from('Employees')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to);
      const res = await fallbackQuery;
      employees = res.data;
      count = res.count;
      error = res.error;

      // Inject dummy fields so the UI doesn't crash
      if (employees) {
        employees = employees.map(e => ({
          ...e,
          employment_status: e.employment_status || 'Active'
        }));
      }
    }

    if (error) throw error;

    const enriched = await enrichEmployees(employees || []);
    return res.json({ employees: enriched, total: count, page, limit });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/employees/recycle-bin
router.get('/recycle-bin', requireAdmin, async (req, res) => {
  try {
    let q = supabase
      .from('Employees')
      .select('*', { count: 'exact' })
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    const { data: employees, count, error } = await q;
    if (error) throw error;

    const enriched = await enrichEmployees(employees || []);
    return res.json({ employees: enriched, total: count });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/employees/former
router.get('/former', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let q = supabase
      .from('Employees')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .eq('employment_status', 'Resigned')
      .order('resign_date', { ascending: false })
      .range(from, to);

    let { data: employees, count, error } = await q;

    // Fallback if the employment_status column doesn't exist yet
    if (error && error.code === '42703' && error.message.includes('employment_status')) {
      employees = [];
      count = 0;
      error = null;
    }

    if (error) throw error;

    const enriched = await enrichEmployees(employees || []);
    return res.json({ employees: enriched, total: count, page, limit });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/employees/form-data
router.get('/form-data', async (req, res) => {
  try {
    const [depts, positions, posWithLevel, allActive, hired] = await Promise.all([
      dbFetch('Departments', 'id,Department_name'),
      dbFetch('positions', 'id,title'),
      dbFetch('positions', 'id,level'),
      dbFetch('Employees', 'id,Full_name,employee_id,position_id', { status: 'Active' }),
      dbFetch('recruitment_candidates', '*', { status: 'Hired' }),
    ]);
    const managerLevels = new Set(posWithLevel.filter(p => ['Manager', 'Executive', 'Senior'].includes(p.level)).map(p => p.id));
    const managers = allActive.filter(e =>
      managerLevels.has(e.position_id) ||
      /manager|boss|ceo|head|lead|director/i.test(e.Full_name || '') ||
      /manager|boss|ceo|head|lead|director/i.test(e.employee_id || '')
    );
    return res.json({ departments: depts, positions, managers, candidates: hired });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const profile = await hrmModule.getEmployeeProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Employee not found' });
    return res.json(profile);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/employees/:id/timeline
router.get('/:id/timeline', async (req, res) => {
  try {
    let items = [];
    try {
      items = await dbFetch('employee_career_timeline', '*', { employee_id: req.params.id }, { order: 'effective_date', ascending: false });
    } catch (e) {
      items = [];
    }
    return res.json({ timeline: items });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/employees
router.post('/:id/timeline',requireAdmin,async(req,res)=>{
 try{
  const employee=await dbFetchOne('Employees','id',{id:req.params.id});
  if(!employee)return res.status(404).json({error:'Employee not found'});
  const d=req.body,types=['PROMOTION','SALARY_RAISE','DEPARTMENT_TRANSFER','COMMENDATION','OTHER'];
  if(!types.includes(d.event_type)||typeof d.title!=='string'||!d.title.trim()||d.title.length>200)
   return res.status(400).json({error:'Choose a supported milestone and a title up to 200 characters. Use Warning Letters for disciplinary records.'});
  const effective_date=d.effective_date||getBkkDateString(new Date());bkkDayBounds(effective_date);
  const row={employee_id:employee.id,event_type:d.event_type,title:d.title.trim(),effective_date};
  for(const key of ['description','previous_position','new_position']){
   if(d[key]!=null&&typeof d[key]!=='string')return res.status(400).json({error:'Milestone text must be text.'});
   if(String(d[key]||'').length>(key==='description'?4000:200))return res.status(400).json({error:'Milestone text is too long.'});
   row[key]=d[key]?.trim()||null;
  }
  const salaryFields=['previous_salary','new_salary'];
  const includesSalary=d.event_type==='SALARY_RAISE'||salaryFields.some(k=>d[k]!==undefined&&d[k]!==null&&d[k]!=='');
  if(includesSalary&&!req.user.is_owner&&!req.user.access.sensitive.salary)return res.status(403).json({error:'Salary access is required.'});
  for(const key of salaryFields)if(d[key]!==undefined&&d[key]!==null&&d[key]!==''){
   const value=Number(d[key]);if(!Number.isFinite(value)||value<0)return res.status(400).json({error:'Salary must be non-negative.'});row[key]=value;
  }
  const event=await dbInsert('employee_career_timeline',row);
  await dbInsert('sys_audit_logs',{user_id:req.user.id,action:'CREATE',module:'Employee timeline',details:'Recorded milestone for employee '+employee.id});
  res.json({success:true,event});
 }catch(error){res.status(error.status||500).json({error:error.message});}
});

// POST /api/employees
router.post('/', requireAdmin, validate(createEmployeeSchema), async (req, res) => {
  try {
    const { result, credentials } = await hrmModule.createEmployee(req.body, req.user);
    return res.json({ success: true, employee: result, credentials, message: `Employee added! Login: ${credentials.username} / ${credentials.defaultPassword}` });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// PUT /api/employees/:id
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    await hrmModule.updateEmployee(req.params.id, req.body, req.user);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/employees/bulk-import (Bulk Upload/Update Employee Numbers & Base Salaries via JSON or Excel/CSV)
router.post('/bulk-import', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    let rows = [];
    if (req.file) {
      const wb = (await import('xlsx')).default.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = (await import('xlsx')).default.utils.sheet_to_json(sheet);
    } else if (Array.isArray(req.body.employees)) {
      rows = req.body.employees;
    } else {
      return res.status(400).json({ error: 'No Excel file or employee payload provided.' });
    }

    if (!rows.length) return res.status(400).json({ error: 'Payload or Excel sheet is empty.' });

    let updatedCount = 0;
    let createdCount = 0;
    const errors = [];
    const credentials=[];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const empId = String(row.employee_id || row['Employee ID'] || row['EmployeeID'] || row.id || '').trim();
      const name = String(row.Full_name || row['Full Name'] || row.name || row['Name'] || '').trim();
      const salaryVal = row.salary !== undefined ? row.salary : (row['Salary'] !== undefined ? row['Salary'] : row['Base Salary']);
      let parsedSalary;
      const email = row.email || row['Email'] || null;
      const phone = row.phone || row['Phone'] || null;
      const dbId = row.db_id || row.id;

      if (!empId && !name && !dbId) continue;

      try {
        parsedSalary=employeeSalary(salaryVal);
        let existing = null;
        if (dbId) existing = await dbFetchOne('Employees', '*', { id: dbId });
        if (!existing && empId) existing = await dbFetchOne('Employees', '*', { employee_id: empId });

        if (existing) {
          await integrityRpc('hr_update_import_employee',{p_actor:req.user.id,p_id:existing.id,p_code:empId||existing.employee_id,p_name:name||existing.Full_name,p_salary:parsedSalary,p_email:email,p_phone:phone});
          updatedCount++;
        } else {
          // CREATE
          if (!name || !empId) {
            errors.push(`Row ${i + 1}: Name and Employee ID are required for new records.`);
            continue;
          }
          const temporaryPassword=randomBytes(18).toString('base64url');
          const hash='MUST_CHANGE:'+await bcrypt.hash(temporaryPassword,12);
          const imported=await integrityRpc('hr_import_employee',{p_actor:req.user.id,p_code:empId,p_name:name,p_salary:parsedSalary,p_email:email,p_phone:phone,p_password_hash:hash});
          credentials.push({employee_id:imported.employee.id,username:imported.username,temporary_password:temporaryPassword});
          createdCount++;

        }
      } catch (err) {
        errors.push(`Row ${i + 1} error: ${err.message}`);
      }
    }

    res.set('Cache-Control','no-store');
    return res.json({
      success: true,
      message: `Bulk update completed! Updated: ${updatedCount}, Created: ${createdCount}`,
      updatedCount,
      createdCount,
      credentials,
      errors
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/employees/:id/avatar
router.post('/:id/avatar', upload.single('avatar'), async (req, res) => {
  let uploadedPath = null;
  try {
    const eid = req.params.id;
    if (!UUID.test(eid)) return res.status(400).json({ error: 'Invalid employee reference' });
    const self = req.user.employee_id === eid;
    if (!self && !scoped(req.user, 'employees', eid, 'edit')) {
      return res.status(403).json({ error: 'Not authorized to update this avatar' });
    }
    const employee = await dbFetchOne('Employees', 'id', { id: eid });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const {mime, extension} = validateAvatarImage(req.file);
    const fileName = `avatar_${eid}_${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, req.file.buffer, {
      contentType: mime,
      upsert: false,
    });
    if (uploadError) throw new Error('Unable to save employee avatar');
    uploadedPath = fileName;
    const avatar_url = hrFileUrl('avatars', fileName);
    await dbUpdate('Employees', eid, { avatar_url, updated_at: new Date().toISOString() });
    uploadedPath = null;
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id, action: 'UPDATE', module: 'Employees',
      details: `Updated avatar for employee ID ${eid}`, ip_address: req.ip || '0.0.0.0'
    }).catch(error => console.error('[AVATAR AUDIT]', error));
    return res.json({ success: true, avatar_url });
  } catch (e) {
    if (uploadedPath) await supabase.storage.from('avatars').remove([uploadedPath]).catch(() => {});
    console.error('[AVATAR UPLOAD]', e);
    return res.status(e.status || 500).json({ error: e.status === 400 ? e.message : 'Unable to update employee avatar' });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const owner = await dbFetchOne('sys_users','id',{employee_id:req.params.id,is_owner:true});
  if(owner)return res.status(409).json({error:'The owner’s employee record cannot be removed.'});
  try {
    // Deactivate sys_user via Identity Module
    await identityModule.deactivateAccountForEmployee(req.params.id);

    // Soft delete employee
    await dbUpdate('Employees', req.params.id, { status: 'Inactive', deleted_at: new Date().toISOString() });

    // Audit log
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.username,
      action: 'DELETE',
      module: 'Employees',
      details: `Soft-deleted employee ID ${req.params.id}`,
      created_at: new Date().toISOString()
    }).catch(console.error);

    return res.json({ success: true, message: 'Employee soft-deleted' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// PUT /api/employees/:id/restore
router.put('/:id/restore', requireAdmin, async (req, res) => {
  try {
    await dbUpdate('Employees', req.params.id, { status: 'Active', deleted_at: null });

    // Reactivate sys_user via Identity Module
    await identityModule.reactivateAccountForEmployee(req.params.id);

    // Audit log
    await dbInsert('sys_audit_logs', {
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.username,
      action: 'UPDATE',
      module: 'Employees',
      details: `Restored employee ID ${req.params.id} from Recycle Bin`,
      created_at: new Date().toISOString()
    }).catch(console.error);

    return res.json({ success: true, message: 'Employee restored' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/employees/:id/hard (Permanent Delete)
router.delete('/:id/hard', requireAdmin, async (req,res)=>{
 try {await integrityRpc('hr_delete_pristine_employee',{p_actor:req.user.id,p_employee:req.params.id});res.json({success:true,message:'Unused employee permanently deleted.'});}
 catch(error){res.status(error.status||500).json({error:error.message});}
});

export default router;
