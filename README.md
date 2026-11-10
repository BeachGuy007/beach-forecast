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

**UNKNOWN** if average or coldest-hour feels-like, wind, rain, or sun is missing. **PASSED** once today's window is over.
**GO** otherwise; a gray *close call* note means a GO passes a limit by only a little.
A rain-related reason always ends with *(check radar)*.

- **Feels-like:** NWS apparent temperature and Open-Meteo apparent temperature are used as published by each provider, then blended 50/50 hour by hour. If a provider omits an hour, that provider's air temperature is used for that hour.
- **Temperature and wind:** NWS and Open-Meteo averaged 50/50.
- **Sun:** 100 minus cloud cover; NWS sky cover averaged with the mean of four Open-Meteo models.
- **Rain:** average of two source families, NWS (grid + hourly on day 0) and Open-Meteo (default
  model + HRRR + NBM on days 0–1). Averaging per family stops one forecast being counted several times.
- **Display only (never changes the call):** wind direction and onshore/offshore, rain amount,
  "thunder possible", and the rip-current level (a High risk shows a warning line).

Water quality and the crowd model live only in the Python reports (not in this repo).

## Tests
```
npm test
```
Runs the Node tests in `dashboard.test.js` and `tests/forecast.test.mjs`. The tests load the page's own script, so there is nothing to export. GitHub Actions runs them on every push.

## Keeping secrets out
The e-mail reports are Python scripts with credentials, so they are **not** part of this repo and
`.gitignore` blocks `*.py` and `beach_forecast_core/`. Keep it that way, or use a private repository.
