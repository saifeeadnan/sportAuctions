import "dotenv/config";
import fs from "fs";
import path from "path";
import readline from "readline";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import bcrypt from "bcryptjs";

/**
 * Replaces the local dev database with a copy of production.
 *
 *   PROD_DATABASE_URL="postgresql://…" npm run db:prod-to-dev
 *   npm run db:prod-to-dev -- --scrub-only      (only scrub the dev DB in place)
 *   flags: --yes (skip the confirmation prompt), --no-scrub (keep real credentials)
 *
 * Everything runs inside the dev Postgres container so pg_dump/pg_restore are
 * the same major version as the server (dev must be >= prod). The prod URL is
 * passed to the container through its environment, never on a command line or
 * to disk, and prod is only ever read. The dev database is dumped to backups/
 * first, on every run, because this replaces it.
 */

const CONTAINER = "sports-auction-postgres";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const DEV_PASSWORD = "devpass123";
const BACKUPS_DIR = path.join(__dirname, "..", "backups");

const flags = new Set(process.argv.slice(2));
const step = (msg: string) => console.log(`\n-> ${msg}`);

function fail(msg: string): never {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

function parseDbUrl(raw: string | undefined, label: string) {
  if (!raw) fail(`${label} is not set.`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail(`${label} is not a valid URL.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    fail(`${label} must be a postgresql:// URL.`);
  }
  const db = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(db)) fail(`${label}'s database name must be letters, digits or underscores.`);
  const port = url.port || "5432";
  return { host: url.hostname, port, db, display: `${url.hostname}:${port}/${db}` };
}

// ---- docker helpers --------------------------------------------------------

type Run = SpawnSyncReturns<string>;

function docker(args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}): Run {
  const res = spawnSync("docker", args, { encoding: "utf8", input: opts.input, env: opts.env ?? process.env });
  if (res.error) fail(`Could not run docker: ${res.error.message}`);
  return res;
}

function must(res: Run, what: string): string {
  if (res.status !== 0) fail(`${what} failed:\n${(res.stderr || res.stdout).trim()}`);
  return res.stdout.trim();
}

/** SQL on the dev container's own server (stdin, so psql variables work). */
function localSql(db: string, sql: string, vars: Record<string, string> = {}): string {
  const varArgs = Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`]);
  return must(
    docker(["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", db, "-tAq", "-F", "|", "-v", "ON_ERROR_STOP=1", ...varArgs], {
      input: sql,
    }),
    "SQL on the dev database"
  );
}

function prodSql(prodUrl: string, sql: string): string {
  return must(
    docker(["exec", "-i", "-e", "PROD_URL", CONTAINER, "sh", "-c", 'psql "$PROD_URL" -tAq -F "|" -v ON_ERROR_STOP=1'], {
      input: sql,
      env: { ...process.env, PROD_URL: prodUrl },
    }),
    "SQL on the production database"
  );
}

const COUNTS_SQL = `
select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;`;

function parseCounts(out: string): Map<string, number> {
  return new Map(
    out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [table, n] = line.split("|");
        return [table, Number(n)] as [string, number];
      })
  );
}

// ---- dump / restore --------------------------------------------------------

function verifyArchive(file: string) {
  const fd = fs.openSync(file, "r");
  const res = spawnSync("docker", ["exec", "-i", CONTAINER, "pg_restore", "--list"], {
    stdio: [fd, "pipe", "pipe"],
    encoding: "utf8",
  });
  fs.closeSync(fd);
  const tables = (res.stdout ?? "").split("\n").filter((l) => l.includes(" TABLE DATA ")).length;
  if (res.status !== 0 || tables === 0) fail(`The dump ${file} isn't a readable archive with table data.`);
  return tables;
}

function dumpToFile(file: string, cmd: string[], env?: NodeJS.ProcessEnv) {
  const fd = fs.openSync(file, "w");
  const res = spawnSync("docker", cmd, { stdio: ["ignore", fd, "pipe"], env: env ?? process.env });
  fs.closeSync(fd);
  if (res.status !== 0) {
    fs.rmSync(file, { force: true });
    fail(`pg_dump failed:\n${res.stderr?.toString().trim()}`);
  }
  const tables = verifyArchive(file);
  console.log(`   ${path.relative(process.cwd(), file)}  (${(fs.statSync(file).size / 1048576).toFixed(1)} MB, ${tables} tables)`);
}

function restoreFromFile(file: string, db: string) {
  const fd = fs.openSync(file, "r");
  const res = spawnSync(
    "docker",
    ["exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", db, "--no-owner", "--no-privileges"],
    { stdio: [fd, "pipe", "pipe"], encoding: "utf8" }
  );
  fs.closeSync(fd);
  return res;
}

