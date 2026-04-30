import { NextResponse } from "next/server";

import { env, getMissingCoreEnvKeys, hasSupabaseEnv } from "@/lib/env";
import { getMissingOperationalEnvKeys, getServerEnvironmentDiagnostics, serverEnv } from "@/lib/server-env";
import { storageBuckets } from "@/lib/storage";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { isMissingColumnError, isMissingRelationError, isSchemaCacheTableError } from "@/services/supabase/schema-compat";

type CapabilityStatus = "available" | "degraded" | "blocked";
type ReadinessStatus = "healthy" | "degraded" | "blocked";
type TableDiagnosticStatus = "visible" | "missing_or_stale" | "schema_exposure_blocked" | "unknown";
type RecommendedManualAction =
  | "none"
  | "run_storage_setup"
  | "apply_finalization_bundle"
  | "seed_license_types"
  | "verify_project_exposure";

type CapabilityReport = {
  status: CapabilityStatus;
  summary: string;
};

type DomainReport = {
  status: CapabilityStatus;
  summary: string;
};

const FINALIZATION_BUNDLE =
  "/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql" as const;
const FINALIZATION_RUNBOOK =
  "/Users/malcolmw/Documents/The Sync Exchange.2/docs/supabase-finalization.md" as const;
const REQUIRED_LICENSE_TYPE_SLUGS = ["digital-campaign", "broadcast", "exclusive-buyout"] as const;

type TableDiagnostic = {
  status: TableDiagnosticStatus;
  summary: string;
  manualSqlCheckRequired: boolean;
};

