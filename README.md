# Beach Forecast dashboard

Live go / no-go for Gulf-coast beaches near Sarasota, in one file (`index.html`, no build step).
Open the GitHub Pages site on any phone or tablet.

**Live page:** `https://beachguy007.github.io/beach-forecast/`

## Using it
- Pick a **beach** and a **window** (6–10am, 9am–1pm, 10am–3pm). All three windows come from the same
  data, so switching is instant. `?window=8-12` opens a custom window.
- The small **Calls by window** table shows the call for every window side by side.
- Results are saved in the browser and shown immediately on the next visit while fresh data loads.
- The title area shows the build and when the file was last saved. If it looks stale, hard-refresh.

## How the call is made
**NO-GO** if any of these is true (limits are at the top of `index.html`):

| Check | Limit |
|---|---|
| Average feels-like in the window | below 72°F |
| Coldest hour (feels-like) | below 70°F |
| Wind (window maximum) | 15 mph or more |
| Rain | 45% or more |
| Sun | below 50% |
| Rain imminent (today, NWS hourly, inside the window) | yes |
| Red tide (FWC, 15 mi, last 8 days) | moderate or severe |

**UNKNOWN** if average feels-like, coldest-hour feels-like, wind, rain or sun is missing.
**PASSED** once today's window is over.
**GO** otherwise; a gray *close call* note means a GO passes a limit by only a little.
A rain-related reason always ends with *(check radar)*.

- **Temperature and wind:** NWS and Open-Meteo air temperature, humidity and wind are averaged 50/50.
  Feels-like is the NWS rule applied once to that blend (heat index at ≥80°F, wind chill at ≤50°F
  and wind >3 mph, otherwise air temperature). Same rule as weather.gov / Weather Underground and
  the Python email reports. Vendor apparent-temperature fields are not averaged.
- **Sun:** 100 minus cloud cover; NWS sky cover averaged with the mean of four Open-Meteo models.
- **Rain:** average of two source families, NWS (grid + hourly on day 0) and Open-Meteo (default
  model + HRRR + NBM on days 0–2). Hourly model PoP is kept per hour and aggregated per window so
  side-by-side calls stay correct. Averaging per family stops one forecast being counted several times.
- **Display only (never changes the call):** wind direction and onshore/offshore, rain amount,
  "thunder possible", and the rip-current level (a High risk shows a warning line).

Water quality (bacteria) and the crowd model live only in the Python reports (not in this repo), so the
Python e-mail can show NO-GO for a poor-water day that this page calls GO. Everything else is meant to match
the Python reports exactly; the Python test suite runs this page's own `resolve()` and `decide()` against the
Python on 400 random inputs to keep it that way.

## Tests
```
npm test
```
Runs `node --test` (Node 20+): `dashboard.test.js` and `tests/forecast.test.mjs`.
The tests load the page's own script, so there is nothing to export. GitHub Actions runs them on every push.

## Keeping secrets out
The e-mail reports are Python scripts with credentials, so they are **not** part of this repo and
`.gitignore` blocks `*.py` and `beach_forecast_core/`. Keep it that way, or use a private repository.
