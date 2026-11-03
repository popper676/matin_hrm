import { auditContext } from "../middleware/auditContext.js";
import { employeeScope, can, personalCan } from "../../shared/accessPolicy.js";
const ZERO = "00000000-0000-0000-0000-000000000000";
const TABLES = {
  Employees: ["employees", "id", "profile"],
  employee_career_timeline: ["employees", "employee_id", "profile"],
  attendance_records: ["attendance", "employee_id", "attendance"],
  employee_daily_schedules: ["attendance", "employee_id", "attendance"],
  employee_rosters: ["attendance", "employee_id", "attendance"],
  qr_attendance_tokens: ["attendance", "employee_id", "checkin"],
  biometric_employees: ["attendance", "employee_id", "attendance"],
  biometric_logs: ["attendance", "employee_id", "attendance"],
  overtime_requests: ["attendance", "employee_id", "attendance"],
  Leave_Request: ["leave", "employee_id", "leave"],
  Leave_balances: ["leave", "employee_id", "leave"],
  payrolls: ["payroll", "employee_id", "payslips"],
  kpis: ["performance", "employee_id", "overview"],
  rewards_and_claims: ["rewards", "employee_id", "rewards"],
  employee_onboarding: ["onboarding", "employee_id", null],
  corporate_offboarding: ["offboarding", "employee_id", "exit-survey"],
  exit_interviews: ["offboarding", "employee_id", "exit-survey"],
  daily_sops: ["sops", "employee_id", "sops"],
  employee_documents: ["documents", "employee_id", "documents"],
  doc_approval_requests: ["documents", "employee_id", "documents"],
  employee_handovers: ["handovers", "outgoing_employee_id", "handovers"],
  peer_voting_records: ["voting", "nominee_id", "voting"],
  peer_votes: ["voting", "nominee_id", "voting"],
  boss_kpi_assignments: ["performance", "assigned_to_id", null],
};
const CHILDREN = {
  onboarding_assignments: ["employee_onboarding", "onboarding_id"],
  offboarding_case_tasks: ["corporate_offboarding", "offboarding_id"],
  handover_items: ["employee_handovers", "handover_id"],
  handover_attachments: ["employee_handovers", "handover_id"],
};
const MODULE_TABLES = {
  recruitment_candidates: "recruitment",
  job_openings: "recruitment",
  job_opening_files: "recruitment",
  sop_templates: "sops",
  onboarding_tasks: "onboarding",
  company_payroll_policy: "payroll",
  kpi_settings: "payroll",
  boss_chat_sessions: "owner",
  boss_chat_messages: "owner",
  hrm_manual_permissions: "owner",
  sys_audit_logs: "owner",
};
const IDENTITY = new Set([
  "national_id",
  "passport_no",
  "passport_number",
  "work_permit_no",
  "visa_type",
  "visa_expiry_date",
  "work_permit_expiry_date",
]);
const MONEY =
  /^(salary|salary_template|basic_salary|base_salary|net_salary|gross_salary|previous_salary|new_salary|total_paid|salary_history|bank_.*)$/;
