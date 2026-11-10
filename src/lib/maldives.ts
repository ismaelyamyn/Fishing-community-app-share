// Centre of the Maldives (lng, lat)
export const MALDIVES_CENTER: [number, number] = [73.2207, 3.2028];

// [[west, south], [east, north]] around the whole Maldives, with a small margin.
// Keep in sync with assert_valid_spot() in phase3.sql.
export const MALDIVES_BOUNDS: [[number, number], [number, number]] = [
  [72.0, -1.5],
  [74.5, 7.8],
];

export function inMaldivesBounds(lng: number, lat: number): boolean {
  const [[west, south], [east, north]] = MALDIVES_BOUNDS;
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= west &&
    lng <= east &&
    lat >= south &&
    lat <= north
  );
}
