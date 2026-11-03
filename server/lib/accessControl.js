import { systemDb } from "../shared/db/index.js";
import {
  can,
  personalCan,
  emptyPolicy,
  normalizePolicy,
  MODULES,
  PERSONAL_APPS,
  WORKFLOWS,
  hasApprovalAccess,
} from "../../shared/accessPolicy.js";
export { can, personalCan, MODULES, PERSONAL_APPS, WORKFLOWS, normalizePolicy };
export async function loadAccount(id) {
  const { data: user, error } = await systemDb
    .from("sys_users")
    .select(
      "id,username,role,full_name,employee_id,is_active,is_owner,password_hash",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    const e = new Error(
      "People & Access needs database migration 004. Run it in the existing HR project.",
    );
    e.status = 503;
    throw e;
  }
  if (!user?.is_active) {
    const e = new Error("Account is disabled or no longer exists");
    e.status = 401;
    throw e;
  }
  const { data: settings, error: policyError } = await systemDb
    .from("hr_access_policies")
    .select("policy,version")
    .eq("user_id", id)
    .maybeSingle();
  if (policyError)
    throw Object.assign(new Error("Unable to load current access settings"), {
      status: 503,
    });
  const password = user.password_hash;
  delete user.password_hash;
  return {
    ...user,
    access: settings?.policy || emptyPolicy(),
    access_version: settings?.version || 0,
    must_change_password: password?.startsWith("MUST_CHANGE:") || false,
  };
}
export function routePermission(req) {
  const p = new URL(req.originalUrl, "http://local").pathname.replace(
    /^\/api/,
    "",
  );
  const read = ["GET", "HEAD"].includes(req.method),
    method = req.method;
  const action = read
    ? "view"
    : method === "DELETE"
      ? "delete"
      : method === "POST"
        ? "create"
        : "edit";
  const owner = () => ({ owner: true });
  const module = (key, a = action) => ({ module: key, action: a });
  const personal = (app) => ({
    personal: app,
    action: read ? "view" : "submit",
  });
  const self = req.headers["x-hr-portal"] === "employee";
  if (p.startsWith("/auth/")) return { session: true };
  if (p === "/demo/status" && method === "GET") return { session: true };
  if (p === "/access/me") return { session: true };
  if (p.startsWith("/access")) return owner();
  if (p.startsWith("/owner-setup") || p.startsWith("/branding")) return owner();
  if (p.startsWith("/hr-operations")) return {file:true}; // Each operations endpoint enforces its own current permissions.
  if (p.startsWith("/warnings")) return {file:true}; // Dedicated subject, scope and assigned-reviewer checks.
  if (p.startsWith("/probation")) return {file:true}; // Dedicated subject/scope/assigned-reviewer checks.
  if (p.startsWith("/expense-forms")) return { file: true }; // Dedicated own/scope/assigned reviewer checks.
  if (p.startsWith("/employee-information")) return { file: true }; // Dedicated row and sensitive-field checks in the route.
  if (p.startsWith("/approvals")) return { approval: true };
  if (p.startsWith("/notifications")) return { session: true };
  if (p === "/portal") return { personal: "portal" };
  if (p.startsWith("/uploads")) return owner();
  if (p.startsWith("/hr-files/")) return { file: true };
  if ((p==='/payroll/salary-template' && method==='POST') || /^\/payroll\/salary-template\/[^/]+\/pay$/.test(p) || /^\/payroll\/[^/]+\/payslip$/.test(p)) return {file:true}; // Dedicated salary scope, action/version checks and own-payslip checks.
  if (
    /^\/boss\/users/.test(p) ||
    p === "/audit-logs" ||
    p.startsWith("/boss/chat") ||
    p === "/boss/overview" ||
    p.startsWith("/test/")
  )
    return owner();
  if (p.startsWith("/boss/announcements")) return module("announcements");
  if (p.startsWith("/boss/kpi")) return owner();
  if (p === "/dashboard") return module("analytics");
  if (p.startsWith("/employees")) {
    if(p.endsWith('/timeline')&&method==='POST')return module('employees','edit');
    if (/\/avatar$/.test(p)) return self ? personal("profile") : module("employees", "edit");
    if (p === "/employees/form-data" && read) return { lookup: true };
    if (p === "/employees/bulk-import" || p.endsWith("/hard")) return owner();
    return module("employees");
  }
  if (p.startsWith("/attendance")) {
    if (
      ["/attendance/photo-checkin", "/attendance/scan"].includes(
        p,
      ) &&
      method === "POST"
    )
      return personal("checkin");
    if (p.endsWith("/checkout") || (p === "/attendance" && method === "POST")) return module("attendance", "edit");
    if (p === "/attendance/available-shifts" && read)
      return personal("checkin");
    if (p.includes("/biometric")) return owner();
    if (p.includes("/approvals/")) return module("attendance", "approve");
    return module(
      "attendance",
      read ? "view" : method === "DELETE" ? "delete" : "edit",
    );
  }
  if (p.startsWith("/overtime")) {
    if (p.endsWith('/status'))return {file:true}; // Row-specific approval versus assigned employee acceptance.
    if (p === "/overtime/my" || p === "/overtime/request"&&self)
      return personal("attendance");
    return module(
      "attendance",
      read ? "view" : "edit",
    );
  }
  if(p==='/leave/calendar')return owner();
  if(p.startsWith('/leave/form/')){
    if(['/leave/form/meta','/leave/form/quote','/leave/form/submit'].includes(p))return personal('leave');
    return {file:true}; // Dedicated form, document, PDF and acknowledgment checks.
  }
  if (p.startsWith("/leave")) {
    if (p === "/leave/request") return personal("leave");
    if (self && read) return personal("leave");
    return module(
      "leave",
      p.endsWith("/status")
        ? "approve"
        : read
          ? "view"
          : method === "DELETE"
            ? "delete"
            : "edit",
    );
  }
  if (p.startsWith("/rewards")) {
    if (p === "/rewards" && (method === "POST" || self))
      return personal("rewards");
    return module(
      "rewards",
      /\/(approve|reject)$/.test(p) ? "approve" : action,
    );
  }
  if (
    /^\/payroll\/[^/]+$/.test(p) &&
    method === "PUT" &&
    req.body?.payment_status !== undefined &&
    !can(req.user, "payroll", "edit")
  )
    return module("payroll", "pay");
  if (p==="/payroll/workspace/calculate")return module("payroll","view");
  if (p==="/payroll/workspace/apply")return module("payroll",can(req.user,"payroll","edit")?"edit":"create");
  if (p.startsWith("/payroll"))
    return module(
      "payroll",
      action === "create" && /workspace|engine|policy/.test(p)
        ? "edit"
        : action,
    );
  if (p.startsWith("/recruitment") || p.startsWith("/job-openings"))
    return module(
      "recruitment",
      read
        ? "view"
        : method === "DELETE"
          ? "delete"
          : /\/convert$/.test(p)
            ? "create"
            : method === "POST" && /^\/(recruitment|job-openings)$/.test(p)
              ? "create"
              : "edit",
    );
  if (p.startsWith("/onboarding"))
    return module(
      "onboarding",
      read
        ? "view"
        : p === "/onboarding" && method === "POST"
          ? "create"
          : "edit",
    );
  if (p.startsWith("/offboarding"))
    return module(
      "offboarding",
      /\/(release|clearance)$/.test(p)
        ? "approve"
        : read
          ? "view"
          : p === "/offboarding" && method === "POST"
            ? "create"
            : "edit",
    );
  if (p === "/exit-survey") return personal("exit-survey");
  if (p.startsWith("/handover")) {
    if (self && p.endsWith("/acknowledge")) return personal("incoming");
    if (p.includes("/portal/") || self)
      return personal(p.includes("/incoming") ? "incoming" : "handovers");
    return module(
      "handovers",
      /\/(approve|waive)$/.test(p)
        ? "approve"
        : read
          ? "view"
          : /\/(create|coverage|return)$/.test(p)
            ? "create"
            : "edit",
    );
  }
  if (p.startsWith("/documents")) {
    if(p.startsWith('/documents/download/')||p.startsWith('/documents/generated/'))return {file:true};
    if (self && read) return personal("documents");
    return module(
      "documents",
      /\/(boss-sign|hr-sign)\//.test(p) ? "approve" : action,
    );
  }
  if (p.startsWith("/sops")) {
    if (self && (read || p.endsWith("/complete"))) return personal("sops");
    return module(
      "sops",
      p.endsWith("/bulk-delete") ? "delete" : p.includes("bulk") || p.endsWith("/complete") ? "edit" : action,
    );
  }
  if (p.startsWith("/peer-voting"))
    return self||p==='/peer-voting/colleagues'||p==='/peer-voting/submit' ? personal("voting") : module("voting", read ? "view" : "edit");
  if (p.startsWith("/birthdays")) return module("birthdays");
  if (p.startsWith("/departments")) return module("departments");
  if (p.startsWith("/positions"))
    return module(
      "positions",
      read
        ? "view"
        : p === "/positions" && method === "POST"
          ? "create"
          : action === "delete"
            ? "delete"
            : "edit",
    );
  if (p.startsWith("/org/")) return module("org-chart", read ? "view" : "edit");
  if (p.startsWith("/performance"))
    return p.endsWith("/sync-payroll")
      ? module("payroll", "edit")
      : module("performance");
  if (p.startsWith("/finance")) return module("finance");
  if (p.startsWith("/manual")) {
    if (p === "/manual/public" || p === "/manual/export/pdf")
      return personalCan(req.user, "manual")
        ? personal("manual")
        : module("manual");
    if (p.includes("/permissions") || method === "DELETE") return owner();
    return module("manual", read ? "view" : "edit");
  }
  return owner(); // New routes are private until explicitly classified.
}
export function authorizeRequest(req) {
  const rule = routePermission(req);
  req.accessContext = rule;
  if (req.user.is_owner || rule.session || rule.file) return true;
  if (rule.approval) return hasApprovalAccess(req.user);
  if (rule.lookup)
    return (
      Object.keys(req.user.access.modules).length > 0 ||
      personalCan(req.user, "profile")
    );
  if (rule.owner) return false;
  if (rule.personal)
    return rule.personal === "portal"
      ? req.user.access.personal.length > 0
      : personalCan(req.user, rule.personal);
  return can(req.user, rule.module, rule.action);
}
export const requestIsManager = (req) =>
  !!req.user?.is_owner || !!req.accessContext?.module;
