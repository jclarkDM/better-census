import { writeFileSync } from "node:fs";
import { Census } from "../lib/census";
import locationsJSON from "./locations.json";

import { stateFipsMap } from "./fipsMap";

type Location = {
  name: string;
  state: string;
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

type GeocodedLocation = {
  PLACES: Place[];
  COUNTY_SUBDIVISIONS: CountySubdivision[];
};

type Geography = Place | CountySubdivision;

const locations: Location[] = locationsJSON;

//

const url = "http://localhost:1776/";
const cen = await Census.createRemote(url);

const testedLocations: Record<string, any> = {};
await Promise.all(
  locations.map(async (location, idx) => {
    const geocoded = (await cen.geocode({ ...location.coordinates })) as GeocodedLocation;
    const geography = getPlaceGeography(geocoded);

    testedLocations[geography!.GEOIDFQ] = { ...location, geography };
  })
);

await Promise.all(
  Object.entries(testedLocations).map(async ([GEOIDFQ, location]) => {
    const population = await cen.run({
      places: [GEOIDFQ],
      columns: ["B01001_001E"],
    });

    const columns = {
      B01001_001E: population[GEOIDFQ]!["B01001_001E"],
    };

    testedLocations[GEOIDFQ] = { ...location, columns };
  })
);

writeFileSync("./tests/test-validation.json", JSON.stringify(testedLocations, null, 2));

//

async function getGeocodedLocations() {
  const geocodedLocations = await Promise.all(
    locations.map(async (location) => {
      const result = await cen.geocode({ ...location.coordinates });
      return result as GeocodedLocation;
    })
  );

  return geocodedLocations;
}

async function getLocationPopulations() {
  const geocodedLocations = await getGeocodedLocations();

  const populations = await Promise.all(
    geocodedLocations.map(async (location) => {
      const geography = getPlaceGeography(location);
      if (!geography) return {};

      return await cen.run({
        places: [geography?.GEOIDFQ],
        columns: ["B01001_001E"],
      });
    })
  );

  return populations;
}

function getPlaceGeography(geocodedLocation: GeocodedLocation) {
  const state = geocodedLocation.PLACES?.at(0)?.STATEFP ?? geocodedLocation.COUNTY_SUBDIVISIONS?.at(0)?.STATEFP;
  if (!state) return null;

  const isMCDState = stateFipsMap[Number(state) as keyof typeof stateFipsMap].mcd;
  const incorporatedPlaces = geocodedLocation.PLACES?.filter(isIncorporatedPlace);
  const CDPs = geocodedLocation.PLACES?.filter(isCDP);
  if (isMCDState) return incorporatedPlaces?.at(0) ?? geocodedLocation.COUNTY_SUBDIVISIONS?.at(0) ?? null;

  return incorporatedPlaces?.at(0) ?? CDPs?.at(0) ?? null;
}

function isCDP(geography: Geography) {
  return ["55", "57", "62"].includes(geography.LSAD);
}

function isIncorporatedPlace(geography: Geography) {
  return ["00", "25", "37", "43", "47", "53", "BL", "CB", "CN", "MB", "MG", "UB", "UC", "UG"].includes(geography.LSAD);
}
