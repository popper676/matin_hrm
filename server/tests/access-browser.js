import {installCompletionFixtures,exerciseCompletionBrowser} from './completion-browser.js';
import {installAuditFixtures,exerciseAuditBrowser} from './audit-browser.js';
import {installSalaryFixtures,exerciseSalaryBrowser} from './salary-browser.js';
import {buildOwnerSetup} from '../lib/ownerSetup.js';
import {setupFixture,logoPng} from './brandingFixtures.js';
import {DEFAULT_BRANDING,cleanBranding} from '../../shared/branding.js';
// Real browser tests with synthetic API fixtures. No production service or data is contacted.
import {todayBangkok,addDays,previousMonth,OPERATIONS_DEFAULTS} from '../../shared/operations.js';
import {employee360} from '../lib/employee360.js';
import {monthlyReview} from '../lib/monthlyReview.js';
import {buildOperationsTasks} from '../lib/operationsTasks.js';
import assert from "node:assert/strict";
import express from "express";
import multer from "multer";
import path from "node:path";
import { mkdir,writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import {
  emptyPolicy,
  MODULES,
  PERSONAL_APPS,
  WORKFLOWS,
} from "../../shared/accessPolicy.js";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const owner = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "demo-owner",
  full_name: "Demo Owner",
  is_owner: true,
  is_active: true,
  role: "boss",
  access: emptyPolicy(),
  access_version: 0,
};
const employee = {
  id: "00000000-0000-4000-8000-000000000002",
  username: "demo-reviewer",
  full_name: "Demo Reviewer",
  is_owner: false,
  is_active: true,
  role: "employee",
  employee_id: "00000000-0000-4000-8000-000000000003",
  access: emptyPolicy(),
  access_version: 0,
};
let current = owner,
  saves = 0,
  workflowSaves = 0;
const data = {
  users: [owner, employee],
  employees: [
    {
      id: employee.employee_id,
      employee_id: "DEMO-001",
      Full_name: "Demo Reviewer",
    },
  ],
  policies: [],
  settings: [],
  modules: MODULES,
  personal_apps: PERSONAL_APPS,
  workflows: WORKFLOWS,
  default_policy: emptyPolicy(),
};
const app = express();
app.use(express.json());
const completionFixture=installCompletionFixtures(app,{getCurrent:()=>current,data,owner,employee});
const auditFixture=installAuditFixtures(app,{employee});
const salaryFixture=installSalaryFixtures(app,{getCurrent:()=>current,employee});
app.get("/api/demo/status", (req,res)=>res.json({active:true,day:todayBangkok()}));
app.get("/api/auth/me", (req, res) => res.json({ user: current }));
app.get("/api/access", (req, res) => res.json({...data,expense_routing:completionFixture.setting}));
app.get("/api/notifications", (req, res) =>
  res.json({ notifications: [], unread_count: 0 }),
);
let infoRecord = null;
const infoSeed = {
  full_name: "Demo Reviewer",
  phone: "",
  email: "demo@example.test",
  address: "",
  family: [],
  languages: [],
};
const infoEmployment = {
  employee_number: "DEMO-001",
  department: "Operations",
  position: "Team member",
  hire_date: "2026-01-01",
  employment_type: "Full-Time",
  probation_period: "3 months",
  work_location: "Bangkok",
};
let approvalRequests = [],
  leaveRecords = [];
