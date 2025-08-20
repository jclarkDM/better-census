export function separateLine(line: string) {
  return line.split("|").map((x) => x.trim());
}
