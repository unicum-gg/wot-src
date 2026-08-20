// Generator for the `unicum-gg/wot-src` mirror: rebuilds the decompiled World of
// Tanks client sources straight from Wargaming's update CDN, with no game
// client installed, and writes the same tree IzeBerg/wot-src publishes.
//
// Pipeline:
//   1. WGUS -> the versioned CDN URLs of the install `.wgpkg` volumes.
//   2. Those volumes are a split 7-Zip; we rebuild them SPARSE, fill only the
//      header, and range-download one block per package we care about.
//   3. Each package is a zip laid out under `sources/res/`. We keep sources
//      only, exactly as upstream does: `.pyc` decompiled to `.py`, packed XML
//      converted to text, `.def`/`.txt` copied, `.swc` decompiled into
//      `sources-as3/<library>/`, everything binary dropped.
//   4. The `locale` part's gettext `.mo` become `.po`.
//
// Usage: npm run generate -- --host H --guid G --out DIR [--force] [--only PKG]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SparseArchive } from "./lib/archive.js";
import { decodePacked, isPacked } from "./lib/packed.js";
import { toXml } from "./lib/serialize.js";
import { resolveClient } from "./lib/wgus.js";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

const HOST = flag("--host") ?? "wgus-woteu.wargaming.net";
const GUID = flag("--guid") ?? "WOT.EU.PRODUCTION";
const OUT = path.resolve(flag("--out") ?? "out");
const ONLY = flag("--only"); // debug: a single package
const FORCE = args.includes("--force");

// Toolchain. These exact versions are what reproduce upstream byte for byte:
// a newer uncompyle6 mangles nested dict comprehensions, and ffdec past 14.4.0
// reorders SWF metadata and rewrites boolean coercions.
const PYTHON = process.env.WOTSRC_PYTHON ?? "python3";
const FFDEC_JAR = process.env.WOTSRC_FFDEC_JAR ?? "tools/ffdec/ffdec.jar";

const SOURCES = path.join(OUT, "sources", "res");
const SOURCES_AS3 = path.join(OUT, "sources-as3");

// Upstream keeps sources only. Measured against its `comp7` tree: 437 `.py`,
// 7 `.xml`, 6 `.def`, 1 `.txt` out of 1948 files, everything else dropped.
// `.def` (entity and space definitions) are packed sections just like `.xml`,
// so the format is decided by the bytes, not by the extension.
const KEPT = new Set([".xml", ".def", ".txt"]);

const log = (msg: string) => console.log(`[wot-src] ${msg}`);

function writeFile(target: string, contents: string | Buffer): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

/** Walk a directory, yielding every file path. */
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

/** A `.swc` is a zip holding `library.swf`; that is what carries the classes. */
function decompileSwc(swc: string, workDir: string): void {
  // `foo-1.0-SNAPSHOT.swc` publishes as `sources-as3/foo/`.
  const library = path.basename(swc, ".swc").replace(/-\d+(\.\d+)*-SNAPSHOT$/, "");
  const unpacked = path.join(workDir, "swc", library);
  fs.mkdirSync(unpacked, { recursive: true });
  execFileSync("7z", ["x", swc, `-o${unpacked}`, "-y"], { stdio: "ignore" });
  const swf = path.join(unpacked, "library.swf");
  if (!fs.existsSync(swf)) return;
  execFileSync("java", ["-jar", FFDEC_JAR, "-export", "script", path.join(SOURCES_AS3, library), swf], {
    stdio: "ignore",
  });
}

/** Convert one unpacked package into the published tree. */
function harvest(root: string, workDir: string): { xml: number; copied: number; swc: number } {
  const stats = { xml: 0, copied: 0, swc: 0 };
  const pycRoot = path.join(workDir, "pyc");

  for (const file of walk(root)) {
    const rel = path.relative(root, file);
    const ext = path.extname(file).toLowerCase();

    if (ext === ".pyc") {
      // Batched later: one Python process for the whole tree, not one per file.
      writeFile(path.join(pycRoot, rel), fs.readFileSync(file));
      continue;
    }
    if (ext === ".swc") {
      decompileSwc(file, workDir);
      stats.swc++;
      continue;
    }
    if (KEPT.has(ext)) {
      const buf = fs.readFileSync(file);
      // Some of these ship as plain text already; pass those through untouched.
      const packed = isPacked(buf);
      writeFile(path.join(SOURCES, rel), packed ? toXml(decodePacked(buf)) : buf);
      if (packed) stats.xml++;
      else stats.copied++;
    }
  }
  return stats;
}

async function main(): Promise<void> {
  log(`resolving ${GUID} via ${HOST}`);
  const client = await resolveClient(HOST, GUID);
  if (!client) {
    log(`${GUID}: no build published, nothing to mirror`);
    return;
  }
  log(`client metadata ${client.version} (host ${client.host})`);

  // Cheap up-to-date guard for the cron: same client, nothing to redo.
  const versionFile = path.join(OUT, ".metadata_version");
  const current = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : null;
  if (current === client.version && !FORCE) {
    log(`already at ${client.version}, nothing to do`);
    return;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "wotsrc-"));
  const pycRoot = path.join(workDir, "pyc");
  try {
    const volumes = client.getVolumes("client");
    if (volumes.length === 0) throw new Error("no client volumes");
    log(`opening ${volumes.length} volumes`);
    const archive = await SparseArchive.open(workDir, volumes);
    const blocks = archive.index();

    const packages = [...blocks.values()]
      .filter((b) => /^res\/packages\/[^/]+\.pkg$/.test(b.name))
      .filter((b) => !ONLY || b.name.includes(ONLY));
    log(`${packages.length} packages to harvest`);

    for (const block of packages) {
      const unpackDir = path.join(workDir, "pkg");
      fs.rmSync(unpackDir, { recursive: true, force: true });
      const pkg = await archive.extract(block, unpackDir);
      const contents = path.join(workDir, "contents");
      fs.rmSync(contents, { recursive: true, force: true });
      execFileSync("7z", ["x", pkg, `-o${contents}`, "-y"], { stdio: "ignore" });
      const stats = harvest(contents, workDir);
      log(
        `  ${path.basename(block.name)} (${(block.packed / 1e6).toFixed(0)} MB): ` +
          `${stats.xml} xml, ${stats.copied} copied, ${stats.swc} swc`,
      );
      fs.rmSync(pkg, { force: true });
      fs.rmSync(contents, { recursive: true, force: true });
    }

    // One Python pass for every .pyc gathered above.
    if (fs.existsSync(pycRoot)) {
      log("decompiling python");
      execFileSync(PYTHON, [path.resolve("lib/py/decompile_pyc.py"), pycRoot, SOURCES], {
        stdio: "inherit",
      });
    }

    // Localisation lives in its own part, as loose `.mo` files.
    const localeVolumes = client.getVolumes("locale");
    if (localeVolumes.length > 0) {
      log("harvesting locale");
      const localeDir = path.join(workDir, "locale");
      fs.mkdirSync(localeDir, { recursive: true });
      const localeArchive = await SparseArchive.open(localeDir, localeVolumes);
      const mo = [...localeArchive.index().values()].filter((b) => b.name.endsWith(".mo"));
      const moDir = path.join(workDir, "mo");
      for (const block of mo) await localeArchive.extract(block, moDir);
      execFileSync(
        PYTHON,
        [path.resolve("lib/py/mo_to_po.py"), path.join(moDir, "res", "text", "lc_messages"),
         path.join(SOURCES, "text", "lc_messages")],
        { stdio: "inherit" },
      );
    }

    writeFile(versionFile, `${client.version}\n`);
    log(`done: ${OUT}`);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