export function redactData(value, user, personal = false) {
  if (user?.is_owner) return value;
  const ownSalary = personal && personalCan(user, "payslips");
  if (Array.isArray(value))
    return value.map((v) => redactData(v, user, personal));
  if (!value || typeof value !== "object") return value;
  if (
    !user.access.sensitive.salary &&
    !ownSalary &&
    (["HIRED", "SALARY_RAISE", "SALARY_CHANGE"].includes(value.event_type) || value.previous_salary != null || value.new_salary != null)
  )
    value = {
      ...value,
      description: null,
      ...(["SALARY_RAISE", "SALARY_CHANGE"].includes(value.event_type) || value.previous_salary != null || value.new_salary != null
        ? { title: "Salary update" }
        : {}),
    };
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => {
        if (
          k === "password_hash" ||
          k === "bot_linking_code" ||
          k === "telegram_chat_id"
        )
          return false;
        if (IDENTITY.has(k) && !user.access.sensitive.identity && !personal)
          return false;
        if (k.startsWith("bank_") && !user.access.sensitive.bank && !personal)
          return false;
        if (
          MONEY.test(k) &&
          !k.startsWith("bank_") &&
          !user.access.sensitive.salary &&
          !ownSalary
        )
          return false;
        return true;
      })
      .map(([k, v]) => [k, redactData(v, user, personal)]),
  );
}
function responseEmpty(init) {
  const h = new Headers(init.headers);
  return h.get("Accept")?.includes("vnd.pgrst.object")
    ? Response.json(
        { code: "PGRST116", message: "Record is unavailable" },
        { status: 406 },
      )
    : Response.json([], { headers: { "Content-Range": "0-0/0" } });
}
function denied(message = "This record is outside your access") {
  return Response.json({ code: "42501", message }, { status: 403 });
}
export async function scopedFetch(input, init = {}) {
  const req = auditContext.getStore();
  if (
    !req?.user ||
    req.user.is_owner ||
    !req.accessContext ||
    req.originalUrl?.startsWith("/api/auth/")
  )
    return globalThis.fetch(input, init);
  const user = req.user,
    personal = !!req.accessContext.personal;
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (!url.pathname.startsWith("/rest/v1/"))
    return globalThis.fetch(input, init);
  const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length)),
    method = init.method || "GET",
    read = ["GET", "HEAD"].includes(method);
  if (table.startsWith("rpc/"))
    return denied("Only the owner may run this operation");
  let def = TABLES[table],
    key,
    ids;
  if (CHILDREN[table]) {
    const [parent, column] = CHILDREN[table];
    def = TABLES[parent];
    key = column;
    const parentUrl = new URL(url);
    parentUrl.pathname = "/rest/v1/" + parent;
    parentUrl.search = "";
    parentUrl.searchParams.set("select", "id");
    const parentResponse = await scopedFetch(parentUrl.toString(), {
      headers: init.headers,
    });
    if (!parentResponse.ok) return parentResponse;
    ids = (await parentResponse.json()).map((row) => row.id);
  }
  if (def) {
    const [module, column, selfApp] = def;
    const financePayroll =
      module === "payroll" &&
      req.accessContext.module === "finance" &&
      user.access.sensitive.salary;
    const management = !personal && (can(user, module) || financePayroll);
    const selfAllowed =
      (selfApp && personalCan(user, selfApp)) ||
      (module === "handovers" && personalCan(user, "incoming"));
    if (
      module === "payroll" &&
      !user.access.sensitive.salary &&
      !(personal && personalCan(user, "payslips"))
    )
      return read ? responseEmpty(init) : denied("Salary access is required.");
    // Employee names are needed for permitted module forms, but still obey the employee scope.
    const lookup =
      table === "Employees" &&
      (!!req.accessContext.module || req.accessContext.lookup);
    if (lookup && !can(user, "employees")) {
      const allowed = new Set([
        "id",
        "Full_name",
        "employee_id",
        "Dept_id",
        "position_id",
        "Manager_id",
        "status",
        "employment_status",
        "default_shift_id",
        "hire_date",
      ]);
      if (
        user.access.sensitive.salary &&
        ["payroll", "finance"].includes(req.accessContext.module)
      )
        allowed.add("salary");
      const requested = url.searchParams.get("select") || "*";
      url.searchParams.set(
        "select",
        requested === "*"
          ? [...allowed].join(",")
          : requested
              .split(",")
              .filter((k) => allowed.has(k))
              .join(",") || "id",
      );
    }
    if (!management && !selfAllowed && !lookup)
      return read ? responseEmpty(init) : denied();
    if (!key) {
      key = column;
      ids = employeeScope(user, personal || (!management && !lookup));
    }
    if (ids !== null) {
      if (table === "employee_handovers")
        url.searchParams.append(
          "or",
          `(outgoing_employee_id.in.(${ids.length ? ids.join(",") : ZERO}),successor_employee_id.in.(${ids.length ? ids.join(",") : ZERO}))`,
        );
      else
        url.searchParams.append(
          key,
          `in.(${ids.length ? ids.join(",") : ZERO})`,
        );
      if (!read && init.body) {
        let records;
        try {
          records = JSON.parse(init.body);
        } catch {
          return denied("Invalid scoped write");
        }
        for (const record of Array.isArray(records) ? records : [records]) {
          if (key in record && !ids.includes(record[key])) return denied();
          if (method === "POST" && !(key in record))
            return denied("Employee association is required");
        }
      }
    }
  }
  if (MODULE_TABLES[table] && !can(user, MODULE_TABLES[table])) {
    const safeTaskLookup =
      table === "sop_templates" && personalCan(user, "sops");
    if (!safeTaskLookup && !(table === "sys_audit_logs" && !read))
      return read ? responseEmpty(init) : denied();
  }
  if (table === "sys_users") {
    const scope = employeeScope(user, personal);
    if (scope !== null)
      url.searchParams.append(
        "employee_id",
        `in.(${scope.length ? scope.join(",") : ZERO})`,
      );
    if (!read) {
      const employeeAction =
        req.accessContext.module === "employees" &&
        ["create", "edit", "delete"].includes(req.accessContext.action);
      if (!employeeAction) return denied("Account management is owner-only");
      let record;
      try {
        record = JSON.parse(init.body);
      } catch {
        return denied();
      }
      if (Array.isArray(record)) return denied();
      if (method === "POST") {
        const permitted = [
          "username",
          "password_hash",
          "role",
          "employee_id",
          "full_name",
        ];
        if (
          req.accessContext.action !== "create" ||
          record.role !== "employee" ||
          Object.keys(record).some((k) => !permitted.includes(k))
        )
          return denied("New accounts must use basic employee access");
      } else if (method === "PATCH") {
        if (
          Object.keys(record).some(
            (k) => !["username", "is_active"].includes(k),
          )
        )
          return denied("Only employee account synchronization is permitted");
        url.searchParams.append("is_owner", "eq.false");
      } else return denied("Account removal is owner-only");
    }
  }
  if (table.startsWith("hr_"))
    return denied("Use the dedicated access and approval endpoints");
  if (table === "system_notifications" && read)
    url.searchParams.append("recipient_user_id", "eq." + user.id);
  if (table === "system_notifications" && !read && method !== "POST")
    url.searchParams.append("recipient_user_id", "eq." + user.id);
  if (table === "announcements" && !can(user, "announcements"))
    url.searchParams.append("target_role", "eq.All");
  if (
    !read &&
    init.body &&
    ["Employees", "employee_career_timeline", "positions"].includes(table)
  ) {
    let rows;
    try {
      rows = JSON.parse(init.body);
    } catch {
      return denied();
    }
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      if (!user.access.sensitive.salary)
        for (const k of Object.keys(row).filter((k) => MONEY.test(k))) {
          if (row[k] != null)
            return denied("Salary access is required to change salary");
          delete row[k];
        }
      if (!personal && !user.access.sensitive.identity)
        for (const k of Object.keys(row).filter((k) => IDENTITY.has(k))) {
          if (row[k] != null) return denied("Identity access is required");
          delete row[k];
        }
    }
    init = { ...init, body: JSON.stringify(rows) };
  }
  const response = await globalThis.fetch(url.toString(), init);
  if (!response.ok || method === "HEAD") return response;
  const content = await response.text();
  if (!content)
    return new Response(null, {
      status: response.status,
      headers: response.headers,
    });
  try {
    const value = JSON.parse(content),
      headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(JSON.stringify(redactData(value, user, personal)), {
      status: response.status,
      headers,
    });
  } catch {
    return new Response(content, {
      status: response.status,
      headers: response.headers,
    });
  }
}
