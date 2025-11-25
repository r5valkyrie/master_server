import type { APIRoute } from 'astro';
import { gunzipSync } from 'node:zlib';
import { logger } from '../../../lib/logger.ts';

// In-memory cache for mods data
interface ModsCache {
    data: any[] | null;
    timestamp: number;
    isRefreshing: boolean;
}

const cache: ModsCache = {
    data: null,
    timestamp: 0,
    isRefreshing: false
};

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

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

async function fetchModsFromThunderstore(): Promise<any[]> {
    const community = process.env.THUNDERSTORE_COMMUNITY || 'r5valkyrie';
    const indexUrl = `https://thunderstore.io/c/${community}/api/v1/package-listing-index/`;
    
    try {
        const idxBuf = await fetchBufferFollowRedirects(indexUrl);
        const idxJson = JSON.parse(Buffer.from(gunzipMaybe(idxBuf)).toString('utf8'));
        const urls: string[] = Array.isArray(idxJson) ? idxJson : [];
        const concurrency = 8;
        const results: any[] = [];
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
                } catch(e) { 
                    logger.error(`Error fetching mod chunk: ${e}`, { prefix: 'CLIENT' }); 
                }
            }
        }));
        
        return results;
    } catch (e) {
        logger.error(`Error fetching mods index: ${e}`, { prefix: 'CLIENT' });
        // Fallback to simple endpoint
        const fallbackUrl = `https://thunderstore.io/c/${community}/api/v1/package/`;
        const resp = await fetch(fallbackUrl, { headers: { 'User-Agent': 'R5Valkyrie-Server/1.0' } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    }
}

async function refreshCache(): Promise<void> {
    if (cache.isRefreshing) return;
    
    cache.isRefreshing = true;
    try {
        const mods = await fetchModsFromThunderstore();
        cache.data = mods;
        cache.timestamp = Date.now();
        logger.info(`Mods cache refreshed: ${mods.length} mods loaded`, { prefix: 'CLIENT' });
    } catch (e) {
        logger.error(`Failed to refresh mods cache: ${e}`, { prefix: 'CLIENT' });
    } finally {
        cache.isRefreshing = false;
    }
}

export const GET: APIRoute = async ({ url }) => {
    const query = String(url.searchParams.get('q') || '').toLowerCase();
    const now = Date.now();
    const cacheAge = now - cache.timestamp;
    
    // If cache is empty or expired, we need to fetch
    if (!cache.data || cacheAge > CACHE_TTL) {
        // If we have stale data, return it immediately and refresh in background
        if (cache.data && !cache.isRefreshing) {
            // Trigger background refresh
            refreshCache();
        } else if (!cache.data) {
            // No data at all, must wait for fetch
            await refreshCache();
        }
    }
    
    // Return cached data (or empty array if still loading)
    let packs = cache.data || [];
    
    // Apply search filter
    if (query) {
        packs = packs.filter((p: any) => 
            String(p?.name || '').toLowerCase().includes(query) || 
            String(p?.full_name || '').toLowerCase().includes(query)
        );
    }
    
    return new Response(JSON.stringify(packs), { 
        status: 200, 
        headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60'
        } 
    });
};


