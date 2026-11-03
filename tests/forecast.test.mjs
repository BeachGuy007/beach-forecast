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
    windowHours, resolve, fetchOmModelRain, fetchRipFromSrf,
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

test("HRRR/NBM matcher excludes hours before the daylight-trimmed window", async () => {
  const app = loadApp();
  app.setGetJson(async () => ({ hourly: {
    time: ["2026-11-04T06:00", "2026-11-04T07:00", "2026-11-04T08:00", "2026-11-04T09:00", "2026-11-04T10:00"],
    precipitation_probability: [0, 0, 30, 60, 0],
  } }));
  const result = await app.fetchOmModelRain(
    { lat: 27, lon: -82 }, "gfs_hrrr", 2,
    (_date, hour) => hour >= 8 && hour <= 10,
  );
  assert.equal(result["2026-11-04"], 45); // smoothed peak of [30, 60, 0]
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

test("rain providers are passed the sunrise-trimmed matcher", () => {
  assert.match(script, /const hourMatcher = \(date, h\) => windowHours\(sunrise\[date\] \?\? null\)\.includes\(h\)/);
  assert.match(script, /fetchHRRR\(b, hourMatcher\), fetchNBM\(b, hourMatcher\)/);
});
