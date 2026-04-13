import { NextResponse } from "next/server";

import { env, getMissingCoreEnvKeys, getMissingOperationalEnvKeys, hasSupabaseEnv } from "@/lib/env";
import { storageBuckets } from "@/lib/storage";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { isMissingColumnError, isMissingRelationError, isSchemaCacheTableError } from "@/services/supabase/schema-compat";

type CapabilityStatus = "available" | "degraded" | "blocked";
type ReadinessStatus = "healthy" | "degraded" | "blocked";
type TableDiagnosticStatus = "visible" | "missing_or_stale" | "schema_exposure_blocked" | "unknown";
type RecommendedManualAction = "none" | "apply_foundation_bootstrap" | "apply_follow_up_bundle" | "verify_project_exposure";

type CapabilityReport = {
  status: CapabilityStatus;
  summary: string;
};

type TableDiagnostic = {
  status: TableDiagnosticStatus;
  summary: string;
  manualSqlCheckRequired: boolean;
};

export async function GET() {
  const missingCore = getMissingCoreEnvKeys();
  const missingOperational = getMissingOperationalEnvKeys();
  const notes: string[] = [];

  const storage = {
    serviceRoleReady: Boolean(env.supabaseServiceRoleKey),
    bucketsPresent: false,
    missingBuckets: [] as string[]
  };

  const postgrest = {
    baselineTablesVisible: false,
    status: "blocked" as ReadinessStatus,
    summary: "Supabase service-role access is unavailable."
  };
  const foundationDiagnostics: Record<"tracks" | "license_types", TableDiagnostic> = {
    tracks: {
      status: "unknown",
      summary: "tracks visibility is unavailable until Supabase service-role access succeeds.",
      manualSqlCheckRequired: false
    },
    license_types: {
      status: "unknown",
      summary: "license_types visibility is unavailable until Supabase service-role access succeeds.",
      manualSqlCheckRequired: false
    }
  };
  const tableDiagnostics: Record<"user_profiles" | "orders" | "order_activity_log", TableDiagnostic> = {
    user_profiles: {
      status: "unknown",
      summary: "user_profiles visibility is unavailable until Supabase service-role access succeeds.",
      manualSqlCheckRequired: false
    },
    orders: {
      status: "unknown",
      summary: "orders visibility is unavailable until Supabase service-role access succeeds.",
      manualSqlCheckRequired: false
    },
    order_activity_log: {
      status: "unknown",
      summary: "order_activity_log visibility is unavailable until Supabase service-role access succeeds.",
      manualSqlCheckRequired: false
    }
  };

  const capabilities: Record<
    "avatarPathSupport" | "fulfillmentMetadataSupport" | "agreementMetadataSupport" | "orderActivitySupport",
    CapabilityReport
  > = {
    avatarPathSupport: {
      status: "blocked",
      summary: "Avatar storage persistence cannot be verified yet."
    },
    fulfillmentMetadataSupport: {
      status: "blocked",
      summary: "Order fulfillment metadata cannot be verified yet."
    },
    agreementMetadataSupport: {
      status: "blocked",
      summary: "Agreement artifact metadata cannot be verified yet."
    },
    orderActivitySupport: {
      status: "blocked",
      summary: "Order activity auditing cannot be verified yet."
    }
  };
  let recommendedManualAction: RecommendedManualAction = "none";
  let recommendedManualBundle:
    | "/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql"
    | "/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-storage-fulfillment-avatar.sql"
    | null = null;

  if (!hasSupabaseEnv) {
    notes.push("Supabase public environment variables are missing, so live auth/data/storage flows are unavailable.");
  }

  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    notes.push("SUPABASE_SERVICE_ROLE_KEY is missing, so readiness can only report environment-level status.");
  } else {
    const bucketResult = await supabase.storage.listBuckets();
    if (bucketResult.error) {
      notes.push(`Unable to inspect Supabase Storage buckets: ${bucketResult.error.message}`);
    } else {
      const bucketNames = new Set((bucketResult.data || []).map((bucket) => bucket.name));
      const requiredBuckets = Object.values(storageBuckets);
      storage.missingBuckets = requiredBuckets.filter((bucket) => !bucketNames.has(bucket));
      storage.bucketsPresent = storage.missingBuckets.length === 0;

      if (storage.missingBuckets.length) {
        notes.push(`Storage buckets still missing: ${storage.missingBuckets.join(", ")}.`);
      }
    }

    const baselineTracks = await supabase.from("tracks").select("id").limit(1);
    const baselineLicenses = await supabase.from("license_types").select("id").limit(1);
    const baselineErrors = [baselineTracks.error, baselineLicenses.error].filter(Boolean);

    if (!baselineTracks.error && !baselineLicenses.error) {
      postgrest.baselineTablesVisible = true;
      postgrest.status = "healthy";
      postgrest.summary = "Core public tables are visible through PostgREST.";
    } else if (baselineErrors.some((error) => isSchemaCacheTableError(error, ["tracks", "license_types"]))) {
      postgrest.status = "blocked";
      postgrest.summary =
        "Core public tables are not visible through PostgREST. This usually means the service-role key targets the wrong project, the `public` schema is not exposed, or the API schema cache has not refreshed after migrations.";
      notes.push(postgrest.summary);
    } else {
      postgrest.status = "degraded";
      postgrest.summary =
        "Core public-table visibility could not be confirmed cleanly. Verify the connected Supabase project and inspect the SQL editor checks in the manual apply guide.";
      notes.push(postgrest.summary);
    }

    foundationDiagnostics.tracks = diagnoseTableAccess({
      baselineVisible: postgrest.baselineTablesVisible,
      tableName: "tracks",
      migrationHint: "0001/0008",
      error: baselineTracks.error
    });
    foundationDiagnostics.license_types = diagnoseTableAccess({
      baselineVisible: postgrest.baselineTablesVisible,
      tableName: "license_types",
      migrationHint: "0001/0008",
      error: baselineLicenses.error
    });

    const userProfilesTable = await supabase.from("user_profiles").select("id").limit(1);
    const avatarColumn = await supabase.from("user_profiles").select("avatar_path").limit(1);
    const ordersTable = await supabase.from("orders").select("id,status").limit(1);
    const orderMetadata = await supabase
      .from("orders")
      .select("agreement_path, agreement_generation_error, agreement_content_type, agreement_size_bytes, last_webhook_event_id")
      .limit(1);
    const orderActivity = await supabase.from("order_activity_log").select("id").limit(1);

    tableDiagnostics.user_profiles = diagnoseTableAccess({
      baselineVisible: postgrest.baselineTablesVisible,
      tableName: "user_profiles",
      migrationHint: "0008",
      error: userProfilesTable.error
    });
    tableDiagnostics.orders = diagnoseTableAccess({
      baselineVisible: postgrest.baselineTablesVisible,
      tableName: "orders",
      migrationHint: "0008/0009",
      error: ordersTable.error
    });
    tableDiagnostics.order_activity_log = diagnoseTableAccess({
      baselineVisible: postgrest.baselineTablesVisible,
      tableName: "order_activity_log",
      migrationHint: "0010",
      error: orderActivity.error
    });

    capabilities.avatarPathSupport = evaluateAvatarCapability({
      baselineVisible: postgrest.baselineTablesVisible,
      userProfilesTableError: userProfilesTable.error,
      avatarColumnError: avatarColumn.error
    });

    capabilities.fulfillmentMetadataSupport = evaluateFulfillmentCapability({
      baselineVisible: postgrest.baselineTablesVisible,
      ordersTableError: ordersTable.error,
      orderMetadataError: orderMetadata.error
    });

    capabilities.agreementMetadataSupport = evaluateAgreementCapability(capabilities.fulfillmentMetadataSupport);

    capabilities.orderActivitySupport = evaluateOrderActivityCapability({
      baselineVisible: postgrest.baselineTablesVisible,
      ordersTableError: ordersTable.error,
      activityError: orderActivity.error
    });

    for (const capability of Object.values(capabilities)) {
      if (capability.status !== "available") {
        notes.push(capability.summary);
      }
    }

    const foundationMissing =
      foundationDiagnostics.tracks.status !== "visible" || foundationDiagnostics.license_types.status !== "visible";
    const followUpMissing =
      tableDiagnostics.user_profiles.status !== "visible" ||
      tableDiagnostics.orders.status !== "visible" ||
      tableDiagnostics.order_activity_log.status !== "visible" ||
      capabilities.avatarPathSupport.status !== "available" ||
      capabilities.fulfillmentMetadataSupport.status !== "available";

    if (foundationMissing) {
      recommendedManualAction = "apply_foundation_bootstrap";
      recommendedManualBundle =
        "/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql";
      notes.push(
        "Foundational app tables are not visible. Apply the full foundation bootstrap bundle first. If readiness is still blocked afterward, then verify project credentials, schema exposure, and PostgREST cache health."
      );
    } else if (followUpMissing) {
      recommendedManualAction = "apply_follow_up_bundle";
      recommendedManualBundle =
        "/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-storage-fulfillment-avatar.sql";
    } else {
      recommendedManualAction = "none";
      recommendedManualBundle = null;
    }
  }

  const blockedFeatures = Object.entries(capabilities)
    .filter(([, value]) => value.status === "blocked")
    .map(([key]) => key);
  const degradedFeatures = Object.entries(capabilities)
    .filter(([, value]) => value.status === "degraded")
    .map(([key]) => key);

  const status: ReadinessStatus =
    missingCore.length > 0 || !storage.serviceRoleReady || blockedFeatures.length > 0 || !storage.bucketsPresent
      ? "blocked"
      : degradedFeatures.length > 0 || missingOperational.length > 0
        ? "degraded"
        : "healthy";

  return NextResponse.json(
    {
      status,
      ok: status === "healthy",
      manualSupabaseActionRequired: status !== "healthy",
      missingCore,
      missingOperational,
      postgrest,
      foundationDiagnostics,
      tableDiagnostics,
      storage,
      capabilities,
      recommendedManualAction,
      recommendedManualBundle,
      blockedFeatures,
      degradedFeatures,
      notes
    },
    { status: status === "healthy" ? 200 : status === "degraded" ? 200 : 503 }
  );
}

