# unicum.gg/wot-src

Decompiled World of Tanks client sources, rebuilt straight from Wargaming's
update CDN. Used by [unicum.gg](https://unicum.gg) for the vehicle catalogue,
specifications, arenas and nations.

This repo plays two roles at once.

## Branches we build

The [`build`](.github/workflows/build.yml) workflow extracts the live client
daily and pushes what changed, the same way
[`unicum-gg/wot.maps`](https://github.com/unicum-gg/wot.maps) mirrors minimaps.

| Branch | Client | WGUS host | guid |
| --- | --- | --- | --- |
| [`EU`](../../tree/EU) | Wargaming release, EU | `wgus-woteu.wargaming.net` | `WOT.EU.PRODUCTION` |
| [`NA`](../../tree/NA) | Wargaming release, NA | `wgus-wotna.wargaming.net` | `WOT.NA.PRODUCTION` |
| [`ASIA`](../../tree/ASIA) | Wargaming release, Asia | `wgus-wotasia.wargaming.net` | `WOT.ASIA.PRODUCTION` |
| [`CT`](../../tree/CT) | Wargaming Common Test | `wgus-wotct.wargaming.net` | `WOT.CT.PRODUCTION` |
| [`RU`](../../tree/RU) | Lesta release (Мир танков) | `lstus-ru.lesta.ru` | `MT.RU.PRODUCTION` |
| [`PT_RU`](../../tree/PT_RU) | Lesta public test | `lstus-ru.lesta.ru` | `MT.PT.PRODUCTION` |
| [`CN`](../../tree/CN) | 360 release (坦克世界) | `wgus-cn360.wggames.cn` | `WOT.CN.PRODUCTION` |

These keep the names they had as upstream mirrors, so everything reading this
repo carries on unchanged; they simply stop being copies of IzeBerg's work and
become our own extraction, one build fresher.

Two branches are not served by Wargaming at all, and each one took reading its
launcher to find: the host is in no binary, but the launcher's resource blob
(`lgc_res.dat` / `wgc_res.dat`) carries a zlib-compressed `gc_info.xml` whose
`install_*check_link` is a base64 `<GUID>@<url>` pair. That is where
`lstus-ru.lesta.ru` and `wgus-cn360.wggames.cn` came from.

`RU` is not Wargaming's: since it left Russia its own service froze that branch
at December 2023, and Мир танков is published by **Lesta**, on its own update
service. It runs the same protocol, so only the host and the app tag change.
Two details differ and are handled in `lib/wgus.ts`: Lesta sends no
`version_from`, so the chain is ordered by `version_to` with the full install
first, and its build directories are named `mt_<version>_ru_<hash>`.

The host column is an entry point, not necessarily where the build is served:
WGUS answers a moved branch with a `redirect_url` that the generator follows.
The Common Test currently redirects to `wgus-eu.wargaming.net`, and is only
published while a test is running, so between tests its build is a no-op.

Every branch is now built from the client. Nothing is mirrored from
[IzeBerg/wot-src](https://github.com/IzeBerg/wot-src) any more, so the
`sync-upstream` workflow is gone.

Our output is meant to stay interchangeable with upstream's, and that is
measurable: diff a built branch against the matching one on
[IzeBerg/wot-src](https://github.com/IzeBerg/wot-src) and the only differences
should be content the two builds genuinely disagree on.

## How it's built

Fully self-contained, no game client needed.

1. **WGUS** resolves a branch to the versioned CDN URLs of the install `.wgpkg`
   volumes, and to every incremental patch published since that install.
2. Those volumes are a split 7-Zip whose entries are each their own LZMA2 block.
   We recreate them as **sparse** local files, fill in only the ~2 MB header so
   `7z l` can enumerate the blocks, then range-download one block per package.
3. Each package is rebuilt to the live build by replaying the chain's binary
   deltas over it, `.xdiff` (VCDIFF, via `xdelta3`) and `.rdiff` (librsync, via
   `rdiff`). **This is what keeps the mirror current**: Wargaming republishes a
   full install only every few weeks, so the new tanks and the rebalances all
   arrive as patches. Mirroring the install alone would freeze the tree at the
   last republication.
4. A package is a zip laid out under `sources/res/`. We keep **sources only**,
   as upstream does: `.pyc` decompiled to `.py`, packed XML converted to text,
   `.def`/`.txt` copied, `.swc` libraries decompiled into `sources-as3/`, and
   everything binary (textures, sounds, video, web assets) dropped.
5. The game root's own config files are harvested the same way, and the `locale`
   part's gettext `.mo` catalogues become `.po`.

The client stores its XML as **BigWorld packed sections**, a binary tree with a
string dictionary; `lib/packed.ts` decodes it and `lib/serialize.ts` writes it
back out in upstream's exact text form, down to the `<!--BW_String-->` markers,
`Matrix34` rows and `%f` rounding.

**The tool versions are pinned and load-bearing**: `uncompyle6==3.8.0` (newer
releases mangle nested dict comprehensions) and `ffdec 14.4.0` (later ones
reorder SWF metadata and rewrite boolean coercions). Both were found by
bisecting against upstream's published output.

Run locally (needs `7z`, `xdelta3`, `rdiff`, a JRE, and Python 3.9 with
`uncompyle6`/`polib`):

```sh
npm install
npm run generate -- --host wgus-woteu.wargaming.net --guid WOT.EU.PRODUCTION --out out
```

`--force` re-extracts even when the client version is unchanged, `--only <pkg>`
limits the run to a single package.

`_stubs/` is the one directory not produced from the client: it describes the
engine's native modules (`BigWorld`, `Entity`, `WoT`), which ship compiled into
the executable and exist in no package, so an IDE reading the decompiled scripts
has nothing to resolve them against. It is vendored from `stubs/` on this branch,
carried over from upstream, which generated it by introspecting a running client.

## The icon mirror

[`assets.yml`](.github/workflows/assets.yml) rebuilds the four branches of
[`unicum-gg/wot.assets`](https://github.com/unicum-gg/wot.assets) from the same
clients, publishing the `gui` tree. It exists for the same reason this repo
does: that mirror was a fork of an upstream whose test branch froze in July
2026, which left Common Test vehicles with no picture anywhere, since
Wargaming's CDN serves released vehicles only.

**It accumulates, unlike this one.** A script the client drops must stop being
published here, because the tree describes what the game is. Assets are the
other way round: Wargaming pulls an event's art when the event ends, and those
files are gone for good. So the assets run writes over its branch without
clearing it, keeping ~23k retired event assets alongside what the live client
carries.

## Notice

Assets provided in the repository are the property of their sole owners.
