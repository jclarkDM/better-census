import { Census } from "../lib/census";
import locationsJSON from "./validation.json";

export type Location = {
  GEOIDFQ: string;
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

//
const url = `http://localhost:${process.env.BETTER_CENSUS_PORT ?? 3000}`;

export const locations: Location[] = locationsJSON;
export const localConnection = await Census.createRemote(url);
export function logComparison(test: string, real: string) {
  console.log("\n", `Test: ${test}`, "\n", `Real: ${real}`);
}

//

export function getPlaceGeography(geocodedLocation: GeocodedLocation) {
  const state = geocodedLocation.PLACES?.at(0)?.STATEFP ?? geocodedLocation.COUNTY_SUBDIVISIONS?.at(0)?.STATEFP;
  if (!state) return null;

  const incorporatedPlaces = geocodedLocation.PLACES?.filter(isIncorporatedPlace).map(correctGeography);
  const CDPs = geocodedLocation.PLACES?.filter(isCDP).map(correctGeography);
  if (isMCDState(state)) return incorporatedPlaces?.at(0) ?? geocodedLocation.COUNTY_SUBDIVISIONS?.at(0) ?? null;

  return incorporatedPlaces?.at(0) ?? CDPs?.at(0) ?? null;
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

function correctGeography(geography: Geography | undefined) {
  if (!geography) return geography;
  if (geography.GEOIDFQ === "1600000US2148000") geography.GEOIDFQ = "1600000US2148006";
  return geography;
}

function isCDP(geography: Geography) {
  return ["55", "57", "62"].includes(geography.LSAD);
}

function isIncorporatedPlace(geography: Geography) {
  return ["00", "25", "37", "43", "47", "53", "BL", "CB", "CN", "MB", "MG", "UB", "UC", "UG"].includes(geography.LSAD);
}

function isMCDState(stateFip: string | number) {
  return ["9", "23", "25", "26", "27", "33", "34", "36", "42", "44", "50", "55"].includes(String(Number(stateFip)));
}
