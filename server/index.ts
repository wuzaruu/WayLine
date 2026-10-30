import express from 'express';
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
const app = express();
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const browserKey = process.env.MAPS_API_KEY || '';
const serverKey = process.env.MAPS_SERVER_API_KEY || '';
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ googleMapsBrowserKey: browserKey, serverDirectionsEnabled: !!serverKey });
});
const quota = new Map<string, { n: number; reset: number }>();
app.post('/api/directions', async (req, res) => {
  if (!serverKey) { res.status(503).json({ error: 'Google road guidance is not enabled.' }); return; }
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}` && new URL(origin).host !== req.get('host')) {
    res.status(403).json({ error: 'Use directions from this app.' }); return;
  }
  const ip = req.ip || 'local'; const now = Date.now();
  for (const [key, value] of quota) if (value.reset < now) quota.delete(key);
  const use = quota.get(ip) || { n: 0, reset: now + 60_000 };
  quota.set(ip, use);
  if (++use.n > 12) { res.status(429).json({ error: 'Please wait a minute before requesting more directions.' }); return; }
  const points: unknown = req.body?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 27 || points.some(p => !p || typeof p.lat !== 'number' || typeof p.lng !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.lat < 53.25 || p.lat > 53.8 || p.lng < -113.9 || p.lng > -113.2)) {
    res.status(400).json({ error: 'Provide 2–27 route points within the Edmonton area.' }); return;
  }
  const waypoint = (p: { lat: number; lng: number }) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': serverKey, 'X-Goog-FieldMask': 'routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation,routes.warnings' },
      body: JSON.stringify({ origin: waypoint(points[0]), destination: waypoint(points.at(-1)), intermediates: points.slice(1, -1).map(waypoint), travelMode: 'DRIVE', languageCode: 'en-CA', units: 'METRIC', routingPreference: 'TRAFFIC_UNAWARE' })
    });
    if (!response.ok) { res.status(502).json({ error: `Google could not calculate road directions (${response.status}). Check that Routes API and billing are enabled.` }); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.json(await response.json());
  } catch { res.status(502).json({ error: 'Google directions timed out. You can still preview the ETS route.' }); }
});
if (production) {
  app.use(express.static(resolve('dist')));
  app.get('/{*splat}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT) || 5173;
const server = app.listen(port, '0.0.0.0', () => console.log(`Wayline is ready at http://localhost:${port}`));
process.on('SIGTERM', () => server.close());
