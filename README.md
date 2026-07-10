# unicum.gg/wot-src

A mirror fork of [IzeBerg/wot-src](https://github.com/IzeBerg/wot-src) (the WoT
client scripts we build the vehicle catalogue, specs and nations from).

Kept as a safety net: the [`Sync upstream branches`](.github/workflows/sync-upstream.yml)
workflow fast-forwards every mirror branch (`ASIA`, `CN`, `CT`, `EU`, `NA`,
`PT_RU`, `RU`) from upstream twice daily, plus a manual trigger. If upstream ever
goes private we still hold an up-to-date copy to switch to.

This `main` branch is automation only (this README plus the workflow); the mirror
branches carry the actual sources.

> Don't commit to the mirror branches directly. Any divergence makes the
> fast-forward sync fail, so fork-specific changes belong on `main`.
