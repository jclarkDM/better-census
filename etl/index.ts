import path from "node:path";
import glob from "fast-glob";
import { createLineStream } from "../util/stream";
import { separateLine } from "../util/csv";
import { initializeDB } from "./init";

const connection = await initializeDB();
const basePath = "./data/raw/";

export async function getAllIds() {
  const files = await glob(`${basePath}/**/*.csv`)
    .then(f => f.map(file => file
      .replace(basePath, "")
      .replace(/\.csv$/, "")));
  
  const ids = new Set<string>();

  for(const file of files) {
    const csv = Bun.file(path.join(`${basePath}/${file}.csv`)).stream();
    const lineStream = createLineStream(csv);

    const firstLine = await lineStream.next();
    if(!firstLine.value) continue;

    const split = separateLine(firstLine.value)
      .filter(id => id.endsWith("E") && id !== "NAME");
    
    split.forEach(id => ids.add(id));
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

const BATCH_SIZE = 4000;

export async function loadAll() {
  const files = await glob(`${basePath}/**/*.csv`);

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

const ids = await getAllIds();
await setupTable(ids);

await loadAll();