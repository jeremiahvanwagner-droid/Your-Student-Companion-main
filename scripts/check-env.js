#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Prebuild env-var assertion.
 *
 * Runs before `npm run build` (wired in package.json). Fails the build with a
 * clear, listed-out error if any required frontend env var is missing. The
 * goal is to prevent the failure mode that triggered the May 2026 walkthrough
 * findings, where production deployed without REACT_APP_CLERK_PUBLISHABLE_KEY
 * (a Clerk wizard had handed out a VITE_-prefixed variable) and silently
 * rendered the app without auth.
 *
 * Vercel runs `npm run build`, so this gate fires on every Vercel build. CI
 * (.github/workflows/ci.yml) runs `npx craco build` directly so it bypasses
 * the prebuild hook — intentional, because we don't want CI to fail just
 * because secrets aren't wired into the workflow file.
 *
 * To opt out for a one-off local build (e.g. compiling for a marketing
 * preview without auth), set SKIP_ENV_CHECK=true.
 */

const fs = require("fs");
const path = require("path");

if (process.env.SKIP_ENV_CHECK === "true") {
  console.log("[check-env] SKIP_ENV_CHECK=true — skipping env-var check");
  process.exit(0);
}

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

// Required frontend env vars. Each entry includes the canonical name and
// (optionally) acceptable aliases — if any name in the alias list is set, the
// check passes for that entry. This lets us absorb framework-naming drift
// without weakening the check.
const REQUIRED = [
  {
    canonical: "REACT_APP_CLERK_PUBLISHABLE_KEY",
    aliases: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
    purpose: "Clerk authentication — without this the app cannot sign anyone in.",
  },
  {
    canonical: "REACT_APP_SUPABASE_URL",
    aliases: [],
    purpose: "Supabase project URL — required for any data the frontend reads.",
  },
  {
    canonical: "REACT_APP_SUPABASE_ANON_KEY",
    aliases: [],
    purpose: "Supabase anonymous key — required for any data the frontend reads.",
  },
  {
    canonical: "REACT_APP_API_BASE_URL",
    aliases: [],
    purpose: "FastAPI backend URL — required for tasks, profile, subscriptions.",
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

const missing = REQUIRED.filter((entry) => {
  const allNames = [entry.canonical, ...entry.aliases];
  return !allNames.some((name) => {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
});

const softMissing = SOFT_REQUIRED.filter((entry) => {
  const allNames = [entry.canonical, ...entry.aliases];
  return !allNames.some((name) => {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
});

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