const leaveTypeId = "00000000-0000-4000-8000-000000000030";
const leaveQuote = (body) => ({
  working_days: body.session === "FULL" ? 1 : 0.5,
  days: [
    {
      date: body.start_date,
      working: true,
      session: body.session,
      units: body.session === "FULL" ? 1 : 0.5,
    },
  ],
  balances: [
    {
      type_id: leaveTypeId,
      type_name: "Annual leave",
      year: Number(body.start_date.slice(0, 4)),
      before: 12,
      requested: body.session === "FULL" ? 1 : 0.5,
      after: body.session === "FULL" ? 11 : 11.5,
    },
  ],
  medical_required: false,
  issues: [],
  start_at: body.start_date + "T02:00:00Z",
  fingerprint: "c".repeat(32),
});
app.get("/api/leave/form/meta", (req, res) =>
  res.json({
    employee: {
      id: employee.employee_id,
      name: "Demo Reviewer",
      employee_number: "DEMO-001",
      phone: "0900000000",
      email: "demo@example.test",
      position: "Team member",
      manager: "Demo Owner",
    },
    types: [
      {
        id: leaveTypeId,
        type_name: "Annual leave",
        kind: "annual",
        is_paid: true,
      },
    ],
    workflow_enabled: true,
  }),
);
app.post("/api/leave/form/quote", (req, res) =>
  res.json({ quote: leaveQuote(req.body) }),
);
app.post("/api/leave/form/submit", multer().none(), (req, res) => {
  const i = req.body,
    q = leaveQuote(i),
    r = {
      id: i.submission_key,
      requester_id: employee.id,
      employee_id: employee.employee_id,
      form_version: 2,
      leave_type_id: leaveTypeId,
      status: "Pending",
      start_date: i.start_date,
      end_date: i.end_date,
      session: i.session,
      working_days: q.working_days,
      calendar_snapshot: q.days,
      reason: i.reason,
      conditions: "",
      created_at: new Date().toISOString(),
      form_snapshot: {
        employee: {
          name: "Demo Reviewer",
          employee_number: "DEMO-001",
          business_unit: i.business_unit,
          phone: i.contact_phone,
          email: i.contact_email,
        },
        input: i,
        balances: q.balances,
        type_name: "Annual leave",
        declared_at: new Date().toISOString(),
      },
    };
  leaveRecords.push(r);
  approvalRequests = [
    {
      id: "00000000-0000-4000-8000-000000000031",
      workflow_key: "leave",
      resource_id: r.id,
      requester_id: employee.id,
      employee_id: employee.employee_id,
      title: "Demo Reviewer: half-day leave",
      snapshot: { leave_form_id: r.id },
      stages: [
        {
          key: "manager",
          label: "Manager",
          action: "approve",
          assignee_id: owner.id,
          assignee_name: "Demo Owner",
        },
        {
          key: "hr",
          label: "HR",
          action: "approve",
          assignee_id: owner.id,
          assignee_name: "Demo Owner",
        },
      ],
      current_stage: 0,
      status: "pending",
      history: [],
      can_act: true,
      version: 1,
      created_at: r.created_at,
    },
  ];
  res.json({ request: r });
});
app.get("/api/leave/form/:id", (req, res) =>
  res.json({
    request: leaveRecords.find((r) => r.id === req.params.id),
    approval: approvalRequests.find((r) => r.resource_id === req.params.id),
    can_ack: false,
  }),
);
app.get("/api/leave/calendar", (req, res) =>
  res.json({
    calendar: {
      id: true,
      settings: {
        weekly_holidays: [0],
        default_start: "09:00",
        default_end: "18:00",
      },
      version: 1,
    },
    dates: [],
  }),
);
let expenseRecords = [];
app.get("/api/rewards", (req, res) =>
  res.json({ rewards: expenseRecords, employees: [] }),
);
app.get("/api/expense-forms/meta", (req, res) =>
  res.json({
    employee: {
      name: "Demo Reviewer",
      employee_number: "DEMO-001",
      department: "Operations",
    },
    workflow_enabled: true,
    routing:completionFixture.setting,
  }),
);
app.post(
  "/api/expense-forms/submit",
  multer().array("attachments", 5),
  (req, res) => {
    const i = {
      ...req.body,
      requested_amount: Number(req.body.requested_amount),
    };
    delete i.submission_key;
    const r = {
      id: req.body.submission_key,
      employee_id: employee.employee_id,
      requester_id: employee.id,
      form_version: 2,
      claim_type: "Expense Claim",
      request_number: "UYF_2030_001",
      description: i.description,
      requested_amount: i.requested_amount,
      approved_amount: null,
      currency: i.currency,
      status: "PENDING",
      created_at: new Date().toISOString(),
      form_snapshot: {
        input: i,
        employee: {
          name: "Demo Reviewer",
          employee_number: "DEMO-001",
          department: "Operations",
        },
        request_date: "2030-05-01",
        documents: [],
      },
    };
    expenseRecords = [r];
    approvalRequests = [
      {
        id: "00000000-0000-4000-8000-000000000041",
        workflow_key: "expense",
        resource_id: r.id,
        requester_id: employee.id,
        employee_id: employee.employee_id,
        title: r.request_number + ": " + r.description,
        snapshot: {
          expense_form_id: r.id,
          request_number: r.request_number,
          requested_amount: r.requested_amount,
          currency: r.currency,
        },
        stages: ["department", "agm", "coo", "finance"].map((key, j) => ({
          key,
          label: [
            "Department approval",
            "AGM review",
            "COO approval",
            "Finance payment",
          ][j],
          action: j === 3 ? "pay" : "approve",
          assignee_id: owner.id,
          assignee_name: "Demo Owner",
        })),
        current_stage: 0,
        status: "pending",
        version: 1,
        can_act: true,
        history: [],
        created_at: new Date().toISOString(),
      },
    ];
    res.json({ reward: r });
  },
);
app.get("/api/expense-forms/:id", (req, res) =>
  res.json({
    request: expenseRecords.find((r) => r.id === req.params.id),
    approval: approvalRequests.find((a) => a.resource_id === req.params.id),
  }),
);
app.post("/api/approvals/:id/decision", (req, res) => {
  const a = approvalRequests.find((a) => a.id === req.params.id);
  if (a.workflow_key === "expense") {
    const r = expenseRecords.find((r) => r.id === a.resource_id);
    a.history.push({
      stage: a.stages[a.current_stage].key,
      actor_name: "Demo Owner",
      decision: req.body.decision,
      comment: req.body.comment,
      conditions: req.body.conditions,
      approved_amount:
        req.body.decision === "pay" ? null : Number(req.body.approved_amount),
      currency: r.currency,
      payment: req.body.decision === "pay" ? req.body.payment : null,
      at: new Date().toISOString(),
    });
    if (req.body.decision === "pay") {
      r.status = "PAID";
      r.paid_amount = Number(req.body.payment.amount);
      r.payment_date = req.body.payment.date;
      r.payment_reference = req.body.payment.reference;
      a.status = "paid";
      a.can_act = false;
    } else {
      r.approved_amount = Number(req.body.approved_amount);
      a.current_stage++;
      if (a.current_stage === 3) r.status = "APPROVED";
    }
    a.version++;
    return res.json({ request: a });
  }
  a.history.push({
    stage: a.stages[a.current_stage].key,
    actor_name: "Demo Owner",
    decision: req.body.decision,
    comment: req.body.comment,
    conditions: req.body.conditions,
    at: new Date().toISOString(),
  });
  a.current_stage++;
  a.version++;
  const r = leaveRecords.find((r) => r.id === a.resource_id);
  r.conditions = req.body.conditions || r.conditions;
  if (a.current_stage === 2) {
    a.status = "approved";
    a.can_act = false;
    r.status = "Approved";
  }
  res.json({ request: a });
});
app.get("/api/portal", (req, res) =>
  res.json({
    emp: {
      id: employee.employee_id,
      Full_name: "Demo Reviewer",
      employee_id: "DEMO-001",
      email: "demo@example.test",
      phone: "0900000000",
      hire_date: "2026-01-01",
    },
    leave_types: [
      {
        id: leaveTypeId,
        type_name: "Annual leave",
        kind: "annual",
        is_paid: true,
      },
    ],
    leave_bals: [
      {
        id: "demo-balance",
        year: new Date().getFullYear(),
        leave_type_id: leaveTypeId,
        type_name: "Annual leave",
        entitled_days: 12,
        used_days: 0,
      },
    ],
    leave_requests: leaveRecords,
    payslips: salaryFixture.personal(),
  }),
);
app.get("/api/employee-information", (req, res) =>
  res.json({
    employee: { id: employee.employee_id, full_name: "Demo Reviewer" },
    seed: infoSeed,
    employment: infoEmployment,
    records: infoRecord ? [infoRecord] : [],
    workflow_enabled: true,
    can_start: true,
    can_edit_employment: false,
  }),
);
app.post("/api/employee-information", (req, res) => {
  infoRecord = {
    id: "00000000-0000-4000-8000-000000000010",
    employee_id: employee.employee_id,
    created_by: employee.id,
    payload: req.body.payload,
    attachments: [],
    employment_snapshot: {},
    status: "draft",
    can_edit: true,
    version: 1,
    created_at: new Date().toISOString(),
  };
  res.json({ record: infoRecord });
});
app.put("/api/employee-information/:id", (req, res) => {
  infoRecord = {
    ...infoRecord,
    payload: req.body.payload,
    version: infoRecord.version + 1,
  };
  res.json({ record: infoRecord });
});
app.get("/api/employee-information/:id", (req, res) =>
  res.json({ record: infoRecord }),
);
app.post("/api/employee-information/:id/submit", (req, res) => {
  infoRecord = {
    ...infoRecord,
    status: "submitted",
    can_edit: false,
    version: infoRecord.version + 1,
    declaration_name: req.body.signature,
    declared_at: new Date().toISOString(),
    employment_snapshot: infoEmployment,
    approval_id: "00000000-0000-4000-8000-000000000011",
  };
  approvalRequests = [
    {
      id: infoRecord.approval_id,
      workflow_key: "employee_information",
      resource_id: infoRecord.id,
      requester_id: employee.id,
      employee_id: employee.employee_id,
      title: "Employee information · Demo Reviewer",
      snapshot: { information_id: infoRecord.id },
      stages: [
        {
          key: "hr_review",
          label: "HR review",
          action: "approve",
          assignee_id: owner.id,
          assignee_name: "Demo Owner",
        },
        {
          key: "final_approval",
          label: "Authorized approval",
          action: "approve",
          assignee_id: owner.id,
          assignee_name: "Demo Owner",
        },
      ],
      current_stage: 0,
      status: "pending",
      history: [],
      version: 1,
      can_act: true,
      created_at: new Date().toISOString(),
    },
  ];
  res.json({ record: infoRecord });
});
app.get("/api/approvals", (req, res) =>
  res.json({ requests: approvalRequests }),
);
app.put("/api/access/people/:id", (req, res) => {
  saves++;
  const row = {
    user_id: req.params.id,
    policy: req.body.policy,
    version: req.body.version + 1,
  };
  data.policies = [row];
  res.json({ policy: row });
});
app.put("/api/access/workflows/:key", (req, res) => {
  workflowSaves++;
  const setting = {
    workflow_key: req.params.key,
    ...req.body,
    version: req.body.version + 1,
  };
  data.settings = [setting];
  res.json({ setting });
});
app.post("/api/access/workflows/:key/preview", (req, res) =>
  res.json({
    ready: true,
    stages: req.body.stages.map((s) => ({
      ...s,
      name: "Demo Owner",
      state: "ready",
    })),
  }),
);
let probationRecord=null;
const probationActions=()=>({edit:current.id===owner.id&&probationRecord.status==='draft',respond:current.id===employee.id&&probationRecord.self_invited_at&&!probationRecord.self_response,decide:current.id===owner.id&&probationRecord.status==='pending',reply:false,receive_appeal:false,salary:current.id===owner.id});
const probationCopy=()=>{
 const r={...probationRecord,personal:current.id===employee.id};
 if(r.personal&&r.status!=='decided')return {id:r.id,employee_id:r.employee_id,status:r.status,version:r.version,employee_snapshot:r.employee_snapshot,anchor:r.anchor,self_invited_at:r.self_invited_at,self_due_date:r.self_due_date,self_response:r.self_response,self_responded_at:r.self_responded_at,personal:true};
 return r;
};
const probationDate=n=>{const d=new Date(new Date(Date.now()+7*3600000).toISOString().slice(0,10)+'T12:00:00Z');while(n){d.setUTCDate(d.getUTCDate()+1);if(d.getUTCDay()!==0)n--;}return d.toISOString().slice(0,10);};
app.get('/api/probation/meta',(req,res)=>res.json({employees:[{id:employee.employee_id,employee_id:'DEMO-001',Full_name:'Demo Reviewer',hire_date:'2026-01-01'}],can_create:true}));
app.get('/api/probation',(req,res)=>res.json({records:probationRecord?[probationCopy()]:[]}));
app.put('/api/probation/:id',(req,res)=>{probationRecord={...(probationRecord||{}),id:req.params.id,employee_id:employee.employee_id,creator_id:owner.id,status:'draft',data:req.body.data,version:(probationRecord?.version||0)+1,employee_snapshot:{name:'Demo Reviewer',employee_number:'DEMO-001',department:'Operations',position:'Team member',hire_date:'2026-01-01',manager:'Demo Owner'},anchor:{hire_date:'2026-01-01',period:'6',original_end:'2026-06-30',current_end:'2026-06-30',max_extension_end:'2026-09-30'}};res.json({id:req.params.id});});
app.get('/api/probation/:id',(req,res)=>res.json({record:probationCopy(),approval:current.id===employee.id&&probationRecord.status!=='decided'?null:approvalRequests.find(a=>a.resource_id===req.params.id),actions:probationActions()}));
app.post('/api/probation/:id/invite',(req,res)=>{probationRecord.self_invited_at=new Date().toISOString();probationRecord.self_due_date=req.body.due_date;probationRecord.version++;res.json({success:true});});
app.post('/api/probation/:id/respond',(req,res)=>{probationRecord.self_response=req.body.response;probationRecord.self_responded_at=new Date().toISOString();probationRecord.version++;res.json({success:true});});
app.post('/api/probation/:id/submit',(req,res)=>{probationRecord.status='pending';probationRecord.version++;approvalRequests=[{id:'00000000-0000-4000-8000-000000000061',workflow_key:'probation',resource_id:probationRecord.id,requester_id:owner.id,employee_id:employee.employee_id,title:'Probation: Demo Reviewer',snapshot:{probation_id:probationRecord.id},stages:['manager','department_head','hr'].map((key,i)=>({key,label:['Manager / Supervisor','Department head','HR final decision'][i],action:'approve',assignee_id:owner.id,assignee_name:'Demo Owner'})),current_stage:0,status:'pending',version:1,can_act:true,history:[],created_at:new Date().toISOString()}];res.json({success:true});});
app.post('/api/probation/:id/decision',(req,res)=>{const a=approvalRequests.find(a=>a.resource_id===req.params.id);a.history.push({stage:a.stages[a.current_stage].key,actor_name:'Demo Owner',decision:req.body.decision,comment:req.body.comment,at:new Date().toISOString()});a.version++;probationRecord.version++;if(a.current_stage===2){a.status='approved';a.can_act=false;probationRecord.status='decided';probationRecord.final_decision={...req.body.final,reviewer_name:'Demo Owner',at:new Date().toISOString()};probationRecord.decision_at=new Date().toISOString();probationRecord.shared_at=probationRecord.decision_at;probationRecord.share_due=probationDate(5);probationRecord.appeal_due=probationDate(10);probationRecord.salary_adjustment=req.body.salary;}else a.current_stage++;res.json({success:true});});
app.post('/api/probation/:id/acknowledge',(req,res)=>{probationRecord.acknowledged_at=new Date().toISOString();probationRecord.version++;res.json({success:true});});
app.post('/api/probation/:id/appeal',(req,res)=>{probationRecord.appeal={...req.body,at:new Date().toISOString()};probationRecord.version++;res.json({success:true});});
let warningRecord=null;
const warningApproval=()=>approvalRequests.find(a=>a.resource_id===warningRecord?.id);
const warningCopy=()=>{const r={...warningRecord,personal:current.id===employee.id};if(current.id!==owner.id)delete r.hr_records;return r;};
const warningActions=()=>({edit:current.id===owner.id&&warningRecord.status==='draft',respond:current.id===employee.id&&warningRecord.status==='issued'&&(!warningRecord.employee_comment||!warningRecord.acknowledgment),decide:current.id===owner.id&&warningRecord.status==='pending',hr:current.id===owner.id&&warningRecord.status==='issued'});
app.get('/api/warnings/meta',(req,res)=>res.json({employees:data.employees,can_create:true}));
app.get('/api/warnings',(req,res)=>res.json({records:warningRecord&&(current.id===owner.id||warningRecord.status==='issued')?[{...warningCopy(),level:warningRecord.data.level,target_date:warningRecord.data.target_date}]:[]}));
app.put('/api/warnings/:id',(req,res)=>{warningRecord={id:req.params.id,employee_id:employee.employee_id,creator_id:owner.id,status:'draft',data:req.body.data,employee_snapshot:{name:'Demo Reviewer',employee_number:'DEMO-001',department:'Operations',position:'Team member',manager:'Demo Owner'},version:1,employee_comment:null,acknowledgment:null,hr_records:[],external_receipts:[]};res.json({id:req.params.id});});
app.get('/api/warnings/:id',(req,res)=>res.json({record:warningCopy(),approval:warningApproval(),actions:warningActions()}));
app.post('/api/warnings/:id/submit',(req,res)=>{warningRecord.status='pending';warningRecord.letter_number='UYF-WARN-2026-00001';warningRecord.version++;approvalRequests=[{id:'00000000-0000-4000-8000-000000000071',workflow_key:'warning',resource_id:warningRecord.id,requester_id:owner.id,employee_id:employee.employee_id,title:'UYF-WARN-2026-00001: Demo Reviewer',snapshot:{warning_id:warningRecord.id},stages:['supervisor','hr'].map((key,i)=>({key,label:['Supervisor / Manager','HR / Authorized approver'][i],action:'approve',assignee_id:owner.id,assignee_name:'Demo Owner'})),current_stage:0,status:'pending',version:1,can_act:true,history:[],created_at:new Date().toISOString()}];res.json({success:true});});
app.post('/api/warnings/:id/decision',(req,res)=>{const a=warningApproval();a.history.push({stage:a.stages[a.current_stage].key,actor_name:'Demo Owner',decision:req.body.decision,comment:req.body.comment,at:new Date().toISOString()});a.version++;warningRecord.version++;if(a.current_stage===1){a.status='approved';a.can_act=false;warningRecord.status='issued';warningRecord.issued_at=new Date().toISOString();warningRecord.issuance={...req.body.issue,actor_name:'Demo Owner',at:warningRecord.issued_at};warningRecord.hr_records.push({...req.body.hr,actor_name:'Demo Owner',at:warningRecord.issued_at});}else a.current_stage++;res.json({success:true});});
app.post('/api/warnings/:id/respond',(req,res)=>{if(req.body.comments)warningRecord.employee_comment={comments:req.body.comments,at:new Date().toISOString()};if(req.body.acknowledged)warningRecord.acknowledgment={signature:req.body.signature,at:new Date().toISOString()};warningRecord.version++;res.json({success:true});});
app.post('/api/warnings/:id/follow-up',(req,res)=>{warningRecord.hr_records.push({...req.body,actor_name:'Demo Owner',at:new Date().toISOString()});warningRecord.version++;res.json({success:true});});
// Shared production projections against synthetic operations data.
const opsBusinesses=[{key:'UYF',name:'Unlock Your Future',name_my:'',color:'#dd123d',is_active:true,version:1},{key:'AI_AUTONO',name:'AI Autono',name_my:'',color:'#185adb',is_active:true,version:1}];
let opsAssignments=[],opsReceipts=[],opsSetting={version:1,settings:{...OPERATIONS_DEFAULTS}},opsRuns=[],opsSent=false;
function operationsData(){const day=todayBangkok(),month=day.slice(0,7),out=Object.fromEntries(['employees','departments','positions','approvals','information','profiles','attendance','leaves','payrolls','expenses','probations','warnings','handovers','onboarding','offboarding','sops','career','businesses','assignments','receipts'].map(k=>[k,[]]));Object.assign(out,{employees:[{...data.employees[0],hire_date:'2026-01-01',status:'Active',employment_status:'Active',salary:3000,probation_period:'6 months',email:'demo@example.test',phone:'000-000-000'}],businesses:opsBusinesses,assignments:opsAssignments,receipts:opsReceipts,approvals:approvalRequests,expenses:expenseRecords,probations:probationRecord?[probationRecord]:[],warnings:warningRecord?[warningRecord]:[],profiles:[{employee_id:employee.employee_id,data:{visa_expiry_date:addDays(day,5),work_permit_expiry_date:addDays(day,20)}}],payrolls:[{id:'00000000-0000-4000-8000-000000000081',employee_id:employee.employee_id,month:previousMonth(month),basic_salary:3000,net_salary:3000,payment_status:'Paid'},{id:'00000000-0000-4000-8000-000000000082',employee_id:employee.employee_id,month,basic_salary:3000,allowances:100,net_salary:3100,payment_status:'Pending'}]});return out;}
app.get('/api/hr-operations/businesses',(req,res)=>res.json({businesses:opsBusinesses,can_edit:current.is_owner}));
app.put('/api/hr-operations/businesses/:key',(req,res)=>{let r=opsBusinesses.find(b=>b.key===req.params.key);if(r)Object.assign(r,req.body,{version:r.version+1});else{r={...req.body,version:1};opsBusinesses.push(r);}res.json({business:r});});
app.get('/api/hr-operations/today',(req,res)=>{const tasks=buildOperationsTasks(current,operationsData(),opsSetting.settings,todayBangkok(),{business:req.query.business||''});res.json({date:todayBangkok(),tasks,businesses:opsBusinesses,summary:{total:tasks.length,overdue:tasks.filter(t=>t.state==='overdue').length,today:tasks.filter(t=>t.state==='today').length,upcoming:tasks.filter(t=>t.state==='upcoming').length}});});
app.get('/api/hr-operations/monthly',(req,res)=>res.json(monthlyReview(current,operationsData(),req.query.month||todayBangkok().slice(0,7),req.query.business||'')));
app.get('/api/hr-operations/employees/:id',(req,res)=>res.json(employee360(current,operationsData(),req.params.id,req.query.month||todayBangkok().slice(0,7),req.query.personal==='1')));
app.post('/api/hr-operations/employees/:id/businesses',(req,res)=>res.status(410).json({error:'Employee business assignments are retired; expense business tags remain available.'}));
app.get('/api/hr-operations/settings',(req,res)=>res.json({setting:opsSetting,runs:opsRuns}));
app.put('/api/hr-operations/settings',(req,res)=>{opsSetting={settings:req.body.settings,version:opsSetting.version+1};res.json({setting:opsSetting});});
app.get('/api/hr-operations/reminders/preview',(req,res)=>res.json({total:2,recipients:[{user_id:owner.id,name:'Demo Owner',count:2}]}));
app.post('/api/hr-operations/reminders/run',(req,res)=>{const r={delivered:opsSent?0:2,skipped:opsSent?2:0,failed:0};opsSent=true;opsRuns.push({...r,id:opsRuns.length+1,created_at:new Date().toISOString(),status:'success'});res.json(r);});
app.get('/api/hr-operations/expenses/:id',(req,res)=>res.json({can_record:current.is_owner,documents:expenseRecords[0].form_snapshot.documents,receipts:opsReceipts}));
app.post('/api/hr-operations/expenses/:id/receipts',multer().array('attachments',5),(req,res)=>{const r={...req.body,expense_id:req.params.id,existing_document_ids:JSON.parse(req.body.existing_document_ids),documents:[],created_at:new Date().toISOString()};opsReceipts.push(r);res.json({receipt:r});});
// Owner-only setup and public branding fixtures use the production readiness builder.
let fixtureBrand={settings:{...DEFAULT_BRANDING},version:1},fixtureSetupReviews=[];
const ownerSetupFixture=()=>buildOwnerSetup({...setupFixture(),branding:fixtureBrand,businesses:opsBusinesses,assignments:opsAssignments,reviews:fixtureSetupReviews,expenseRouting:completionFixture.setting},todayBangkok());
app.get('/api/branding',(req,res)=>res.json({name:fixtureBrand.settings.name,tagline:fixtureBrand.settings.tagline,accent:fixtureBrand.settings.accent,logo_url:fixtureBrand.settings.logo?'/api/branding/logo/'+fixtureBrand.settings.logo.id:'/logo.svg',version:fixtureBrand.version}));
app.get('/api/branding/logo/:id',(req,res)=>req.params.id===fixtureBrand.settings.logo?.id?res.type('image/png').send(logoPng()):res.sendStatus(404));
app.get('/api/branding/owner',(req,res)=>current.is_owner?res.json({branding:fixtureBrand}):res.sendStatus(403));
app.put('/api/branding',multer().single('logo'),(req,res)=>{
 if(!current.is_owner)return res.sendStatus(403);if(Number(req.body.version)!==fixtureBrand.version)return res.status(409).json({error:'Branding changed. Reload before saving'});
 const body=JSON.parse(req.body.settings),logo=req.file?{id:'00000000-0000-4000-8000-000000000090',ext:'png',mime:'image/png',name:req.file.originalname,size:req.file.size}:req.body.remove_logo==='true'?null:fixtureBrand.settings.logo;
 fixtureBrand={settings:{...cleanBranding(body),logo},version:fixtureBrand.version+1};res.json({branding:fixtureBrand});
});
app.get('/api/owner-setup',(req,res)=>current.is_owner?res.json(ownerSetupFixture()):res.sendStatus(403));
app.post('/api/owner-setup/reviews/:step',(req,res)=>{
 if(!current.is_owner)return res.sendStatus(403);const step=ownerSetupFixture().steps.find(v=>v.key===req.params.step);
 if(!step?.can_review||req.body.confirmed!==true)return res.status(400).json({error:'Complete and review these settings first'});
 if(step.fingerprint!==req.body.fingerprint||step.version!==req.body.version)return res.status(409).json({error:'Setup changed. Reload and review it again'});
 const review={step:step.key,fingerprint:step.fingerprint,version:step.version+1,reviewed_at:new Date().toISOString(),reviewed_by:owner.id};fixtureSetupReviews=[...fixtureSetupReviews.filter(v=>v.step!==step.key),review];res.json({review});
});

