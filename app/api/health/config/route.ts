import { NextResponse } from "next/server";

import { getMissingCoreEnvKeys, getMissingOperationalEnvKeys } from "@/lib/env";

export async function GET() {
  const missingCore = getMissingCoreEnvKeys();
  const missingOperational = getMissingOperationalEnvKeys();
  const ok = missingCore.length === 0;

  return NextResponse.json(
    {
      ok,
      missingCore,
      missingOperational
    },
    { status: ok ? 200 : 500 }
  );
}
