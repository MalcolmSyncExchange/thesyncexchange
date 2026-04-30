import { NextResponse } from "next/server";

import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
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

  const { error } = await supabase.auth.signOut({ scope: "global" });

  if (error) {
    reportOperationalError("buyer_global_logout_failed", error, {
      userId: user.id,
      supabaseErrorCode: error.name || null
    });
    return NextResponse.json({ error: "Unable to log out from all devices right now." }, { status: 500 });
  }

  return NextResponse.json({
    message: "Logged out from all devices."
  });
}
