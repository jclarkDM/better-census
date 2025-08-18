import type { DuckDBConnection, JS } from "@duckdb/node-api";

export interface DBQueryService {
  query(q: string): Promise<Record<string, JS>[]>;
}

export class LocalDBQueryService implements DBQueryService {
  private connection: DuckDBConnection;

  constructor(connection: DuckDBConnection) {
    this.connection = connection;
  }

  async query(q: string) {
    const result = await this.connection.runAndReadAll(q);
    const rows = result.getRowObjectsJS();
    return rows;
  }
}

export class RemoteDBQueryService implements DBQueryService {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async query(q: string) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: q,
    });

    if (!response.ok) throw new Error(`Failed to fetch data from ${this.url}.`);

    const data = await response.json() as Record<string, JS>[];
    return data;
  }
}
