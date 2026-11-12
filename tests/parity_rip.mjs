// Helper for the Python parity test: reads a JSON list of Surf Zone Forecast texts on stdin and prints the
// rip-current level the live page's own ripFromSrfText() finds in each.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const pagePath = [process.env.BEACH_HTML, here("../index.html"), here("../github/index.html")].find(p => p && existsSync(p));
if (!pagePath) throw new Error("live page not found (set BEACH_HTML)");
const script = readFileSync(pagePath, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({ document: undefined, location: { search: "" }, URLSearchParams, Intl, Date, Math, Map, Set,
  AbortController, setTimeout, clearTimeout, fetch: async () => { throw new Error("no network"); } });
vm.runInContext(`${script}\n;globalThis.__t = { ripFromSrfText };`, context);
const texts = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(texts.map(t => context.__t.ripFromSrfText(t))));
