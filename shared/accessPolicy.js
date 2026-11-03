// Shared permission vocabulary. Job titles and legacy roles never grant access.
export const MODULES = [
  ["today", "Today & follow-ups", "ယနေ့နှင့် ဆက်လက်ဆောင်ရွက်ရန်", ["view"]],
  ["monthly-review", "Monthly review", "လစဉ် စစ်ဆေးမှု", ["view"]],
  [
    "employees",
    "Employees",
    "ဝန်ထမ်းများ",
    ["view", "create", "edit", "approve", "delete"],
  ],
  [
    "attendance",
    "Attendance",
    "အလုပ်တက်မှတ်တမ်း",
    ["view", "edit", "approve", "delete"],
  ],
  ["leave", "Leave", "ခွင့်", ["view", "edit", "approve", "delete"]],
  ["payroll", "Payroll", "လစာ", ["view", "create", "edit", "pay", "delete"]],
  [
    "rewards",
    "Expenses & claims",
    "အသုံးစရိတ်နှင့် တောင်းဆိုမှု",
    ["view", "create", "edit", "approve", "pay", "delete"],
  ],
  [
    "recruitment",
    "Recruitment",
    "အလုပ်ခေါ်ယူမှု",
    ["view", "create", "edit", "delete"],
  ],
  [
    "onboarding",
    "Onboarding",
    "ဝန်ထမ်းအသစ်လက်ခံခြင်း",
    ["view", "create", "edit"],
  ],
  [
    "offboarding",
    "Offboarding",
    "အလုပ်ထွက်လုပ်ငန်းစဉ်",
    ["view", "create", "edit", "approve"],
  ],
  [
    "documents",
    "Documents",
    "စာရွက်စာတမ်းများ",
    ["view", "create", "edit", "approve", "delete"],
  ],
  ["performance", "Performance", "လုပ်ဆောင်ရည်", ["view", "approve"]],
  ["warnings", "Warning letters", "သတိပေးစာများ", ["view", "create", "edit", "approve"]],
  ["probation", "Probation", "အစမ်းခန့် အကဲဖြတ်မှု", ["view", "create", "edit", "approve"]],
  [
    "sops",
    "Daily tasks",
    "နေ့စဉ်လုပ်ငန်းများ",
    ["view", "create", "edit", "delete"],
  ],
  [
    "handovers",
    "Handovers",
    "တာဝန်လွှဲပြောင်းမှု",
    ["view", "create", "edit", "approve"],
  ],
  [
    "departments",
    "Departments",
    "ဌာနများ",
    ["view", "create", "edit", "delete"],
  ],
  ["positions", "Positions", "ရာထူးများ", ["view", "create", "edit", "delete"]],
  ["org-chart", "Organization chart", "ဖွဲ့စည်းပုံ", ["view", "edit"]],
  ["voting", "Peer feedback", "အဖွဲ့ဝင်အကဲဖြတ်ချက်", ["view"]],
  ["birthdays", "Birthdays", "မွေးနေ့များ", ["view"]],
  [
    "announcements",
    "Announcements",
    "ကြေညာချက်များ",
    ["view", "create", "edit", "delete"],
  ],
  ["finance", "Finance overview", "ငွေကြေးခြုံငုံမြင်ကွင်း", ["view"]],
  ["analytics", "Overview", "ခြုံငုံမြင်ကွင်း", ["view"]],
  ["manual", "HR manual", "HR လမ်းညွှန်", ["view", "edit"]],
];
export const PERSONAL_APPS = [
  "profile",
  "checkin",
  "attendance",
  "leave",
  "payslips",
  "documents",
  "sops",
  "handovers",
  "overview",
  "qr",
  "incoming",
  "rewards",
  "voting",
  "manual",
  "exit-survey",
  "approvals",
  "probation",
  "warnings",
];
export const WORKFLOWS = {
  employee_information: {
    label: "Employee information",
    my: "ဝန်ထမ်းအချက်အလက်",
    module: "employees",
    stages: [
      ["hr_review", "HR review", "approve"],
      ["final_approval", "Authorized approval", "approve"],
    ],
  },
  leave: {
    label: "Leave request",
    my: "ခွင့်တောင်းဆိုမှု",
    module: "leave",
    stages: [
      ["manager", "Manager / Supervisor", "approve"],
      ["hr", "HR final approval", "approve"],
    ],
  },
  expense: {
    label: "Expense request",
    my: "အသုံးစရိတ်တောင်းဆိုမှု",
    module: "rewards",
    stages: [
      ["department", "Department approval", "approve"],
      ["agm", "AGM review", "approve"],
      ["coo", "COO approval", "approve"],
      ["finance", "Finance payment", "pay"],
    ],
  },
  probation: {
    label: "Probation evaluation",
    my: "အစမ်းခန့်အကဲဖြတ်မှု",
    module: "probation",
    stages: [
      ["manager", "Manager / Supervisor", "approve"],
      ["department_head", "Department head", "approve"],
      ["hr", "HR final decision", "approve"],
    ],
  },
  warning: {
    label: "Warning letter",
    my: "သတိပေးစာ",
    module: "warnings",
    stages: [
      ["supervisor", "Supervisor / Manager", "approve"],
      ["hr", "HR / Authorized approver", "approve"],
    ],
  },
};
export const emptyPolicy = () => ({
  modules: {},
  personal: [...PERSONAL_APPS],
  scope: "own",
  employee_ids: [],
  sensitive: { salary: false, bank: false, identity: false },
});
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normalizePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid access settings");
  if (!["own", "selected", "all"].includes(value.scope))
    throw new Error("Choose a valid employee scope");
  if (
    !Array.isArray(value.personal) ||
    value.personal.some((k) => !PERSONAL_APPS.includes(k))
  )
    throw new Error("Invalid personal app");
  const employee_ids = [...new Set(value.employee_ids || [])];
  if (employee_ids.length > 1000 || employee_ids.some((id) => !UUID.test(id)))
    throw new Error("Invalid employee selection");
  if (value.scope === "selected" && !employee_ids.length)
    throw new Error("Select at least one employee");
  const modules = {};
  for (const [key, actions] of Object.entries(value.modules || {})) {
    const def = MODULES.find((m) => m[0] === key);
    if (
      !def ||
      !Array.isArray(actions) ||
      actions.some((a) => !def[3].includes(a))
    )
      throw new Error("Invalid app permission");
    if (actions.length && !actions.includes("view"))
      throw new Error("View is required for enabled actions");
    if (actions.length) modules[key] = [...new Set(actions)];
  }
  if (modules.employees?.includes("create") && value.scope !== "all")
    throw new Error("Creating employees requires the All employees scope.");
  if (
    (modules.payroll?.length || modules.finance?.length) &&
    value.sensitive?.salary !== true
  )
    throw new Error(
      "Payroll and Finance access require the Salary field permission.",
    );
  return {
    modules,
    personal: [...new Set(value.personal)],
    scope: value.scope,
    employee_ids: value.scope === "selected" ? employee_ids : [],
    sensitive: Object.fromEntries(
      ["salary", "bank", "identity"].map((k) => [
        k,
        value.sensitive?.[k] === true,
      ]),
    ),
  };
}
export function can(user, module, action = "view") {
  return (
    !!user?.is_owner || !!user?.access?.modules?.[module]?.includes(action)
  );
}
export function personalCan(user, app) {
  return !!user?.is_owner || !!user?.access?.personal?.includes(app);
}
export function hasManagement(user) {
  return (
    !!user?.is_owner ||
    Object.values(user?.access?.modules || {}).some((a) => a.includes("view"))
  );
}
export function hasApprovalAccess(user) {
  return (
    personalCan(user, "approvals") ||
    Object.values(user?.access?.modules || {}).some(
      (actions) => actions.includes("approve") || actions.includes("pay"),
    )
  );
}
export function employeeScope(user, personal = false) {
  if (user?.is_owner && !personal) return null;
  if (personal || user?.access?.scope === "own")
    return user?.employee_id ? [user.employee_id] : [];
  return user?.access?.scope === "all"
    ? null
    : user?.access?.employee_ids || [];
}
export const ROUTE_MODULES = [
  ["/today", "today"],
  ["/monthly-review", "monthly-review"],
  ["/hr-operations/expense", "rewards"],
  ["/warnings", "warnings"],
  ["/employees", "employees"],
  ["/attendance", "attendance"],
  ["/leave", "leave"],
  ["/payroll/rewards", "rewards"],
  ["/payroll", "payroll"],
  ["/recruitment", "recruitment"],
  ["/onboarding", "onboarding"],
  ["/offboarding", "offboarding"],
  ["/documents", "documents"],
  ["/performance/probation", "probation"],
  ["/performance", "performance"],
  ["/sops", "sops"],
  ["/handovers", "handovers"],
  ["/departments", "departments"],
  ["/positions", "positions"],
  ["/org-chart", "org-chart"],
  ["/peer-voting", "voting"],
  ["/birthdays", "birthdays"],
  ["/announcements", "announcements"],
  ["/finance", "finance"],
  ["/insights", "analytics"],
  ["/user-manual", "manual"],
];
export const PERSONAL_ROUTES = [
  ["/portal/warnings", "warnings"],
  ["/portal/attendance/photo", "checkin"],
  ["/portal/checkin", "checkin"],
  ["/portal/qr", "qr"],
  ["/portal/attendance", "attendance"],
  ["/portal/leaves", "leave"],
  ["/portal/payslips", "payslips"],
  ["/portal/documents", "documents"],
  ["/portal/rewards", "rewards"],
  ["/portal/probation", "probation"],
  ["/portal/profile", "profile"],
  ["/portal/sops", "sops"],
  ["/portal/handover/incoming", "incoming"],
  ["/portal/handover/outgoing", "handovers"],
  ["/portal/vot", "voting"],
  ["/portal/exit-survey", "exit-survey"],
  ["/portal/overview", "overview"],
];
export function pageAllowed(user, path) {
  if (!user) return false;
  if (user.is_owner) return true;
  if (path === "/portal") return true;
  if (path === "/approvals") return hasApprovalAccess(user);
  if (path === "/dashboard") return hasManagement(user);
  if (path.startsWith("/payroll/workspace"))
    return can(user, "payroll", "edit") || can(user, "payroll", "create");
  if (path.startsWith("/portal/")) {
    const item = PERSONAL_ROUTES.find(([p]) => path.startsWith(p));
    return !!item && personalCan(user, item[1]);
  }
  if (path === "/user-manual" && personalCan(user, "manual")) return true;
  if (/^\/employees\/[^/]+\/edit$/.test(path))
    return can(user, "employees", "edit");
  const item = ROUTE_MODULES.find(
    ([p]) => path === p || path.startsWith(p + "/"),
  );
  return !!item && can(user, item[1]);
}
