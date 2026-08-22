# wot-src

Decompiled **World of Tanks client sources**, one branch per client build.
Extracted straight from the update CDN by
[`unicum-gg/wot.build`](https://github.com/unicum-gg/wot.build), with no game
client installed. Used by [unicum.gg](https://unicum.gg) for the vehicle
catalogue, specifications, arenas and nations.

## Branches

| Branch | Client | Update service | guid |
| --- | --- | --- | --- |
| [`EU`](../../tree/EU) | Wargaming release, EU | `wgus-woteu.wargaming.net` | `WOT.EU.PRODUCTION` |
| [`NA`](../../tree/NA) | Wargaming release, NA | `wgus-wotna.wargaming.net` | `WOT.NA.PRODUCTION` |
| [`ASIA`](../../tree/ASIA) | Wargaming release, Asia | `wgus-wotasia.wargaming.net` | `WOT.ASIA.PRODUCTION` |
| [`CT`](../../tree/CT) | Wargaming Common Test | `wgus-wotct.wargaming.net` | `WOT.CT.PRODUCTION` |
| [`RU`](../../tree/RU) | Lesta release (Мир танков) | `lstus-ru.lesta.ru` | `MT.RU.PRODUCTION` |
| [`PT_RU`](../../tree/PT_RU) | Lesta public test | `lstus-ru.lesta.ru` | `MT.PT.PRODUCTION` |
| [`CN`](../../tree/CN) | 360 release (坦克世界) | `wgus-cn360.wggames.cn` | `WOT.CN.PRODUCTION` |

Three publishers, one protocol. Wargaming left Russia, so Мир танков is
published by **Lesta**, and 坦克世界 by **360** in China; neither is reachable
from Wargaming's own service. Their update hosts are not in any binary
either: each launcher keeps them in a zlib-compressed `gc_info.xml` inside its resource
blob.

## What is published

Sources only, as upstream did: `.pyc` decompiled to `.py`, packed XML converted
back to text, `.def`/`.txt` copied, `.swc` libraries decompiled into
`sources-as3/`, and everything binary dropped, except the vehicle contour icons
and the `.swc` archives themselves. The `locale` part's gettext `.mo` become
`.po`.

**This mirror does not accumulate.** A file the client drops stops being
published here, because the tree describes what the game *is*. Its sibling
[`wot.assets`](https://github.com/unicum-gg/wot.assets) does the opposite, and
says why.

`_stubs/` is the one directory not produced from the client: it describes the
engine's native modules (`BigWorld`, `Entity`, `WoT`), which ship compiled into
the executable and exist in no package, so an IDE reading the decompiled scripts
has nothing to resolve them against.

## History

This began as a fork of [IzeBerg/wot-src](https://github.com/IzeBerg/wot-src),
fast-forwarded from it. That mirror's Common Test branch had frozen on an April
2021 manifest, so a vehicle in testing was invisible here weeks before release,
which is what the branch exists for. Every branch is now built from the client
itself.

Output is meant to stay interchangeable with upstream's, and that is measurable:
diff a branch against the matching one upstream and the only differences should
be content the two builds genuinely disagree on.

## Notice

Assets provided in the repository are the property of their sole owners.
