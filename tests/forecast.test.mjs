import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "index.html must contain its application script");

function loadApp() {
  const context = vm.createContext({
    document: undefined,
    location: { search: "" },
    URLSearchParams,
    Intl,
    Date,
    Math,
    Map,
    Set,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async () => { throw new Error("unexpected fetch in unit test"); },
  });
  vm.runInContext(`${script}\n;globalThis.__test = {
    windowHours, resolve, modelWindowRain, fetchOmModelRain, fetchRipFromSrf, decide,
    setGetJson(fn) { getJson = fn; },
    setWindow(start, end) { WIN_START = start; WIN_END = end; },
  };`, context);
  return context.__test;
}

test("daylight trimming keeps at least three forecast hours", () => {
  const app = loadApp();
  assert.deepEqual(Array.from(app.windowHours(6.5)), [6, 7, 8, 9, 10]);
  assert.deepEqual(Array.from(app.windowHours(9.5)), [8, 9, 10]);
});

test("rain estimate averages available sources and ignores missing ones", () => {
  const app = loadApp();
  const result = app.resolve({ rain: 20 }, { rain: 40 }, 0, {
    hrrr: 60, nbm: null, hourlyRain: 80,
  });
  assert.equal(result.rain, 50);
});

test("HRRR/NBM fetch preserves hourly PoP so each window aggregates independently", async () => {
  const app = loadApp();
  app.setGetJson(async () => ({ hourly: {
    time: ["2026-11-04T06:00", "2026-11-04T07:00", "2026-11-04T08:00", "2026-11-04T09:00", "2026-11-04T10:00",
           "2026-11-04T11:00", "2026-11-04T12:00"],
    precipitation_probability: [0, 0, 30, 60, 0, 90, 80],
  } }));
  const raw = await app.fetchOmModelRain({ lat: 27, lon: -82 }, "gfs_hrrr", 2);
  // Hourly map, not a daily scalar
  assert.equal(typeof raw["2026-11-04"], "object");
  assert.equal(raw["2026-11-04"][8], 30);
  assert.equal(raw["2026-11-04"][11], 90);
  // Different windows see different rain
  assert.equal(app.modelWindowRain(raw, "2026-11-04", [6, 10]), 30);   // smoothed peak of [0,0,30,60,0] → 30
  assert.equal(app.modelWindowRain(raw, "2026-11-04", [10, 12]), 85);  // afternoon rain [0,90,80] → 85
});

test("surf-zone parser accepts multiple punctuation marks before risk", async () => {
  const app = loadApp();
  app.setGetJson(async url => {
    if (url.includes("products/types/SRF")) {
      return { "@graph": [{ "@id": "https://example.test/product" }] };
    }
    return { productText: "FLZ050\nRip Current Risk.... Moderate\n$$" };
  });
  assert.equal(await app.fetchRipFromSrf(), "Moderate");
});

test("missing coldest-hour is treated as UNKNOWN", () => {
  const app = loadApp();
  const d = app.decide({ avgFeels: 78, wind: 5, rain: 5, sun: 90, feelsLow: null });
  assert.equal(d.label, "UNKNOWN");
  assert.match(d.why, /coldest hour/);
});

test("no hourMatcher is applied at fetch time (hourly data is kept)", () => {
  // After the fix, fetchHRRR/fetchNBM are called without a matcher and store hourly maps.
  assert.doesNotMatch(script, /const hourMatcher = \(date, h\) => windowHours/);
  assert.match(script, /fetchHRRR\(b\), fetchNBM\(b\)/);
  assert.match(script, /modelWindowRain\(hrrr, date, hours\)/);
});

test("Open-Meteo family adds HRRR and NBM through day 2 only", () => {
  const app = loadApp();
  assert.equal(app.resolve({ rain: 20 }, { rain: 40 }, 2, { hrrr: 60, nbm: 80 }).rain, 40);   // (20 + (40+60+80)/3) / 2
  assert.equal(app.resolve({ rain: 20 }, { rain: 40 }, 3, { hrrr: 60, nbm: 80 }).rain, 30);   // (20 + 40) / 2
});