function diagnoseTableAccess({
  baselineVisible,
  tableName,
  migrationHint,
  error
}: {
  baselineVisible: boolean;
  tableName: string;
  migrationHint: string;
  error: { message?: string } | null;
}): TableDiagnostic {
  if (!error) {
    return {
      status: "visible",
      summary: `public.${tableName} is visible through PostgREST.`,
      manualSqlCheckRequired: false
    };
  }

  if (isMissingRelationError(error, tableName) || isSchemaCacheTableError(error, tableName)) {
    if (baselineVisible) {
      return {
        status: "missing_or_stale",
        summary: `public.${tableName} is missing from the current PostgREST view while baseline public tables are visible. Run the manual to_regclass check to distinguish whether migration ${migrationHint} is missing or the API schema cache is stale.`,
        manualSqlCheckRequired: true
      };
    }

    return {
      status: "schema_exposure_blocked",
      summary: `public.${tableName} is not visible and baseline public tables are also unavailable. Verify project credentials, public-schema API exposure, and PostgREST health before assuming migration ${migrationHint} is the problem.`,
      manualSqlCheckRequired: false
    };
  }

  return {
    status: "unknown",
    summary: `Unable to diagnose public.${tableName}: ${String(error.message || "unknown error")}`,
    manualSqlCheckRequired: false
  };
}

