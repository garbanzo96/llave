export type Point = { lat: number; lng: number };

export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 200 m cubre el error típico del GPS de un teléfono en ciudad.
export const ARRIVAL_RADIUS_KM = 0.2;

export function withinArrivalRadius(worker: Point, home: Point): boolean {
  return distanceKm(worker, home) <= ARRIVAL_RADIUS_KM;
}

// Hora local de Chile; los turnos nocturnos son de 22:00 a 07:00.
export function isNight(at: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Santiago" }).format(at),
  );
  return hour >= 22 || hour < 7;
}
