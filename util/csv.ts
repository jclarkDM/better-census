
const quotedItemRegex = /"(.*?)"/g

export function separateLine(line: string) {
  return line
    .split(quotedItemRegex)
    .map(x => x.trim())
    .filter(x => x && x !== ",");
}