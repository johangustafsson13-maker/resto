import SunCalc from "suncalc";

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

/**
 * Returns a sun score 0–100 for the given coordinates at the current time.
 * Score is based on the sun's altitude above the horizon via a sine curve.
 */
export function getSunScore(lat: number, lng: number, at: Date = new Date()): number {
  const { altitude } = SunCalc.getPosition(at, lat, lng);

  if (altitude <= 0) return 0;

  const maxAltitude = Math.PI / 2;
  const score = Math.sin((altitude / maxAltitude) * (Math.PI / 2)) * 100;

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Returns true if the given coordinate is in building shadow at the given time.
 * Uses queryRenderedFeatures on the "sun-buildings" fill-extrusion layer.
 * Returns null if the venue is outside the current map viewport.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isInShadow(
  map: any,
  lat: number,
  lng: number,
  date: Date = new Date(),
): boolean | null {
  const { altitude, azimuth } = SunCalc.getPosition(date, lat, lng);

  if (altitude <= 0) return true;

  const bearingRad = (((azimuth / DEG_TO_RAD) + 180) % 360) * DEG_TO_RAD;
  const dx = Math.sin(bearingRad);
  const dy = -Math.cos(bearingRad);

  const origin = map.project([lng, lat]);

  const canvas = map.getCanvas();
  if (
    origin.x < 0 || origin.x > canvas.width ||
    origin.y < 0 || origin.y > canvas.height
  ) {
    return null;
  }

  const STEP_PX = 5;
  const MAX_STEPS = 50;

  for (let i = 1; i <= MAX_STEPS; i++) {
    const px = origin.x + dx * STEP_PX * i;
    const py = origin.y + dy * STEP_PX * i;

    const sample = map.unproject([px, py]);
    const dLat = (sample.lat - lat) * DEG_TO_RAD;
    const dLng = (sample.lng - lng) * DEG_TO_RAD;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * DEG_TO_RAD) * Math.cos(sample.lat * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;
    const horizontalDist = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const minBlockingHeight = horizontalDist * Math.tan(altitude);

    const features = map.queryRenderedFeatures([px, py], { layers: ["sun-buildings"] });
    for (const f of features) {
      const h = Number(f.properties?.height ?? 0);
      if (h > minBlockingHeight) return true;
    }
  }

  return false;
}
