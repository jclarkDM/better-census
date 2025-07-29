# Better Census

The US Census API is slow, clunky, and unreliable. This is my manifesto.

## Features

- ETL utilities for importing data directly from CSV input files
- DuckDB for efficient data querying
- Encoders for converting human-readable keys into Census IDs, e.g. `Census.encoder.housing.median.rent()` -> `"B25064_001E"`

## Setup
This repository includes [zip files in the releases section](https://github.com/jclarkDM/better-census/releases/tag/data) with common Census demographic data, including
- Age by race
- Housing data:
  - Average rent
  - Median home value
  - Occupied and vacant housing units
- Income buckets by race
- Per-capita income by race

To use this data, unzip it into the `data/raw` directory. Then, run the ETL script with `bun etl`. This will take a while, but you should get a DuckDB database file in `data/census.db`.

## Usage Example

```ts
import { Census } from "./lib/census";

const result = await Census.run({
  places: ["1600000US0980420", "1600000US0960260", "1600000US0980000", "1600000US1931710"],
  columns: [

    // Median rent for each place (single ID)
    ...Census.encoder.housing.median.rent(),
    // becomes "B25064_001E"

    // A single column from the occupied housing units table
    ...Census.encoder.housing.units.occupied("byOwner"),
    // becomes "B25003_002E"

    // Median home value for each place in three decades (three IDs)
    ...Census.encoder.housing.median.homeValue("1990-1999", "2000-2009", "2010-2019"),
    // becomes "B25107_005E", "B25107_004E", "B25107_003E"

    // Every column from the vacant housing units table
    ...Census.encoder.housing.units.vacant.all(),
    // becomes "B25004_002E", "B25004_003E", "B25004_004E", "B25004_005E", "B25004_006E", "B25004_007E", "B25004_008E"

    // arbitrary column ID, if it's not (yet) in the set of encoders
    "B19001A_001E"
  ]
});

```

## Type safety
The `columns` property of the `Census.run(...)` options object is fully type-safe. Any string ID you pass in will follow through in the type system, and will be used in the resulting data.

Example:
```ts
const result = await Census.run({
  places: ["place1", "place2", "place3"],
  columns: [
    "column1",
    "column2",
    "column3",
    "column4"
  ]
});

// Resulting object looks like this:
type Result = {
  place1: {
    column1: number | null,
    column2: number | null,
    column3: number | null,
    column4: number | null
  },
  place2: {
    column1: number | null,
    column2: number | null,
    column3: number | null,
    column4: number | null
  },
  place3: {
    column1: number | null,
    column2: number | null,
    column3: number | null,
    column4: number | null
  }
}
```

You can also use the `transpose` options to switch the keys and values, which will end up something like this:
```ts
type Result = {
  column1: {
    place1: number | null,
    place2: number | null,
    place3: number | null
  },
  column2: {
    place1: number | null,
    place2: number | null,
    place3: number | null
  },
  column3: {
    place1: number | null,
    place2: number | null,
    place3: number | null
  },
  column4: {
    place1: number | null,
    place2: number | null,
    place3: number | null
  }
}
```
