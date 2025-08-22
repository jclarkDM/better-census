export function separateLine(line: string) {
  return line.split("|").map((x) => x.trim());
}

export function correctDatColumnID(id: string){
  const match = id.match(/^(.*?)_([A-Za-z])(\d+)$/);
  if (match) {
    const [, prefix, letter, number] = match;
    return `${prefix}_${number}${letter}`;
  }
  return id;
}