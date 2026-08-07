import { config } from "dotenv";
import { execSync } from "child_process";
import { Client } from "pg";

// Deliberately loaded after the default "dotenv/config" import order elsewhere
// in this repo's scripts — this one specifically needs .env.test, not .env,
// since it provisions the dedicated test database, never the dev one.
config({ path: ".env.test", override: true });

const TEST_DB_NAME = "sportauction_test";

async function main() {
  const testUrl = new URL(process.env.DATABASE_URL!);

  // Connecting to the target test database before it exists would fail, so
  // this connects to Postgres's own "postgres" maintenance database first —
  // same instance/credentials, just to run a CREATE DATABASE if needed.
  const maintClient = new Client({
    host: testUrl.hostname,
    port: Number(testUrl.port),
    user: testUrl.username,
    password: testUrl.password,
    database: "postgres",
  });
  await maintClient.connect();

  const { rows } = await maintClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    TEST_DB_NAME,
  ]);
  if (rows.length === 0) {
    // CREATE DATABASE has no "IF NOT EXISTS" and can't be parameterized —
    // TEST_DB_NAME is a fixed constant above, not user input.
    await maintClient.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    console.log(`Created database "${TEST_DB_NAME}"`);
  } else {
    console.log(`Database "${TEST_DB_NAME}" already exists`);
  }
  await maintClient.end();

  console.log("Running migrations against the test database...");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });

  console.log("Test database ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
