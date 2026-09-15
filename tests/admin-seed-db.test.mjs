import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("generic SQL seed cannot promote an email-matched existing user to admin", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create table auth.users(id uuid, email text);
      create type public.user_role as enum ('admin','artist','buyer');
      create table public.user_profiles(id uuid primary key,email text,role public.user_role,full_name text,onboarding_started_at timestamptz,onboarding_completed_at timestamptz,onboarding_step text);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111','admin@thesyncexchange.com'),('22222222-2222-4222-8222-222222222222','maya@sync.exchange');`);
    const source = readFileSync(new URL("../supabase/seeds/seed.sql", import.meta.url), "utf8");
    await db.exec(source.slice(source.indexOf("with existing_auth_users"),source.indexOf("insert into public.artist_profiles")));
    const rows = (await db.query("select email,role from public.user_profiles order by email")).rows;
    assert.deepEqual(rows, [{ email: "maya@sync.exchange", role: "artist" }]);
  } finally { await db.close(); }
});
