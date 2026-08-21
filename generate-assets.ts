// Generator for the `unicum-gg/wot.assets` mirror's own branches.
//
// That repo is a fork of Kurzdor/wot.assets, fast-forwarded from upstream. Its
// test branch is only as fresh as upstream's, and upstream froze in July: a
// Common Test vehicle therefore has no picture anywhere, because Wargaming's
// public CDN serves released vehicles only. This rebuilds the branch from the
// client instead, the same way `generate.ts` rebuilds the sources.
//
// Scope is deliberately narrower than upstream's. It mirrors the whole `gui`
// tree (21 GB), which no CI runner can hold; we take the vehicle icons, which
// is what the site actually reads, and the extraction is filtered so the rest
// never lands on disk.
//
// Usage: npm run generate:assets -- --host H --guid G --out DIR [--force]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SparseArchive } from "./lib/archive.js";
import { walk, writeFile } from "./lib/harvest.js";
import { resolveClient } from "./lib/wgus.js";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

const HOST = flag("--host") ?? "wgus-wotct.wargaming.net";
const GUID = flag("--guid") ?? "WOT.CT.PRODUCTION";
const OUT = path.resolve(flag("--out") ?? "assets-out");
const FORCE = args.includes("--force");

// The GUI ships as several packages and the naming varies by client: Wargaming
// splits it `gui-part1..4`, Lesta ships two parts plus `gui_lootboxes`. Match
// them all rather than a fixed list; the extraction filter below is what keeps
// the cost down, so a package holding no vehicle icon simply yields nothing.
const GUI_PACKAGE = /^res\/packages\/gui[-_a-z0-9]*\.pkg$/i;

// What we publish, keyed by the path inside the package. `contour` is the
// silhouette used in lists, the sized folders are the hangar renders.
const KEPT = /^gui\/maps\/icons\/vehicle\/(contour\/)?[^/]+\.png$/i;
const KEPT_SIZED = /^gui\/maps\/icons\/vehicle\/\d+x\d+\/[^/]+\.png$/i;
const wanted = (rel: string) => KEPT.test(rel) || KEPT_SIZED.test(rel);

const log = (msg: string) => console.log(`[wot.assets] ${msg}`);

async function main(): Promise<void> {
  log(`resolving ${GUID} via ${HOST}`);
  const client = await resolveClient(HOST, GUID);
  if (!client) {
    log(`${GUID}: no build published, nothing to mirror`);
    return;
  }
  log(`client ${client.versionName} (host ${client.host})`);

  const versionFile = path.join(OUT, ".version_name");
  const current = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : null;
  if (current === client.versionName && !FORCE) {
    log(`already at ${client.versionName}, nothing to do`);
    return;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "wotassets-"));
  try {
    const chain = client.getChain("client");
    if (chain.length === 0) throw new Error("no client volumes");
    const clientDir = path.join(workDir, "client");
    fs.mkdirSync(clientDir, { recursive: true });
    const archive = await SparseArchive.open(clientDir, chain[0].volumes);
    const packages = [...archive.index().values()].filter((b) => GUI_PACKAGE.test(b.name));
    log(`${packages.length} gui packages`);

    let total = 0;
    for (const block of packages) {
      const unpackDir = path.join(workDir, "pkg");
      fs.rmSync(unpackDir, { recursive: true, force: true });
      const pkg = await archive.extract(block, unpackDir);
      const contents = path.join(workDir, "contents");
      fs.rmSync(contents, { recursive: true, force: true });
      // Extract only the icon tree: a gui package is ~2.5 GB unpacked and all
      // but a fraction of it is atlases and video we do not publish.
      execFileSync(
        "7z",
        ["x", pkg, `-o${contents}`, "-y", "gui/maps/icons/vehicle/*"],
        { stdio: "ignore" },
      );
      let kept = 0;
      for (const file of walk(contents)) {
        const rel = path.relative(contents, file).split(path.sep).join("/");
        if (!wanted(rel)) continue;
        writeFile(path.join(OUT, rel), fs.readFileSync(file));
        kept++;
      }
      total += kept;
      log(`  ${path.basename(block.name)} (${(block.packed / 1e6).toFixed(0)} MB): ${kept} icons`);
      fs.rmSync(unpackDir, { recursive: true, force: true });
      fs.rmSync(contents, { recursive: true, force: true });
      await archive.reset();
    }

    writeFile(versionFile, `${client.versionName}\n`);
    log(`done: ${total} icons in ${OUT}`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
