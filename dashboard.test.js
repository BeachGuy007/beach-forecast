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

// ------------------------------------------------------------------ decision text
test("rain NO-GO ends with (check radar) exactly once", () => {
  const { T } = load();
  const both = T.decide({ avgFeels: 75, wind: 8, rain: 60, sun: 80, feelsLow: 74, precipWhy: "precip imminent (9a 60%)" });
  assert.equal(both.label, "NO-GO");
  assert.equal(both.why.split("(check radar)").length - 1, 1);
  assert.ok(both.why.endsWith("(check radar)"));
  assert.ok(T.decide({ avgFeels: 75, wind: 8, rain: 50, sun: 80, feelsLow: 74 }).why.includes("rain 50% ≥ 45% (check radar)"));
});

test("non-rain reasons never mention radar", () => {
  const { T } = load();
  const d = T.decide({ avgFeels: 75, wind: 25, rain: 10, sun: 80, feelsLow: 74 });
  assert.equal(d.why, "wind 25 ≥ 20 mph");
});

test("missing data gives UNKNOWN, clear data gives GO", () => {
  const { T } = load();
  assert.equal(T.decide({ avgFeels: 75, wind: 8, rain: null, sun: 80, feelsLow: 74 }).label, "UNKNOWN");
  assert.equal(T.decide({ avgFeels: 75, wind: 8, rain: 10, sun: 80, feelsLow: 74 }).label, "GO");
});

test("close calls: only values that pass by a small margin", () => {
  const { T } = load();
  assert.deepEqual(plain(T.closeCalls({ avgFeels: 73, feelsLow: 71, wind: 19, rain: 42, sun: 53 })),
    ["feels 73° (limit 72°)", "coldest hour 71° (limit 70°)", "wind 19 mph (limit 20)", "rain 42% (limit 45%)", "sun 53% (limit 50%)"]);
  assert.deepEqual(plain(T.closeCalls({ avgFeels: 80, feelsLow: 78, wind: 8, rain: 10, sun: 90 })), []);
  assert.deepEqual(plain(T.closeCalls({ avgFeels: 71, feelsLow: 69, wind: 22, rain: 50, sun: 40 })), []);   // already failing
});

// ------------------------------------------------------------------ rain families
test("rain averages two families, so duplicate Open-Meteo-family values are not triple counted", () => {
  const { T } = load();
  // NWS family: (60 + 40) / 2 = 50 ; OM family: (20 + 20 + 20) / 3 = 20 ; result 35
  assert.equal(T.resolve({ rain: 60 }, { rain: 20 }, 0, { hrrr: 20, nbm: 20, hourlyRain: 40 }).rain, 35);
  assert.equal(T.resolve({ rain: 60 }, { rain: 20 }, 1, { hrrr: 20, nbm: 20 }).rain, 40);
  assert.equal(T.resolve({ rain: 60 }, { rain: 20 }, 3, { hrrr: 99 }).rain, 40);       // later days: NWS and OM only
});

test("a missing family is skipped, no data gives null", () => {
  const { T } = load();
  assert.equal(T.resolve({ rain: null }, { rain: 30 }, 2).rain, 30);
  assert.equal(T.resolve({}, {}, 2).rain, null);
});

test("model window rain smooths and uses only the window hours", () => {
  const { T } = load();
  const raw = { "2026-11-04": { 5: 90, 6: 0, 7: 30, 8: 0, 9: 0, 10: 0, 11: 90 } };
  assert.equal(T.modelWindowRain(raw, "2026-11-04", [6, 10]), 15);   // rolling 3-hour means 15,10,10,0,0 (the first hour only has 2 neighbours)
  assert.equal(T.modelWindowRain(raw, "2026-11-05", [6, 10]), null);
});

// ------------------------------------------------------------------ formulas and helpers
test("missing humidity uses 70% (same as the Python script)", () => {
  const { T } = load();
  assert.equal(T.feelsLike(88, null, 5), T.feelsLike(88, 70, 5));
});

test("wind direction helpers", () => {
  const { T } = load();
  assert.equal(T.windTag(250, 250), "onshore");
  assert.equal(T.windTag(340, 250), "cross-shore");
  assert.equal(T.windTag(70, 250), "offshore");
  assert.ok(Math.abs(T.avgDir([350, 10]) - 0) < 0.001 || Math.abs(T.avgDir([350, 10]) - 360) < 0.001);   // wrap-around
});

