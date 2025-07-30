
export namespace String {
  export type Join<Path extends string[], Separator extends string = "."> = Path extends [infer Head, ...infer Tail]
  ? Head extends string
    ? Tail extends string[]
      ? Tail["length"] extends 0
        ? Head
        : `${Head}${Separator}${Join<Tail, Separator>}`
      : never
    : never
  : "";

  export type CamelCase<Path extends string[], Acc extends string = ""> = Path extends [infer Head extends string, ...infer Tail extends string[]]
    ? CamelCase<Tail, `${Acc}${Acc extends "" ? Head : Capitalize<Head>}`>
    : Acc;
}

export function toCamelCase(parts: string[]) {
  if(parts.length === 0) return "";
  return parts[0] + parts.slice(1).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}