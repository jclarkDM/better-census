import glob from "fast-glob";
import path from "node:path";
import { parseArgs } from "util";
import { separateLine as separateLineCSV } from "../util/csv";
import { correctDatColumnID, separateLine as separateLineDat } from "../util/dat";
import { createLineStream } from "../util/stream";
import { initializeDB } from "./init";

const { values: argValues } = parseArgs({
  args: Bun.argv,
  options: {
    geoid: { type: "string" },
    force: { type: "boolean" },
  },
  strict: true,
  allowPositionals: true,
});

const BASE_PATH = "./data/raw/";
const BOUNDARIES_PATH = "./data/boundaries/";
const DB_PATH = "./data/census.db";
const BATCH_SIZE = 4000;

const connection = await initializeDB();
await main();

//

async function main(){
  const dbExists = await Bun.file(DB_PATH).exists();
  if (dbExists && !argValues.force) return console.log(`Database census.db already exists at ${DB_PATH}. Skipping ETL. Use --force to overwrite.`);
  
  await setupGeocodingTables();
  
  const ids = await getAllIds();
  await setupTable(ids);
  await loadAll();
}

async function setupGeocodingTables() {
  await setupGeocodingList();
  await setupBoundaries();
}

async function setupGeocodingList() {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS geocoding_tables (
      name TEXT PRIMARY KEY
    );
  `);
}

async function setupBoundaries() {
  const files = await glob(`${BOUNDARIES_PATH}/**/*.shp`);

  const cousubRegex = /cb_\d\d\d\d_us_cousub_500k/;
  const placeRegex = /cb_\d\d\d\d_us_place_500k/;

  for (const file of files) {
    const base = path.basename(file, ".shp");

    let tableName = base; // default: use file name
    if (cousubRegex.test(base)) tableName = "county_subdivisions";
    if (placeRegex.test(base)) tableName = "places";

    console.log(`Inserting into ${tableName} from ${file}`);
    await connection.run(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM st_read('${file}');`);
    await connection.run(`INSERT INTO geocoding_tables (name) VALUES ('${tableName}') ON CONFLICT(name) DO NOTHING;`);
    console.log(`Successfully inserted ${tableName}`);
  }
}

async function getAllIds() {
  const files = await glob(`${BASE_PATH}/**/*.{csv,dat}`).then((f) => f.map((file) => file.replace(BASE_PATH, "")));

  const ids = new Set<string>();
  for (const fileName of files) {
    const fileType = getFileType(fileName);
    if (fileType === "unknown") continue;

    const fileStream = Bun.file(path.join(`${BASE_PATH}/${fileName}`)).stream();
    const lineStream = createLineStream(fileStream);

    const firstLine = await lineStream.next();
    if (!firstLine.value) continue;

    const split = extractEstimateColumns(firstLine.value, fileType);
    split.forEach((id) => ids.add(id));
  }

  return ids;
}

async function setupTable(ids: Set<string>) {
  const q = `
    create or replace table data (
    id text primary key,
    ${[...ids].map((id) => `"${id}" real`).join(",\n  ")}
    );
  `;

  console.log(q);
  console.log(ids.size, "columns");

  await connection.run(q);
}

async function loadAll() {
  const files = await glob(`${BASE_PATH}/**/*.{csv,dat}`);
  for (const file of files) {
    const fileType = getFileType(file);
    if (fileType === "unknown") continue;

    const index = files.indexOf(file);
    console.log(`Loading ${index + 1}/${files.length}: ${file}`);

    if (fileType === "dat") await parseDatFile(file);
    if (fileType === "csv") await parseCsvFile(file);
  }
}