const aiFixtureSession='00000000-0000-4000-8000-000000000081';
let aiFixtureActions=[{id:'00000000-0000-4000-8000-000000000082',session_id:aiFixtureSession,kind:'create_kpi_task',payload:{title:'Reviewed KPI task',description:'Only execute after explicit confirmation',employee_id:employee.employee_id},status:'pending',expires_at:new Date(Date.now()+600000).toISOString()}],aiFixtureExecutions=0;
app.get('/api/boss/chat/sessions',(req,res)=>res.json([{id:aiFixtureSession,title:'Confirm actions'}]));
app.get('/api/boss/chat/sessions/:id/messages',(req,res)=>res.json([{role:'ai',content:'Review the proposed action card.'}]));
app.get('/api/boss/chat/sessions/:id/actions',(req,res)=>res.json({actions:aiFixtureActions}));
app.post('/api/boss/chat/actions/:id/decide',(req,res)=>{
 const action=aiFixtureActions.find(a=>a.id===req.params.id);
 if(!action||req.body.session_id!==aiFixtureSession)return res.sendStatus(409);
 if(req.body.confirmed===true)aiFixtureExecutions++;
 aiFixtureActions=[];res.json({success:true,status:req.body.confirmed?'completed':'cancelled'});
});
const manualFixture={categories:[{id:'manual-category',name:'Security policies'}],articles:[{id:'manual-article',category_id:'manual-category',title:'Safe published policy',status:'published',version:1,published_content:'<p><b>Safe policy text</b></p><img src=x onerror="window.__manualAttack=true"><a href="javascript:window.__manualAttack=true">Unsafe link</a>',draft_content:'<p>Draft</p><img src=x onerror="window.__manualAttack=true">'}]};
app.get('/api/manual/admin',(req,res)=>res.json(manualFixture));
app.get('/api/manual/public',(req,res)=>res.json(manualFixture));
app.get('/api/manual/recycle-bin',(req,res)=>res.json({articles:[]}));

