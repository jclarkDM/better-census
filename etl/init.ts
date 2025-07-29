import { DuckDBInstance } from "@duckdb/node-api";

export const db = await DuckDBInstance.create("./data/census.db");

export const connection = await db.connect();