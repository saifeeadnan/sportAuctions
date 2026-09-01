const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Not a package-manager workspace (root package.json has no "workspaces"
// field, by design) — mobile/ has its own independent node_modules. We only
// need Metro's file watcher to see a handful of pure-logic source files that
// live outside mobile/'s own root, so this is scoped to lib/ itself rather
// than the whole repo (avoids watching node_modules, .next, prisma/, etc.).
config.watchFolders = [path.resolve(repoRoot, "lib")];

module.exports = config;