export async function GET() {
  const missingCore = getMissingCoreEnvKeys();
  const missingOperational = getMissingOperationalEnvKeys();
  const environment = getServerEnvironmentDiagnostics();
  const notes: string[] = [];

  const storage = {
    serviceRoleReady: Boolean(serverEnv.supabaseServiceRoleKey),
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
  const tableDiagnostics: Record<"user_profiles" | "orders" | "order_activity_log" | "generated_licenses", TableDiagnostic> = {
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
    },
    generated_licenses: {
      status: "unknown",
      summary: "generated_licenses visibility is unavailable until Supabase service-role access succeeds.",
      manualSqlCheckRequired: false
    }
  };

  const capabilities: Record<
    | "avatarPathSupport"
    | "licenseTypeSeedSupport"
    | "fulfillmentMetadataSupport"
    | "agreementMetadataSupport"
    | "orderActivitySupport"
    | "generatedLicenseSupport",
    CapabilityReport
  > = {
    avatarPathSupport: {
      status: "blocked",
      summary: "Avatar storage persistence cannot be verified yet."
    },
    licenseTypeSeedSupport: {
      status: "blocked",
      summary: "Required marketplace license types cannot be verified yet."
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
    },
    generatedLicenseSupport: {
      status: "blocked",
      summary: "Generated license persistence cannot be verified yet."
    }
  };
  let recommendedManualAction: RecommendedManualAction = "none";
  let recommendedManualBundle: typeof FINALIZATION_BUNDLE | null = null;

  if (!hasSupabaseEnv) {
    notes.push("Supabase public environment variables are missing, so live auth/data/storage flows are unavailable.");
  }

  for (const issue of environment.errors) {
    notes.push(issue.message);
  }

  for (const issue of environment.warnings) {
    notes.push(issue.message);
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
    const seededLicenseTypes = await supabase.from("license_types").select("slug").in("slug", [...REQUIRED_LICENSE_TYPE_SLUGS]);
    const ordersTable = await supabase.from("orders").select("id,status").limit(1);
    const orderMetadata = await supabase
      .from("orders")
      .select("agreement_path, agreement_generation_error, agreement_content_type, agreement_size_bytes, last_webhook_event_id")
      .limit(1);
    const orderActivity = await supabase.from("order_activity_log").select("id").limit(1);
    const generatedLicensesTable = await supabase.from("generated_licenses").select("id, agreement_number, pdf_storage_path, status").limit(1);

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
    tableDiagnostics.generated_licenses = diagnoseTableAccess({
      baselineVisible: postgrest.baselineTablesVisible,
      tableName: "generated_licenses",
      migrationHint: "0013",
      error: generatedLicensesTable.error
    });

    capabilities.avatarPathSupport = evaluateAvatarCapability({
      baselineVisible: postgrest.baselineTablesVisible,
      userProfilesTableError: userProfilesTable.error,
      avatarColumnError: avatarColumn.error
    });
    capabilities.licenseTypeSeedSupport = evaluateLicenseTypeCapability({
      baselineVisible: postgrest.baselineTablesVisible,
      licenseTypesTableError: baselineLicenses.error,
      seededLicenseTypesError: seededLicenseTypes.error,
      availableSlugs: (seededLicenseTypes.data || []).map((licenseType) => licenseType.slug)
    });

    capabilities.fulfillmentMetadataSupport = evaluateFulfillmentCapability({
      baselineVisible: postgrest.baselineTablesVisible,
      ordersTableError: ordersTable.error,
      orderMetadataError: orderMetadata.error
    });

    capabilities.orderActivitySupport = evaluateOrderActivityCapability({
      baselineVisible: postgrest.baselineTablesVisible,
      ordersTableError: ordersTable.error,
      activityError: orderActivity.error
    });

    capabilities.generatedLicenseSupport = evaluateGeneratedLicenseCapability({
      baselineVisible: postgrest.baselineTablesVisible,
      ordersTableError: ordersTable.error,
      generatedLicensesError: generatedLicensesTable.error
    });

    capabilities.agreementMetadataSupport = evaluateAgreementCapability(
      capabilities.fulfillmentMetadataSupport,
      capabilities.generatedLicenseSupport
    );

    for (const capability of Object.values(capabilities)) {
      if (capability.status !== "available") {
        notes.push(capability.summary);
      }
    }

    const finalizationMissing =
      foundationDiagnostics.tracks.status !== "visible" ||
      foundationDiagnostics.license_types.status !== "visible" ||
      tableDiagnostics.user_profiles.status !== "visible" ||
      tableDiagnostics.orders.status !== "visible" ||
      tableDiagnostics.order_activity_log.status !== "visible" ||
      tableDiagnostics.generated_licenses.status !== "visible" ||
      capabilities.avatarPathSupport.status !== "available" ||
      capabilities.fulfillmentMetadataSupport.status !== "available" ||
      capabilities.orderActivitySupport.status !== "available" ||
      capabilities.generatedLicenseSupport.status !== "available";

    if (storage.missingBuckets.length) {
      recommendedManualAction = "run_storage_setup";
      recommendedManualBundle = FINALIZATION_BUNDLE;
      notes.push("Required storage buckets are missing. Run npm run setup:storage before applying the finalization SQL bundle.");
    } else if (finalizationMissing) {
      recommendedManualAction = "apply_finalization_bundle";
      recommendedManualBundle = FINALIZATION_BUNDLE;
      notes.push(
        "Critical marketplace schema or policy objects are missing or stale. Apply the single finalization SQL bundle, then recheck readiness. If tables still appear unavailable afterward, verify project credentials, public-schema exposure, and PostgREST cache health."
      );
    } else if (capabilities.licenseTypeSeedSupport.status !== "available") {
      recommendedManualAction = "seed_license_types";
      recommendedManualBundle = null;
      notes.push("Required marketplace license types are missing. Run npm run seed:license-types before expecting artist submission or buyer checkout to work.");
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
  const domains = buildReadinessDomains({
    hasSupabaseEnv,
    storage,
    capabilities,
    missingCore,
    missingOperational
  });
  const blockedDomains = Object.entries(domains)
    .filter(([, value]) => value.status === "blocked")
    .map(([key]) => key);
  const degradedDomains = Object.entries(domains)
    .filter(([, value]) => value.status === "degraded")
    .map(([key]) => key);
  const criticalOperationalMissing = missingOperational.filter((key) =>
    ["SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].includes(key)
  );
  const environmentHasBlockingErrors = environment.errors.length > 0;
  const environmentHasDeploymentWarnings = environment.deploymentTarget !== "local" && environment.warnings.length > 0;
  const status: ReadinessStatus =
    missingCore.length > 0 || criticalOperationalMissing.length > 0 || blockedDomains.length > 0 || environmentHasBlockingErrors
      ? "blocked"
      : degradedDomains.length > 0 || missingOperational.length > 0 || environmentHasDeploymentWarnings
        ? "degraded"
        : "healthy";

  return NextResponse.json(
    {
      status,
      ok: status === "healthy",
      environment,
      manualSupabaseActionRequired: recommendedManualAction === "apply_finalization_bundle" || recommendedManualAction === "run_storage_setup",
      missingCore,
      missingOperational,
      postgrest,
      foundationDiagnostics,
      tableDiagnostics,
      storage,
      capabilities,
      domains,
      recommendedManualAction,
      recommendedManualBundle,
      runbook: FINALIZATION_RUNBOOK,
      blockedFeatures,
      degradedFeatures,
      blockedDomains,
      degradedDomains,
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

function evaluateLicenseTypeCapability({
  baselineVisible,
  licenseTypesTableError,
  seededLicenseTypesError,
  availableSlugs
}: {
  baselineVisible: boolean;
  licenseTypesTableError: { message?: string } | null;
  seededLicenseTypesError: { message?: string } | null;
  availableSlugs: string[];
}): CapabilityReport {
  if (licenseTypesTableError) {
    if (isMissingRelationError(licenseTypesTableError, "license_types")) {
      return {
        status: "blocked",
        summary:
          "public.license_types is not reachable through PostgREST. Confirm the foundation schema migrations are applied and the connected Supabase project matches this app."
      };
    }

    if (isSchemaCacheTableError(licenseTypesTableError, "license_types")) {
      return {
        status: baselineVisible ? "degraded" : "blocked",
        summary:
          baselineVisible
            ? "public.license_types exists in the app contract but is stale in the current PostgREST schema cache."
            : "public.license_types is not visible and baseline public tables are also unavailable."
      };
    }
  }

  if (seededLicenseTypesError) {
    return {
      status: "blocked",
      summary: `Unable to verify required marketplace license types: ${String(seededLicenseTypesError.message || "unknown error")}`
    };
  }

  const missingSlugs = REQUIRED_LICENSE_TYPE_SLUGS.filter((slug) => !availableSlugs.includes(slug));
  if (missingSlugs.length > 0) {
    return {
      status: "blocked",
      summary: `Required marketplace license types are missing: ${missingSlugs.join(", ")}. Run the license type seed/bootstrap before submitting tracks or expecting buyer checkout.`
    };
  }

  return {
    status: "available",
    summary: "Required marketplace license types are present."
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

function evaluateGeneratedLicenseCapability({
  baselineVisible,
  ordersTableError,
  generatedLicensesError
}: {
  baselineVisible: boolean;
  ordersTableError: { message?: string } | null;
  generatedLicensesError: { message?: string } | null;
}): CapabilityReport {
  if (!ordersTableError && !generatedLicensesError) {
    return {
      status: "available",
      summary: "generated_licenses is available for idempotent license persistence and buyer/admin agreement access."
    };
  }

  if (isMissingRelationError(generatedLicensesError, "generated_licenses")) {
    return {
      status: "blocked",
      summary:
        "public.generated_licenses is not reachable through PostgREST. Apply migration 0013 so completed purchases can persist one secure generated license record per order."
    };
  }

  if (isSchemaCacheTableError(generatedLicensesError, "generated_licenses")) {
    return {
      status: "blocked",
      summary:
        baselineVisible
          ? "public.generated_licenses exists in the app contract but is stale in the current PostgREST schema cache. Automated license persistence is blocked until migration 0013 is applied or the API schema cache refreshes."
          : "public.generated_licenses is not visible and baseline public tables are also unavailable. This points to wrong project credentials or PostgREST schema exposure problems."
    };
  }

  if (ordersTableError) {
    return {
      status: "blocked",
      summary: "Generated license persistence is blocked because the orders table is not available to the app."
    };
  }

  return {
    status: "blocked",
    summary: `Unable to verify generated license persistence: ${String(generatedLicensesError?.message || "unknown error")}`
  };
}

function evaluateAgreementCapability(
  fulfillmentCapability: CapabilityReport,
  generatedLicenseCapability: CapabilityReport
): CapabilityReport {
  if (fulfillmentCapability.status === "available" && generatedLicenseCapability.status === "available") {
    return {
      status: "available",
      summary: "Agreement artifact metadata and generated license persistence are available."
    };
  }

  if (fulfillmentCapability.status === "degraded" || generatedLicenseCapability.status === "degraded") {
    return {
      status: "degraded",
      summary:
        "Agreement artifact generation can run, but without the final orders/generated_licenses schema contract secure buyer delivery and structured admin visibility remain degraded."
    };
  }

  return {
    status: "blocked",
    summary:
      "Agreement artifact delivery is blocked because the orders table or generated_licenses table is not fully reachable through PostgREST."
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

function buildReadinessDomains({
  hasSupabaseEnv,
  storage,
  capabilities,
  missingCore,
  missingOperational
}: {
  hasSupabaseEnv: boolean;
  storage: {
    serviceRoleReady: boolean;
    bucketsPresent: boolean;
    missingBuckets: string[];
  };
  capabilities: Record<
    | "avatarPathSupport"
    | "licenseTypeSeedSupport"
    | "fulfillmentMetadataSupport"
    | "agreementMetadataSupport"
    | "orderActivitySupport"
    | "generatedLicenseSupport",
    CapabilityReport
  >;
  missingCore: string[];
  missingOperational: string[];
}): Record<
  | "authProfile"
  | "catalog"
  | "storage"
  | "orders"
  | "generatedLicenses"
  | "agreements"
  | "activityLog"
  | "webhook"
  | "purchaseFlow",
  DomainReport
> {
  const authProfile =
    !hasSupabaseEnv || missingCore.length > 0
      ? {
          status: "blocked" as CapabilityStatus,
          summary: "Supabase public auth/profile environment variables are missing, so the live profile contract is unavailable."
        }
      : capabilities.avatarPathSupport;

  const storageDomain: DomainReport = !storage.serviceRoleReady
    ? {
        status: "blocked",
        summary: "SUPABASE_SERVICE_ROLE_KEY is missing, so private storage operations cannot complete."
      }
    : !storage.bucketsPresent
      ? {
          status: "blocked",
          summary: `Storage buckets are incomplete. Missing: ${storage.missingBuckets.join(", ")}.`
        }
      : {
          status: "available",
          summary: "Required storage buckets are present."
        };

  const catalog = capabilities.licenseTypeSeedSupport;
  const orders = capabilities.fulfillmentMetadataSupport;
  const generatedLicenses = capabilities.generatedLicenseSupport;
  const agreements = capabilities.agreementMetadataSupport;
  const activityLog = capabilities.orderActivitySupport;

  const webhook: DomainReport = missingOperational.includes("STRIPE_SECRET_KEY") || missingOperational.includes("STRIPE_WEBHOOK_SECRET")
    ? {
        status: "blocked",
        summary: "Stripe secret/webhook credentials are missing, so the real paid order fulfillment loop cannot complete."
      }
      : orders.status === "blocked" || generatedLicenses.status === "blocked"
      ? {
          status: "blocked",
          summary: "Webhook processing is blocked because the orders or generated_licenses schema contract is not available."
        }
      : activityLog.status === "degraded" || generatedLicenses.status === "degraded"
        ? {
            status: "degraded",
            summary:
              "Webhook fulfillment can run, but audit logging or generated-license persistence still remains in compatibility mode until the final schema contract is fully live."
          }
        : {
            status: "available",
            summary: "Stripe webhook credentials, order fulfillment metadata, and generated-license persistence are present."
          };

  const domainValues = [authProfile, catalog, storageDomain, orders, generatedLicenses, agreements, activityLog, webhook];
  const purchaseFlow: DomainReport = domainValues.some((domain) => domain.status === "blocked")
    ? {
        status: "blocked",
        summary:
          "The marketplace cannot complete a real artist-to-buyer purchase flow yet because one or more critical domains are still blocked."
      }
    : domainValues.some((domain) => domain.status === "degraded")
      ? {
          status: "degraded",
          summary:
            "The marketplace can run in compatibility mode, but a real purchase flow still has degraded infrastructure that should be finalized before launch."
        }
      : {
          status: "available",
          summary: "The app has the core dependencies needed to complete the real marketplace purchase flow."
        };

  return {
    authProfile,
    catalog,
    storage: storageDomain,
    orders,
    generatedLicenses,
    agreements,
    activityLog,
    webhook,
    purchaseFlow
  };
}