function evaluateAvatarCapability({
  baselineVisible,
  userProfilesTableError,
  avatarColumnError
}: {
  baselineVisible: boolean;
  userProfilesTableError: { message?: string } | null;
  avatarColumnError: { message?: string } | null;
}): CapabilityReport {
  if (!userProfilesTableError && !avatarColumnError) {
    return {
      status: "available",
      summary: "user_profiles and avatar_path are available."
    };
  }

  if (isMissingColumnError(avatarColumnError, "avatar_path")) {
    return {
      status: "degraded",
      summary: "Migration 0012 is not applied yet; avatar uploads fall back to avatar_url-only compatibility mode."
    };
  }

  if (isMissingRelationError(userProfilesTableError, "user_profiles")) {
    return {
      status: baselineVisible ? "blocked" : "blocked",
      summary:
        "public.user_profiles is not reachable through PostgREST. Confirm migration 0008 is applied, the project credentials are correct, and the API exposes the public schema."
    };
  }

  if (isSchemaCacheTableError(userProfilesTableError, "user_profiles")) {
    return {
      status: baselineVisible ? "degraded" : "blocked",
      summary:
        baselineVisible
          ? "public.user_profiles exists in the app contract but is missing from the current PostgREST schema cache. This usually means migration 0008 is missing or the API schema cache is stale."
          : "public.user_profiles is not visible and baseline public tables are also unavailable. This points to wrong project credentials or PostgREST schema exposure problems."
    };
  }

  return {
    status: "blocked",
    summary: `Unable to verify avatar_path support: ${String(userProfilesTableError?.message || avatarColumnError?.message || "unknown error")}`
  };
}

