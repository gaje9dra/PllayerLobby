import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;

// `server-only` is a Next.js build-time boundary. Node's standalone test runner
// executes server modules directly, so neutralize only that marker during tests.
// ESM/CJS interop can pass the resolved package path to Module._load rather than
// the bare `server-only` specifier, so handle both forms.
Module._load = function load(request, parent, isMain) {
  if (
    request === "server-only" ||
    (typeof request === "string" && /[\\/]server-only[\\/]index\.js$/.test(request))
  ) {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