async function parseDatFile(filePath: string) {
  const fileStream = Bun.file(filePath).stream();
  const lineStream = createLineStream(fileStream);

  const firstLine = await lineStream.next();
  if (!firstLine.value) return;

  // Select Columns
  const columnLine = separateLineDat(firstLine.value).map(correctDatColumnID);
  const selectedIndices = new Set<number>();
  columnLine.forEach((col, index) => {
    if (col.endsWith("E") && col !== "NAME") selectedIndices.add(index);
  });

  const selectedColumns = [...selectedIndices].map((i) => columnLine[i]);
  console.log("--", selectedColumns.length, "columns in", filePath);

  // Insert Rows
  let rows = 0;
  const valuesBatch: (string | number)[][] = [];
  for await (const line of lineStream) {
    const split = separateLineDat(line);
    const geoID = split[0]!;
    const selectedValues = split.filter((_, idx) => selectedIndices.has(idx)).map(parseNumber);

    if (shouldSkip(geoID)) continue;

    const queryValues = [`'${geoID}'`, ...selectedValues];
    valuesBatch.push(queryValues);

    if (valuesBatch.length >= BATCH_SIZE) {
      await insertValuesBatch(valuesBatch, selectedColumns);
      rows += valuesBatch.length;
      console.log("  --", `Inserted ${valuesBatch.length} rows for ${filePath}`);

      valuesBatch.length = 0;
    }
  }

  console.log("--", `Loaded ${filePath} with ${rows} rows`);
}

async function parseCsvFile(filePath: string) {
  const fileStream = Bun.file(filePath).stream();
  const lineStream = createLineStream(fileStream);

  const firstLine = await lineStream.next();
  if (!firstLine.value) return;

  // Select Columns
  const columnLine = separateLineCSV(firstLine.value);
  const selectedIndices = new Set<number>();
  columnLine.forEach((col, index) => {
    if (col.endsWith("E") && col !== "NAME") selectedIndices.add(index);
  });

  const selectedColumns = [...selectedIndices].map((i) => columnLine[i]);
  console.log("--", selectedColumns.length, "columns in", filePath);

  // Skip label line
  const _ = lineStream.next();

  // Insert Rows
  let rows = 0;
  const valuesBatch: (string | number)[][] = [];
  for await (const line of lineStream) {
    const split = separateLineCSV(line);
    const geoID = split[0]!;
    const selectedValues = split.filter((_, idx) => selectedIndices.has(idx)).map(parseNumber);

    if (shouldSkip(geoID)) continue;

    const queryValues = [`'${geoID}'`, ...selectedValues];
    valuesBatch.push(queryValues);

    if (valuesBatch.length >= BATCH_SIZE) {
      await insertValuesBatch(valuesBatch, selectedColumns);
      rows += valuesBatch.length;
      console.log("  --", `Inserted ${valuesBatch.length} rows for ${filePath}`);

      valuesBatch.length = 0;
    }
  }

  console.log("--", `Loaded ${filePath} with ${rows} rows`);
}

async function insertValuesBatch(valueBatch: (string | number)[][], selectedColumns: (string | undefined)[]) {
  const q = `
    insert into data (id, ${selectedColumns.join(", ")})
    values ${valueBatch.map((chunk) => `(${chunk.join(", ")})`).join(",\n  ")}
    on conflict (id) do update set
      ${selectedColumns.map((col, i) => `"${col}" = excluded."${col}"`).join(",\n  ")}
  `;

  await connection.run(q);
}

function extractEstimateColumns(line: string, fileType: "csv" | "dat") {
  switch (fileType) {
    case "csv":
      return separateLineCSV(line).filter((id) => id.endsWith("E") && id !== "NAME");
    case "dat":
      return separateLineDat(line)
        .filter((id) => id.includes("_E"))
        .map(correctDatColumnID);
  }
}

function getFileType(file: string) {
  if (file.endsWith(".csv")) return "csv";
  if (file.endsWith(".dat")) return "dat";
  return "unknown";
}

function parseNumber(val: string) {
  const asNumber = Number(val);
  return isNaN(asNumber) ? "NULL" : asNumber;
}

function shouldSkip(geoID: string) {
  return argValues.geoid && !new RegExp(argValues.geoid).test(geoID);
}
