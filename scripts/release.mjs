#!/usr/bin/env node
/**
 * Ship a new version:  npm run release [patch|minor|major|x.y.z]
 *
 * Bumps the version everywhere it lives (package.json, package-lock.json,
 * src-tauri/tauri.conf.json, src-tauri/Cargo.toml + Cargo.lock), commits
 * "Release vX.Y.Z" and pushes to main. GitHub Actions then builds the
 * installer and publishes the release; installed apps pick it up on their
 * next launch. See RELEASING.md.
 *
 * Only Node built-ins on purpose - it must work on a fresh clone with no
 * dev-dependency installed.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// Returns captured stdout, or "" when the caller inherits stdio (execSync gives null then).
const sh = (cmd, opts = {}) =>
  (execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts }) ?? "").trim();
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

// --- Preconditions -----------------------------------------------------------

const branch = sh("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") fail(`Releases are cut from "main" (you are on "${branch}").`);

if (sh("git status --porcelain") !== "") {
  fail("Working tree is not clean. Commit or stash your changes first - a release commit should only bump the version.");
}

sh("git fetch origin main --quiet", { stdio: "inherit" });
const behind = Number(sh("git rev-list --count HEAD..origin/main"));
if (behind > 0) fail(`Local main is ${behind} commit(s) behind origin/main. Run "git pull" first.`);

// --- Compute the new version -------------------------------------------------

const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const current = pkg.version;
const arg = process.argv[2] ?? "patch";

const next = /^\d+\.\d+\.\d+$/.test(arg) ? arg : bump(current, arg);
if (next === current) fail(`Version is already ${current}.`);
if (sh(`git tag --list v${next}`) !== "") fail(`Tag v${next} already exists locally.`);
if (sh(`git ls-remote --tags origin refs/tags/v${next}`) !== "") fail(`Release v${next} already exists on GitHub.`);

function bump(version, kind) {
  const [maj, min, pat] = version.split(".").map(Number);
  switch (kind) {
    case "major":
      return `${maj + 1}.0.0`;
    case "minor":
      return `${maj}.${min + 1}.0`;
    case "patch":
      return `${maj}.${min}.${pat + 1}`;
    default:
      return fail(`Unknown bump "${kind}". Use patch, minor, major or an explicit x.y.z.`);
  }
}

console.log(`\nReleasing ${current} → ${next}\n`);

// --- Write the version in every place it lives -------------------------------

// package.json + package-lock.json in one go, without npm's own git tagging.
sh(`npm version ${next} --no-git-tag-version --allow-same-version`);

const confPath = resolve(root, "src-tauri/tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = next;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

const cargoPath = resolve(root, "src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const bumped = cargo.replace(/^version = "[^"]+"/m, `version = "${next}"`);
if (bumped === cargo) fail("Could not find the [package] version in src-tauri/Cargo.toml.");
writeFileSync(cargoPath, bumped);

// Refresh only this crate's entry in Cargo.lock; dependencies stay pinned.
sh("cargo update --workspace --offline --quiet", { cwd: resolve(root, "src-tauri"), stdio: "inherit" });

// --- Commit and push ---------------------------------------------------------

sh("git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
sh(`git commit --quiet -m "Release v${next}"`);
sh("git push origin main", { stdio: "inherit" });

console.log(`
✔ Pushed Release v${next}.

GitHub Actions is now building the installer (about 10-15 minutes):
  https://github.com/${repoSlug()}/actions

When it finishes, the release appears at:
  https://github.com/${repoSlug()}/releases/tag/v${next}

Installed apps will offer the update on their next launch.
`);

function repoSlug() {
  const url = sh("git remote get-url origin");
  const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return m ? m[1] : "<owner>/<repo>";
}
