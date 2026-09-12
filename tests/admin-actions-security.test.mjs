import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminActionsSource = readFileSync(new URL("../services/admin/actions.ts", import.meta.url), "utf8");
const complianceActionSource =
  adminActionsSource.match(/export async function updateComplianceFlagStatusAction[\s\S]*?\nexport async function createComplianceFlagAction/)?.[0] || "";

function indexOfOrFail(source, pattern, label) {
  const index = typeof pattern === "string" ? source.indexOf(pattern) : source.search(pattern);
  assert.notEqual(index, -1, `${label} was not found`);
  return index;
}

test("compliance flag status update authorizes admin before privileged mutation", () => {
  const validationIndex = indexOfOrFail(complianceActionSource, /status !== "open" && status !== "resolved"/, "status validation");
  const adminCheckIndex = indexOfOrFail(complianceActionSource, "const actorId = await requireAdminActorId();", "admin authorization");
  const privilegedClientIndex = indexOfOrFail(complianceActionSource, "const supabase = createPrivilegedSupabaseClient();", "privileged client creation");
  const mutationIndex = indexOfOrFail(complianceActionSource, /\.from\("admin_flags"\)\s*\.update/s, "admin_flags mutation");

  assert.ok(validationIndex < adminCheckIndex, "status validation should happen before admin authorization");
  assert.ok(adminCheckIndex < privilegedClientIndex, "admin authorization should happen before privileged client use");
  assert.ok(adminCheckIndex < mutationIndex, "admin authorization should happen before admin_flags mutation");
});

test("compliance flag status update only accepts open or resolved", () => {
  assert.match(complianceActionSource, /if \(status !== "open" && status !== "resolved"\) \{/);
  assert.match(complianceActionSource, /throw new Error\("Invalid compliance flag status\."\);/);
  assert.doesNotMatch(complianceActionSource, /status as Database\["public"\]\["Enums"\]\["flag_status"\][\s\S]*requireAdminActorId\(\)/);
});

test("compliance flag audit log is written only after successful status mutation", () => {
  const updateResultIndex = indexOfOrFail(complianceActionSource, "const updateResult = await supabase", "captured update result");
  const errorCheckIndex = indexOfOrFail(complianceActionSource, "if (updateResult.error)", "update error check");
  const throwIndex = indexOfOrFail(complianceActionSource, "throw new Error(updateResult.error.message);", "update error throw");
  const auditIndex = indexOfOrFail(complianceActionSource, "appendTrackAuditLog", "audit log append");

  assert.ok(updateResultIndex < errorCheckIndex, "update result should be checked");
  assert.ok(errorCheckIndex < throwIndex, "update errors should throw");
  assert.ok(throwIndex < auditIndex, "audit log should happen after successful mutation path");
});

test("compliance flag action keeps authorization database-backed without metadata fallbacks", () => {
  assert.match(complianceActionSource, /requireAdminActorId\(\)/);
  assert.doesNotMatch(complianceActionSource, /user_metadata\?\.role|user_metadata\.role/);
  assert.doesNotMatch(complianceActionSource, /app_metadata\?\.role|app_metadata\.role/);
});
