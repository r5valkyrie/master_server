import { createClient } from 'redis';
import { logger } from './logger.ts';

type RedisClientInstance = ReturnType<typeof createClient>;
let redisClient: RedisClientInstance | null = null;

async function initializeRedis() {
    const redisUrl = process.env.REDIS_URL;
    const noRedis = process.env.DISABLE_REDIS === "1";

    if (noRedis || !redisUrl || redisUrl.trim() === '') {
        return null;
    }

    try {
        const client = createClient({
            url: redisUrl,
            password: process.env.REDIS_PASSWORD
        });
        client.on('error', (err) => logger.error(`Redis client error: ${err}`, { prefix: 'SERVERS' }));
        await client.connect();
        logger.info('Successfully connected to Redis', { prefix: 'SERVERS' });
        return client;
    } catch (e) {
        logger.warn(`Failed to initialize Redis. Proceeding without Redis: ${(e as Error).message}`, { prefix: 'SERVERS' });
        return null;
    }
}

redisClient = await initializeRedis();

export function ConvertServerDataTypes(server: any, useRealTypes: boolean) {
    let sv = {...server};
    let hidden = false;

    if(typeof sv.hidden == "boolean")
        hidden = sv.hidden;
    else
        hidden = sv.hidden === "true";

    let hasPassword = false;
    if(typeof sv.hasPassword == "boolean")
        hasPassword = sv.hasPassword;
    else
        hasPassword = sv.hasPassword === "true";

    sv.hidden = useRealTypes ? hidden : `${sv.hidden}`;
    sv.hasPassword = useRealTypes ? hasPassword : `${sv.hasPassword}`;
    sv.password = sv.password ? sv.password.toString() : "";
    sv.port = useRealTypes ? parseInt(sv.port) : `${sv.port}`;
    sv.playerCount = useRealTypes ? parseInt(sv.playerCount) : `${sv.playerCount}`;
    sv.maxPlayers = useRealTypes ? parseInt(sv.maxPlayers) : `${sv.maxPlayers}`;
    sv.checksum = useRealTypes ? parseInt(sv.checksum) : `${sv.checksum}`;
    sv.numPlayers = useRealTypes ? parseInt(sv.playerCount) : `${sv.playerCount}`;
    
    // requiredMods normalization
    let requiredModsArr: string[] = [];
    if (Array.isArray(sv.requiredMods)) {
        requiredModsArr = sv.requiredMods
            .filter((m: any) => typeof m === "string")
            .map((m: string) => m.trim())
            .filter((m: string) => m.length > 0);
    } else if (typeof sv.requiredMods === "string") {
        try {
            const parsed = JSON.parse(sv.requiredMods);
            if (Array.isArray(parsed)) {
                requiredModsArr = parsed
                    .filter((m: any) => typeof m === "string")
                    .map((m: string) => m.trim())
                    .filter((m: string) => m.length > 0);
            }
        } catch {
            // ignore malformed strings; fall back to empty array
        }
    }
    sv.requiredMods = useRealTypes ? requiredModsArr : JSON.stringify(requiredModsArr);

    // enabledMods normalization
    let enabledModsArr: any[] = [];
    if (Array.isArray(sv.enabledMods)) {
        enabledModsArr = sv.enabledMods
            .filter((mod: any) => mod && typeof mod === "object")
            .map((mod: any) => ({
                id: (typeof mod.id === "string" ? mod.id.trim() : ""),
                name: (typeof mod.name === "string" ? mod.name.trim() : ""),
                author: (typeof mod.author === "string" ? mod.author.trim() : ""),
                version: (typeof mod.version === "string" ? mod.version.trim() : ""),
                thunderstore_id: (typeof mod.thunderstore_id === "string" ? mod.thunderstore_id.trim() : ""),
                description: (typeof mod.description === "string" ? mod.description.trim() : "")
            }))
            .filter((mod: any) => mod.id.length > 0 && mod.name.length > 0);
    } else if (typeof sv.enabledMods === "string") {
        try {
            const parsed = JSON.parse(sv.enabledMods);
            if (Array.isArray(parsed)) {
                enabledModsArr = parsed
                    .filter((mod: any) => mod && typeof mod === "object")
                    .map((mod: any) => ({
                        id: (typeof mod.id === "string" ? mod.id.trim() : ""),
                        name: (typeof mod.name === "string" ? mod.name.trim() : ""),
                        author: (typeof mod.author === "string" ? mod.author.trim() : ""),
                        version: (typeof mod.version === "string" ? mod.version.trim() : ""),
                        thunderstore_id: (typeof mod.thunderstore_id === "string" ? mod.thunderstore_id.trim() : ""),
                        description: (typeof mod.description === "string" ? mod.description.trim() : "")
                    }))
                    .filter((mod: any) => mod.id.length > 0 && mod.name.length > 0);
            }
        } catch {
            // ignore malformed strings; fall back to empty array
        }
    }
    sv.enabledMods = useRealTypes ? enabledModsArr : JSON.stringify(enabledModsArr);

    // If enabledMods exists but requiredMods is empty, populate requiredMods for backward compatibility
    if (enabledModsArr.length > 0 && requiredModsArr.length === 0) {
        requiredModsArr = enabledModsArr.map((mod: any) => mod.id).filter((id: string) => id.length > 0);
        sv.requiredMods = useRealTypes ? requiredModsArr : JSON.stringify(requiredModsArr);
    }

    return sv;
}

