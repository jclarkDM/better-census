import { connection } from "../etl/init";
import { transpose } from "../util/object";
import { Encoder } from "./encoder";

export namespace Census {
  export interface RunOptions<
    GeoIDs extends string[] = [],
    ColumnIDs extends Encoder.EncodedItem<string, string>[] = [],
    Transpose extends boolean = false
  > {
    places: GeoIDs,
    columns: ColumnIDs,
    transpose?: Transpose
  }
  
  export type RunResult<
    GeoIDs extends string[] = [],
    ColumnIDs extends Encoder.EncodedItem<string, string>[] = [],
    Transpose extends boolean = false
  > = Transpose extends true ? {
    [C in ColumnIDs[number] as C["label"]]: {
      [G in GeoIDs[number]]: number | null
    }
  } : {
    [G in GeoIDs[number]]: {
      [C in ColumnIDs[number] as C["label"]]: number | null
    }
  }
}

export class Census<Enc extends Encoder.RootRecord> {
  private internalEncoder: Enc;

  constructor(encoder: { items: Enc }) {
    this.internalEncoder = encoder.items;
  }

  get encoder() {
    return Encoder.proxy(this.internalEncoder);
  }

  async run<
    const GeoIDs extends string[] = [],
    const ColumnIDs extends Encoder.EncodedItem<string, string>[] = [],
    const Transpose extends boolean = false
  >(options: Census.RunOptions<GeoIDs, ColumnIDs, Transpose>): Promise<Census.RunResult<GeoIDs, ColumnIDs, Transpose>> {
    const q = `
select ${options.columns.map(({ id, label }) => `"${id}" as "${label}"`).join(", ")}
from data
where id in (${options.places.map(id => `'${id}'`).join(", ")});
    `;

    const result = await connection.runAndReadAll(q);

    const rows = result.getRowObjectsJS();
    const output = Object.fromEntries(rows.map((row, i) => {
      const id = options.places[i];

      return [id, row];
    }));

    for(const id of options.columns) {
      for(const place of options.places) {
        if(output[place] && output[place][id.label] == undefined) {
          output[place][id.label] = null;
        }
      }
    }

    if(options.transpose) {
      return transpose(output) as any;
    }

    return output;
  }
}