// ---- scrub -----------------------------------------------------------------

// Real credentials and contact details have no business in a dev database
// that's reachable through the dev tunnel. Names, login IDs and photos stay —
// the roster data is unrecognisable without them.
const SCRUB_SQL = `
begin;
update "users" set "passwordHash" = :'hash';
update "users" set "email" = 'user-' || "id" || '@example.invalid' where "email" is not null;
update "users" set "phone" = null where "phone" is not null;
update "players" set "email" = null, "phone" = null where "email" is not null or "phone" is not null;
update "auctions" set "highlightsToken" = null where "highlightsToken" is not null;
update "team_auction_entries" set "rosterCardToken" = null where "rosterCardToken" is not null;
delete from "tournament_stats_shares";
update "login_events" set "ipAddress" = null, "userAgent" = null;
update "audit_logs" set "before" = null, "after" = null where "entityType" = 'User';
commit;`;

function scrub(db: string) {
  const hash = bcrypt.hashSync(DEV_PASSWORD, 10);
  localSql(db, SCRUB_SQL, { hash });
  const leftovers = localSql(
    db,
    `select
       (select count(*) from "users" where "passwordHash" <> :'hash')
     + (select count(*) from "users" where "email" is not null and "email" not like '%@example.invalid')
     + (select count(*) from "users" where "phone" is not null)
     + (select count(*) from "players" where "email" is not null or "phone" is not null)
     + (select count(*) from "auctions" where "highlightsToken" is not null)
     + (select count(*) from "team_auction_entries" where "rosterCardToken" is not null)
     + (select count(*) from "tournament_stats_shares");`,
    { hash }
  );
  if (leftovers !== "0") fail(`Scrub left ${leftovers} sensitive value(s) behind — check the dev database.`);
  console.log(`   passwords, emails, phones, public share tokens, IPs and audit-log contact details scrubbed.`);
  console.log(`   Every account now signs in with the password "${DEV_PASSWORD}".`);
}

// ---- main ------------------------------------------------------------------

async function confirm(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a.trim()))));
}

