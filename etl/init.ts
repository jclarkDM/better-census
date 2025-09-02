import { DuckDBInstance } from "@duckdb/node-api";
import path from "path";

export async function initializeDB(canWrite?: boolean) {
  const db = await DuckDBInstance.create(path.join(__dirname, "..", "data", "census.db"), {
    access_mode: canWrite ? "read_write" : "read_only"
  });
  const connection = await db.connect();
  await connection.run("INSTALL spatial; LOAD spatial;");

  return connection;
}