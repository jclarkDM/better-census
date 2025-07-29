
export function transpose(obj: Record<string, any>) {
  const result = {}

  for(const outerKey in obj) {
    if(obj.hasOwnProperty(outerKey)) {
      const inner = obj[outerKey];

      for(const innerKey in inner) {
        if(inner.hasOwnProperty(innerKey)) {
          // @ts-expect-error
          if(!result[innerKey]) {
            // @ts-expect-error
            result[innerKey] = {};
          }
          
          // @ts-expect-error
          result[innerKey][outerKey] = inner[innerKey];
        }
      }
    }
  }

  return result;
}

export function createIdSet<
  const IDs extends [key: string, id: string][]
>(ids: IDs) {

  return {
    ids,
    $keys: null! as IDs[number][0],
    $values: null! as IDs[number][1],
    $map: null! as KeyToValue<IDs>
  }
}

type KeyToValue<IDs extends [key: string, id: string][]> = {
  [K in IDs[number][0]]: Extract<
    IDs[number],
    [K, any]
  >[1]
}

const test = createIdSet([
  ["alpha", "a"],
  ["beta", "b"],
  ["gamma", "c"]
]);

export type RemoveDuplicates<T extends readonly unknown[], Acc extends readonly unknown[] = []> =
  T extends readonly [infer Head, ...infer Tail]
  ? Head extends Acc[number]
    ? RemoveDuplicates<Tail extends readonly unknown[] ? Tail : [], Acc>
    : RemoveDuplicates<Tail extends readonly unknown[] ? Tail : [], [...Acc, Head]>
  : Acc;

export type MapIDSet<
  IDSet extends ReturnType<typeof createIdSet<[key: string, id: string][]>>,
  Keys extends readonly IDSet["$keys"][],
  EmptyDefault extends string[] = [],
  DedupedKeys = RemoveDuplicates<Keys>
> = Keys[number] extends never ? EmptyDefault : {
  [X in keyof DedupedKeys]: IDSet["$map"][DedupedKeys[X] & IDSet["$keys"]]
}

export function createIdQuery<
  IDSet extends ReturnType<typeof createIdSet<[key: string, id: string][]>>,
  const EmptyDefault extends string[] = []
>(idSet: IDSet, emptyDefault?: EmptyDefault) {
  function query<
    const Keys extends readonly IDSet["$keys"][]
  >(...keys: Keys): MapIDSet<IDSet, Keys, EmptyDefault> {
    if(keys.length === 0) return emptyDefault as any;

    const ids = new Set<string>();

    for(const key of keys) {
      const id = idSet.ids.find(([k]) => k === key)?.[1];
      if(id) ids.add(id);
    }

    return Array.from(ids) as any;
  }

  function all() {
    type Values<T extends Array<[key: string, id: string]>> = {
      [K in keyof T]: T[K][1]
    }

    return query(...idSet.ids.map(([k]) => k) as any) as Values<IDSet["ids"]>
  }

  query.all = all;

  return query;
}