async function main() {
  const target = parseDbUrl(process.env.DATABASE_URL, "DATABASE_URL");

  // The one thing this script must never do is write to anything but the local dev database.
  if (!LOCAL_HOSTS.has(target.host)) {
    fail(`DATABASE_URL points at ${target.host}, not a local database. Refusing — this script only ever replaces the local dev database.`);
  }
  if (target.db.endsWith("_test")) {
    fail(`DATABASE_URL is the test database (${target.db}); the test suite truncates it. Point it at the dev database.`);
  }

  const running = docker(["inspect", "-f", "{{.State.Running}}", CONTAINER]);
  if (running.status !== 0 || running.stdout.trim() !== "true") {
    fail(`The ${CONTAINER} container isn't running. Start it with "npm run db:up".`);
  }
  const published = docker(["port", CONTAINER, "5432/tcp"]).stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!published.some((l) => l.endsWith(`:${target.port}`))) {
    fail(`DATABASE_URL uses port ${target.port}, but ${CONTAINER} publishes ${published.join(", ") || "nothing"} — it isn't the server this URL reaches.`);
  }

  if (flags.has("--scrub-only")) {
    step(`Scrubbing ${target.display} in place`);
    scrub(target.db);
    return;
  }

  const prodUrl = process.env.PROD_DATABASE_URL;
  const source = parseDbUrl(prodUrl, "PROD_DATABASE_URL");
  if (source.host === target.host && source.port === target.port && source.db === target.db) {
    fail("PROD_DATABASE_URL and DATABASE_URL are the same database.");
  }
  if (source.host.includes("-pooler")) {
    fail(`PROD_DATABASE_URL uses Neon's pooled endpoint (${source.host}); pg_dump needs the direct one. Remove "-pooler" from the host, or copy the non-pooled connection string from the Neon dashboard.`);
  }

  step(`Checking ${source.display}`);
  const prodMajor = Math.floor(Number(prodSql(prodUrl!, "show server_version_num;")) / 10000);
  const devMajor = Math.floor(Number(localSql("postgres", "show server_version_num;")) / 10000);
  if (!prodMajor) fail("Couldn't read the production server version.");
  if (prodMajor > devMajor) {
    fail(`Production is Postgres ${prodMajor} but the dev container is ${devMajor}; a newer server's dump can't be restored here. Upgrade the container's image in docker-compose.yml.`);
  }
  console.log(`   production Postgres ${prodMajor}, dev Postgres ${devMajor}`);

  console.log(`\nThis will REPLACE the dev database "${target.display}" with a copy of "${source.display}".`);
  if (!flags.has("--yes")) {
    if (!process.stdin.isTTY) fail("Not a terminal — pass --yes to confirm non-interactively.");
    if ((await confirm(`Type the dev database name (${target.db}) to continue: `)) !== target.db) fail("Cancelled.");
  }

  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const devBackup = path.join(BACKUPS_DIR, `dev-before-prod-copy-${stamp}.dump`);
  const prodDump = path.join(BACKUPS_DIR, `prod-${stamp}.dump`);

  step("Backing up the current dev database");
  const devExists = localSql("postgres", `select count(*) from pg_database where datname = '${target.db}';`) === "1";
  if (devExists) dumpToFile(devBackup, ["exec", CONTAINER, "pg_dump", "-U", "postgres", "-Fc", target.db]);
  else console.log("   (no dev database yet — nothing to back up)");

  step("Dumping production (read-only)");
  dumpToFile(
    prodDump,
    ["exec", "-e", "PROD_URL", CONTAINER, "sh", "-c", 'pg_dump "$PROD_URL" --schema=public --no-owner --no-privileges -Fc'],
    { ...process.env, PROD_URL: prodUrl }
  );

  step(`Recreating "${target.db}" and restoring`);
  localSql("postgres", `drop database if exists "${target.db}" with (force);`);
  localSql("postgres", `create database "${target.db}";`);
  const restored = restoreFromFile(prodDump, target.db);
  // A --schema=public dump includes CREATE SCHEMA public, which a fresh
  // database already has — expected, so don't alarm anyone with it.
  const restoreLines = (restored.stderr ?? "").split("\n").filter((l) => l.startsWith("pg_restore:"));
  const isExpected = (l: string) => /schema "public" already exists/.test(l);
  const unexpected = restoreLines.filter((l) => !isExpected(l));
  const expectedCount = restoreLines.length - unexpected.length;
  const summary = unexpected.find((l) => /errors ignored on restore: \d+/.test(l));
  const ignored = summary ? Number(summary.match(/(\d+)$/)![1]) : 0;
  const worth = ignored === expectedCount ? unexpected.filter((l) => l !== summary) : unexpected;
  if (worth.length > 0) {
    console.log(`   pg_restore reported ${worth.length} unexpected message(s):`);
    worth.slice(0, 10).forEach((l) => console.log(`     ${l}`));
  }

  step("Comparing row counts with production");
  const prodCounts = parseCounts(prodSql(prodUrl!, COUNTS_SQL));
  const devCounts = parseCounts(localSql(target.db, COUNTS_SQL));
  const missing = [...prodCounts.keys()].filter((t) => !devCounts.has(t));
  if (missing.length > 0) fail(`These tables didn't make it into dev: ${missing.join(", ")}. The dump is at ${prodDump}.`);
  const differing = [...prodCounts].filter(([t, n]) => devCounts.get(t) !== n);
  const totalRows = [...devCounts.values()].reduce((a, b) => a + b, 0);
  if (differing.length === 0) console.log(`   all ${devCounts.size} tables match (${totalRows} rows).`);
  else {
    console.log(`   ${differing.length} table(s) differ — expected only if production changed during the copy:`);
    differing.forEach(([t, n]) => console.log(`     ${t}: prod ${n}, dev ${devCounts.get(t)}`));
  }

  step("Applying any migrations dev has that production doesn't");
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", shell: true, env: process.env });
  const migrateOut = `${migrate.stdout}${migrate.stderr}`;
  if (migrate.status !== 0) fail(`prisma migrate deploy failed:\n${migrateOut.trim()}`);
  const applied = /have been successfully applied|successfully applied/i.test(migrateOut);
  console.log(applied ? "   applied pending migrations." : "   no pending migrations.");

  if (flags.has("--no-scrub")) {
    console.log("\n   --no-scrub: real password hashes and contact details are still in the dev database.");
  } else {
    step("Scrubbing credentials");
    scrub(target.db);
  }

  console.log("\nDone.");
  if (applied) console.log('- Run "npx prisma generate" and restart the dev server (migrations changed the schema).');
  else console.log("- Restart the dev server if it was running (its database connections were dropped).");
  console.log(`- Delete ${path.relative(process.cwd(), prodDump)} when you're finished — it holds real data and password hashes.`);
  if (devExists) console.log(`- Your previous dev data is in ${path.relative(process.cwd(), devBackup)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
