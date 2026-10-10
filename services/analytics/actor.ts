import "server-only";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { validActor, type Actor, type EventName, type EventProperties } from "@/lib/analytics/schema";
import { analyticsConfig, captureEvent } from "./server";

// No metadata or role inferred from artist/buyer profile existence is accepted.
export async function getAnalyticsActor(): Promise<Actor | null> {
  try {
    const db = await createServerSupabaseClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return null;
    const { data, error: profileError } = await db.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
    const actor = { id: user.id, role: data?.role ?? "unassigned" } as Actor;
    return !profileError && data && validActor(actor) ? actor : null;
  } catch { return null; }
}

export async function captureForUser<E extends Exclude<EventName, "purchase_verified" | "signup_completed">>(
  expectedUserId: string, event: E, properties: EventProperties<E>, dedupeKey?: string
) {
  if (!analyticsConfig()) return;
  const actor = await getAnalyticsActor();
  if (actor?.id !== expectedUserId) return;
  const role = actor.role;
  if (event.startsWith("submission_") && role !== "artist") return;
  if (["license_selected", "checkout_started"].includes(event) && role !== "buyer") return;
  if (event.startsWith("onboarding_") && role !== "artist" && role !== "buyer") return;
  await captureEvent(actor, event, properties, dedupeKey);
}

// The only caller supplies the Auth signUp response ID, after ensureAppUser succeeds.
// Signup may require email confirmation, so it need not yet have a session cookie.
export async function capturePersistedSignup(userId: string, confirmationRequired: boolean) {
  if (!analyticsConfig()) return;
  try {
    const db = createAdminSupabaseClient();
    if (!db) return;
    const { data, error } = await db.from("user_profiles").select("role").eq("id", userId).maybeSingle();
    const actor = { id: userId, role: data?.role ?? "unassigned" } as Actor;
    if (!error && data && validActor(actor)) await captureEvent(actor, "signup_completed", {
      confirmation_required: confirmationRequired
    }, `signup:${userId}`);
  } catch { /* Analytics never changes the authentication outcome. */ }
}
