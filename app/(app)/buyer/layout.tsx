import { BuyerDiscoveryProvider } from "@/components/audio/buyer-discovery-provider";
import type { ReactNode } from "react";

import { BuyerWorkspaceShell } from "@/components/artist/artist-workspace-shell";
import { requireSession } from "@/services/auth/session";

export const dynamic = "force-dynamic";

export default async function BuyerLayout({ children }: { children: ReactNode }) {
  const user = await requireSession("buyer");
  return <BuyerDiscoveryProvider><BuyerWorkspaceShell user={user}>{children}</BuyerWorkspaceShell></BuyerDiscoveryProvider>;
}
