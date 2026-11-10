// Regression tests for the current browser forecast logic in index.html.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
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
    windowHours, resolve, fetchOmModelRain, modelWindowRain, decide, fetchRipFromSrf,
    setGetJson(fn) { getJson = fn; },
  };`, context);
  return context.__test;
}

test("daylight trimming keeps at least three forecast hours", () => {
  const app = loadApp();
  assert.deepEqual(Array.from(app.windowHours(6.5)), [6, 7, 8, 9, 10]);
  assert.deepEqual(Array.from(app.windowHours(9.5)), [8, 9, 10]);
});

test("rain estimate averages source families rather than double-counting providers", () => {
  const app = loadApp();
  const result = app.resolve({ rain: 60 }, { rain: 20 }, 0, {
    hrrr: 20, nbm: 20, hourlyRain: 40,
  });
  assert.equal(result.rain, 35);
});

test("current wind threshold produces NO-GO at 15 mph", () => {
  const app = loadApp();
  const result = app.decide({ avgFeels: 75, feelsLow: 74, wind: 15, rain: 10, sun: 80 });
  assert.equal(result.label, "NO-GO");
  assert.match(result.why, /wind 15 ≥ 15 mph/);
});

test("missing required forecast fields produce UNKNOWN", () => {
  const app = loadApp();
  assert.equal(app.decide({ avgFeels: 75, feelsLow: 74, wind: 8, rain: null, sun: 80 }).label, "UNKNOWN");
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
