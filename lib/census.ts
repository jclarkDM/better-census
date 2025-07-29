import { connection } from "../etl/init";
import { housingEncoder } from "./housing-encoder";
import { transpose } from "./util";

export namespace Census {
  export interface RunOptions<
    GeoIDs extends string[] = [],
    ColumnIDs extends string[] = [],
    Transpose extends boolean = false
  > {
    places: GeoIDs,
    columns: ColumnIDs,
    transpose?: Transpose
  }

  export type RunResult<
    GeoIDs extends string[] = [],
    ColumnIDs extends string[] = [],
    Transpose extends boolean = false
  > = Transpose extends true
    ? {
      [C in ColumnIDs[number]]: {
        [G in GeoIDs[number]]: number | null
      }
    }
    : {
      [G in GeoIDs[number]]: {
        [C in ColumnIDs[number]]: number | null
      }
    }
}


export const Census = {
  async run<
    const GeoIDs extends string[] = [],
    const ColumnIDs extends string[] = [],
    const Transpose extends boolean = false
  >(options: Census.RunOptions<GeoIDs, ColumnIDs, Transpose>): Promise<Census.RunResult<GeoIDs, ColumnIDs, Transpose>> {
    const q = `
select ${options.columns.map(id => `"${id}"`).join(", ")}
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
        if(output[place] && output[place][id] == undefined) {
          output[place][id] = null;
        }
      }
    }

    if(options.transpose) {
      return transpose(output) as any;
    }

    return output;
  },

  encoder: {
    housing: housingEncoder
  }
}