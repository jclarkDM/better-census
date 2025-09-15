import { expect, test } from "bun:test";
import { getPlaceGeography, localConnection, locations, logComparison, percentDiff, type GeocodedLocation } from "./util";

locations.map((location, idx) => {
  test(`Population Test: ${location.name}, ${location.state}`, async () => {
    const geocoded = (await localConnection.geocode({ ...location.coordinates })) as GeocodedLocation;
    const geography = getPlaceGeography(geocoded);
    if (!geography) return;

    const population = await localConnection.run({
      places: [geography.GEOIDFQ],
      columns: ["B01001_001E"],
    });

    const recievedTotalPopulation = population[geography.GEOIDFQ]?.B01001_001E!;
    expect(percentDiff(recievedTotalPopulation, location.totalPopulation)).toBeLessThan(0.1);
    logComparison(recievedTotalPopulation.toLocaleString(), location.totalPopulation.toLocaleString());
  });
});
