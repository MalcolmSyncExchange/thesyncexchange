import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public navigation uses the frozen V1 information architecture", async () => {
  const [header, footer] = await Promise.all([
    read("components/layout/site-header.tsx"),
    read("components/layout/site-footer.tsx")
  ]);

  for (const label of ["Discover", "For artists", "For buyers", "How it works"]) {
    assert.match(header, new RegExp(label, "i"));
  }
  assert.match(footer, /Find it\. Clear it\. License it\./);
  assert.match(footer, /Rights & Licensing/);
  assert.match(footer, /Contact & Support/);
});

test("homepage and auth copy match the approved messaging revision", async () => {
  const [homepage, login, signup] = await Promise.all([
    read("components/marketing/homepage.tsx"),
    read("app/(auth)/login/page.tsx"),
    read("app/(auth)/signup/page.tsx")
  ]);

  assert.match(homepage, /Find it\. Clear it\. License it\./);
  assert.match(homepage, /Know what is offered before you move forward/);
  assert.match(login, /Pick up where you left off/);
  assert.match(signup, /One person\. One account\./);
  assert.match(signup, /does not grant workspace access/);
});

test("pricing page does not invent unapproved prices", async () => {
  const pricing = await read("app/(marketing)/pricing/page.tsx");
  assert.doesNotMatch(pricing, /\$39|\$\d+/);
  assert.match(pricing, /Final plan pricing is pending/);
  assert.match(pricing, /No price or fee shown here is final/);
});

test("public discovery keeps the live catalog behind current authorization", async () => {
  const discover = await read("app/(marketing)/discover/page.tsx");
  assert.match(discover, /redirectTo.*\/buyer\/catalog/s);
  assert.match(discover, /The live catalog is protected/);
  assert.doesNotMatch(discover, /createServiceRole|SUPABASE_SERVICE_ROLE_KEY|getBuyerCatalogTracks/);
});

test("rights messaging keeps recording and composition separate without a blanket guarantee", async () => {
  const rights = await read("app/(marketing)/rights-and-licensing/page.tsx");
  assert.match(rights, /The recording/);
  assert.match(rights, /The song/);
  assert.match(rights, /not a blanket guarantee/);
  assert.match(rights, /Purchase-time terms matter/);
});
