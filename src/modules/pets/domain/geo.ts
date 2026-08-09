// Публично координаты пропажи округляем: место пропажи обычно рядом с домом
// владельца, поэтому нашедшему отдаём район (~110 м), а не точную метку.
const PUBLIC_COORD_PRECISION = 3;

const KM_PER_LAT_DEGREE = 111.32;
const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

export function roundCoord(value: number | null | undefined): number | null {
  if (value == null) return null;
  const factor = 10 ** PUBLIC_COORD_PRECISION;
  return Math.round(value * factor) / factor;
}

/**
 * Границы квадрата, описанного вокруг круга поиска. Фильтруем по нему в БД:
 * это попадает в индекс [lat, lng] и корректно работает с пагинацией.
 * Углы квадрата дальше радиуса — точное расстояние отдаём в distanceKm,
 * чтобы клиент мог отсечь лишнее.
 */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / KM_PER_LAT_DEGREE;
  const lngDelta =
    radiusKm / (KM_PER_LAT_DEGREE * Math.max(Math.cos(toRadians(lat)), 0.01));
  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lngMin: lng - lngDelta,
    lngMax: lng + lngDelta,
  };
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
