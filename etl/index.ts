import path from "node:path";
import glob from "fast-glob";
import { createLineStream } from "../util/stream";
import { separateLine } from "../util/csv";
import { separateLine as separateLineDat } from "../util/dat";
import { initializeDB } from "./init";

const BASE_PATH = "./data/raw/";
const BATCH_SIZE = 4000;
const connection = await initializeDB();

// const ids = await getAllIds();
// await setupTable(ids);
// await loadAll();

const ids = await getAllIds();
await setupTable(ids);
// await loadAllDat();

// 

export async function getAllIds() {
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

export async function setupTable(ids: Set<string>) {  
  const q = `
    create or replace table data (
    id text primary key,
    ${[...ids].map(id => `"${id}" real`).join(",\n  ")}
    );
  `;

  console.log(q);
  console.log(ids.size, "columns");

  await connection.run(q);
}

export async function loadAllDat(){
  const files = await glob(`${BASE_PATH}/**/*.dat`);
  for(const file of files) {
    const index = files.indexOf(file);
    console.log(`Loading ${index + 1}/${files.length}: ${file}`);
    const csv = Bun.file(file).stream();
    const lineStream = createLineStream(csv);
    
    const firstLine = await lineStream.next();
    if(!firstLine.value) continue;
    const columnLine = separateLineDat(firstLine.value);

    const keptIndices = new Set<number>();

    columnLine.forEach((col, index) => {
      if(col.includes("_E") && col !== "NAME") {
        keptIndices.add(index);
      }
    });
    
    const columns = [...keptIndices].map(i => columnLine[i]);
    console.log("--", columns.length, "columns in", file);

    let i = 0;
    const chunks: (string | number)[][] = [];

    const limit = 10;
    let l = 0;
    for await(const line of lineStream) {
      if (l > limit) break;
      
      const split = separateLineDat(line);
      const chunkLine = split
        .filter((_, i) => keptIndices.has(i))
        .map(val => {
          const asNumber = Number(val);
          if(isNaN(asNumber)) return "NULL";
          return asNumber;
        });
      const geoId = split[0]! as string;
      if (!geoId.startsWith("06000")) continue;

      const chunk = [`'${geoId}'`, ...chunkLine];
      chunks.push(chunk);

      if(chunks.length >= BATCH_SIZE) {
        i += chunks.length;
        const q = `
          insert into data (id, ${columns.join(", ")})
          values ${chunks.map(chunk => `(${chunk.join(", ")})`).join(",\n  ")}
          on conflict (id) do update set
            ${columns.map((col, i) => `"${col}" = excluded."${col}"`).join(",\n  ")}
        `;

        await connection.run(q);
        console.log("  --", `Inserted ${chunks.length} rows for ${file}`);

        chunks.length = 0;
      }
    }

    console.log("--", `Loaded ${file} with ${i} rows`);
  }
  
}

export async function loadAll() {
  const files = await glob(`${BASE_PATH}/**/*.csv`);

  for(const file of files) {
    const index = files.indexOf(file);
    console.log(`Loading ${index + 1}/${files.length}: ${file}`);
    const csv = Bun.file(file).stream();
    const lineStream = createLineStream(csv);

    const firstLine = await lineStream.next();
    if(!firstLine.value) continue;
    const columnLine = separateLine(firstLine.value);

    const keptIndices = new Set<number>();

    columnLine.forEach((col, index) => {
      if(col.endsWith("E") && col !== "NAME") {
        keptIndices.add(index);
      }
    });

    const columns = [...keptIndices].map(i => columnLine[i]);

    console.log("--", columns.length, "columns in", file);

    // label line
    const _ = lineStream.next();

    let i = 0;
    const chunks: (string | number)[][] = [];

    for await(const line of lineStream) {
      const split = separateLine(line);
      const chunkLine = split
        .filter((_, i) => keptIndices.has(i))
        .map(val => {
          const asNumber = Number(val);
          if(isNaN(asNumber)) return "NULL";
          return asNumber;
        });
      const geoId = split[0]! as string;

      chunks.push([`'${geoId}'`, ...chunkLine]);

      if(chunks.length >= BATCH_SIZE) {
        i += chunks.length;
        const q = `
insert into data (id, ${columns.join(", ")})
values ${chunks.map(chunk => `(${chunk.join(", ")})`).join(",\n  ")}
on conflict (id) do update set
  ${columns.map((col, i) => `"${col}" = excluded."${col}"`).join(",\n  ")}
        `;

        await connection.run(q);
        console.log("  --", `Inserted ${chunks.length} rows for ${file}`);

        chunks.length = 0;
      }
    }

    console.log("--", `Loaded ${file} with ${i} rows`);
  }
}

// 

function extractEstimateColumns(line: string, fileType: "csv" | "dat") {
  switch (fileType) {
    case "csv":
      return separateLine(line).filter((id) => id.endsWith("E") && id !== "NAME");
    case "dat":
      return separateLineDat(line).filter((id) => id.includes("_E") && id !== "NAME");
  }
}

function getFileType(file: string) {
  if (file.endsWith(".csv")) return "csv";
  if (file.endsWith(".dat")) return "dat";
  return "unknown";
}