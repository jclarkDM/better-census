import cliProgress from "cli-progress";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import unzipper from "unzipper";
import { parseArgs } from "util";

const { positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
});

const DATA_DIR = `${import.meta.dir}/raw`;

const command = positionals[0];

switch (command) {
  case "collect":
    collect();
    break;
  case "purge":
    purge();
    break;

  default:
    printHelp();
}

//

async function collect() {
  const urls = await listUrls();
  if (urls.length < 1) return;

  const zips = await downloadAll(urls.slice(0, 2), DATA_DIR);
  await extractAll(zips, DATA_DIR, true);
}

async function purge() {
  const files = await readdir(DATA_DIR).then((allFiles) => allFiles.map((file) => path.join(DATA_DIR, file)));
  const dbFiles = ["census.db", "census.db.wal"].map((file) => path.join(import.meta.dir, file));
  const existingDbFiles = (await Promise.all(dbFiles.map(async (f) => ((await fileExists(f)) ? f : null)))).filter(Boolean) as string[];
  files.push(...existingDbFiles);
  if (files.length < 1) return console.log("No data to purge.");

  console.log(`You are about to delete ${files.length} files.`);
  console.log(files.map((file) => `- ${relativeToDataDir(file)}`).join("\n"));
  const answer = prompt(`Are you sure you want to delete all data? This cannot be undone. (Y/n)`);
  if (answer?.toLowerCase() !== "y") return;

  await Promise.all(files.map((filepath) => deleteFile(filepath)));
  console.log("Purged all data.");
}

async function deleteFile(path: string) {
  await rm(path, { recursive: true });
}

async function fileExists(path: string) {
  return await Bun.file(path).exists();
}

function relativeToDataDir(absPath: string) {
  return path.relative(import.meta.dir, absPath);
}

function printHelp() {
  const commands = {
    collect: "Collects data using data/urls.txt",
    purge: "Purges all data",
    help: "Show this screen",
  };

  console.log(
    `Usage: bun run data <command>

Commands:
${Object.entries(commands)
  .map(([key, desc]) => key.padEnd(10) + desc)
  .join("\n")}`
  );
}

async function listUrls() {
  const file = await Bun.file(`${import.meta.dir}/urls.txt`).text();
  const urls = file.split(/\r?\n/).filter(Boolean);
  return urls;
}

const MultiBar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format: "[{bar}] {percentage}% | ETA: {eta_formatted} | {filename}",
  },
  cliProgress.Presets.shades_classic
);

async function downloadAll(urls: string[], dir: string) {
  const files = await Promise.all(urls.map((url) => download(url, dir)));
  MultiBar.stop();

  return files;
}

async function download(url: string, dir: string) {
  const filename = url.split("/").pop() ?? crypto.randomUUID();
  const outputFilename = `${dir}/${filename}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url} - HTTP ${res.status}`);

  const total = Number(res.headers.get("content-length") || 0);
  const progress = MultiBar.create(total, 0, { filename });

  const outputFile = Bun.file(outputFilename);
  const writer = outputFile.writer();
  let loaded = 0;

  for await (const chunk of res.body!) {
    loaded += chunk.length;
    progress.update(loaded);
    writer.write(chunk);
  }

  await writer.end();
  progress.stop();

  return outputFilename;
}

async function extract(path: string, dest = ".", cleanup = false) {
  const zip = await unzipper.Open.file(path);
  const filename = getFileName(path);

  console.log(`Extracting ${filename}...`);
  await zip.extract({ path: dest });

  if (cleanup) Bun.file(path).delete();
}

async function extractAll(paths: string[], dest = ".", cleanup = false) {
  await Promise.all(paths.map((file) => extract(file, dest, cleanup)));
}

function getFileName(path: string){
  return path.split("/").pop()!;
}