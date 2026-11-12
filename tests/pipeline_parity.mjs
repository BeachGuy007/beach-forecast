// Helper for the Python pipeline-parity test.
// Reads {dates, beach, payloads} as JSON on stdin, serves the SAME raw API payloads the Python is given
// to the live page's own code (fetch -> parse -> window -> blend -> decide), and prints what the page computes.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const pagePath = [process.env.BEACH_HTML, here("../index.html"), here("../github/index.html")].find(p => p && existsSync(p));
if (!pagePath) throw new Error("live page not found (set BEACH_HTML)");
const script = readFileSync(pagePath, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({ document: undefined, location: { search: "" }, URLSearchParams, Intl, Date, Math, Map, Set,
  AbortController, setTimeout, clearTimeout, fetch: async () => { throw new Error("no network"); } });
vm.runInContext(`${script}\n;globalThis.__t = { evaluateBeach, setGetJson(fn) { getJson = fn; } };`, context);

const { dates, beach, payloads } = JSON.parse(readFileSync(0, "utf8"));
const route = async (url) => {
  if (url.includes("/points/")) return payloads.points;
  if (url.endsWith("/forecast/hourly")) return payloads.nws_hourly;
  if (url.includes("/gridpoints/")) return payloads.nws_grid;
  if (url.includes("api.open-meteo.com/v1/gfs")) return url.includes("gfs_hrrr") ? payloads.hrrr : payloads.nbm;
  if (url.includes("api.open-meteo.com/v1/forecast")) return url.includes("hourly=cloud_cover&") ? payloads.cloud : payloads.om;
  if (url.includes("myfwc.com")) return { features: [] };
  return null;
};
context.__t.setGetJson(route);

const res = await context.__t.evaluateBeach(beach, dates, [6, 10]);
const out = res.rows.map(r => ({
  date: r.date, hours: [r.hours[0], r.hours[r.hours.length - 1]],
  feelsAvg: r.u.feelsAvg, feelsLow: r.u.feelsLow, wind: r.u.wind, rain: r.rain, sun: r.sun,
  label: r.label, why: r.why, close: r.close,
  nws: r.n ? { feelsAvg: r.n.feelsAvg, feelsLow: r.n.feelsLow, wind: r.n.wind, rain: r.n.rain, sun: r.n.sky == null ? null : Math.max(0, 100 - Math.round(r.n.sky)) } : null,
  om: r.o ? { feelsAvg: r.o.feelsAvg, feelsLow: r.o.feelsLow, wind: r.o.wind, rain: r.o.rain, sun: r.o.sun } : null,
  hrrr: r.hrrr, nbm: r.nbm, hourlyRain: r.hourlyRain,
}));
process.stdout.write(JSON.stringify(out));
