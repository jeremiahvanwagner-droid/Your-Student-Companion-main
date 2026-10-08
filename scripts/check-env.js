#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Prebuild env-var gate.
 *
 * Runs before `npm run build` via the `prebuild` hook in package.json and does
 * two things, in this order:
 *
 *   1. SECRET GUARD (never skippable). CRA inlines every REACT_APP_* variable
 *      into the public JS bundle (build/static/js/*), so a secret with that
 *      prefix is a secret handed to every browser. Any defined REACT_APP_*
 *      name matching /(SERVICE_ROLE|SECRET|WEBHOOK|PRIVATE)/i aborts the
 *      build. Only names are printed, never values.
 *
 *   2. REQUIRED-VAR CHECK. Aborts the build with a clear, listed-out error if
 *      a required frontend var is missing. This is the gate against the May
 *      2026 walkthrough failure, where production deployed without
 *      REACT_APP_CLERK_PUBLISHABLE_KEY (a Clerk wizard had handed out a
 *      VITE_-prefixed variable) and silently rendered the app without auth.
 *      SKIP_ENV_CHECK=true bypasses this step only — for a one-off local
 *      build such as a marketing preview without auth.
 *
 * Where it fires: Vercel's build command is `npm run build` (vercel.json), so
 * every Vercel build passes through here. CI (.github/workflows/ci.yml) runs
 * `npx craco build` directly and bypasses the prebuild hook — intentional,
 * because CI should not fail just because secrets aren't wired into the
 * workflow file.
 *
 * The frontend never talks to Supabase — every data call goes through the
 * FastAPI backend at REACT_APP_API_BASE_URL, which holds the only Supabase
 * credentials — so no REACT_APP_SUPABASE_* variable is required or allowed.
 */

const fs = require("fs");
const path = require("path");

// Mirror CRA's env loading order so this script sees the same vars CRA will.
// CRA loads .env.local before .env, and only when NODE_ENV !== 'test'.
// We use dotenv directly (a transitive dep of react-scripts) instead of
// importing from react-scripts to keep this script standalone.
function loadDotenvFiles() {
  let dotenv;
  try {
    dotenv = require("dotenv");
  } catch {
    // dotenv unavailable — skip; on Vercel/CI env vars come from the
    // process environment directly so this isn't fatal.
    return;
  }
  const repoRoot = path.resolve(__dirname, "..");
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const fullPath = path.join(repoRoot, file);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, override: false });
    }
  }
}

loadDotenvFiles();

