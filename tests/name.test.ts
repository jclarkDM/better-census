import { expect, test } from "bun:test";
import { getPlaceGeography, isCitySimilar, localConnection, locations, logComparison, type GeocodedLocation } from "./util";

locations.map((location, idx) => {
  test(`Name Validation Test: ${location.name}, ${location.state}`, async () => {
    const geocoded = (await localConnection.geocode({ ...location.coordinates })) as GeocodedLocation;
    const geography = getPlaceGeography(geocoded);
    if (!geography) return;

    expect(isCitySimilar(geography.NAMELSAD, location.name)).toBeTrue();
    logComparison(geography.NAMELSAD, location.name);
  });
});
