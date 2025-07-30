import { createIdQuery, createIdSet } from "../util/ids";

function units() {
  const id = "B25001_001E";
  return [id] as [typeof id];
}

const occupiedStatus = createIdSet([
  ["byOwner", "B25003_002E"],
  ["byRenter", "B25003_003E"]
]);

const occupied = createIdQuery(occupiedStatus, ["B25003_001E"]);

units.occupied = occupied;

const vacantStatus = createIdSet([
  ["forRent", "B25004_002E"],
  ["rented", "B25004_003E"],
  ["forSale", "B25004_004E"],
  ["sold", "B25004_005E"],
  ["forSeasonalUse", "B25004_006E"],
  ["forMigrantWorkers", "B25004_007E"],
  ["other", "B25004_008E"]
]);

const vacant = createIdQuery(vacantStatus, ["B25004_001E"]);

units.vacant = vacant;

function rent() {
  const id = "B25064_001E";
  return [id] as [typeof id];
}

const homeValueDecade = createIdSet([
  [">=2020", "B25107_002E"],
  ["2010-2019", "B25107_003E"],
  ["2000-2009", "B25107_004E"],
  ["1990-1999", "B25107_005E"],
  ["1980-1989", "B25107_006E"],
  ["1970-1979", "B25107_007E"],
  ["1960-1969", "B25107_008E"],
  ["1950-1959", "B25107_009E"],
  ["1940-1949", "B25107_010E"],
  ["<=1939", "B25107_011E"]
]);

const homeValue = createIdQuery(homeValueDecade, ["B25107_001E"]);

const median = {
  rent,
  homeValue
}

export const housingEncoder = {
  units,
  median
}