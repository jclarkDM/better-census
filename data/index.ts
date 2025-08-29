import { parseArgs } from "util";
import cliProgress from "cli-progress";

const { positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
});

const command = positionals[0];

if (!command) {
  printHelp();
  process.exit(0);
}

switch (command) {
  case "collect":
    collect();
    break;
}

//

async function collect() {
  const urls = await listUrls();
  if (urls.length < 1) return;

  const outputDir = `${import.meta.dir}/raw`;
  downloadAll(urls.slice(0, 2), outputDir);
}

function printHelp() {
  const commands = {
    collect: "Collects data using data/urls.txt",
    prune: "Prunes data",
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
  await Promise.all(urls.map((url) => download(url, dir)));
  MultiBar.stop();
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
}
