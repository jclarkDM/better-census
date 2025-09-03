import { expect, test } from "bun:test";
import { Census } from "../lib/census";
import locationsJSON from "./locations.json";
import testValidationJSON from "./test-validation.json";
import { getPlaceGeography, isCitySimilar, percentDiff, type GeocodedLocation, type Location } from "./util";

const locations: Location[] = locationsJSON;
const testValidation: Record<string, any> = testValidationJSON;

//

const url = `http://localhost:${process.env.BETTER_CENSUS_PORT ?? 3000}`;
const cen = await Census.createRemote(url);

//

locations.map((location, idx) => {
  test(`Geocoding Test: ${location.name}, ${location.state}`, async () => {
    const geocoded = (await cen.geocode({ ...location.coordinates })) as GeocodedLocation;
    const geography = getPlaceGeography(geocoded);
    expect(geography).toBeTruthy();
    expect(testValidation[geography!.GEOIDFQ].name).toEqual(location.name);
  });
});

locations.map((location, idx) => {
  test(`Population Test: ${location.name}, ${location.state}`, async () => {
    const geocoded = (await cen.geocode({ ...location.coordinates })) as GeocodedLocation;
    const geography = getPlaceGeography(geocoded);
    if (!geography) return;

    const population = await cen.run({
      places: [geography.GEOIDFQ],
      columns: ["B01001_001E"],
    });

    const recievedTotalPopulation = population[geography.GEOIDFQ]?.B01001_001E!;
    expect(percentDiff(recievedTotalPopulation, location.totalPopulation)).toBeLessThan(0.1);
    console.log(recievedTotalPopulation.toLocaleString(), "→", location.totalPopulation.toLocaleString(), "\n");
  });
});

locations.map((location, idx) => {
  test(`Name Validation Test: ${location.name}, ${location.state}`, async () => {
    const geocoded = (await cen.geocode({ ...location.coordinates })) as GeocodedLocation;
    const geography = getPlaceGeography(geocoded);
    if (!geography) return;

    expect(isCitySimilar(geography.NAMELSAD, location.name)).toBeTrue();
    console.log(geography.NAMELSAD, "→", location.name, "\n");
  });
});
