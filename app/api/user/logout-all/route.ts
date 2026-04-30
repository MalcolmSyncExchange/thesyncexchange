import { NextResponse } from "next/server";

import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { buildGlobalSignOutOptions } from "@/services/buyer/settings";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function POST() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  reportOperationalEvent("buyer_global_logout_triggered", "Buyer requested logout from all devices.", {
    userId: user.id
  });

  const { error } = await supabase.auth.signOut(buildGlobalSignOutOptions());

  if (error) {
    reportOperationalError("buyer_global_logout_failed", error, {
      userId: user.id,
      supabaseErrorCode: error.name || null
    });
    return NextResponse.json({ error: "Unable to log out from all devices right now." }, { status: 500 });
  }

  return NextResponse.json({
    message: "Logged out from all devices.",
    redirectTo: "/login?success=Logged%20out%20from%20all%20sessions."
  });
}