function evaluateFulfillmentCapability({
  baselineVisible,
  ordersTableError,
  orderMetadataError
}: {
  baselineVisible: boolean;
  ordersTableError: { message?: string } | null;
  orderMetadataError: { message?: string } | null;
}): CapabilityReport {
  if (!ordersTableError && !orderMetadataError) {
    return {
      status: "available",
      summary: "Order fulfillment metadata columns are available."
    };
  }

  if (
    isMissingColumnError(orderMetadataError, [
      "agreement_path",
      "agreement_generation_error",
      "agreement_content_type",
      "agreement_size_bytes",
      "last_webhook_event_id"
    ])
  ) {
    return {
      status: "degraded",
      summary:
        "Migration 0010 is not applied yet; payment syncing still works, but richer fulfillment, webhook, and agreement metadata are running in reduced compatibility mode."
    };
  }

  if (isMissingRelationError(ordersTableError, "orders")) {
    return {
      status: "blocked",
      summary:
        "public.orders is not reachable through PostgREST. Confirm the base schema migrations are applied and that the connected Supabase project matches this app."
    };
  }

  if (isSchemaCacheTableError(ordersTableError, "orders")) {
    return {
      status: baselineVisible ? "degraded" : "blocked",
      summary:
        baselineVisible
          ? "public.orders is not visible in the current PostgREST schema cache. This usually means the order schema migrations are missing or the API schema cache is stale."
          : "public.orders is not visible and baseline public tables are also unavailable. This points to wrong project credentials or PostgREST schema exposure problems."
    };
  }

  return {
    status: "blocked",
    summary: `Unable to verify order fulfillment metadata: ${String(ordersTableError?.message || orderMetadataError?.message || "unknown error")}`
  };
}

function evaluateAgreementCapability(fulfillmentCapability: CapabilityReport): CapabilityReport {
  if (fulfillmentCapability.status === "available") {
    return {
      status: "available",
      summary: "Agreement artifact metadata is available."
    };
  }

  if (fulfillmentCapability.status === "degraded") {
    return {
      status: "degraded",
      summary:
        "Agreement artifact generation works, but without migration 0010 the order row cannot retain the full document metadata contract, so secure buyer delivery remains blocked."
    };
  }

  return {
    status: "blocked",
    summary: "Agreement artifact metadata is blocked because the orders table is not fully reachable through PostgREST."
  };
}

function evaluateOrderActivityCapability({
  baselineVisible,
  ordersTableError,
  activityError
}: {
  baselineVisible: boolean;
  ordersTableError: { message?: string } | null;
  activityError: { message?: string } | null;
}): CapabilityReport {
  if (!ordersTableError && !activityError) {
    return {
      status: "available",
      summary: "order_activity_log is available for auditing and webhook dedupe."
    };
  }

  if (isMissingRelationError(activityError, "order_activity_log")) {
    return {
      status: "degraded",
      summary: "Migration 0010 is not applied yet; order activity auditing and webhook dedupe are limited until order_activity_log exists."
    };
  }

  if (isSchemaCacheTableError(activityError, "order_activity_log")) {
    return {
      status: baselineVisible ? "degraded" : "blocked",
      summary:
        baselineVisible
          ? "order_activity_log is not visible in the current PostgREST schema cache. This usually means migration 0010 is missing or the API schema cache is stale."
          : "order_activity_log is not visible and baseline public tables are also unavailable. This points to wrong project credentials or PostgREST schema exposure problems."
    };
  }

  if (ordersTableError) {
    return {
      status: "blocked",
      summary: "Order activity support is blocked because the orders table is not available to the app."
    };
  }

  return {
    status: "blocked",
    summary: `Unable to verify order activity support: ${String(activityError?.message || "unknown error")}`
  };
}
