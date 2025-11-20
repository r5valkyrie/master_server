import type { APIRoute } from 'astro';
import { setServer, getServerByIPAndPort } from '../../../lib/servers';
import { IsVersionSupported, IsChecksumsEnabled, initializeVersions } from '../../../lib/versions';
import { IsChecksumSupported } from '../../../lib/checksums';
import { assertLength, isNumeric } from '../../../lib/utils';
import { GameServerClient } from '../../../lib/gameServerClient';
import { logger } from '../../../lib/logger';
import { v4 as uuidv4 } from 'uuid';
//import Filter = require('bad-words');

// Helper for returning errors
function ParamError(message: string) {
    return new Response(JSON.stringify({ success: false, error: message }), { status: 400 });
}

export const POST: APIRoute = async ({ request }) => {
    try {
        await initializeVersions();
        const body = await request.json();
        let { name, description, map, version, numPlayers, maxPlayers, checksum, port, playlist, key, hidden, hasPassword, password, requiredMods, enabledMods } = body;

        // Get the IP address, preferring cf-connecting-ip, and parse it to get the first IP in the list.
        let ip = request.headers.get('Cf-Pseudo-IPv4') || request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
        ip = ip.split(',')[0].trim();

        // ==== VALIDATION ====
        if (!name || !map || !version || !playlist || !key) {
            return ParamError("Missing required fields.");
        }


        if(!password) password = "";

        if(password && password.length > 0) {
            hasPassword = true;
        }
        else
        {
            hasPassword = false;
        }

        if (!assertLength(name, 1, 256)) return ParamError("Name must be between 1 and 256 characters.");
        // Disallow URLs or invite links in server name (protocols, www, domains, IPs, invites)
        const urlMatchers = [
            /(https?:\/\/|ftp:\/\/)/i,                 // protocols
            /\bwww\.[^\s]+/i,                            // www.
            /\bdiscord\.(gg|com\/invite)\b/i,          // discord invites
            /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/,  // IPv4[:port]
            /\[[0-9a-f:]+\]/i,                           // IPv6 [addr]
            /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:[a-z]{2,24})(?:\b|\/)/i // domain.tld[/]
        ];

        if (urlMatchers.some(rx => rx.test(name))) return ParamError("Server name cannot contain URLs or invite links.");
        if (description && !assertLength(description, 0, 256)) return ParamError("Description must be below 256 characters.");
        if (!assertLength(map, 1, 32)) return ParamError("Map must be between 1 and 32 characters.");
        if (maxPlayers < 1 || maxPlayers > 128) return ParamError("Max players must be between 1 and 128 players.");
        if (!ip) return ParamError("Couldn't retrieve an IP address.");
        if (port < 0 || port > 65535) return ParamError("Port must be in the range 0-65535");
        if (!/^[a-zA-Z0-9_]+$/.test(playlist)) return ParamError("Playlist must be composed of latin letters, numbers, and underscores.");

        // Normalize requiredMods to an array of non-empty strings
        if (Array.isArray(requiredMods)) {
            requiredMods = requiredMods
                .filter((m) => typeof m === "string")
                .map((m) => m.trim())
                .filter((m) => m.length > 0);
        } else if (typeof requiredMods === "string") {
            try {
                const parsed = JSON.parse(requiredMods);
                if (Array.isArray(parsed)) {
                    requiredMods = parsed
                        .filter((m) => typeof m === "string")
                        .map((m) => m.trim())
                        .filter((m) => m.length > 0);
                } else {
                    requiredMods = [];
                }
            } catch {
                requiredMods = [];
            }
        } else {
            requiredMods = [];
        }

        // Normalize enabledMods to an array of valid mod objects
        let enabledModsArray: any[] = [];
        if (Array.isArray(enabledMods)) {
            enabledModsArray = enabledMods
                .filter((mod) => mod && typeof mod === "object")
                .map((mod) => ({
                    id: (typeof mod.id === "string" ? mod.id.trim() : ""),
                    name: (typeof mod.name === "string" ? mod.name.trim() : ""),
                    author: (typeof mod.author === "string" ? mod.author.trim() : ""),
                    version: (typeof mod.version === "string" ? mod.version.trim() : ""),
                    thunderstore_id: (typeof mod.thunderstore_id === "string" ? mod.thunderstore_id.trim() : ""),
                    description: (typeof mod.description === "string" ? mod.description.trim() : "")
                }))
                .filter((mod) => mod.id.length > 0 && mod.name.length > 0);
        } else if (typeof enabledMods === "string") {
            try {
                const parsed = JSON.parse(enabledMods);
                if (Array.isArray(parsed)) {
                    enabledModsArray = parsed
                        .filter((mod) => mod && typeof mod === "object")
                        .map((mod) => ({
                            id: (typeof mod.id === "string" ? mod.id.trim() : ""),
                            name: (typeof mod.name === "string" ? mod.name.trim() : ""),
                            author: (typeof mod.author === "string" ? mod.author.trim() : ""),
                            version: (typeof mod.version === "string" ? mod.version.trim() : ""),
                            thunderstore_id: (typeof mod.thunderstore_id === "string" ? mod.thunderstore_id.trim() : ""),
                            description: (typeof mod.description === "string" ? mod.description.trim() : "")
                        }))
                        .filter((mod) => mod.id.length > 0 && mod.name.length > 0);
                }
            } catch {
                // ignore malformed strings; fall back to empty array
            }
        }
        enabledMods = enabledModsArray;

        // If enabledMods is provided but requiredMods is empty, populate requiredMods from enabledMods for backward compatibility
        if (enabledMods.length > 0 && requiredMods.length === 0) {
            requiredMods = enabledMods.map((mod: any) => mod.id).filter((id: string) => id.length > 0);
        }

        if (!hidden && !await IsVersionSupported(version)) {
            return ParamError("Please update to the latest version of the SDK to host a public server.");
        }
        
        if (await IsChecksumsEnabled(version) && !IsChecksumSupported(checksum, version)) {
             return ParamError(`Your remote functions checksum does not match the server checksum.\nChecksum: ${checksum}\nVersion: ${version}`);
        }

        // ==== RSRC CLIENT LOGIC (Promise.race pattern) ====
        const client = new GameServerClient({ encryptionKey: key, ip: ip, port: port, uid: 1000000001337n });

        const challengePromise = new Promise<void>((resolve, reject) => {
            client.once("challenge", () => resolve());
            client.once("error", (err) => reject(new Error("GameServerClient connection error.")));
        });

        const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error("Server verification timed out. Please check your ports.")), 800);
        });
        
        client.connect();

        // Race the challenge against the timeout
        await Promise.race([challengePromise, timeoutPromise]);

        // If we get here, the challenge was successful
        client.close();

        let token: string | null = null;
        if (hidden) {
            const retrievedServer = await getServerByIPAndPort(ip, port);
            token = (retrievedServer && retrievedServer.token) ? retrievedServer.token : uuidv4();
        }

        const server = {
            name, description, map, ip, port, playlist, key, hidden,
            numPlayers, maxPlayers, version, checksum,
            playerCount: numPlayers,
            region: request.headers.get('cf-ipcountry') || "XX",
            ...(token && { token }),
            hasPassword,
            ...(hasPassword && { password }),
            requiredMods,
            enabledMods,
        };

        await setServer(server);
        
        return new Response(JSON.stringify({ success: true, token, ip: ip, port: port }), { status: 200 });

    } catch (error: any) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        
        if (error.message === "Server verification timed out. Please check your ports.") {
            return new Response(JSON.stringify({ 
                success: false, 
                error: error.message
            }), { status: 400 });
        }
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
