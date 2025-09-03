import glob from "fast-glob";
import path from "node:path";
import { parseArgs } from "util";
import { LocalDBQueryService, RemoteDBQueryService, type DBQueryService } from "../lib/queries";
import { separateLine as separateLineCSV } from "../util/csv";
import { correctDatColumnID, separateLine as separateLineDat } from "../util/dat";
import { createLineStream } from "../util/stream";
import { initializeDB } from "./init";

const { values: argValues } = parseArgs({
  args: Bun.argv,
  options: {
    geoid: { type: "string" },
    force: { type: "boolean" },
    live: { type: "boolean" },
  },
  strict: true,
  allowPositionals: true,
});

const DATA_DIR = path.join(import.meta.dir, "../data").replace(/\\/g, "/");
const RAW_DATA_DIR = path.join(DATA_DIR, "raw").replace(/\\/g, "/");
const DB_PATH = path.join(DATA_DIR, "census.db").replace(/\\/g, "/");
const BATCH_SIZE = 4000;

let queryService: DBQueryService;
await main();

//

async function main() {
  const dbExists = await Bun.file(DB_PATH).exists();
  // if (dbExists && !argValues.force) return console.log(`Database census.db already exists at ${DB_PATH}. Skipping ETL. Use --force to overwrite.`);
  
  const error = await setupQueryService()
  .then(() => false)
  .catch((e) => e as Error);
  if (error) {
    if (!(error instanceof Error && resourceIsLocked(error.message))) throw error;
    console.error(
      "The process cannot access the database file due to an IO Error.\nIf it's being hosted on a server, try running bun run etl --live instead."
    );
    return;
  }
  
  if (dbExists && argValues.force) {
    console.log(`Database census.db already exists at ${DB_PATH}. Truncating all tables...`);
    await truncateDB();
  }
  
  await setupFileTable();
  await setupGeocodingTables();

  const ids = await getAllIds();
  await setupTable(ids);
  await loadAll();
}

// 

async function truncateDB() {
  const allTables = await getAllTables();
  for (const table of allTables) {
    await queryService.query(`TRUNCATE TABLE ${table} CASCADE;`);
  }
}

async function getAllTables(){
  const q = `
    SELECT table_name FROM information_schema.tables;
  `;
  const allTables = await queryService.query(q).then(records => records.map(record => record["table_name"]));
  return allTables;
}

async function setupQueryService() {
  if (argValues.live) {
    const url = `http://localhost:${process.env.BETTER_CENSUS_PORT ?? 3000}`;
    queryService = new RemoteDBQueryService(url);
    return queryService;
  }

  const connection = await initializeDB({ canWrite: true });
  queryService = new LocalDBQueryService(connection);
  return queryService;
}

async function setupGeocodingTables() {
  await setupGeocodingList();
  await setupBoundaries();
}

async function setupGeocodingList() {
  await queryService.query(`
    CREATE TABLE IF NOT EXISTS geocoding_tables (
      name TEXT PRIMARY KEY
    );
  `);
}

async function setupBoundaries() {
  const files = await glob(`${RAW_DATA_DIR}/**/*.shp`);

  const cousubRegex = /cb_\d\d\d\d_us_cousub_500k/;
  const placeRegex = /cb_\d\d\d\d_us_place_500k/;

  for (const file of files) {
    const base = path.basename(file, ".shp");

    let tableName = base; // default: use file name
    if (cousubRegex.test(base)) tableName = "county_subdivisions";
    if (placeRegex.test(base)) tableName = "places";

    console.log(`Inserting into ${tableName} from ${file}`);
    await queryService.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM st_read('${file}');`);
    await queryService.query(`INSERT INTO geocoding_tables (name) VALUES ('${tableName}') ON CONFLICT(name) DO NOTHING;`);
    console.log(`Successfully inserted ${tableName}`);
  }
}

async function getAllIds() {
  const files = await glob(`${RAW_DATA_DIR}/**/*.{csv,dat}`).then((f) => f.map((file) => file.replace(RAW_DATA_DIR, "")));
  console.log(`${RAW_DATA_DIR}/**/*.{csv,dat}`);

  const ids = new Set<string>();
  for (const fileName of files) {
    const fileType = getFileType(fileName);
    if (fileType === "unknown") continue;

    const fileStream = Bun.file(path.join(`${RAW_DATA_DIR}/${fileName}`)).stream();
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
    CREATE TABLE IF NOT EXISTS data (
      id text primary key,
      ${[...ids].map((id) => `"${id}" real`).join(",\n  ")}
    );
  `;

  console.log(ids.size, "columns");

  await queryService.query(q);
}

async function setupFileTable() {
  const q = `
    CREATE TABLE IF NOT EXISTS files (
      name TEXT PRIMARY KEY
    );
  `;
  await queryService.query(q);
  console.log("Created files table");
}

async function addToFileTable(fileName: string) {
  const q = `
    INSERT INTO files (name) VALUES ('${fileName}') ON CONFLICT(name) DO NOTHING;
  `;
  await queryService.query(q);
}

async function fileExistsInFileTable(fileName: string) {
  const q = `
    SELECT name FROM files WHERE name = '${fileName}';
  `;
  const result = await queryService.query(q);
  return result.length > 0;
}

async function loadAll() {
  const files = await glob(`${RAW_DATA_DIR}/**/*.{csv,dat}`);
  for (const file of files) {
    const fileName = path.basename(file);
    const fileType = getFileType(file);
    if (fileType === "unknown") continue;

    const inFileTable = await fileExistsInFileTable(fileName);
    if (inFileTable) {
      console.log(`Skipping ${fileName} because it's already in the files table`);
      continue;
    }

    const index = files.indexOf(file);
    console.log(`Loading ${index + 1}/${files.length}: ${fileName}`);

    if (fileType === "dat") await parseDatFile(file);
    if (fileType === "csv") await parseCsvFile(file);

    await addToFileTable(fileName);
  }
}

async function parseDatFile(filePath: string) {
  const fileName = path.basename(filePath);
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
  console.log("--", selectedColumns.length, "columns in", fileName);

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
      console.log("  --", `Inserted ${valuesBatch.length} rows for ${fileName}`);

      valuesBatch.length = 0;
    }
  }
  
  if (valuesBatch.length) {
    await insertValuesBatch(valuesBatch, selectedColumns);
    rows += valuesBatch.length;
    console.log("  --", `Inserted ${valuesBatch.length} rows for ${fileName}`);
  }

  console.log("--", `Loaded ${filePath} with ${rows} rows`);
}

async function parseCsvFile(filePath: string) {
  const fileName = path.basename(filePath);
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
      console.log("  --", `Inserted ${valuesBatch.length} rows for ${fileName}`);

      valuesBatch.length = 0;
    }  
  }
  
  if (valuesBatch.length) {
    await insertValuesBatch(valuesBatch, selectedColumns);
    rows += valuesBatch.length;
    console.log("  --", `Inserted ${valuesBatch.length} rows for ${fileName}`);
  }

  console.log("--", `Loaded ${filePath} with ${rows} rows`);
}

async function insertValuesBatch(valueBatch: (string | number)[][], selectedColumns: (string | undefined)[]) {
  const q = `
    INSERT INTO data (id, ${selectedColumns.join(", ")})
    VALUES ${valueBatch.map((chunk) => `(${chunk.join(", ")})`).join(",\n  ")}
    ON CONFLICT (id) DO UPDATE SET
      ${selectedColumns.map((col, i) => `"${col}" = excluded."${col}"`).join(",\n  ")}
  `;

  await queryService.query(q);
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

function resourceIsLocked(message: string) {
  return message.includes("IO Error");
}
