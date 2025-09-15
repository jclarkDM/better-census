import { expect, test } from "bun:test";
import { getPlaceGeography, localConnection, locations, type GeocodedLocation } from "./util";

locations.map((location, idx) => {
  test(`Geocoding Test: ${location.name}, ${location.state}`, async () => {
    const geocoded = (await localConnection.geocode({ ...location.coordinates })) as GeocodedLocation;
    const geography = getPlaceGeography(geocoded);
    expect(geography).toBeTruthy();
    expect(geography!.GEOIDFQ).toEqual(location.GEOIDFQ);
  });
});
