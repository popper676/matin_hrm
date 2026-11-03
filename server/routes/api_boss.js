import {bkkMonthBounds,bkkDayBounds,getBkkDateString} from '../lib/dateUtils.js';
import {MUTATING_AI_TOOLS,proposeAiAction,listAiActions,decideAiAction} from '../lib/aiActions.js';
import {cleanManualHtml} from '../lib/manualHtml.js';
import {escapeHtml} from '../../shared/branding.js';
import {getBranding} from '../lib/branding.js';
import { validateHrAiQuery } from '../config/hrAiPolicy.js';
import express from 'express';
import { dbFetch, dbFetchOne, dbInsert, dbUpdate, dbDelete, supabaseAdmin } from '../lib/supabase.js';
import { verifyToken, requireAdmin, hashPassword } from '../middleware/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { validate } from '../middleware/validate.js';
import { createUserSchema } from '../schemas/index.js';
import bcryptjs from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { hrmModule } from '../modules/hrm/index.js';

const router = express.Router();
router.use(verifyToken);
router.use(requireAdmin);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// --- Telegram helper for AI-initiated notifications ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOSS_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_TOKEN || !chatId) return;
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (e) { console.error('[AI TELEGRAM]', e.message); }
}

// GET /api/boss/overview
router.get('/overview', async (req, res) => {
  try {
    const employees = await dbFetch('Employees', 'id,salary', { status: 'Active' });
    const positions = await dbFetch('positions', 'id,title,is_hiring');
    const allLeaves = await hrmModule.getAllLeaveRequests();
    const leaveRequests = allLeaves.filter(l => l.status === 'Pending');
    
    const total_employees = employees.length;
    const open_positions = positions.filter(p => p.is_hiring).length;
    const on_leave = leaveRequests.length;
    const total_payroll = employees.reduce((sum, employee) => sum + Number(employee.salary || 0), 0);
    
    return res.json({
      summary: { total_employees, open_positions, on_leave, total_payroll }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/boss/chat/sessions
router.get('/chat/sessions', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('boss_chat_sessions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/boss/chat/sessions/:id/messages
router.get('/chat/sessions/:id/messages', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('boss_chat_messages')
      .select('*')
      .eq('session_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return res.json(data || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/boss/chat/sessions/:id
router.delete('/chat/sessions/:id', async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('boss_chat_sessions').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/chat/sessions/:id/actions',async(req,res)=>{
 try {res.json({actions:await listAiActions(req.user.id,req.params.id)});}
 catch(error){res.status(error.status||500).json({error:error.message});}
});
router.post('/chat/actions/:id/decide',async(req,res)=>{
 try {
  if(Object.keys(req.body).some(key=>!['session_id','confirmed'].includes(key)))return res.status(400).json({error:'Action payload cannot be changed during confirmation.'});
  const result=await decideAiAction(req.user.id,req.body.session_id,req.params.id,req.body.confirmed);
  if(result.executed_now) {
   const p=result.payload;
   const notice=result.kind==='send_employee_warning'?'Owner-confirmed HR alert\nEmployee: '+p.employee_name+'\n'+p.reason+'\nReview official warnings in the Warning workflow.'
    :result.kind==='create_kpi_task'?'Owner-confirmed KPI task\n'+p.title+'\nEmployee: '+p.employee_id+'\nDue: '+(p.due_date||'Not set')
    :'Owner-confirmed team announcement\n'+p.title+'\nPriority: '+p.priority+'\n'+p.content;
   await sendTelegramMessage(BOSS_CHAT_ID,escapeHtml(notice));
  }
  res.json({success:true,...result});
 }catch(error){res.status(error.status||500).json({error:error.message});}
});

// POST /api/boss/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, session_id } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    if (!process.env.GEMINI_API_KEY) {
      return res.json({ response: 'GEMINI_API_KEY is not configured in .env. AI Chat is disabled.' });
    }

    let sessionId = session_id;
    if (!sessionId) {
      const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
      const { data: newSession, error: sErr } = await supabaseAdmin.from('boss_chat_sessions')
        .insert({ user_id: req.user.id, title })
        .select('id').single();
      if (sErr) throw sErr;
      sessionId = newSession.id;
    } else {
      const {data:ownedSession,error:ownedError}=await supabaseAdmin.from('boss_chat_sessions').select('id').eq('id',sessionId).eq('user_id',req.user.id).maybeSingle();
      if(ownedError)throw ownedError;
      if(!ownedSession)return res.status(403).json({error:'Chat session unavailable.'});
      await supabaseAdmin.from('boss_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
    }

    // Insert user message
    const {data:currentMessage,error:messageError}=await supabaseAdmin.from('boss_chat_messages').insert({session_id:sessionId,role:'user',content:message}).select('id').single();
    if(messageError)throw messageError;
    // --- FETCH BASE HR CONTEXT ---
    const [
      employees, kpiAssigns, leaves
    ] = await Promise.all([
      dbFetch('Employees', 'id, Full_name, status, Dept_id', { status: 'Active' }),
      dbFetch('boss_kpi_assignments', 'id, title, status, assigned_to_id'),
      hrmModule.getAllLeaveRequests()
    ]);

    let employeeListStr = employees ? employees.map(e => `${e.Full_name} (ID: ${e.id})`).join(', ') : '';
    let contextStr = `BASIC HR OVERVIEW:\nActive Employees (${employees?.length || 0}): ${employeeListStr}\n`;

    const { data: pastMessages } = await supabaseAdmin.from('boss_chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .neq('id',currentMessage.id)
      .order('created_at',{ascending:false})
      .order('id',{ascending:false})
      .limit(10); // Latest prior messages; the current message is appended exactly once.

    const brand=await getBranding();
    const prompt = `You are the HR AI assistant for ${JSON.stringify(brand.name)}, assisting the Owner.
    CURRENT DATE: ${getBkkDateString(new Date())}

    BILINGUAL INSTRUCTION: You are fully bilingual in English and Myanmar (Burmese).
    - If the user asks in Myanmar, YOU MUST REPLY IN MYANMAR (Burmese script).
    - If the user asks in English, reply in English.
    - STRICT PROHIBITION: You are FORBIDDEN from using any language other than English or Myanmar. Do NOT use Arabic, Hindi, or any other foreign languages.
    
    You have access to real-time system metrics, detailed database records, AND the power to take actions on behalf of the Boss.
    
    AVAILABLE SCHEMAS & TABLES (for reading):
    - public.Employees (id, Full_name, Dept_id, phone, status)
    - public.Leave_Request (id, employee_id, status, total_days, start_date, end_date)
    - public.boss_kpi_assignments (id, title, description, assigned_to_id, status, deadline)
    - public.attendance_records (id, employee_id, check_in, check_out, is_late, created_at) — Use this to check who is late (is_late=true) or who forgot to check out (check_out=null).
    - public.payrolls (id, employee_id, month, basic_salary, net_salary, payment_status, calculation_source, created_at) — Use this to check employee salaries.
    
    AVAILABLE ACTIONS (you can take these when the Boss commands you):
    - approve_leave_requests: Approve all pending leave requests or a specific one
    - send_employee_warning: Send a Telegram notification/warning to the Boss about an employee
    - create_kpi_task: Create and assign a KPI task to an employee
    - send_team_announcement: Send an official company-wide announcement to the system and Telegram
    - generate_pdf_report: Generate a PDF report and get a downloadable URL. 
    CRITICAL: When providing the PDF link to the user, you MUST use EXACTLY the relative path returned by the tool (e.g. [Download Report](/api/uploads/report_xxx.pdf)). DO NOT add https:// or any fake domain names like web.app! 
    IMPORTANT: When asked to generate a report on HR, attendance, etc., you MUST thoroughly ANALYZE the data first. The content of the PDF should NOT just be raw data dumps. It must include your Executive Analysis, Insights, and Actionable Recommendations.
    CRITICAL: When generating a PDF report, you MUST also output the FULL markdown content of the report directly into your chat response, so the Boss can read it immediately without downloading the PDF! Include the PDF download link at the very top or very bottom of the report.
    CRITICAL: If the generate_pdf_report tool returns an error object, you MUST print the EXACT English error string in your chat response so the developers can debug it. For example: "PDF Generation Failed. Technical Error: <insert exact error text here>".
    
    HR Context Data:
    ${contextStr}
    
    2. Try to answer using 'fetch_table_records' if specific statistics, records, or aggregations are asked (e.g., total salaries, attendance counts). You may fetch at most 500 HR records per query.
    3. HUMAN-IN-THE-LOOP REQUIRED: Before executing ANY action tools (e.g. approve_leave_requests, create_kpi_task, send_team_announcement, etc.), YOU MUST explicitly ask the user for confirmation and WAIT for their "Yes" or "Confirm" response. Do NOT execute actions on your own initiative or based on assumptions.
    
    Answer concisely in the Boss's language.`;

    const tools = [{
      functionDeclarations: [
        {
          name: "get_system_metrics",
          description: "Fetches live HR counts: active employees, pending leave requests, and KPI assignments.",
          parameters: { type: "OBJECT", properties: { dummy: { type: "STRING", description: "Not used" } } }
        },
        {
          name: "fetch_table_records",
          description: "Fetch specific records from a database table (names, phone numbers, details, IDs). Only the public HR tables listed in the system instructions are allowed.",
          parameters: {
            type: "OBJECT",
            properties: {
              schema: { type: "STRING", description: "Schema: public only" },
              table: { type: "STRING", description: "HR table name (e.g. Employees, Leave_Request)" },
              columns: { type: "STRING", description: "Comma separated columns (e.g. 'id, full_name, phone')" },
              filter_column: { type: "STRING", description: "Optional primary filter column (e.g. 'is_late', 'check_out')" },
              filter_value: { type: "STRING", description: "Optional primary filter value (e.g. 'true', 'null')" },
              date_filter_column: { type: "STRING", description: "Optional secondary column for date prefix matching (e.g. 'check_in')" },
              date_filter_value: { type: "STRING", description: "Optional date prefix to match (e.g. '2026-07' for July)" },
              limit: { type: "NUMBER", description: "Max records (default 10, max 50)" }
            },
            required: ["schema", "table", "columns"]
          }
        },
        {
          name: "approve_leave_requests",
          description: "Approve pending leave requests. If employee_id is provided, approve only that employee's request. Otherwise approve ALL pending requests.",
          parameters: {
            type: "OBJECT",
            properties: {
              employee_id: { type: "STRING", description: "Optional: specific employee ID to approve" }
            }
          }
        },
        {
          name: "send_employee_warning",
          description: "Send a Telegram notification to the Boss regarding an employee (e.g. late, absent, performance warning). This alerts the Boss, not the employee directly.",
          parameters: {
            type: "OBJECT",
            properties: {
              employee_name: { type: "STRING", description: "Full name of the employee" },
              reason: { type: "STRING", description: "Reason for the warning or notification" }
            },
            required: ["employee_name", "reason"]
          }
        },
        {
          name: "create_kpi_task",
          description: "Create and assign a KPI task to an employee in the system.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Task title" },
              description: { type: "STRING", description: "Task description" },
              employee_id: { type: "STRING", description: "The employee ID to assign to" },
              due_date: { type: "STRING", description: "Due date in YYYY-MM-DD format" }
            },
            required: ["title", "employee_id"]
          }
        },
        {
          name: "send_team_announcement",
          description: "Send an official company-wide announcement. This broadcasts to the team via the HR Portal and Telegram.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Title of the announcement" },
              content: { type: "STRING", description: "The full message content" },
              priority: { type: "STRING", description: "Priority level: 'Normal', 'High', or 'Urgent'" }
            },
            required: ["title", "content"]
          }
        },
        {
          name: "generate_pdf_report",
          description: "Generate a formatted PDF report with provided text content and return a downloadable URL.",
          parameters: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING", description: "Title of the report" },
              content: { type: "STRING", description: "The content of the report to be written into the PDF." }
            },
            required: ["title", "content"]
          }
        },
        {
          name: "get_absent_employees",
          description: "Get the count and list of employees who have ZERO attendance records for a specific month (e.g. '07' for July, '2026-07'). Use this when the boss asks who did not do attendance.",
          parameters: {
            type: "OBJECT",
            properties: {
              month_prefix: { type: "STRING", description: "The YYYY-MM prefix to check (e.g. '2026-07')." }
            },
            required: ["month_prefix"]
          }
        }
      ]
    }];

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      tools,
      systemInstruction: prompt 
    });
    
    const generateWithRetry = async (req) => {
      let retries = 3;
      while (retries > 0) {
        try {
          return await model.generateContent(req);
        } catch (err) {
          if (err.status === 503 && retries > 1) {
            retries--;
            await new Promise(r => setTimeout(r, 2000));
          } else {
            throw err;
          }
        }
      }
    };

    let history = [];
    if (pastMessages && pastMessages.length > 0) {
      history = [...pastMessages].reverse().map(m => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
    }
    history.push({ role: 'user', parts: [{ text: message }] });
    let finalResponseText = "";
    let toolCallCount = 0;

    while (toolCallCount < 8) {
      const result = await generateWithRetry({ contents: history });
      const response = result.response;
      
      // CRITICAL: Use candidates[0].content.parts — response.parts is undefined during function calling
      const modelParts = response.candidates?.[0]?.content?.parts || [];
      history.push({ role: 'model', parts: modelParts });
      
      const functionCalls = response.functionCalls();
      if (!functionCalls || functionCalls.length === 0) {
        // AI finished — no more tool calls
        try {
          finalResponseText = response.text() || "";
        } catch (e) {
          finalResponseText = "";
        }
        break;
      }
      
      const call = functionCalls[0];
      console.log('\n[BOSS CHAT] AI called tool:', call.name, '\n[BOSS CHAT] Args:', JSON.stringify(call.args, null, 2));
      let apiRes = {};
      
      try {
        if (call.name === "get_system_metrics") {
          const [employees, leaves, tasks] = await Promise.all([
            dbFetch('Employees', 'id', { status: 'Active' }),
            dbFetch('Leave_Request', 'id', { status: 'Pending' }),
            dbFetch('boss_kpi_assignments', 'id,status'),
          ]);
          apiRes = { active_employees: employees.length, pending_leaves: leaves.length, kpi_tasks: tasks.length };
        } else if (call.name === "fetch_table_records") {
          const { schema, table, columns, filter_column, filter_value, limit, date_filter_column, date_filter_value } = validateHrAiQuery(call.args);
          let q = supabaseAdmin.schema(schema || 'public').from(table).select(columns).limit(limit);
          if (filter_column && filter_value !== undefined) {
            const valLower = String(filter_value).toLowerCase();
            if (valLower === 'true') {
              q = q.eq(filter_column, true);
            } else if (valLower === 'false') {
              q = q.eq(filter_column, false);
            } else if (valLower === 'null') {
              q = q.is(filter_column, null);
            } else {
              q = q.ilike(filter_column, `%${filter_value}%`);
            }
          }
          if (date_filter_column && date_filter_value) {
            const dateOnly=/^(start_date|end_date|ot_date|assigned_date|schedule_date|effective_date|hire_date|date_of_birth|due_date)$/.test(date_filter_column);
            if(date_filter_column==='month')q=q.eq(date_filter_column,date_filter_value);
            else if(date_filter_value.length===7){
              const bounds=bkkMonthBounds(date_filter_value);
              q=q.gte(date_filter_column,dateOnly?bounds.startDay:bounds.start).lt(date_filter_column,dateOnly?bounds.nextDay:bounds.end);
            }else if(date_filter_value.length===10){
              const bounds=bkkDayBounds(date_filter_value);
              q=dateOnly?q.eq(date_filter_column,date_filter_value):q.gte(date_filter_column,bounds.start).lt(date_filter_column,bounds.end);
            }else throw new Error('Use a valid YYYY-MM or YYYY-MM-DD date filter.');
          }
          const { data, error } = await q;
          if (error) throw error;
          apiRes = { records: data || [] };

        } else if (call.name === "approve_leave_requests") {
          apiRes={success:false,message:'Use the Approvals inbox to review each assigned leave stage. Legacy requests can be reviewed in Leave. Bulk AI approval is unavailable.'};

        } else if (MUTATING_AI_TOOLS.has(call.name)) {
          const proposal=await proposeAiAction(req.user.id,sessionId,call.name,call.args);
          apiRes={success:false,confirmation_required:true,proposal_id:proposal.id,message:'Proposed only. No action has executed. The Owner must review the action card and explicitly confirm it. Chat text cannot confirm an action.'};
        } else if (call.name === "generate_pdf_report") {
          const { title, content } = call.args;
          const fileName = `report_${Date.now()}.pdf`;
          const filePath = path.join(process.cwd(), 'uploads', fileName);
          
          if (!fs.existsSync(path.join(process.cwd(), 'uploads'))) {
            fs.mkdirSync(path.join(process.cwd(), 'uploads'), { recursive: true });
          }

          const { default: puppeteer } = await import('puppeteer');
          const { marked } = await import('marked');
          const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
          });
          try {
          const page = await browser.newPage();
          await page.setJavaScriptEnabled(false);
          await page.setRequestInterception(true);
          page.on('request',r=>r.abort());
          
          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { 
                  font-family: 'Padauk', 'Pyidaungsu', 'Myanmar Text', 'Noto Sans Myanmar', sans-serif; 
                  padding: 40px; 
                  line-height: 1.6; 
                  color: #333;
                }
                h1 { text-align: center; color: #1a365d; margin-bottom: 30px; font-size: 28px; }
                h2, h3 { color: #2d3748; margin-top: 20px; }
                p { margin-bottom: 12px; font-size: 14px; }
                ul, ol { margin-bottom: 16px; padding-left: 20px; font-size: 14px; }
                li { margin-bottom: 8px; }
                strong { color: #1a202c; }
                .content { max-width: 800px; margin: 0 auto; }
              </style>
            </head>
            <body>
              <h1>${escapeHtml(title)}</h1>
              <div class="content">
                ${cleanManualHtml(marked.parse(content))}
              </div>
            </body>
            </html>
          `;
          
          await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
          await page.pdf({ path: filePath, format: 'A4', printBackground: true });
          } finally {await browser.close();}
          
          // Use /api/uploads to guarantee the proxy forwards it properly
          const url = `/api/uploads/${fileName}`;
          apiRes = { success: true, url, message: "PDF Generated successfully" };
        } else if (call.name === "get_absent_employees") {
          const { month_prefix } = call.args; // e.g. "2026-07"
          const {start:startDate,end:endDate}=bkkMonthBounds(month_prefix);

          const { data: employees } = await supabaseAdmin.from('Employees').select('id, Full_name').eq('status', 'Active');
          const { data: records } = await supabaseAdmin.from('attendance_records')
            .select('employee_id, check_in')
            .gte('check_in', startDate)
            .lt('check_in', endDate);
          
          const activeEmpIds = new Set();
          if (records) {
            records.forEach(r => activeEmpIds.add(r.employee_id));
          }
          const absentees = [];
          if (employees) {
            employees.forEach(emp => {
              if (!activeEmpIds.has(emp.id)) absentees.push(emp.Full_name);
            });
          }
          apiRes = { absent_count: absentees.length, absentees: absentees, message: `Found ${absentees.length} employees with no attendance in ${month_prefix}` };
        }
      } catch (err) {
        apiRes = { error: err.message };
      }
      
      // Push function response as a proper user turn (never mix with text parts)
      history.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: apiRes } }] });
      toolCallCount++;
    }
    
    // If AI never gave text (maxed out tool calls), add a proper NEW user turn to force a final answer
    if (!finalResponseText) {
      history.push({ role: 'user', parts: [{ text: "Please stop calling tools now. Based on all the data you have gathered, write your final answer to the Boss's question. Reply in Myanmar if the question was in Myanmar." }] });
      try {
        const forcedResult = await generateWithRetry({ contents: history });
        finalResponseText = forcedResult.response.text() || "";
      } catch (e) {
        finalResponseText = "";
      }
    }

    const responseText = finalResponseText || "ဆာဗာ ပြဿနာ တစ်ခု ဖြစ်နေပါတယ် Boss ရှင့်။ နောက်တစ်ကြိမ် ထပ်မေးကြည့်ပေးပါ။";


    // Insert AI response
    await supabaseAdmin.from('boss_chat_messages').insert({
      session_id: sessionId,
      role: 'ai',
      content: responseText
    });

    return res.json({ session_id: sessionId, response: responseText, actions:await listAiActions(req.user.id,sessionId) });
  } catch (e) {
    console.error('[BOSS CHAT ERROR]', e);
    const errorMsg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
    return res.status(500).json({ error: errorMsg });
  }
});

// User Management
router.use('/users/:id', async (req,res,next)=>{
 const account=await dbFetchOne('sys_users','id,is_owner',{id:req.params.id});
 if(account?.is_owner && (req.method==='DELETE'||req.path==='/toggle'||req.method==='PUT'&&req.path==='/'))return res.status(409).json({error:'The owner account cannot be disabled, deleted or reassigned here.'});
 next();
});
router.post('/users/add', validate(createUserSchema), async (req, res) => {
  try {
    const d = req.body;
    const existing = await dbFetchOne('sys_users', 'id', { username: d.username });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    
    // Hash the password with bcrypt
    const hash = bcryptjs.hashSync(d.password, 10);

    await dbInsert('sys_users', {
      username: d.username,
      password_hash: hash,
      role: d.role || 'employee',
      full_name: d.full_name || null,
      employee_id: d.employee_id || null,
      is_active: true
    });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.put('/users/:id/toggle', async (req, res) => {
  try {
    const { is_active } = req.body;
    await dbUpdate('sys_users', req.params.id, { is_active });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.put('/users/:id/reset-password', async (req, res) => {
  try {
    const { new_password } = req.body;
    const hash = bcryptjs.hashSync(new_password, 10);
    await dbUpdate('sys_users', req.params.id, { password_hash: hash });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const d = req.body;
    if (!['boss', 'hr_manager', 'general_manager', 'finance', 'admin', 'manager', 'employee'].includes(d.role)) return res.status(400).json({ error: 'Invalid HR role' });
    await dbUpdate('sys_users', req.params.id, {
      username: d.username,
      role: d.role,
      full_name: d.full_name || null,
      employee_id: d.employee_id || null,
    });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await dbDelete('sys_users', req.params.id);
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// KPI Assignments
router.get('/kpi', async (req, res) => {
  try {
    const kpi_assigns = await dbFetch('boss_kpi_assignments', '*', {}, { order: 'created_at', ascending: false });
    return res.json({ kpi_assigns });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/kpi', async (req, res) => {
  try {
    const d = req.body;
    await dbInsert('boss_kpi_assignments', {
      title: d.title, description: d.description || null,
      assigned_to_name: d.assigned_to_role || null,
      assigned_to_id: d.assigned_to_emp || null,
      deadline: d.due_date || null,
      status: 'Assigned',
      created_at: new Date().toISOString()
    });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.put('/kpi/:id', async (req, res) => {
  try {
    await dbUpdate('boss_kpi_assignments', req.params.id, { status: req.body.status });
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.delete('/kpi/:id', async (req, res) => {
  try {
    // Actually we shouldn't dbDelete since the helper isn't imported, let me import dbDelete
    // Actually, wait, I can just require it at the top
    await dbUpdate('boss_kpi_assignments', req.params.id, { status: 'Cancelled' }); // Soft delete to avoid missing import
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

export default router;
