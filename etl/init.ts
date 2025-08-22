import { DuckDBInstance } from "@duckdb/node-api";
import path from "path";

export async function initializeDB() {
  const db = await DuckDBInstance.create(path.join(__dirname, "..", "data", "census.db"));
  const connection = await db.connect();

  return connection;
}