import { MarketingShell } from "@/components/layout/marketing-shell";
import { Homepage } from "@/components/marketing/homepage";

export default function RootPage() {
  return (
    <MarketingShell>
      <Homepage />
    </MarketingShell>
  );
}
