import { systemDb } from "../shared/db/index.js";
import { WORKFLOWS, can } from "../../shared/accessPolicy.js";
import { loadAccount } from "./accessControl.js";
export async function prepareApproval(key, user) {
  const { data: setting, error } = await systemDb
    .from("hr_workflow_settings")
    .select("*")
    .eq("workflow_key", key)
    .maybeSingle();
  if (error) throw error;
  if (!setting?.enabled) return null;
  const def = WORKFLOWS[key],
    stages = [];
  for (const configured of setting.stages) {
    const id =
      configured.assignee_id === user.id
        ? configured.alternate_id
        : configured.assignee_id;
    if (!id || id === user.id)
      throw Object.assign(
        new Error(
          "An independent approver is needed. Ask the owner to set an alternate.",
        ),
        { status: 409 },
      );
    const account = await loadAccount(id);
    if (!can(account, def.module, configured.action))
      throw Object.assign(
        new Error(
          "An assigned approver no longer has permission. Ask the owner to update Approval Setup.",
        ),
        { status: 409 },
      );
    stages.push({
      ...configured,
      assignee_id: id,
      assignee_name: account.full_name || account.username,
    });
  }
  return stages;
}
export async function createApproval(
  key,
  user,
  resource,
  title,
  snapshot,
  stages,
) {
  if (!stages) return null;
  const { data, error } = await systemDb
    .from("hr_approval_requests")
    .insert({
      workflow_key: key,
      requester_id: user.id,
      employee_id: user.employee_id || null,
      resource_id: resource,
      title,
      snapshot,
      stages,
    })
    .select()
    .single();
  if (error) throw error;
  await systemDb
    .from("system_notifications")
    .insert({
      recipient_user_id: stages[0].assignee_id,
      title: "Approval needed",
      message: title,
      link_url: "/approvals",
    });
  return data;
}
export async function linkedApproval(key, id) {
  const { data, error } = await systemDb
    .from("hr_approval_requests")
    .select("id,status")
    .eq("workflow_key", key)
    .eq("resource_id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
