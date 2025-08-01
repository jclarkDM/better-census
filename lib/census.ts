import { connection } from "../etl/init";
import { transpose } from "../util/object";
import { Encoder } from "./encoder";

export namespace Census {
  export interface RunOptions<
    GeoIDs extends string[] = [],
    ColumnIDs extends (string | Encoder.EncodedItem<string, string>)[] = [],
    Transpose extends boolean = false,
    RawIds extends boolean = false
  > {
    places: GeoIDs,
    columns: ColumnIDs,
    transpose?: Transpose,
    rawIds?: RawIds
  }
  
  export type RunResult<
    GeoIDs extends string[] = [],
    ColumnIDs extends (string | Encoder.EncodedItem<string, string>)[] = [],
    Transpose extends boolean = false,
    RawIds extends boolean = false
  > = Transpose extends true ? {
    [C in ColumnIDs[number] as C extends { label: infer L, id: infer I } ? RawIds extends true ? I : L : C]: {
      [G in GeoIDs[number]]: number | null
    }
  } : {
    [G in GeoIDs[number]]: {
      [C in ColumnIDs[number] as C extends { label: infer L, id: infer I } ? RawIds extends true ? I : L : C]: number | null
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
    const ColumnIDs extends (string | Encoder.EncodedItem<string, string>)[] = [],
    const Transpose extends boolean = false,
    const RawIds extends boolean = false
  >(options: Census.RunOptions<GeoIDs, ColumnIDs, Transpose, RawIds>): Promise<Census.RunResult<GeoIDs, ColumnIDs, Transpose, RawIds>> {
    const q = `
select ${options.columns.map(item => {
  if(typeof item === "string") return `"${item}"`;

  if(options.rawIds) {
    return `"${item.id}"`;
  } else {
    return `"${item.id}" as "${item.label}"`;
  }
})} from data
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
        // const label = typeof id === "string" ? id : options.rawIds ? id.id : id.label;
        let label;
        if(typeof id === "string") {
          label = id;
        } else if(options.rawIds) {
          label = id.id;
        } else {
          label = id.label;
        }
        if(output[place] && output[place][label] == undefined) {
          output[place][label] = null;
        }
      }
    }

    if(options.transpose) {
      return transpose(output) as any;
    }

    return output;
  }
}