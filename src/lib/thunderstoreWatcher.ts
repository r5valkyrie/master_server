import { gunzipSync } from 'node:zlib';
import { logger } from './logger.ts';
/*
  Thunderstore watcher for R5Valkyrie
  - Polls Thunderstore community packages
  - Detects new packages and version updates
  - Sends Discord webhook embeds (up to 10 per request)
  - Persists seen version state using Redis when available, else filesystem JSON
*/

type ThunderstorePackage = {
    uuid4?: string;
    name?: string;
    owner?: string;
    categories?: string[];
    versions?: Array<{
        version_number?: string;
        description?: string;
        downloads?: number;
        icon?: string;
        date_created?: string;
    }>;
};

type SeenVersionsMap = Record<string, string>;

const DEFAULT_COMMUNITY = 'r5valkyrie';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STATE_FILE = 'seen_versions.json';

let watcherStarted = false;
let inFlight = false;
let memorySeenVersions: SeenVersionsMap = {};

function getEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getEnvString(name: string, fallback: string): string {
    const raw = process.env[name];
    if (!raw || raw.trim() === '') return fallback;
    return raw.trim();
}

async function loadSeenVersions(): Promise<SeenVersionsMap> {
    // Prefer Redis if configured
    try {
        const { createClient } = await import('redis');
        const redisUrl = process.env.REDIS_URL;
        const noRedis = process.env.DISABLE_REDIS === '1';
        if (!noRedis && redisUrl && redisUrl.trim() !== '') {
            const client = createClient({ url: redisUrl, password: process.env.REDIS_PASSWORD });
            client.on('error', () => {});
            await client.connect();
            const raw = await client.get('thunderstore:seen_versions');
            await client.quit();
            if (raw) {
                return JSON.parse(raw);
            }
        }
    } catch {
        // fall back to file
    }

    // File-based fallback
    try {
        const fs = await import('fs/promises');
        const data = await fs.readFile(STATE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

async function saveSeenVersions(map: SeenVersionsMap): Promise<void> {
    // Try Redis first
    try {
        const { createClient } = await import('redis');
        const redisUrl = process.env.REDIS_URL;
        const noRedis = process.env.DISABLE_REDIS === '1';
        if (!noRedis && redisUrl && redisUrl.trim() !== '') {
            const client = createClient({ url: redisUrl, password: process.env.REDIS_PASSWORD });
            client.on('error', () => {});
            await client.connect();
            await client.set('thunderstore:seen_versions', JSON.stringify(map));
            await client.quit();
            return;
        }
    } catch {
        // fall back to file
    }
    try {
        const fs = await import('fs/promises');
        await fs.writeFile(STATE_FILE, JSON.stringify(map), 'utf-8');
    } catch {
        // ignore
    }
}

function buildEmbed(
    mod: ThunderstorePackage,
    latest: NonNullable<ThunderstorePackage['versions']>[number],
    community: string,
    updateType: 'new' | 'update'
) {
    const totalDownloads = (mod.versions || []).reduce((acc, v) => acc + (v.downloads || 0), 0);
    const downloadDisplay = totalDownloads > 0 ? totalDownloads.toLocaleString('en-US') : 'Not available';
    const categories = (mod.categories || []).join(', ') || 'Uncategorized';
    const iconUrl = latest?.icon || '';
    const titlePrefix = updateType === 'new' ? '🆕 Mod Release! -' : '🔄 Mod Update! -';

    return {
        title: `${titlePrefix} ${mod.name || 'Unknown'} v${latest?.version_number || '?'}`,
        url: `https://thunderstore.io/c/${community}/p/${mod.owner || 'Unknown'}/${mod.name || 'Unknown'}/`,
        description: String(latest?.description || 'No changelog provided.').slice(0, 2000),
        color: 0x7289da,
        fields: [
            { name: 'Author', value: mod.owner || 'Unknown', inline: true },
            { name: 'Total Downloads', value: downloadDisplay, inline: true },
            { name: 'Categories', value: categories, inline: true },
        ],
        thumbnail: { url: iconUrl },
        footer: { text: `UUID: ${mod.uuid4 || '?'}` },
        timestamp: latest?.date_created || new Date().toISOString(),
    };
}

async function postDiscordEmbeds(channelId: string, embeds: any[]): Promise<void> {
    if (!channelId || embeds.length === 0) return;
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!botToken) return;
    
    const chunks: any[][] = [];
    for (let i = 0; i < embeds.length; i += 10) chunks.push(embeds.slice(i, i + 10));
    for (const batch of chunks) {
        try {
            const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${botToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ embeds: batch })
            });
            if (!resp.ok) {
                logger.error(`Discord bot send failed: ${resp.status} ${await resp.text()}`, { prefix: 'THUNDERSTORE' });
            }
        } catch (e) {
            logger.error(`Discord bot error: ${e}`, { prefix: 'THUNDERSTORE' });
        }
    }
}

