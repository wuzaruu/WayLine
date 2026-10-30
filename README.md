# WayLine

React, Vite and TypeScript route previews for Edmonton buses, with a Node/Express server ready for Railway.

## Run locally

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set `MAPS_API_KEY` in `.env.local` and open http://localhost:5173. Restart the server after changing environment variables. Without a key, satellite route previews still work.

## Railway

Connect this repository to Railway and set `MAPS_API_KEY` in the service variables. Build with `npm run build` and start with `npm start`; `railway.json` configures these commands and `/api/health`. The server binds to Railway's `PORT`.

Enable Maps JavaScript API and billing for the Google project. Restrict the browser key to the Railway/custom-domain URLs. The browser key must be visible to the browser to display Google Maps and Street View; storing it in a Railway variable does not make it a server secret. No key is embedded in this repository or the Vite build.

Optional Google road instructions use a separate `MAPS_SERVER_API_KEY`, with Routes API enabled. That key is used only by the Node server and is never returned by `/api/config`. Without it, route turns are estimated from the ETS shape. Current bus restrictions and lane assignments are not provided by this data.

## Features

- Route-number search, direction/pattern selection, stops and representative scheduled journey times.
- 182 ETS bus routes and 390 representative route patterns.
- First-person Google Street View with a camera-anchored blue route ribbon.
- Satellite follow camera, automatically used during missing Street View coverage.
- Clickable stops with numbers, platforms and wheelchair boarding information when provided.
- Visual stop notices and optional spoken stop/turn announcements.
- Panorama capture month/year when Google supplies it.
- Native navigation fullscreen, with an immersive viewport fallback for browsers without the Fullscreen API.
- Phone layout, top-right satellite preview and GPS following by default when Start route is pressed.
- A separate video-style route preview player directly above Start route.
- Independent playback state in each browser tab.

Street View advances between captured panoramas. The road ribbon assumes a flat ground plane and uses route geometry plus the actual panorama camera position. It cannot guarantee lane-level accuracy or invent required turn-lane changes. Third-person mode is a satellite map following the bus marker.

## Route data

The included [City of Edmonton GTFS feed](https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/GTFS/gtfs.zip) covers October 13–November 28, 2026. These are static routes, not live vehicle locations or departure predictions. Travel times come from representative scheduled trips. Distinct headsign/direction combinations use their most common shape; not every short-turn variation is included.

Refresh the snapshot from an extracted GTFS ZIP:

```powershell
node scripts/prepare-ets.mjs C:\path\to\extracted-gtfs
```

[Edmonton open data terms](https://data.edmonton.ca/stories/s/City-of-Edmonton-Open-Data-Terms-of-Use/msh8-if28/). Google provides connected maps and panoramas. Esri World Imagery provides the satellite fallback, with attribution retained on the map.

## Validate

```powershell
npm test
npm run build
```

Google imagery, key restrictions, quotas and GPS permissions must also be checked in the deployed browser. A local production server can be run with `npm start` after building.