function isSet(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

// ── 1. Secret guard ─────────────────────────────────────────────────────────
// CRA's DefinePlugin exposes every var whose name matches /^REACT_APP_/i
// (react-scripts/config/env.js), so the prefix is matched case-insensitively
// here too. Presence alone fails the build: an empty or dead value still
// proves the wrong habit, and the next value pasted into that name would ship
// to the world. SKIP_ENV_CHECK does not apply to this step.
const PUBLIC_PREFIX = /^REACT_APP_/i;
const SECRET_NAME = /(SERVICE_ROLE|SECRET|WEBHOOK|PRIVATE)/i;

const leakedSecretNames = Object.keys(process.env)
  .filter((name) => PUBLIC_PREFIX.test(name) && SECRET_NAME.test(name))
  .sort();

if (leakedSecretNames.length > 0) {
  console.error("");
  console.error("=============================================================");
  console.error("  Build aborted — secret-looking name has the REACT_APP_ prefix");
  console.error("=============================================================");
  console.error("");
  console.error("CRA inlines every REACT_APP_* variable into the public JS bundle.");
  console.error("These names match /(SERVICE_ROLE|SECRET|WEBHOOK|PRIVATE)/i and would");
  console.error("be readable by anyone who loads the site (values not shown):");
  console.error("");
  for (const name of leakedSecretNames) {
    console.error(`  ✗ ${name}`);
  }
  console.error("");
  console.error("Remove them from .env.local and from Vercel → Environment Variables.");
  console.error("Server-side secrets belong in backend/.env (local) or Render, without");
  console.error("the REACT_APP_ prefix. If the value was ever live, rotate it — it may");
  console.error("already be in a published bundle. This guard cannot be skipped.");
  console.error("");
  process.exit(1);
}

console.log("[check-env] OK — no secret-looking REACT_APP_* names in the environment");

// ── 2. Required vars ────────────────────────────────────────────────────────
if (process.env.SKIP_ENV_CHECK === "true") {
  console.log("[check-env] SKIP_ENV_CHECK=true — skipping required env-var check");
  process.exit(0);
}

// Required frontend env vars. Each entry includes the canonical name and
// (optionally) acceptable aliases — if any name in the alias list is set, the
// check passes for that entry. This lets us absorb framework-naming drift
// without weakening the check (but see emitAliasWarnings: an alias keeps the
// build green, it does not make the value reachable from the browser).
const REQUIRED = [
  {
    canonical: "REACT_APP_CLERK_PUBLISHABLE_KEY",
    aliases: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    purpose: "Clerk authentication — without this the app cannot sign anyone in.",
  },
  {
    canonical: "REACT_APP_API_BASE_URL",
    aliases: [],
    purpose:
      "FastAPI backend URL — required for tasks, profile, subscriptions and every other data read (the frontend has no Supabase client).",
  },
];

// Soft-required vars: warn loudly when missing in production-style builds but
// don't fail the build. Sentry SDK no-ops cleanly when the DSN is absent, so
// the app still ships — just without error reporting. The warning makes it
// hard to miss.
const SOFT_REQUIRED = [
  {
    canonical: "REACT_APP_SENTRY_DSN",
    aliases: [],
    purpose:
      "Sentry frontend DSN — without this, production errors won't reach Sentry. SDK is a clean no-op when missing.",
  },
];

const missing = REQUIRED.filter(
  (entry) => ![entry.canonical, ...entry.aliases].some(isSet)
);

const softMissing = SOFT_REQUIRED.filter(
  (entry) => ![entry.canonical, ...entry.aliases].some(isSet)
);

// Entries satisfied only through an alias. CRA inlines REACT_APP_* names and
// nothing else, so a NEXT_PUBLIC_ value never reaches the browser: the built
// app behaves exactly as if the variable were unset, even though this check
// passed. Warn every time, not just on production-style builds.
const aliasOnly = REQUIRED.filter(
  (entry) => !isSet(entry.canonical) && entry.aliases.some(isSet)
);

function emitAliasWarnings() {
  for (const entry of aliasOnly) {
    const used = entry.aliases.filter(isSet).join(", ");
    console.warn("");
    console.warn(
      `[check-env] WARNING — ${entry.canonical} is unset; passing via alias ${used}.`
    );
    console.warn(
      "    CRA exposes only REACT_APP_* variables to the browser, so the built app"
    );
    console.warn(
      `    will NOT see ${used}. Set ${entry.canonical} before relying on this build.`
    );
    console.warn("");
  }
}

function emitSoftWarnings() {
  if (softMissing.length === 0) {
    return;
  }
  // Only loud on production-style builds — local `npm start` shouldn't nag.
  const isProdLikeBuild =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.CI === "true";
  if (!isProdLikeBuild) {
    return;
  }
  console.warn("");
  console.warn("[check-env] WARNING — optional env vars missing (build continues):");
  for (const entry of softMissing) {
    console.warn(`  ! ${entry.canonical}`);
    console.warn(`      ${entry.purpose}`);
  }
  console.warn("");
}

if (missing.length === 0) {
  console.log(
    `[check-env] OK — all ${REQUIRED.length} required env vars are set`
  );
  emitAliasWarnings();
  emitSoftWarnings();
  process.exit(0);
}

console.error("");
console.error("=============================================================");
console.error("  Build aborted — required frontend env vars are missing");
console.error("=============================================================");
console.error("");
for (const entry of missing) {
  console.error(`  ✗ ${entry.canonical}`);
  if (entry.aliases.length > 0) {
    console.error(`      (or any of: ${entry.aliases.join(", ")})`);
  }
  console.error(`      ${entry.purpose}`);
  console.error("");
}
console.error("In Vercel: Project Settings → Environment Variables.");
console.error("Locally:   add to .env.local at the repo root.");
console.error("");
console.error("To bypass this check for a one-off build, set SKIP_ENV_CHECK=true.");
console.error("");
process.exit(1);
