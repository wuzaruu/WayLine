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
- First-person Google Street View with an always-on, camera-anchored blue route ribbon.
- Continuous camera-heading updates through turns, independent of panorama lookups.
- Free-look keeps the road overlay in world coordinates; Face route restores camera following.
- Following mode preserves the map zoom selected with the plus/minus controls.
- Startup preparation progress and two reusable Google viewers, keeping the current picture in place while the next viewpoint prepares.
- Satellite follow camera, automatically used during missing Street View coverage.
- Clickable stops with numbers, platforms and wheelchair boarding information when provided.
- Visual stop notices and optional spoken stop/turn announcements.
- Panorama capture month/year when Google supplies it.
- Native navigation fullscreen, with an immersive viewport fallback for browsers without the Fullscreen API.
- Phone layout, top-right satellite preview and GPS following by default when Start route is pressed.
- A Route preview button above Start route that opens a dedicated player without GPS.
- A draggable mobile route panel with collapsed, middle and expanded positions.
- Search results contained in the panel, including when the phone keyboard reduces the viewport.
- Independent playback state in each browser tab.

Street View advances between captured panoramas. The road ribbon assumes a flat ground plane and uses route geometry plus the actual panorama camera position. It cannot guarantee lane-level accuracy or invent required turn-lane changes. Third-person mode is a satellite map following the bus marker.

The startup percentage reports preparation of the starting and next viewpoint. It is not an image-download percentage for the whole route. Google’s documented JavaScript viewer does not expose full tile-render completion or whole-route image preloading. The buffer is limited to the current and next viewer; it does not download or store a route-wide imagery collection. Photo-to-photo position jumps, slow-network stalls and imagery gaps can still occur. See the [Street View viewer reference](https://developers.google.com/maps/documentation/javascript/reference/street-view).

## Lane correction cache

`public/data/lane-corrections.json` deploys with the site and needs no Railway volume. It contains review slots for all 182 routes and 390 representative patterns. All slots are currently pending; no manually verified lane paths have been supplied or completed. ETS route shapes do not specify the correct lane or turn-lane transition.

A reviewed pattern can provide an ordered `path` of `[latitude, longitude]` points following the lane centre, including gradual lane changes and the exit from each turn. Record the evidence in `source`, the review date in `reviewedAt`, and set `reviewStatus` to `verified` only after checking the complete pattern. Verified paths replace the route geometry used by both maps and the Street View ribbon. Automatic camera-lane offsets are disabled for these paths so looking around cannot move the reviewed line.

The app ignores pending corrections, invalid coordinates, mismatched route-shape signatures and corrections from a different feed version. Refresh the review slots after refreshing ETS data with `npm run prepare:lanes`. Matching shapes retain their corrections; changed shapes return to pending. This JSON is route geometry only; Google imagery remains managed by its viewer.

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
