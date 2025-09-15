<div align="center">
  <img src=".github/LOGO.svg" alt="Better Census" width="200" height="auto" />
  &nbsp;
  <p>The US Census API is slow, clunky, and unreliable. This is my manifesto.</p>
  <p>
    <a style="text-decoration: none;" href="https://github.com/jclarkDM/better-census/graphs/contributors"><img src="https://img.shields.io/github/contributors/jclarkDM/better-census" alt="contributors" /></a>
    <a style="text-decoration: none;" href=""><img src="https://img.shields.io/github/last-commit/jclarkDM/better-census" alt="last update" /></a>
    <a style="text-decoration: none;" href="https://github.com/jclarkDM/better-census/stargazers"><img src="https://img.shields.io/github/stars/jclarkDM/better-census" alt="stars" /></a>
    <a style="text-decoration: none;" href="https://github.com/jclarkDM/better-census/issues/"><img src="https://img.shields.io/github/issues/jclarkDM/better-census" alt="open issues" /></a>
    <a style="text-decoration: none;" href="https://github.com/jclarkDM/better-census/blob/master/LICENSE.txt"><img src="https://img.shields.io/github/license/jclarkDM/better-census" alt="license" /></a>
  </p>
</div>

## :sparkles: Features
- ETL utilities for importing data directly from `.csv` `.dat` and `.shp` files
- DuckDB for efficient data querying
- Encoders for converting human-readable keys into Census IDs, e.g. `Census.encoder.housing.median.rent()` -> `"B25064_001E"`

---

## :wrench: Setup
This repository includes [files in the releases section](https://github.com/jclarkDM/better-census/releases/tag/data) with common Census demographic data.

To use this data, unzip it into the `data/raw` directory. Then, run the ETL script with `bun etl`. This will take a while, but you should get a DuckDB database file in `data/census.db`.

### 1. Add Data Sources
```bash
bun run data urls
```

Add the URLs of the data sources you want to use to a `data/urls.txt` file. For a quickstart, you can use the ones listed in the `data/urls.example.txt` file.

### 2. Collect the Data
Either add your data sources to the `data/raw` directory, or run the `bun run data collect` command to download the data from the URLs in a `data/urls.txt` file.
```bash
bun run data collect
```

### 3. ETL the Data
Run the `bun run etl` command to import the data into the DuckDB database. For most cases, we're only interested in the `060` (County Subdivision) and `160` (Incorporated Place) GEOIDs.
```bash
bun run etl --geoid "^(060|160)0000US"
```

If the server is actively running, you can run the `--live` flag to import the data into the existing database without restarting the server.
```bash
bun run etl --geoid "^(060|160)0000US" --live
```

> [!TIP]
> It's recommended to only include the data you want to use. If you want to include everything, you can run the command without the `--geoid` flag.
> ```bash
> bun run etl
> ```

### 4. Run the Server
Run the `bun run server` command to start the server.
```bash
bun run server
```

---

## :package: Docker

> [!TIP]
> The port defaults to `3000` if there is no `BETTER_CENSUS_PORT` environment variable set. It's also recommended to mount the `data` directory to persist the data.

### 1. Setup the Container
```bash
docker build -t better-census .
```

### 2. Run the Container
```bash
docker run -d --name better-census -v bettercensus_data:/app/data -e BETTER_CENSUS_PORT=1776 -p 1776:1776 better-census
```

### 3. Add the Default Data Sources
```bash
docker exec -it better-census mv /app/data/urls.example.txt /app/data/urls.txt
```

```bash
docker exec -it better-census bun run data collect
```

```bash
docker exec -it better-census bun run etl --geoid "^(060|160)0000US" --live
```

---

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
    "B19001A_001E",
  ],
});
```

---

## Type safety

The `columns` property of the `Census.run(...)` options object is fully type-safe. Any string ID you pass in will follow through in the type system, and will be used in the resulting data.

Example:

```ts
const result = await Census.run({
  places: ["place1", "place2", "place3"],
  columns: ["column1", "column2", "column3", "column4"],
});

// Resulting object looks like this:
type Result = {
  place1: {
    column1: number | null;
    column2: number | null;
    column3: number | null;
    column4: number | null;
  };
  place2: {
    column1: number | null;
    column2: number | null;
    column3: number | null;
    column4: number | null;
  };
  place3: {
    column1: number | null;
    column2: number | null;
    column3: number | null;
    column4: number | null;
  };
};
```

You can also use the `transpose` options to switch the keys and values, which will end up something like this:

```ts
type Result = {
  column1: {
    place1: number | null;
    place2: number | null;
    place3: number | null;
  };
  column2: {
    place1: number | null;
    place2: number | null;
    place3: number | null;
  };
  column3: {
    place1: number | null;
    place2: number | null;
    place3: number | null;
  };
  column4: {
    place1: number | null;
    place2: number | null;
    place3: number | null;
  };
};
```