app.use("/api", (req, res) =>
  res.status(404).json({ error: "No fixture for " + req.path }),
);
app.use(express.static(path.join(root, "hrm-client/dist")));
app.use((req, res) =>
  res.sendFile(path.join(root, "hrm-client/dist/index.html")),
);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}`;
let checks = 0;
async function check(value, message) {
  assert(value, message);
  checks++;
}
async function textButton(text) {
  const handles = await page.$$("button");
  for (const h of handles)
    if ((await h.evaluate((e) => e.innerText)).includes(text)) {
      await h.click();
      return;
    }
  throw new Error("Button not found: " + text);
}
async function fits() {
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "No horizontal overflow",
  );
}
await mkdir(path.join(root, "access-browser-artifacts"), { recursive: true });
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base + "/people-access");
  await page.waitForSelector(".access-person-list button");
  await textButton("Demo Reviewer");
  await page.waitForSelector(".access-permissions");
  check(
    (await page.$eval(".access-editor h2", (e) => e.textContent)) ===
      "Demo Reviewer",
    "Person selected",
  );
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".access-permission-row")].find(
      (e) => e.querySelector("strong").textContent === "Employees",
    );
    row.querySelector("input").click();
  });
  await textButton("Save access");
  await page.waitForFunction(() =>
    document
      .querySelector(".access-savebar")
      ?.textContent.includes("All changes saved"),
  );
  check(saves === 1, "Saved access through UI");
  check(
    data.policies[0].policy.modules.employees.includes("view"),
    "Correct permission saved",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/people-desktop.png"),
    fullPage: false,
  });
  await fits();
  await page.goto(base + "/approval-setup");
  await page.waitForSelector(".access-workflow-tabs");
  await textButton("Expense request");
  await page.waitForSelector(".access-stage");
  check(
    (await page.$$(".access-stage")).length === 4,
    "Four form-defined expense stages",
  );
  const selects = await page.$$(".access-stage-selects select");
  for (let i = 0; i < selects.length; i++)
    await selects[i].select(i % 2 ? employee.id : owner.id);
  await page.$eval(".access-activation input", (e) => e.click());
  await textButton("Save workflow");
  await page.waitForFunction(() =>
    document
      .querySelector(".access-savebar")
      ?.textContent.includes("Saved settings"),
  );
  check(workflowSaves === 1, "Workflow saved through UI");
  check(
    data.settings[0].stages.map((s) => s.key).join(",") ===
      "department,agm,coo,finance",
    "Stage order retained",
  );
  await page.select(".access-preview select", employee.id);
  await textButton("Preview route");
  await page.waitForSelector(".access-ready");
  check(
    (await page.$$(".access-preview li")).length === 4,
    "Route preview shown",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/workflow-desktop.png"),
    fullPage: false,
  });
  for (const width of [320, 390, 768]) {
    await page.setViewport({ width, height: 900 });
    await fits();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(root, `access-browser-artifacts/workflow-${width}.png`),
      fullPage: false,
    });
  }
  await page.evaluate(() => {
    localStorage.setItem("lm_hr_language", "my");
    localStorage.setItem("uyf-theme", "dark");
  });
  await page.reload();
  await page.waitForSelector(".access-workflow-tabs");
  await page.$eval(".access-workflow-tabs button", (e) => e.click());
  await page.waitForSelector(".access-stage");
  await fits();
  check((await page.$eval("html", (e) => e.lang)) === "my", "Myanmar language");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/workflow-myanmar-dark.png"),
    fullPage: false,
  });
  await page.goto(base + "/dashboard");
  await page.waitForSelector(".app-label");
  check(
    await page.evaluate(() =>
      document.body.innerText.includes("လူများနှင့် သုံးခွင့်"),
    ),
    "Owner launcher contains access app",
  );
  // New app notes must open without a runtime crash.
  const noteButton = await page.$('button[aria-label*="လူများ"]');
  if (noteButton) await noteButton.click();
  current = {
    ...employee,
    access: { ...emptyPolicy(), personal: ["profile", "leave"] },
  };
  await page.evaluate(() => localStorage.setItem("lm_hr_language", "en"));
  await page.goto(base + "/portal");
  await page.waitForSelector(".app-label");
  check(
    !(await page.evaluate(() => document.body.innerText.includes("Payslips"))),
    "Disabled personal app hidden",
  );
  check(
    await page.evaluate(() => document.body.innerText.includes("My Leave")),
    "Enabled personal app shown",
  );
  await page.goto(base + "/people-access");
  await page.waitForSelector(".access-empty");
  check(
    await page.evaluate(() => document.body.innerText.includes("not enabled")),
    "Direct owner page denied",
  );
  current = {
    ...employee,
    access: {
      ...emptyPolicy(),
      modules: { leave: ["view", "approve"] },
      scope: "selected",
      employee_ids: [employee.employee_id],
    },
  };
  await page.goto(base + "/dashboard");
  await page.waitForSelector(".app-label");
  check(
    await page.evaluate(() => document.body.innerText.includes("Leave")),
    "Employee legacy role can use granted management app",
  );
  check(
    !(await page.evaluate(() =>
      document.body.innerText.includes("People & Access"),
    )),
    "Owner controls remain hidden",
  );
  await page.goto(base + "/approvals");
  await page.waitForSelector(".access-inbox-filters");
  await fits();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/inbox-mobile.png"),
    fullPage: false,
  });
  // Fill the actual profile form, retain draft answers, submit, then inspect the
  // same structured document in the reviewer inbox at desktop and mobile widths.
  current = { ...employee, access: emptyPolicy() };
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base + "/portal/profile");
  await page.waitForSelector(".info-heading");
  await textButton("Start employee information");
  await page.waitForSelector(".info-nav");
  async function fill(label, value) {
    const labels = await page.$$(".info-editor-section label");
    for (const h of labels) {
      if ((await h.evaluate((e) => e.textContent.trim())).startsWith(label)) {
        const input = await h.$("input,textarea");
        await input.click({ clickCount: 3 });
        await input.type(value);
        return;
      }
    }
    throw new Error("Missing field " + label);
  }
  async function section(text) {
    await page.$$eval(
      ".info-nav button",
      (buttons, text) =>
        buttons.find((b) => b.textContent.includes(text)).click(),
      text,
    );
  }
  await fill("Phone", "0912345678");
  await fill("Current address", "Bangkok test address");
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/api/employee-information/") &&
        r.request().method() === "PUT",
    ),
    textButton("Save draft"),
  ]);
  await page.waitForFunction(() =>
    document.querySelector(".info-savebar").textContent.includes("Draft saved"),
  );
  check(infoRecord.payload.phone === "0912345678", "Draft answers saved");
  await section("Family");
  await textButton("Add family member");
  check(
    (await page.$$(".info-family")).length === 1,
    "Repeatable family member fields",
  );
  await section("Emergency");
  await fill("Contact name", "Emergency Person");
  await fill("Contact phone", "0987654321");
  await section("Documents");
  check(
    (await page.$$(".info-document-checklist span")).length === 8,
    "All eight original document categories",
  );
  await section("Employment record");
  check(
    (await page.$$(".info-editor-section input")).length === 0,
    "Employment and salary are read-only",
  );
  await section("Personal details");
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/information-desktop.png"),
    fullPage: false,
  });
  await fits();
  await page.setViewport({ width: 390, height: 900 });
  await fits();
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/information-mobile.png"),
    fullPage: false,
  });
  await section("Review & submit");
  await page.$eval(".info-declaration input", (e) => e.click());
  await fill("Your full name as signature", "Demo Reviewer");
  await textButton("Sign & submit");
  await page.waitForSelector(".info-status.info-submitted");
  check(
    infoRecord.declaration_name === "Demo Reviewer",
    "Employee declaration retained",
  );
  check(
    (await page.$$(".info-savebar")).length === 0,
    "Submitted form cannot be edited",
  );
  current = owner;
  await page.goto(base + "/approvals");
  await page.waitForSelector(".access-request");
  await textButton("Employee information · Demo Reviewer");
  await page.waitForSelector(".info-readonly");
  check(
    await page.evaluate(() =>
      document
        .querySelector(".info-readonly")
        .textContent.includes("Emergency Person"),
    ),
    "Reviewer sees structured employee information",
  );
  await fits();
  await page.screenshot({
    path: path.join(
      root,
      "access-browser-artifacts/information-review-mobile.png",
    ),
    fullPage: false,
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await fits();
  await page.screenshot({
    path: path.join(
      root,
      "access-browser-artifacts/information-review-desktop.png",
    ),
    fullPage: false,
  });
  await page.evaluate(() => {
    localStorage.setItem("lm_hr_language", "my");
    localStorage.setItem("uyf-theme", "dark");
  });
  await page.goto(base + "/portal/profile");
  await page.waitForSelector(".info-readonly");
  check(
    await page.evaluate(() =>
      document
        .querySelector(".info-heading")
        .textContent.includes("ဝန်ထမ်းအချက်အလက်"),
    ),
    "Myanmar employee information labels",
  );
  await fits();
  await page.screenshot({
    path: path.join(
      root,
      "access-browser-artifacts/information-myanmar-dark.png",
    ),
    fullPage: false,
  });
  current = { ...employee, access: emptyPolicy() };
  await page.evaluate(() => {
    localStorage.setItem("lm_hr_language", "en");
    localStorage.setItem("uyf-theme", "light");
  });
  await page.goto(base + "/portal/leaves");
  await page.waitForSelector(".ux-balance");
  check(
    (await page.$$(".ux-balance")).length === 1,
    "One clear balance card per leave type",
  );
  await page.$eval(".ux-section-toolbar>.ux-button-primary", (e) => e.click());
  await page.waitForSelector(".leave-form-identity");
  async function leaveField(label, value) {
    const labels = await page.$$(".leave-form label");
    for (const h of labels) {
      if ((await h.evaluate((e) => e.textContent.trim())).startsWith(label)) {
        const input = await h.$("input,textarea,select");
        const tag = await input.evaluate((e) => e.tagName);
        if (tag === "SELECT") await input.select(value);
        else if (await input.evaluate((e) => e.type === "date"))
          await input.evaluate((e, v) => {
            Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            ).set.call(e, v);
            e.dispatchEvent(new Event("input", { bubbles: true }));
            e.dispatchEvent(new Event("change", { bubbles: true }));
          }, value);
        else {
          await input.click({ clickCount: 3 });
          await input.type(value);
        }
        return;
      }
    }
    throw new Error("Missing leave field " + label);
  }
  await leaveField("Leave type", leaveTypeId);
  await leaveField("Start date", "2030-05-10");
  await leaveField("End date", "2030-05-10");
  await leaveField("Full or partial day", "AM");
  await page.waitForFunction(() =>
    document
      .querySelector(".leave-form-preview header strong")
      ?.textContent.includes("0.5"),
  );
  check(
    await page.$eval(".leave-form-identity strong", (e) => {
      const rgb = getComputedStyle(e)
        .color.match(/\d+/g)
        .slice(0, 3)
        .map((v) => {
          v = Number(v) / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return (
        1.05 / (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 + 0.05) >=
        4.5
      );
    }),
    "Employee identity has readable light-mode contrast",
  );
  check(
    await page.evaluate(
      () => !!document.elementFromPoint(12, 12)?.closest(".ux-modal-layer"),
    ),
    "Modal covers background header controls",
  );
  check(
    await page.$eval(".leave-form-table", (e) =>
      e.textContent.includes("11.5"),
    ),
    "Half-day projected balance is exact",
  );
  await leaveField("Reason for leave", "Morning appointment");
  await leaveField("Your full name as signature", "Demo Reviewer");
  await page.$eval(".leave-form-check input", (e) => e.click());
  await fits();
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/leave-form-desktop.png"),
    fullPage: false,
  });
  await page.setViewport({ width: 390, height: 900 });
  await fits();
  await page.$eval(".ux-modal", (e) => (e.scrollTop = 0));
  await page.evaluate(async () => {
    await Promise.all(
      document
        .querySelector(".ux-modal")
        .getAnimations()
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/leave-form-mobile.png"),
    fullPage: false,
  });
  await textButton("Sign & submit");
  await page.waitForSelector(".leave-form-review");
  check(leaveRecords[0].session === "AM", "Half-day session submitted");
  check(
    leaveRecords[0].form_snapshot.input.signature === "Demo Reviewer",
    "Leave employee declaration submitted",
  );
  check(!!(await page.$('a[href$="/pdf"]')), "Employee can retain a PDF copy");
  current = owner;
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base + "/approvals");
  await page.waitForSelector(".access-request");
  await textButton("Demo Reviewer: half-day leave");
  await page.waitForSelector(".leave-form-review");
  await page.select(
    ".access-section form select,form.access-section .leave-form select",
    "approve_with_conditions",
  );
  const fields = await page.$$("form.access-section textarea");
  await fields[0].type("Coverage checked");
  await fields[1].type("Finish the morning handover.");
  await textButton("Approve this step");
  await page.waitForFunction(() =>
    document
      .querySelector(".access-history")
      ?.textContent.includes("Finish the morning handover."),
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".leave-form-review")
      ?.textContent.includes("Awaiting final HR decision"),
  );
  check(true, "Manager conditions remain pending until HR approval");
  check(
    approvalRequests[0].history[0].conditions ===
      "Finish the morning handover.",
    "Manager approval conditions retained",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(
      root,
      "access-browser-artifacts/leave-approval-desktop.png",
    ),
    fullPage: false,
  });
  await page.evaluate(() => localStorage.setItem("lm_hr_language", "my"));
  await page.goto(base + "/portal/leaves");
  await page.waitForSelector(".ux-history-list");
  await page.$eval(".leave-history-details", (e) => e.click());
  await page.waitForSelector(".leave-form-review");
  await page.setViewport({ width: 390, height: 900 });
  await page.evaluate(async () => {
    await Promise.all(
      document
        .querySelector(".ux-modal")
        .getAnimations()
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await fits();
  check(
    await page.$eval(".leave-form-review", (e) =>
      e.textContent.includes("ဝန်ထမ်းအချက်အလက်"),
    ),
    "Myanmar leave form labels",
  );
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/leave-myanmar-mobile.png"),
    fullPage: false,
  });
  current = { ...employee, access: emptyPolicy() };
  await page.evaluate(() => {
    localStorage.setItem("lm_hr_language", "en");
    localStorage.setItem("uyf-theme", "light");
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base + "/portal/rewards");
  await page.waitForSelector(".expense-workspace .ux-button-primary");
  await textButton("Request an expense");
  await page.waitForSelector(".expense-form .leave-form-identity");
  await leaveField("Expense business","UYF");
  await leaveField("Expense category","Travel & Transportation");
  check(!!(await page.$(".expense-form input[type=date]")),"Conditional travel date appears");
  await leaveField("Expense category","AI Tools / Software");
  check(await page.$eval(".expense-form",el=>el.textContent.includes("Software / service name")),"Software-only details appear");
  await leaveField("Expense category","Office/Admin");
  await leaveField("What is this expense for?","Printer supplies");
  await leaveField("Requested amount","350.25");
  check(await page.$eval(".expense-form",el=>!el.textContent.includes("Budget amount")),"Budget field is removed from employee request");
  check(await page.$eval(".expense-form input[type=file]",el=>!el.required),"Quotations remain optional");
  check(await page.$eval(".expense-form",el=>el.textContent.includes("Additional details (optional)")),"Extra request fields are collapsible");
  await page.$eval(".ux-modal", (e) => (e.scrollTop = 0));
  await fits();
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/expense-form-desktop.png"),
    fullPage: false,
  });
  await page.setViewport({ width: 390, height: 900 });
  await fits();
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/expense-form-mobile.png"),
    fullPage: false,
  });
  await textButton("Submit expense");
  await page.waitForSelector(".expense-review");
  check(
    expenseRecords[0].requested_amount === 350.25,
    "Complete expense submitted",
  );
  check(!!(await page.$('a[href$="/pdf"]')), "Expense PDF link available");
  current = owner;
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(base + "/approvals");
  await page.waitForSelector(".access-request");
  await textButton("UYF_2030_001");
  await page.waitForSelector(".expense-review");
  await page.select(
    "form.access-section .leave-form select",
    "approve_with_conditions",
  );
  await page.$eval("form.access-section input[type=number]", (e) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(e, "300");
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const tx = await page.$$("form.access-section textarea");
  await tx[1].type("Attach final receipt.");
  await textButton("Approve this step");
  await page.waitForFunction(() =>
    document
      .querySelector(".access-history")
      .textContent.includes("Attach final receipt."),
  );
  check(
    approvalRequests[0].history[0].approved_amount === 300,
    "Reduced authorized expense amount retained",
  );
  await textButton("Approve this step");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".access-history li")][2].classList.contains(
      "is-current",
    ),
  );
  await textButton("Approve this step");
  await page.waitForSelector('input[aria-label="Payment currency"]');
  check(
    await page.$eval(
      ".access-payment-grid input[type=number]",
      (e) => e.value === "300",
    ),
    "Finance starts with latest authorized amount",
  );
  await page.select(".access-payment-grid select", "Bank Transfer");
  await page.$eval(".access-payment-grid input:not([type])", (e) => {
    const inputs = [
      ...e.closest(".access-payment-grid").querySelectorAll("input"),
    ];
    const reference = inputs.find((i) => !i.readOnly && i.type === "text");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(reference, "SYNTHETIC-001");
    reference.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({
    path: path.join(
      root,
      "access-browser-artifacts/expense-finance-desktop.png",
    ),
    fullPage: false,
  });
  await textButton("Record payment");
  await page.waitForFunction(() =>
    document
      .querySelector(".expense-review")
      .textContent.includes("SYNTHETIC-001"),
  );
  check(
    expenseRecords[0].status === "PAID" &&
      expenseRecords[0].paid_amount === 300,
    "Final expense payment recorded",
  );
  await page.evaluate(() => localStorage.setItem("lm_hr_language", "my"));
  current = { ...employee, access: emptyPolicy() };
  await page.goto(base + "/portal/rewards");
  await page.waitForSelector(".expense-card");
  await page.$eval(".expense-card", (e) => e.click());
  await page.waitForSelector(".expense-review");
  await page.setViewport({ width: 390, height: 900 });
  await page.evaluate(async () => {
    await Promise.all(
      document
        .querySelector(".ux-modal")
        .getAnimations()
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await fits();
  check(
    await page.$eval(".expense-review", (e) =>
      e.textContent.includes("တောင်းဆိုမှု အသေးစိတ်"),
    ),
    "Myanmar expense review",
  );
  await page.screenshot({
    path: path.join(
      root,
      "access-browser-artifacts/expense-review-myanmar-mobile.png",
    ),
    fullPage: false,
  });
  await page.evaluate(() => localStorage.setItem("uyf-theme", "dark"));
  await page.goto(base + "/portal/rewards");
  await page.waitForSelector(".expense-card");
  await page.$eval(".expense-card", (e) => e.click());
  await page.waitForSelector(".expense-review");
  await page.evaluate(async () => {
    await Promise.all(document.querySelector(".ux-modal").getAnimations().map((a) => a.finished.catch(() => {})));
  });
  await fits();
  check(
    await page.$eval(".ux-modal", (e) => {const sample=document.createElement("span");sample.style.backgroundColor="var(--uyf-panel)";document.body.append(sample);const result=getComputedStyle(e).backgroundColor===getComputedStyle(sample).backgroundColor;sample.remove();return result;}),
    "Expense review follows dark theme",
  );
  await page.screenshot({
    path: path.join(root, "access-browser-artifacts/expense-review-dark-mobile.png"),
    fullPage: false,
  });
  current=owner;
  await page.evaluate(()=>{localStorage.setItem('lm_hr_language','en');localStorage.setItem('uyf-theme','light');});
  await page.setViewport({width:1440,height:1000});await page.goto(base+'/performance/probation');await page.waitForSelector('.probation-workspace .ux-button-primary');await textButton('New evaluation');await page.waitForSelector('.probation-form');
  await leaveField('Employee',employee.employee_id);await leaveField('Original probation period','6');
  for(const [label,value]of [['Total working days','40'],['Days present','39'],['Days absent','1'],['Late arrivals','1'],['Early departures','0'],['Unexcused absences','0'],['Overall attendance rating','4'],['Key strengths','Communication'],['Areas for improvement','Documentation'],['Manager overall summary','Evidence reviewed by the manager'],['Overall performance','4'],['Cultural fit','4'],['Potential for growth','High'],['Recommendation','confirmed'],['Reason for missing the two-week deadline','Historical review documented after the due date.']])await leaveField(label,value);
  const competencySelects=await page.$$('.probation-competency select');for(const select of competencySelects)await select.select('4');
  await page.$eval('.ux-modal',e=>e.scrollTop=0);await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/probation-editor-desktop.png'),fullPage:false});
  await page.setViewport({width:390,height:900});await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/probation-editor-mobile.png'),fullPage:false});
  await textButton('Save draft');await page.waitForSelector('.probation-review');check(Object.keys(probationRecord.data.competencies).length===10,'All ten probation competencies captured');
  await leaveField('Employee response deadline','2030-05-10');await textButton('Invite employee');await page.waitForFunction(()=>document.querySelector('.probation-review').textContent.includes('Invitation sent'));
  current={...employee,access:emptyPolicy()};await page.goto(base+'/portal/probation');await page.waitForSelector('.probation-card');await page.$eval('.probation-card',e=>e.click());await page.waitForSelector('.probation-self');
  check((await page.$$('.probation-rating-review')).length===0,'Pending evaluation ratings are withheld from the subject');
  await leaveField('How do you feel','I completed the assigned goals.');await leaveField('What challenges','Documentation took extra time.');await leaveField('What support','More training would help.');await leaveField('Your full name as signature','Demo Reviewer');await page.$eval('.probation-self input[type=checkbox]',e=>e.click());await textButton('Submit my response');await page.waitForFunction(()=>!document.querySelector('.probation-self'));
  check(probationRecord.self_response.performance.includes('assigned goals'),'Employee self-assessment recorded');
  current=owner;await page.goto(base+'/performance/probation');await page.waitForSelector('.probation-card');await page.$eval('.probation-card',e=>e.click());await page.waitForSelector('.probation-review');await textButton('Submit completed evaluation');await page.waitForFunction(()=>document.querySelector('.probation-review-head').textContent.includes('pending'));
  await page.setViewport({width:1440,height:1000});await page.goto(base+'/approvals');await page.waitForSelector('.access-request');await textButton('Probation: Demo Reviewer');await page.waitForSelector('.probation-decision');
  await textButton('Approve this review step');await page.waitForFunction(()=>document.querySelectorAll('.access-history li')[1].classList.contains('is-current'));await textButton('Approve this review step');await page.waitForFunction(()=>document.querySelector('.probation-decision').textContent.includes('HR final decision'));
  const bkkToday=new Date(Date.now()+7*3600000).toISOString().slice(0,10);await leaveField('Final outcome','confirmed');await leaveField('Confirmation / extension effective date',bkkToday);await leaveField('Late decision explanation','HR reviewed the timing and documented the late evaluation.');
  check(probationRecord.status==='pending','HR outcome is not selected by a score or earlier approval');
  await page.evaluate(()=>document.querySelector('.probation-decision').scrollIntoView());await page.screenshot({path:path.join(root,'access-browser-artifacts/probation-hr-decision.png'),fullPage:false});
  await textButton('Record final decision');await page.waitForFunction(()=>document.querySelector('.probation-final')?.textContent.includes('Confirm employment'));check(probationRecord.shared_at&&probationRecord.final_decision.outcome==='confirmed','HR final decision releases the employee copy');
  current={...employee,access:emptyPolicy()};await page.goto(base+'/portal/probation');await page.waitForSelector('.probation-card');await page.$eval('.probation-card',e=>e.click());await page.waitForSelector('.probation-final');check(!!await page.$('a[href$="/pdf"]'),'Employee finalized PDF link');await textButton('I received this evaluation');await page.waitForFunction(()=>document.querySelector('.probation-review').textContent.includes('Receipt acknowledged'));
  await leaveField('Written appeal to HR','Please review my additional evidence.');await leaveField('Signed name','Demo Reviewer');await textButton('Send written appeal');await page.waitForFunction(()=>document.querySelector('.probation-review').textContent.includes('Please review my additional evidence.'));check(probationRecord.appeal.statement.includes('additional evidence'),'Written appeal recorded');
  await page.evaluate(()=>{localStorage.setItem('lm_hr_language','my');localStorage.setItem('uyf-theme','dark');});await page.goto(base+'/portal/probation');await page.waitForSelector('.probation-card');await page.$eval('.probation-card',e=>e.click());await page.waitForSelector('.probation-review');await page.setViewport({width:390,height:900});await page.evaluate(async()=>{await Promise.all(document.querySelector('.ux-modal').getAnimations().map(a=>a.finished.catch(()=>{})));});await fits();check(await page.$eval('.probation-review',e=>e.textContent.includes('အကဲဖြတ်ချက်')),'Myanmar probation review');await page.screenshot({path:path.join(root,'access-browser-artifacts/probation-myanmar-dark-mobile.png'),fullPage:false});
  // Warning letter: independent management module, human reviews, comments and separate receipt.
  current=owner;await page.evaluate(()=>{localStorage.setItem('lm_hr_language','en');localStorage.setItem('uyf-theme','light');});await page.setViewport({width:1440,height:1000});await page.goto(base+'/warnings');await page.waitForSelector('.warning-workspace');await textButton('New warning letter');await page.waitForSelector('.warning-form');
  async function warningCheck(prefix){await page.waitForFunction(p=>Array.from(document.querySelectorAll('.leave-form label')).some(e=>e.textContent.trim().startsWith(p)&&e.querySelector('input[type=checkbox]')?.matches(':enabled')),{},prefix);const labels=await page.$$('.leave-form label');for(const h of labels){if((await h.evaluate(e=>e.textContent.trim())).startsWith(prefix)){const input=await h.$('input[type=checkbox]');await input.evaluate(e=>e.click());return;}}throw new Error('Missing checkbox '+prefix);}
  await leaveField('Employee',employee.employee_id);await leaveField('Warning level','first');await leaveField('Date of incident',bkkToday);await leaveField('Target / review date',bkkToday);await leaveField('Incident location','Bangkok office');await leaveField('Description of incident','Human-reviewed incident facts and supporting discussion.');await leaveField('Policy / rule','Attendance SOP section 2');await warningCheck('Attendance / punctuality');await warningCheck('Correct the identified');
  await page.$eval('.ux-modal',e=>e.scrollTop=0);await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/warning-editor-desktop.png'),fullPage:false});await page.setViewport({width:390,height:900});await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/warning-editor-mobile.png'),fullPage:false});
  await textButton('Save draft');await page.waitForSelector('.warning-review');await textButton('Submit completed letter');await page.waitForFunction(()=>document.querySelector('.warning-review-head').textContent.includes('pending'));check(warningRecord.data.level==='first'&&warningRecord.data.actions.includes('correct'),'Warning captures human-selected level and corrective expectations');
  current={...employee,access:emptyPolicy()};await page.goto(base+'/portal/warnings');await page.waitForSelector('.warning-workspace .access-empty');check((await page.$$('.warning-card')).length===0,'Pending warning withheld from employee');
  current=owner;await page.setViewport({width:1440,height:1000});await page.goto(base+'/approvals');await page.waitForSelector('.access-request');await textButton('UYF-WARN-2026-00001');await page.waitForSelector('.warning-decision');await textButton('Approve supervisor review');await page.waitForFunction(()=>document.querySelector('.warning-decision')?.textContent.includes('HR final approval'));
  check(warningRecord.status==='pending'&&!warningRecord.issued_at,'Supervisor approval does not issue a warning');
  await leaveField('Explanation / opportunity record','HR explained the letter and offered an opportunity to respond.');await warningCheck('HR confirms the warning');await leaveField('HR file reference','PRIVATE-HR-001');await leaveField('Follow-up / review date',bkkToday);await leaveField('HR notes','Private internal follow-up notes.');await page.evaluate(()=>document.querySelector('.warning-decision').scrollIntoView());await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/warning-hr-decision.png'),fullPage:false});
  await textButton('Approve & issue warning');await page.waitForSelector('.warning-issued');check(warningRecord.status==='issued'&&warningApproval().history.length===2,'Two human reviews issue the warning');
  current={...employee,access:emptyPolicy()};await page.goto(base+'/portal/warnings');await page.waitForSelector('.warning-card');await page.$eval('.warning-card',e=>e.click());await page.waitForSelector('.warning-response');check((await page.$$('.warning-private')).length===0,'Private HR records withheld from employee');check(!!await page.$('a[href$="/pdf"]'),'Employee warning PDF link');
  await leaveField('Employee comments / response','I disagree with the incident description and want my explanation retained.');await textButton('Save my response');await page.waitForSelector('.warning-employee-comment');check(!warningRecord.acknowledgment,'Employee comments do not imply receipt or agreement');
  await warningCheck('I want to acknowledge');await warningCheck('This warning has been explained');await warningCheck('I had an opportunity');await leaveField('Your full name as signature','Demo Reviewer');await textButton('Save my response');await page.waitForSelector('.warning-acknowledgment');check(warningRecord.acknowledgment.signature==='Demo Reviewer'&&warningRecord.employee_comment.comments.includes('disagree'),'Receipt signature preserves employee disagreement');
  await page.evaluate(()=>{localStorage.setItem('lm_hr_language','my');localStorage.setItem('uyf-theme','dark');});await page.goto(base+'/portal/warnings');await page.waitForSelector('.warning-card');await page.$eval('.warning-card',e=>e.click());await page.waitForSelector('.warning-review');await page.setViewport({width:390,height:900});await page.evaluate(async()=>{await Promise.all(document.querySelector('.ux-modal').getAnimations().map(a=>a.finished.catch(()=>{})));});await fits();check(await page.$eval('.warning-review',e=>e.textContent.includes('သတိပေး')),'Myanmar warning letter');await page.screenshot({path:path.join(root,'access-browser-artifacts/warning-myanmar-dark-mobile.png'),fullPage:false});
  current=owner;await page.evaluate(()=>{localStorage.setItem('lm_hr_language','en');localStorage.setItem('uyf-theme','light');});await page.goto(base+'/warnings');await page.waitForSelector('.warning-card');await page.$eval('.warning-card',e=>e.click());await page.waitForSelector('.warning-hr-tools');await leaveField('HR notes','Follow-up completed; documented improvement.');await textButton('Add follow-up record');await page.waitForFunction(()=>document.querySelector('.warning-private').textContent.includes('documented improvement'));check(warningRecord.hr_records.length===2,'HR follow-up appended without rewriting the issued letter');
  // New operations features: usable forms, accurate projections and responsive layouts.
  current=owner;await page.evaluate(()=>{localStorage.setItem('lm_hr_language','en');localStorage.setItem('uyf-theme','light');});await page.setViewport({width:1440,height:1000});
  const opsDay=todayBangkok();expenseRecords[0].form_snapshot.input.expense_date=opsDay;expenseRecords[0].payment_date=opsDay;
  async function opsField(prefix,value){const labels=await page.$$('.ops-field');for(const label of labels){if((await label.evaluate(e=>e.textContent.trim())).startsWith(prefix)){const input=await label.$('input,textarea,select'),tag=await input.evaluate(e=>e.tagName);if(tag==='SELECT')await input.select(value);else await input.evaluate((e,v)=>{Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);return;}}throw new Error('Missing operations field '+prefix);}
  async function opsCheck(prefix){const labels=await page.$$('.ops-check');for(const label of labels){if((await label.evaluate(e=>e.textContent.trim())).startsWith(prefix)){await label.$eval('input',e=>e.click());return;}}throw new Error('Missing operations checkbox '+prefix);}
  await page.goto(base+'/today');await page.waitForSelector('.ops-task');check((await page.$$('.ops-stat')).length===4,'Today summary has four follow-up counts');await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/operations-today-desktop.png'),fullPage:false});
  await page.setViewport({width:390,height:900});await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/operations-today-mobile.png'),fullPage:false});
  await page.goto(base+'/businesses');await page.waitForSelector('.ops-business-card');await textButton('Add expense tag');await page.waitForSelector('.ux-modal .ops-form');await opsField('Expense tag code','WISE_INVEST');await opsField('Expense tag name','Wise Invest');await textButton('Save expense tag');await page.waitForFunction(()=>!document.querySelector('.ux-modal'));check(opsBusinesses.some(b=>b.key==='WISE_INVEST'),'Owner can configure an additional business');
  await page.setViewport({width:1440,height:1000});await page.goto(base+'/employees/'+employee.employee_id+'/360');await page.waitForSelector('.ops-employee360 .ops-facts');
   check(!await page.$eval('.ops-employee360',e=>e.textContent.includes('Assign businesses')||e.textContent.includes('Cost share')),'Employee 360 is organization-wide with no business assignment editor');
   check(opsAssignments.length===0,'No employee memberships were created');await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/operations-employee360-desktop.png'),fullPage:false});
   await page.goto(base+'/monthly-review');await page.waitForSelector('.ops-table tbody tr');check(await page.$eval('.ops-monthly',e=>e.textContent.includes('100.00 THB')&&e.textContent.includes('Needs explanation')),'Monthly review flags payroll changes and includes no business cost allocation');
   await textButton('Demo Reviewer');await page.waitForSelector('.ops-detail');
   check(await page.$eval('.ops-monthly',e=>!e.textContent.includes('Cost allocation for these employees')&&!e.textContent.includes('Business cost shares')),'Salary reports do not split monthly payroll');
   check(await page.$eval('.ops-monthly',e=>e.textContent.includes('3,100.00 THB')),'The one monthly salary amount remains intact');
   await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/operations-monthly-desktop.png'),fullPage:false});
   await textButton('Expenses & receipts');await page.waitForSelector('.ops-currency-grid');await page.click('.ops-table a');await page.waitForSelector('.ops-receipt-form');await opsField('Outside receipt reference','RECEIPT-UI-001');await opsField('Receipt notes','Finance checked the outside receipt.');await opsCheck('I confirm the selected');await textButton('Record receipt');await page.waitForSelector('.ops-receipt-entry');check(opsReceipts.length===1,'Receipt evidence appended without replacing the expense');
  await page.goto(base+'/operations-settings');await page.waitForSelector('.ops-reminder-settings .ops-form');await opsCheck('Enable automatic reminders');await textButton('Save reminder settings');await page.waitForFunction(()=>document.querySelector('.ops-reminder-settings input[type=checkbox]')?.checked&&Array.from(document.querySelectorAll('button')).some(e=>e.textContent.includes('Preview reminders')&&!e.disabled));await textButton('Preview reminders');await page.waitForSelector('.ops-detail');await textButton('Run reminders now');await page.waitForFunction(()=>document.querySelector('.ops-reminder-settings [role=status]')?.textContent.includes('2 / 0 / 0'));check(opsSetting.settings.enabled&&opsSent,'Owner enables and runs in-app reminders');await textButton('Run reminders now');await page.waitForFunction(()=>document.querySelector('.ops-reminder-settings [role=status]')?.textContent.includes('0 / 2 / 0'));check(opsRuns.length===2,'Repeated reminder scan is surfaced without duplicate delivery');
  current={...employee,access:{...emptyPolicy(),personal:['profile','leave','warnings','probation']}};await page.evaluate(()=>{localStorage.setItem('lm_hr_language','my');localStorage.setItem('uyf-theme','dark');});await page.setViewport({width:390,height:900});await page.goto(base+'/portal/profile/360');await page.waitForSelector('.ops-employee360 .ops-facts');await fits();check((await page.$$('.ops-employee360 .ops-tabs button')).length===4,'Self 360 hides payroll and expense apps when not shared');check(!(await page.$eval('.ops-employee360',e=>e.textContent)).includes('Private internal'),'Employee 360 excludes private HR follow-up notes');await page.screenshot({path:path.join(root,'access-browser-artifacts/operations-employee360-myanmar-dark-mobile.png'),fullPage:false});
  // Branding settings and guided Owner setup, without sending any external message.
  current=owner;await page.evaluate(()=>{localStorage.setItem('lm_hr_language','en');localStorage.setItem('uyf-theme','light');});await page.setViewport({width:1440,height:1000});
  await page.goto(base+'/owner-setup');await page.waitForSelector('.setup-step-card');
  check((await page.$$('.setup-step-card')).length===7,'Owner setup shows seven real configuration steps');
  check(await page.$eval('.setup-review-bar .ux-button-primary',e=>e.disabled),'Setup review requires explicit confirmation');
  await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/owner-setup-desktop.png'),fullPage:false});
  await opsField('Company / brand name','Unlock Your Future Studio');await opsField('Tagline','People & Growth');await opsField('Primary brand color','#2455aa');
  await page.click('.setup-email-editor summary');await opsField('Interview email subject','Interview — {{position}} | {{company}}');await opsField('Email signature','People team\n{{company}}');
  check(await page.$eval('.setup-email-preview',e=>e.textContent.includes('Unlock Your Future Studio')),'Email wording previews the draft company identity');
  const logoPath=path.join(root,'access-browser-artifacts/branding-logo-fixture.png');await writeFile(logoPath,logoPng());const logoInput=await page.$('.setup-brand-form input[type=file]');await logoInput.uploadFile(logoPath);
  await textButton('Save branding');await page.waitForFunction(()=>document.querySelector('.uyf-brand-name')?.textContent==='Unlock Your Future Studio');await page.waitForFunction(version=>Number(document.querySelector('.setup-brand-form')?.dataset.version)===version,{},fixtureBrand.version);
  check(await page.evaluate(()=>document.title.includes('Unlock Your Future Studio')&&document.documentElement.style.getPropertyValue('--uyf-accent')==='#2455aa'),'Saved name, document title and accent update together');
  await page.waitForFunction(()=>document.querySelector('.uyf-brand-logo')?.naturalWidth===32);
  check(await page.$eval('.uyf-brand-logo',e=>e.src.includes('/api/branding/logo/')),'Uploaded logo appears in the shared header');
  await page.mouse.move(0,0);await page.waitForFunction(()=>getComputedStyle(document.querySelector('.setup-brand-form>.ux-button')).backgroundColor==='rgb(36, 85, 170)');
  check(await page.$eval('.setup-brand-form>.ux-button',e=>getComputedStyle(e).color==='rgb(255, 255, 255)'),'Branding controls paint the saved accent with readable white text');
  await page.evaluate(()=>window.scrollTo(0,0));
  console.log('AB_IMAGE_BRANDING_DESKTOP:'+await page.screenshot({type:'jpeg',quality:55,encoding:'base64'}));
  await opsCheck('I reviewed these settings');await textButton('Review & continue');await page.waitForFunction(()=>new URLSearchParams(location.search).get('step')==='businesses');
  await page.waitForFunction(()=>document.querySelector('.setup-progress strong')?.textContent.trim().startsWith('1'));
  check(fixtureSetupReviews.some(v=>v.step==='branding'),'Owner confirmation is saved by the backend');
  await textButton('Next step');await page.waitForFunction(()=>new URLSearchParams(location.search).get('step')==='employees');
  await page.click('.setup-step-card:nth-child(2)');await page.waitForFunction(()=>new URLSearchParams(location.search).get('step')==='businesses'&&document.querySelector('#setup-step-title')?.textContent==='Expense business tags');await page.waitForSelector('.setup-config-links a');await page.click('.setup-config-links a');
  await page.waitForSelector('.setup-return-link');check(new URL(page.url()).pathname==='/businesses','Setup opens the actual business configuration page');
  await page.click('.setup-return-link');await page.waitForSelector('.setup-current-step');await opsCheck('I reviewed these settings');await textButton('Review & continue');await page.waitForFunction(()=>document.querySelector('.setup-progress strong')?.textContent.trim().startsWith('2'));
  await page.goto(base+'/branding-settings');await page.waitForSelector('.setup-brand-form');await opsField('Company / brand name','Unlock Your Future Studio Updated');await textButton('Save branding');await page.waitForFunction(()=>document.querySelector('.uyf-brand-name')?.textContent==='Unlock Your Future Studio Updated');
  await page.goto(base+'/owner-setup?step=branding');await page.waitForSelector('.setup-state-review');
  check(await page.$eval('.setup-progress strong',e=>e.textContent.trim().startsWith('1')),'Changing branding invalidates its review while preserving other setup progress');
  await page.reload();await page.waitForSelector('.setup-step-complete');check(fixtureSetupReviews.length===2,'Setup progress survives a reload');
  current={...employee,access:emptyPolicy()};await page.goto(base+'/portal');await page.waitForSelector('.app-grid');
  check((await page.$$('.app-link[href="/owner-setup"],.app-link[href="/branding-settings"]')).length===0,'Owner configuration apps are hidden from employee portals');
  check(await page.$eval('.uyf-brand-name',e=>e.textContent==='Unlock Your Future Studio Updated'),'Employee portal uses the shared saved identity');
  current={...employee,access:{...emptyPolicy(),personal:['overview']}};await page.goto(base+'/portal/overview');await page.waitForSelector('.ux-personal-action-primary');await page.mouse.move(0,0);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.ux-personal-action-primary')).backgroundColor==='rgb(36, 85, 170)');
  check(await page.$eval('.ux-personal-action-primary span',e=>getComputedStyle(e).color==='rgb(255, 255, 255)'),'Employee daily action uses the shared accent and readable hint text');
  await page.goto(base+'/owner-setup');await page.waitForSelector('.access-empty');check(!(await page.$('.setup-workspace')),'Non-Owner direct setup URL has no configuration data');
  await page.goto(base+'/branding-settings');await page.waitForSelector('.access-empty');check(!(await page.$('.setup-brand-form')),'Non-Owner cannot open the branding editor');
  current=owner;await page.evaluate(()=>{localStorage.setItem('lm_hr_language','my');localStorage.setItem('uyf-theme','dark');});await page.setViewport({width:390,height:900});await page.goto(base+'/owner-setup?step=branding');await page.waitForSelector('.setup-current-step');await fits();
  check(await page.$eval('.setup-workspace',e=>e.textContent.includes('စစ်ဆေးရန်လို')),'Owner setup has Myanmar instructions and statuses');
  await page.screenshot({path:path.join(root,'access-browser-artifacts/owner-setup-myanmar-dark-mobile.png'),fullPage:false});console.log('AB_IMAGE_SETUP_MOBILE:'+await page.screenshot({type:'jpeg',quality:65,encoding:'base64'}));
  await page.goto(base+'/branding-settings');await page.waitForSelector('.setup-brand-form');await fits();await page.screenshot({path:path.join(root,'access-browser-artifacts/branding-myanmar-dark-mobile.png'),fullPage:false});console.log('AB_IMAGE_BRANDING_MOBILE:'+await page.screenshot({type:'jpeg',quality:65,encoding:'base64'}));

  // High-priority UI regressions: untrusted legacy HTML and explicit AI consent.
  current=owner;await page.evaluate(()=>localStorage.setItem('lm_hr_language','en'));await page.setViewport({width:1440,height:1000});
  await page.goto(base+'/user-manual');await page.waitForSelector('.manual-index');await textButton('Safe published policy');
  await page.waitForFunction(()=>document.querySelector('.manual-workspace b')?.textContent==='Safe policy text');
  check(await page.evaluate(()=>!window.__manualAttack&&!document.querySelector('.manual-workspace img[src="x"]')&&!document.querySelector('.manual-workspace a[href^="javascript:"]')),'Legacy manual HTML cannot execute browser scripts');
  check(await page.$eval('.manual-workspace b',el=>el.textContent==='Safe policy text'),'Manual rich text formatting is preserved');
  await page.goto(base+'/boss/chat');await page.waitForFunction(()=>[...document.querySelectorAll('span')].some(el=>el.textContent==='Confirm actions'));
  await page.evaluate(()=>[...document.querySelectorAll('span')].find(el=>el.textContent==='Confirm actions').click());
  await page.waitForSelector('section[aria-label="Actions awaiting your confirmation"] article');
  check(aiFixtureExecutions===0,'AI action remains a proposal while its details are displayed');
  check(await page.$eval('section[aria-label="Actions awaiting your confirmation"]',el=>el.textContent.includes('Reviewed KPI task')&&el.textContent.includes('Only execute after explicit confirmation')),'Owner sees the exact action details before confirmation');
  await textButton('Confirm & execute');await page.waitForFunction(()=>!document.querySelector('section[aria-label="Actions awaiting your confirmation"] article'));
  check(aiFixtureExecutions===1,'Only the explicit confirmation button executes the reviewed action');

  await exerciseSalaryBrowser({page,base,root,check,fits,textButton,owner,employee,setCurrent:value=>{current=value;},fixture:salaryFixture});
  await exerciseAuditBrowser({page,base,root,check,fits,textButton,owner,employee,setCurrent:value=>{current=value;},fixture:auditFixture});
  current=owner;await page.goto(base+'/dashboard');await page.waitForSelector('.demo-notice');check(await page.$eval('.demo-notice',el=>el.textContent.includes('DEMO')),'demo notice is visible in the management portal');
  await exerciseCompletionBrowser({page,base,root,check,fits,textButton,owner,employee,setCurrent:value=>{current=value;},fixture:completionFixture});
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    `${checks} browser checks passed. Desktop/mobile, EN/MM, light/dark, access controls, employee information, half-day leave, complete Expense, Probation and Warning forms, Today, Employee 360, business assignments, monthly review, reminders, shared branding and guided Owner setup.`,
  );
} catch(error) {
  await page.screenshot({path:path.join(root,'access-browser-artifacts/failure.png'),fullPage:false}).catch(()=>{});
  await writeFile(path.join(root,'access-browser-artifacts/failure.json'),JSON.stringify({error:error.stack,errors,url:page.url(),state:await page.evaluate(()=>({text:document.body.innerText,wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right})),hover:matchMedia('(hover:hover)').matches})).catch(()=>null)},null,2)).catch(()=>{});
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
