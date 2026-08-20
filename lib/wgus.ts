// Wargaming Update Service: resolves a branch to the exact CDN URLs of the
// install `.wgpkg` volumes, without a game client anywhere.
import { fetchText } from "./http.js";

export const PROTOCOL_VERSION = "100500.6969696"; // spoofed, WGUS accepts it
const MAX_REDIRECTS = 3;

export type Volume = { url: string; size: number };
export type Client = {
  host: string;
  version: string;
  getVolumes: (part: string) => Volume[];
};

const match = (s: string, re: RegExp) => (s.match(re) ?? [])[1];
const matchAll = (s: string, re: RegExp) => [...s.matchAll(re)];

/**
 * Resolve `guid` on `host`, following WGUS redirects.
 *
 * A branch can be served by a host other than the one we ask. WGUS answers the
 * move with a `redirect_url` inside `patches_chain` instead of a chain, and
 * leaves the old host serving frozen metadata: that is how the Common Test left
 * `wgus-wotct` (stuck on an April 2021 manifest) for `wgus-eu`. We follow the
 * pointer and re-resolve, since the new host carries its own metadata version.
 *
 * Resolves to `null` when the branch simply has no build published, which is a
 * normal state rather than a failure.
 */
export async function resolveClient(host: string, guid: string): Promise<Client | null> {
  let currentHost = host;
  for (let hop = 0; ; hop++) {
    const meta = await fetchText(
      `https://${currentHost}/api/v1/metadata/?guid=${guid}&chain_id=unknown&protocol_version=${PROTOCOL_VERSION}`,
    );
    const version = match(meta, /<version>([^<]+)<\/version>/);
    if (!version) throw new Error(`no metadata version for ${guid} on ${currentHost}`);
    // Some publishers redirect the app id itself (Lesta does).
    const appId = match(meta, /<redirect_application_id>([^<]+)<\/redirect_application_id>/) ?? guid;
    // The language has to be one the build ships.
    const lang = match(meta, /<default_language>([^<]+)<\/default_language>/) ?? "EN";
    const hd = match(meta, /<client_type\b[^>]*\bid="hd"[^>]*>([\s\S]*?)<\/client_type>/) ?? "";
    const parts = matchAll(hd, /<client_part\b[^>]*\bid="([^"]+)"/g).map((m) => m[1]);

    const query = new URLSearchParams({
      game_id: appId,
      protocol_version: PROTOCOL_VERSION,
      metadata_protocol_version: PROTOCOL_VERSION,
      installation_id: "wot-src",
      client_type: "hd",
      lang,
      metadata_version: version,
    });
    for (const part of parts) query.set(`${part}_current_version`, "0");
    const chain = await fetchText(`https://${currentHost}/api/v1/patches_chain/?${query}`);

    const moved = match(chain, /<redirect_url>([^<]+)<\/redirect_url>/);
    if (moved) {
      const next = new URL(moved.trim()).host;
      if (next && next !== currentHost) {
        if (hop >= MAX_REDIRECTS) throw new Error(`WGUS redirect loop for ${guid}`);
        console.log(`[wot-src] ${guid} moved: ${currentHost} -> ${next}`);
        currentHost = next;
        continue;
      }
    }

    // Scope the seed to its own block: a chain also lists torrent `<url>`s,
    // which are not range-servable mirrors.
    const seeds = match(chain, /<web_seeds>([\s\S]*?)<\/web_seeds>/) ?? "";
    const seedBase = match(seeds, /<url[^>]*>([^<]+)<\/url>/);
    if (!seedBase) return null;

    // Keep the largest patch per part: that is the full install, the smaller
    // ones being incremental diffs on top of it.
    const total = (v: Volume[]) => v.reduce((sum, vol) => sum + vol.size, 0);
    const byPart = new Map<string, Volume[]>();
    for (const [, patch] of matchAll(chain, /<patch>([\s\S]*?)<\/patch>/g)) {
      const part = match(patch, /<part>([^<]+)<\/part>/);
      if (!part) continue;
      const volumes = matchAll(patch, /<file>([\s\S]*?)<\/file>/g).map((m): Volume => ({
        url: seedBase + (match(m[1], /<name>([^<]+)<\/name>/) ?? "").trim(),
        size: Number(match(m[1], /<size>([^<]+)<\/size>/)),
      }));
      const current = byPart.get(part);
      if (!current || total(volumes) > total(current)) byPart.set(part, volumes);
    }

    return { host: currentHost, version, getVolumes: (part) => byPart.get(part) ?? [] };
  }
}
