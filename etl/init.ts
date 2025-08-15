import { DuckDBInstance } from "@duckdb/node-api";
import path from "path";

export const db = await DuckDBInstance.create(path.join(__dirname, "..", "data", "census.db"));

export const connection = await db.connect();