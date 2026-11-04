// Tests for the logic inside index.html. They load the page's own <script> in a sandbox,
// so there is nothing to export and no build step.  Run with:  npm test
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const EXPORTS = `;globalThis.T = {decide, closeCalls, resolve, feelsLike, fetchNWSPoints, modelWindowRain, windTag,
  avgDir, windowHours, nextDates, computeRows, thunderInWindow, smoothedPeak, nwsWindowPop, WINDOWS};`;

function load(extra = {}) {
  const ctx = vm.createContext({ location: { search: "" }, console, setTimeout, clearTimeout, setInterval: () => 0,
    Intl, URLSearchParams, AbortController, Promise, ...extra });
  vm.runInContext(script + EXPORTS, ctx);
  return ctx;
}
const plain = x => JSON.parse(JSON.stringify(x));   // objects from the sandbox have a different prototype
