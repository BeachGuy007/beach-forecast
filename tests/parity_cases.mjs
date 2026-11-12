// Helper for the Python parity test: reads JSON cases on stdin, runs the page's own resolve() + decide() on each.
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
// the live page: BEACH_HTML, else ../index.html (the repo), else ../github/index.html (the script folder)
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const pagePath = [process.env.BEACH_HTML, here("../index.html"), here("../github/index.html")].find(p => p && existsSync(p));
if (!pagePath) throw new Error("live page not found (set BEACH_HTML)");
const html = readFileSync(pagePath, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({
  document: undefined, location: { search: "" }, URLSearchParams, Intl, Date, Math, Map, Set,
  AbortController, setTimeout, clearTimeout, fetch: async () => { throw new Error("no network"); },
});
vm.runInContext(`${script}\n;globalThis.__t = { resolve, decide, closeCalls };`, context);
const { resolve, decide, closeCalls } = context.__t;

const cases = JSON.parse(readFileSync(0, "utf8"));
const out = cases.map(c => {
  const u = resolve(c.n, c.o, c.dOut, c.extras);
  const sun = u.sky == null ? null : Math.max(0, 100 - Math.round(u.sky));
  const rain = u.rain == null ? null : Math.round(u.rain);
  const d = decide({ avgFeels: u.feelsAvg, wind: u.wind, rain, sun, feelsLow: u.feelsLow,
                     redTide: c.redTide, precipWhy: c.precipWhy });
  const close = d.label === "GO" ? closeCalls({ avgFeels: u.feelsAvg, feelsLow: u.feelsLow, wind: u.wind, rain, sun }) : [];
  return { feelsAvg: u.feelsAvg, feelsLow: u.feelsLow, wind: u.wind, rainRaw: u.rain, skyRaw: u.sky,
           rain, sun, label: d.label, why: d.why, close };
});
process.stdout.write(JSON.stringify(out));
