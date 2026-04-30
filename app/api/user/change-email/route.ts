import { NextResponse } from "next/server";

import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { buildEmailUpdatePayload, validateEmailChange } from "@/services/buyer/settings";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { newEmail?: string } | null;
  const validation = validateEmailChange({
    newEmail: body?.newEmail || ""
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  reportOperationalEvent("buyer_email_update_triggered", "Buyer email update triggered.", {
    userId: user.id,
    newEmailDomain: validation.value.newEmail.split("@")[1] || null
  });

  const { error } = await supabase.auth.updateUser(buildEmailUpdatePayload(validation.value.newEmail));

  if (error) {
    reportOperationalError("buyer_email_update_failed", error, {
      userId: user.id,
      supabaseErrorCode: error.code || null
    });
    return NextResponse.json({ error: "Unable to start the email change right now." }, { status: 500 });
  }

  return NextResponse.json({
    message: "Check your email to confirm the change."
  });
}
