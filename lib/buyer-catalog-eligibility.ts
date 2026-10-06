import type { TrackStatus } from "@/types/models";

export type BuyerVisibilityTone = "success" | "info" | "warning" | "neutral";

export interface BuyerCatalogEligibility {
  eligible: boolean;
  label: "Discoverable" | "In review" | "Needs attention" | "Not discoverable";
  tone: BuyerVisibilityTone;
  explanation: string;
  blockers: Array<"approval" | "preview" | "license">;
}

export function getBuyerCatalogEligibility({
  status,
  previewAvailable,
  activeLicenseCount
}: {
  status: TrackStatus;
  previewAvailable: boolean;
  activeLicenseCount: number;
}): BuyerCatalogEligibility {
  if (status === "pending_review") {
    return {
      eligible: false,
      label: "In review",
      tone: "info",
      explanation: "Buyers cannot find this track while review is in progress.",
      blockers: ["approval"]
    };
  }

  if (status === "rejected") {
    return {
      eligible: false,
      label: "Needs attention",
      tone: "warning",
      explanation: "Resolve the requested changes before this track can return to review.",
      blockers: ["approval"]
    };
  }

  if (status !== "approved") {
    return {
      eligible: false,
      label: "Not discoverable",
      tone: "neutral",
      explanation: status === "archived" ? "Archived tracks do not appear in Discover." : "Submit this draft for review before buyers can find it.",
      blockers: ["approval"]
    };
  }

  const blockers: BuyerCatalogEligibility["blockers"] = [];
  if (!previewAvailable) blockers.push("preview");
  if (activeLicenseCount < 1) blockers.push("license");

  if (blockers.length) {
    const missing = [
      !previewAvailable ? "a Buyer preview" : null,
      activeLicenseCount < 1 ? "an active license option" : null
    ].filter(Boolean).join(" and ");

    return {
      eligible: false,
      label: "Needs attention",
      tone: "warning",
      explanation: `This approved track needs ${missing} before it appears in Discover.`,
      blockers
    };
  }

  return {
    eligible: true,
    label: "Discoverable",
    tone: "success",
    explanation: "Buyers can find this track, play its Buyer preview, and review its active license options.",
    blockers: []
  };
}

export function isBuyerCatalogEligible(input: Parameters<typeof getBuyerCatalogEligibility>[0]) {
  return getBuyerCatalogEligibility(input).eligible;
}
