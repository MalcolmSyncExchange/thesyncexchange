import test from "node:test";
import assert from "node:assert/strict";

import { buildBuyerProfileUpsert } from "../services/auth/buyer-onboarding.ts";

test("buyer basics defers buyer_profiles row creation until required fields exist", () => {
  const result = buildBuyerProfileUpsert({
    userId: "buyer-1",
    onboardingPayload: {
      fullName: "Buyer Basics",
      companyName: "Sync Buyer Co"
    },
    profileUpdates: {
      company_name: "Sync Buyer Co"
    }
  });

  assert.equal(result.upsert, null);
  assert.deepEqual(result.missingRequiredFields, ["buyer_type", "industry_type", "billing_email"]);
});

test("buyer profile step builds a complete upsert from basics payload and profile fields", () => {
  const result = buildBuyerProfileUpsert({
    userId: "buyer-2",
    onboardingPayload: {
      fullName: "Buyer Profile",
      companyName: "Cue Sheet Studios"
    },
    profileUpdates: {
      buyer_type: "Music Supervisor",
      industry_type: "Film & TV",
      billing_email: "billing@cuesheet.example"
    }
  });

  assert.deepEqual(result, {
    upsert: {
      user_id: "buyer-2",
      company_name: "Cue Sheet Studios",
      buyer_type: "Music Supervisor",
      industry_type: "Film & TV",
      billing_email: "billing@cuesheet.example"
    },
    missingRequiredFields: []
  });
});

test("buyer interests updates preserve required buyer profile fields and attach music preferences", () => {
  const result = buildBuyerProfileUpsert({
    userId: "buyer-3",
    onboardingPayload: {
      companyName: "North Frame",
      buyerType: "Producer",
      industryType: "Advertising",
      billingEmail: "accounts@northframe.example"
    },
    profileUpdates: {
      music_preferences: {
        genres: ["Electronic"],
        moods: ["Driving"],
        intended_use: "Broadcast promo"
      }
    },
    existingProfile: {
      company_name: "North Frame",
      buyer_type: "Producer",
      industry_type: "Advertising",
      billing_email: "accounts@northframe.example",
      music_preferences: {}
    }
  });

  assert.deepEqual(result, {
    upsert: {
      user_id: "buyer-3",
      company_name: "North Frame",
      buyer_type: "Producer",
      industry_type: "Advertising",
      billing_email: "accounts@northframe.example",
      music_preferences: {
        genres: ["Electronic"],
        moods: ["Driving"],
        intended_use: "Broadcast promo"
      }
    },
    missingRequiredFields: []
  });
});