test("dates are calendar days and the window trims to daylight", () => {
  const { T } = load();
  const d = plain(T.nextDates(3));
  assert.equal(d.length, 3);
  assert.equal(new Date(d[2] + "T00:00:00Z") - new Date(d[0] + "T00:00:00Z"), 2 * 86400000);
  assert.deepEqual(plain(T.windowHours(7.2, [6, 10])), [7, 8, 9, 10]);        // sunrise 7:12 -> start 7
  assert.deepEqual(plain(T.windowHours(null, [6, 10])), [6, 7, 8, 9, 10]);
});

// ------------------------------------------------------------------ network behaviour
test("one NWS /points request is shared, and a failure is not remembered", async () => {
  let calls = 0, ok = false;
  const fetch = async () => { calls++; await new Promise(r => setTimeout(r, 5));
    return ok ? { ok: true, status: 200, json: async () => ({ properties: { gridId: "TBW" } }) } : { ok: false, status: 404, json: async () => null }; };
  const { T } = load({ fetch });
  const b = { lat: 27.27, lon: -82.55 };
  const [a1, a2] = await Promise.all([T.fetchNWSPoints(b), T.fetchNWSPoints(b)]);
  assert.equal(calls, 1);                 // concurrent callers share one request
  assert.equal(a1, null); assert.equal(a2, null);
  ok = true;
  assert.equal((await T.fetchNWSPoints(b)).properties.gridId, "TBW");   // the earlier failure was not cached
  await T.fetchNWSPoints(b);
  assert.equal(calls, 2);                 // success is cached
});

// ------------------------------------------------------------------ today's window
test("today's window shows PASSED once its last hour is over", () => {
  class Fixed extends Date { constructor(...a) { super(...(a.length ? a : ["2026-11-04T17:00:00Z"])); } static now() { return Date.parse("2026-11-04T17:00:00Z"); } }
  const { T } = load({ Date: Fixed });   // 12:00 ET on 2026-11-04
  const data = { om: null, hrrr: {}, nbm: {}, rt: { status: "clear" }, nwsRaw: null, hourly: [], cloudMap: {} };
  const rows = plain(T.computeRows({ onshore: 250 }, data, ["2026-11-04", "2026-11-05"], [6, 10]));
  assert.equal(rows[0].label, "PASSED");
  assert.equal(rows[1].label, "UNKNOWN");   // tomorrow is never passed
  const later = plain(T.computeRows({ onshore: 250 }, data, ["2026-11-04"], [10, 15]));
  assert.notEqual(later[0].label, "PASSED"); // a window that is still running
});

// ------------------------------------------------------------------ page smoke test
function stubBrowser() {
  const els = {}, store = {};
  const el = id => ({ id, innerHTML: "", textContent: "", value: "", dataset: {}, listeners: {}, options: [],
    addEventListener(t, fn) { this.listeners[t] = fn; }, querySelectorAll: () => [] });
  const document = { getElementById: id => els[id] ??= el(id), querySelectorAll: () => [], hidden: false, title: "", lastModified: "" };
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  let fetches = 0;
  const fetch = async () => { fetches++; return { ok: false, status: 404, json: async () => null }; };
  return { els, store, document, localStorage, fetch, fetches: () => fetches };
}
const settle = () => new Promise(r => setTimeout(r, 300));

test("page loads, lists three windows, and switching windows does not refetch", async () => {
  const b = stubBrowser();
  load({ document: b.document, localStorage: b.localStorage, fetch: b.fetch });
  await settle();
  assert.match(b.els.out.innerHTML, /Siesta Key/);
  assert.equal((b.els.winSel.innerHTML.match(/<option/g) || []).length, 3);
  const before = b.fetches();
  b.els.winSel.value = "9-13";
  b.els.winSel.listeners.change();
  assert.equal(b.fetches(), before);                       // same data, new window
  assert.match(b.els.title.textContent, /9am–1pm/);
  assert.match(b.els.out.innerHTML, /9a–1p/);
});

test("results are saved and shown instantly on the next visit", async () => {
  const b = stubBrowser();
  load({ document: b.document, localStorage: b.localStorage, fetch: b.fetch });
  await settle();
  assert.ok(b.store["beachForecast:v2:Siesta Key"]);
  const b2 = stubBrowser(); b2.store["beachForecast:v2:Siesta Key"] = b.store["beachForecast:v2:Siesta Key"];
  load({ document: b2.document, localStorage: b2.localStorage, fetch: b2.fetch });
  assert.match(b2.els.out.innerHTML, /Siesta Key/);       // painted from the saved copy before any network answer
});
