import type { APIRoute } from 'astro';
import { gunzipSync } from 'node:zlib';
import { logger } from '../../../lib/logger.ts';

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

export const GET: APIRoute = async ({ url }) => {
    const community = process.env.THUNDERSTORE_COMMUNITY || 'r5valkyrie';
    const query = String(url.searchParams.get('q') || '').toLowerCase();

    const indexUrl = `https://thunderstore.io/c/${community}/api/v1/package-listing-index/`;
    try {
        const idxBuf = await fetchBufferFollowRedirects(indexUrl);
        const idxJson = JSON.parse(Buffer.from(gunzipMaybe(idxBuf)).toString('utf8'));
        const urls: string[] = Array.isArray(idxJson) ? idxJson : [];
        const concurrency = 6;
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
                } catch(e) { logger.error(`Error fetching mods: ${e}`, { prefix: 'CLIENT' }); }
            }
        }));

        let packs = results;
        if (query) {
            packs = packs.filter((p: any) => String(p?.name || '').toLowerCase().includes(query) || String(p?.full_name || '').toLowerCase().includes(query));
        }
        return new Response(JSON.stringify(packs), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {

        logger.error(`Error fetching mods: ${e}`, { prefix: 'CLIENT' });
        // Fallback to simple endpoint
        try {
            const fallbackUrl = `https://thunderstore.io/c/${community}/api/v1/package/`;
            const resp = await fetch(fallbackUrl, { headers: { 'User-Agent': 'R5Valkyrie-Server/1.0' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            let packs: any[] = await resp.json();
            if (query) {
                packs = packs.filter((p: any) => String(p?.name || '').toLowerCase().includes(query) || String(p?.full_name || '').toLowerCase().includes(query));
            }
            return new Response(JSON.stringify(packs), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (err: any) {
            const fallbackMessage = (e && typeof e === 'object' && 'message' in (e as any)) ? (e as any).message : String(e);
            const message = err?.message ? String(err.message) : fallbackMessage;
            return new Response(JSON.stringify({ success: false, error: message }), { status: 500 });
        }
    }
};