export async function setServer(server: any) {
    if (!redisClient) {
        throw new Error("Redis client not initialized. Server cannot be saved.");
    }
    if(!server.ip || server.ip === "") {
        throw new Error("IP field is not set");
    }

    const key = `servers:${server.ip}:${server.port}`;
    const serverWithStringTypes = ConvertServerDataTypes(server, false);
    await redisClient.hSet(key, serverWithStringTypes);
    await redisClient.expire(key, parseInt(process.env.SERVER_TTL || '30'));
}

export async function getServers(useRealTypes: boolean) {
    if (!redisClient) return [];

    let servers = [];
    let cursor = 0;

    do {
        const reply = await redisClient.scan(cursor.toString(), { MATCH: 'servers:*:*' });
        cursor = Number(reply.cursor);

        for (const key of reply.keys) {
            const server = await redisClient.hGetAll(key);
            if (!server) continue;
            if (!server.port) server.port = "37015";
            if(server.password && server.password.length > 0)
                server.hasPassword = "true";
            else
                server.hasPassword = "false";
            if (!server.requiredMods) server.requiredMods = "[]";
            if (!server.enabledMods) server.enabledMods = "[]";
            server.password = "";
            servers.push(useRealTypes ? ConvertServerDataTypes(server, useRealTypes) : server);
        }
    } while (cursor != 0);

    return servers;
}

// Returns all Redis keys for active servers (e.g., servers:IP:PORT)
export async function getServerKeys(): Promise<string[]> {
    if (!redisClient) return [];
    let keys: string[] = [];
    let cursor = 0;
    do {
        const reply = await redisClient.scan(cursor.toString(), { MATCH: 'servers:*:*' });
        cursor = Number(reply.cursor);
        keys.push(...reply.keys);
    } while (cursor != 0);
    return keys;
}

const KNOWN_SET_KEY = 'ms:servers:known';

export async function getKnownServerKeys(): Promise<Set<string>> {
    const result = new Set<string>();
    if (!redisClient) return result;
    try {
        const members = await redisClient.sMembers(KNOWN_SET_KEY);
        for (const m of members) result.add(m);
    } catch {}
    return result;
}

export async function replaceKnownServerKeys(keys: string[]): Promise<void> {
    if (!redisClient) return;
    try {
        const multi = redisClient.multi();
        multi.del(KNOWN_SET_KEY);
        if (keys.length > 0) {
            multi.sAdd(KNOWN_SET_KEY, keys);
        }
        await multi.exec();
    } catch (e) {
        console.error('replaceKnownServerKeys error:', e);
    }
}

export async function setMOTD(motd: string) {
    if (!redisClient) return;
    await redisClient.set("motd", motd);
}

export async function getMOTD() {
    if (!redisClient) return null;
    return await redisClient.get("motd");
}

export async function getServerByToken(token: string) {
    const servers = await getServers(false) || [];
    return servers.find(s => s.token === token);
}

export async function getServerByIPAndPort(ip: string, port: number) {
    if (!redisClient) return null;
    return await redisClient.hGetAll(`servers:${ip}:${port}`);
}

export async function getServersByIP(ip: string) {
    const servers = await getServers(false) || [];
    return servers.find(s => s.ip === ip);
}

// Lightweight meta cache helpers (no IPs logged externally)
const META_HASH_KEY = 'ms:servers:meta';

export async function upsertServerMeta(ip: string, port: number, meta: { name?: string; map?: string; playlist?: string; requiredMods?: string[]; enabledMods?: any[] }) {
    if (!redisClient) return;
    const key = `${ip}:${port}`;
    try {
        const stored = {
            name: meta.name || '',
            map: meta.map || '',
            playlist: meta.playlist || '',
            requiredMods: JSON.stringify(meta.requiredMods || []),
            enabledMods: JSON.stringify(meta.enabledMods || [])
        };
        await redisClient.hSet(META_HASH_KEY, key, JSON.stringify(stored));
    } catch (e) { console.error('upsertServerMeta error:', e); }
}

export async function getServerMeta(ip: string, port: number): Promise<{ name: string; map: string; playlist: string; requiredMods: string[]; enabledMods: any[] } | null> {
    if (!redisClient) return null;
    const key = `${ip}:${port}`;
    try {
        const raw = await redisClient.hGet(META_HASH_KEY, key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            name: parsed.name || '',
            map: parsed.map || '',
            playlist: parsed.playlist || '',
            requiredMods: (() => { try { const arr = JSON.parse(parsed.requiredMods || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; } })(),
            enabledMods: (() => { try { const arr = JSON.parse(parsed.enabledMods || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; } })()
        };
    } catch { return null; }
}

export async function removeServerMeta(ip: string, port: number) {
    if (!redisClient) return;
    const key = `${ip}:${port}`;
    try { await redisClient.hDel(META_HASH_KEY, key); } catch {}
}

// Active servers list message id storage
const ACTIVE_LIST_MSG_KEY = 'ms:servers:active_list_message_id';

export async function getActiveServersListMessageId(): Promise<string | null> {
    if (!redisClient) return null;
    try { return await redisClient.get(ACTIVE_LIST_MSG_KEY); } catch { return null; }
}

export async function setActiveServersListMessageId(id: string): Promise<void> {
    if (!redisClient) return;
    try { await redisClient.set(ACTIVE_LIST_MSG_KEY, id); } catch {}
}

export async function clearActiveServersListMessageId(): Promise<void> {
    if (!redisClient) return;
    try { await redisClient.del(ACTIVE_LIST_MSG_KEY); } catch {}
}
