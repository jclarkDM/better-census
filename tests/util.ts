import { stateFipsMap } from "./fipsMap";

export type Location = {
  name: string;
  state: string;
  totalPopulation: number;
  coordinates: { lat: number; lng: number };
};

type Place = {
  STATEFP: string;
  PLACEFP: string;
  PLACENS: string;
  GEOIDFQ: string;
  GEOID: string;
  NAME: string;
  NAMELSAD: string;
  STUSPS: string;
  STATE_NAME: string;
  LSAD: string;
};

type CountySubdivision = {
  STATEFP: string;
  COUNTYFP: string;
  COUSUBFP: string;
  COUSUBNS: string;
  GEOIDFQ: string;
  GEOID: string;
  NAME: string;
  NAMELSAD: string;
  STUSPS: string;
  NAMELSADCO: string;
  STATE_NAME: string;
  LSAD: string;
};

export type GeocodedLocation = {
  PLACES: Place[];
  COUNTY_SUBDIVISIONS: CountySubdivision[];
};

type Geography = Place | CountySubdivision;

export function getPlaceGeography(geocodedLocation: GeocodedLocation) {
  const state = geocodedLocation.PLACES?.at(0)?.STATEFP ?? geocodedLocation.COUNTY_SUBDIVISIONS?.at(0)?.STATEFP;
  if (!state) return null;

  const isMCDState = stateFipsMap[Number(state) as keyof typeof stateFipsMap].mcd;
  const incorporatedPlaces = geocodedLocation.PLACES?.filter(isIncorporatedPlace);
  const CDPs = geocodedLocation.PLACES?.filter(isCDP);
  if (isMCDState) return incorporatedPlaces?.at(0) ?? geocodedLocation.COUNTY_SUBDIVISIONS?.at(0) ?? null;

  return incorporatedPlaces?.at(0) ?? CDPs?.at(0) ?? null;
}

export function isCDP(geography: Geography) {
  return ["55", "57", "62"].includes(geography.LSAD);
}

export function isIncorporatedPlace(geography: Geography) {
  return ["00", "25", "37", "43", "47", "53", "BL", "CB", "CN", "MB", "MG", "UB", "UC", "UG"].includes(geography.LSAD);
}

export function percentDiff(a: number, b: number) {
  return Math.abs(a - b) / b;
}

export function isCitySimilar(a: string, b: string) {
  const words = (s: string) => s.toLowerCase().trim().split(/\s+/);
  const A = new Set(words(a));
  const B = new Set(words(b));
  for (const w of A) if (B.has(w)) return true;

  return false;
}
