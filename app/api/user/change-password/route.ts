import { NextResponse } from "next/server";

import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { buildPasswordUpdatePayload, validatePasswordChange } from "@/services/buyer/settings";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  } | null;
  const validation = validatePasswordChange({
    currentPassword: body?.currentPassword || "",
    newPassword: body?.newPassword || "",
    confirmPassword: body?.confirmPassword || ""
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  reportOperationalEvent("buyer_password_update_triggered", "Buyer password update triggered.", {
    userId: user.id
  });

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: validation.value.currentPassword
  });

  if (verifyError) {
    reportOperationalError("buyer_password_current_password_failed", verifyError, {
      userId: user.id,
      supabaseErrorCode: verifyError.code || null
    });
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser(buildPasswordUpdatePayload(validation.value.newPassword));

  if (error) {
    reportOperationalError("buyer_password_update_failed", error, {
      userId: user.id,
      supabaseErrorCode: error.code || null
    });
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 500 });
  }

  return NextResponse.json({
    message: "Password updated."
  });
}