async function fetchBufferFollowRedirects(url: string): Promise<Uint8Array> {
    const headers: Record<string, string> = {
        'User-Agent': 'R5Valkyrie-Server/1.0',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip'
    };
    let next = url;
    for (let i = 0; i < 5; i++) {
        const resp = await fetch(next, { method: 'GET', headers });
        if (resp.status >= 300 && resp.status < 400) {
            const loc = resp.headers.get('location');
            if (!loc) throw new Error(`Redirect without location from ${next}`);
            next = loc.startsWith('http') ? loc : new URL(loc, next).toString();
            continue;
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = new Uint8Array(await resp.arrayBuffer());
        return buf;
    }
    throw new Error('Too many redirects');
}

function gunzipMaybe(buf: Uint8Array): Uint8Array {
    try { return gunzipSync(buf); } catch { return buf; }
}

async function fetchPackages(community: string): Promise<ThunderstorePackage[]> {
    // Try the index endpoint first for better scalability
    const indexUrl = `https://thunderstore.io/c/${community}/api/v1/package-listing-index/`;
    try {
        const idxBuf = await fetchBufferFollowRedirects(indexUrl);
        const idxJson = JSON.parse(Buffer.from(gunzipMaybe(idxBuf)).toString('utf8'));
        const urls: string[] = Array.isArray(idxJson) ? idxJson : [];
        const concurrency = 6;
        const results: ThunderstorePackage[] = [];
        let cursor = 0;
        await Promise.all(Array.from({ length: concurrency }).map(async () => {
            while (cursor < urls.length) {
                const j = cursor++;
                const u = urls[j];
                try {
                    const b = await fetchBufferFollowRedirects(u);
                    const text = Buffer.from(gunzipMaybe(b)).toString('utf8');
                    const arr = JSON.parse(text);
                    if (Array.isArray(arr)) results.push(...arr);
                } catch {}
            }
        }));
        if (results.length > 0) return results;
    } catch (e) {
        // fall back below
    }

    // Fallback to the simple endpoint
    const fallbackUrl = `https://thunderstore.io/c/${community}/api/v1/package/`;
    const resp = await fetch(fallbackUrl, { method: 'GET', headers: { 'User-Agent': 'R5Valkyrie-Server/1.0' } });
    if (!resp.ok) throw new Error(`Thunderstore API error: ${resp.status}`);
    return await resp.json();
}

function getLatestVersion(mod: ThunderstorePackage): NonNullable<ThunderstorePackage['versions']>[number] | null {
    const versions = mod.versions || [];
    if (versions.length === 0) return null;
    // Use semantic-ish sort by version_number lexicographically is unreliable; assume API already sorted newest first in practice
    // Fallback to max by version_number string
    let latest = versions[0];
    for (const v of versions) {
        if (String(v.version_number || '') > String(latest.version_number || '')) latest = v;
    }
    return latest;
}

async function runOnce(): Promise<void> {
    const community = getEnvString('THUNDERSTORE_COMMUNITY', DEFAULT_COMMUNITY);
    const channelId = process.env.DISCORD_MOD_UPDATES_CHANNEL_ID || '';
    if (!channelId) return;

    try {
        const mods = await fetchPackages(community);
        const updates: { mod: ThunderstorePackage; latest: NonNullable<ReturnType<typeof getLatestVersion>>; type: 'new' | 'update' }[] = [];

        for (const mod of mods) {
            const latest = getLatestVersion(mod);
            const id = String(mod.uuid4 || '').trim();
            if (!latest || !id) continue;

            const prev = memorySeenVersions[id];
            if (!prev) {
                updates.push({ mod, latest, type: 'new' });
                memorySeenVersions[id] = String(latest.version_number || '');
            } else if (prev !== String(latest.version_number || '')) {
                updates.push({ mod, latest, type: 'update' });
                memorySeenVersions[id] = String(latest.version_number || '');
            }
        }

        if (updates.length > 0) {
            const embeds = updates.map(u => buildEmbed(u.mod, u.latest, community, u.type));
            await postDiscordEmbeds(channelId, embeds);
            await saveSeenVersions(memorySeenVersions);
            logger.info(`Posted ${updates.length} update(s)`, { prefix: 'THUNDERSTORE' });
        }
    } catch (e) {
        logger.error(`runOnce error: ${e}`, { prefix: 'THUNDERSTORE' });
    }
}

export async function startThunderstoreWatcher(): Promise<void> {
    if (watcherStarted) return;
    watcherStarted = true;

    const intervalMs = getEnvNumber('THUNDERSTORE_CHECK_INTERVAL_MS', DEFAULT_INTERVAL_MS);
    const channelId = process.env.DISCORD_MOD_UPDATES_CHANNEL_ID || '';
    if (!channelId) {
        logger.warn('No Discord mod updates channel configured; watcher not started', { prefix: 'THUNDERSTORE' });
        return;
    }

    memorySeenVersions = await loadSeenVersions();
    logger.info(`Watching community: ${getEnvString('THUNDERSTORE_COMMUNITY', DEFAULT_COMMUNITY)} (every ${Math.round(intervalMs/1000)}s)`, { prefix: 'THUNDERSTORE' });

    // Run once on startup
    if (!inFlight) {
        inFlight = true;
        runOnce().finally(() => { inFlight = false; });
    }

    setInterval(() => {
        if (inFlight) return;
        inFlight = true;
        runOnce().finally(() => { inFlight = false; });
    }, intervalMs);
}


