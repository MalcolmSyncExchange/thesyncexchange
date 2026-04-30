import { NextResponse } from "next/server";

import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { assertAuthenticatedBuyerSettingsUser, buildTeamInviteInsert, validateTeamInvite } from "@/services/buyer/settings";
import { createServerSupabaseClient } from "@/services/supabase/server";

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const auth = assertAuthenticatedBuyerSettingsUser(user);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => null)) as { email?: string; role?: string } | null;
  const validation = validateTeamInvite({
    email: body?.email,
    role: body?.role
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  reportOperationalEvent("buyer_team_invite_create_triggered", "Buyer team invite creation triggered.", {
    userId: auth.user.id,
    inviteEmailDomain: validation.value.email.split("@")[1] || null,
    role: validation.value.role
  });

  const { data, error } = await supabase
    .from("buyer_team_invites")
    .insert(
      buildTeamInviteInsert({
        buyerUserId: auth.user.id,
        invitedBy: auth.user.id,
        invite: validation.value
      })
    )
    .select("id, email, role, status, created_at")
    .single();

  if (error) {
    reportOperationalError("buyer_team_invite_create_failed", error, {
      userId: auth.user.id
    });
    return NextResponse.json({ error: "Unable to create invite right now." }, { status: 500 });
  }

  return NextResponse.json({
    invite: data
  });
}
