/** Bind privileged bootstrap to an operator-verified identity, never email alone. */
export function assertAdminBootstrapIdentity({ existingUser, expectedUserId, email, settingName }) {
  const expected = String(expectedUserId || "").trim().toLowerCase();
  if (expected && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(expected)) {
    throw new Error(`${settingName} must be the verified Auth user UUID.`);
  }
  if (!existingUser) {
    if (expected) throw new Error(`${settingName} was supplied, but the expected account was not found. No admin was created.`);
    return; // A new account will be created with the operator's password.
  }
  if (!expected || existingUser.id?.toLowerCase() !== expected) {
    throw new Error(`Refusing email-only admin promotion. Verify account ownership and set ${settingName} to the intended Auth user UUID.`);
  }
  if (String(existingUser.email || "").trim().toLowerCase() !== String(email).trim().toLowerCase()) {
    throw new Error("The configured admin email does not match the verified Auth identity.");
  }
  if (!existingUser.email_confirmed_at) {
    throw new Error("The existing admin identity must have a confirmed email before bootstrap. No account was changed.");
  }
}
