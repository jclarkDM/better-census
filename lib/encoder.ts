import { toCamelCase, type String } from "../util/string";

type RemoveDuplicates<T extends readonly unknown[], Acc extends readonly unknown[] = []> =
  T extends readonly [infer Head, ...infer Tail]
  ? Head extends Acc[number]
    ? RemoveDuplicates<Tail extends readonly unknown[] ? Tail : [], Acc>
    : RemoveDuplicates<Tail extends readonly unknown[] ? Tail : [], [...Acc, Head]>
  : Acc;

export namespace Encoder {
  export type Mapping = [key: string, id: string];

  export type EncodedItem<ID extends string, Label extends string> = {
    id: ID,
    label: Label
  }
  
  export type RootRecord = {
    [K in string]: Encoder<Mapping[], string | undefined> | Encoder.RootRecord
  }

  export type Proxy<Enc extends Encoder.RootRecord, Path extends string[] = []> = {
    [K in keyof Enc & string]:
      Enc[K] extends Encoder.RootRecord & { default: StaticEncoder<infer Mapping> }
        ? (() => [EncodedItem<Mapping[number][1], String.CamelCase<[...Path, K]>>]) & Encoder.Proxy<Omit<Enc[K], "default">, [...Path, K]>
        : Enc[K] extends RootRecord
          ? Encoder.Proxy<Enc[K], [...Path, K]>
        : Enc[K] extends StaticEncoder<infer Mapping>
          ? () => [EncodedItem<Mapping[number][1], String.CamelCase<[...Path, K]>>]
        : Enc[K] extends OptionsEncoder<infer Mapping extends Encoder.Mapping[], infer DefaultValue extends string | undefined>
          ? (<const I extends Mapping[number][0][], Deduped = RemoveDuplicates<I>>(...keys: I) => I["length"] extends 0
            ? undefined extends DefaultValue
              ? []
              : [EncodedItem<DefaultValue & string, String.CamelCase<[...Path, K]>>]
            : {
              [J in keyof Deduped]: EncodedItem<
                Extract<Mapping[number], [Deduped[J], any]>[1],
                String.CamelCase<[...Path, Deduped[J] & string]>
              >
            })
        : never
  }
}

export abstract class Encoder<
  const Mapping extends Encoder.Mapping[],
  const DefaultValue extends string | undefined = undefined
> {
  readonly mapping: Mapping;
  readonly defaultValue: DefaultValue;

  constructor(
    mapping: Mapping,
    defaultValue: DefaultValue = undefined as DefaultValue
  ) {
    this.mapping = mapping;
    this.defaultValue = defaultValue;
  }

  static options<
    const Mapping extends Encoder.Mapping[],
    const DefaultValue extends string | undefined = undefined
  >(options: Mapping, defaultValue: DefaultValue = undefined as DefaultValue) {
    return new OptionsEncoder(options, defaultValue);
  }

  static root<const Items extends Encoder.RootRecord>(items: Items) {
    return new EncoderRoot(items);
  }
  
  static static<const Mapping extends Encoder.Mapping[]>(mapping: Mapping) {
    return new StaticEncoder(mapping);
  }

  static proxy<const Items extends Encoder.RootRecord>(definition: EncoderRoot<Items> | Items) {
    if(definition instanceof EncoderRoot) return createEncoderQuery(definition);
    return createEncoderQuery(new EncoderRoot(definition));
  }
}

class OptionsEncoder<
  const Mapping extends Encoder.Mapping[],
  const DefaultValue extends string | undefined = undefined
> extends Encoder<Mapping, DefaultValue> {
  constructor(
    mapping: Mapping,
    defaultValue: DefaultValue = undefined as DefaultValue
  ) {
    super(mapping, defaultValue);
  }
}

class StaticEncoder<const Mapping extends Encoder.Mapping[]> extends Encoder<Mapping, undefined> {
  constructor(mapping: Mapping) {
    super(mapping, undefined);
  }
}

class EncoderRoot<const Items extends Encoder.RootRecord> {
  readonly items: Items;

  constructor(items: Items) {
    this.items = items;
  }
}


function createEncoderQuery<
  const Items extends Encoder.RootRecord,
  const Enc extends EncoderRoot<Items>
>(encoder: Enc): Encoder.Proxy<Enc["items"]> {

  function buildProxy(obj: any, path: string[] = []): any {
    const proxy: any = {};
    for(const key of Object.keys(obj)) {
      const value = obj[key];

      if(value && typeof value === "object" && !(value instanceof Encoder)) {
        if("default" in value && value.default instanceof StaticEncoder) {
          proxy[key] = Object.assign(
            () => [{ id: value.default.mapping[0][1], label: toCamelCase([...path, key]) }],
            buildProxy(
              Object.fromEntries(
                Object.entries(value)
                  .filter(([k]) => k !== "default")
                ),
              [...path, key]
            )
          );
        } else {
          proxy[key] = buildProxy(value, [...path, key]);
        }
      } else if(value instanceof StaticEncoder) {

        proxy[key] = () => value.mapping[0][1];

      } else if(value instanceof OptionsEncoder) {

        proxy[key] = (...args: any[]) => {
          if(args.length === 0) {
            if(value.defaultValue === undefined) return [];
            return [{ id: value.defaultValue, label: toCamelCase([...path, key]) }];
          }

          const seen = new Set();
          const deduped = args.filter((k: any) => {
            if(seen.has(k)) return false;
            seen.add(k);
            return true;
          });

          return deduped.map((k: any) => {
            const found = value.mapping.find(([label]: [string, string]) => label === k);
            if(!found) throw new Error(`Invalid key "${k}" for option "${key}"`);

            return { id: found[1], label: toCamelCase([...path, key, k]) }
          });
        };
      }
    }
    return proxy;
  }

  return buildProxy(encoder.items);
}