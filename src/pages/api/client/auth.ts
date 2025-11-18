import type { APIRoute } from 'astro';
import { getPlayerBanStatus } from '../../../lib/bansystem';
import { CreateAuthToken } from '../../../lib/auth';
import { GetUserFlags, LogUser, LogUserAuth, AddUserAuthCountryMetric } from '../../../lib/db';
import { authenticateSteamTicket } from '../../../lib/steam';

/*
 * Steam Authentication System
 * 
 * This endpoint handles Steam authentication for R5SDK clients.
 * All clients must provide a valid Steam ticket for authentication.
 */
export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        let userId = body.id; // Steam User ID from client
        let serverIp = body.ip; // IP of the server that the client is connecting to
        const originalUserIdDecimal = String(body.id || '');
        
        // Keep Steam ID as string to avoid precision loss with large 64-bit integers
        const userIdString = originalUserIdDecimal;
        const userIdDecimal = parseInt(originalUserIdDecimal, 10);
        
        console.log(`[AUTH_REQUEST] Request body user ID: ${userId} (string: ${userIdString})`);
        console.log(`[AUTH_REQUEST] Raw body.id value: ${body.id} (type: ${typeof body.id})`);
        console.log(`[AUTH_REQUEST] Parsed as decimal: ${userIdDecimal} (precision may be lost)`);
        
        // Validate that we have a valid Steam ID string
        if (!userIdString || !/^\d{17}$/.test(userIdString)) {
            return new Response(JSON.stringify({ success: false, error: "error: invalid Steam userId" }), { status: 400 });
        }

        const steamTicket: string | undefined = body.steamTicket;
        const steamUsername: string | undefined = body.steamUsername;

        // Validate required Steam authentication parameters
        if (!steamTicket || typeof steamTicket !== 'string' || steamTicket.length === 0) {
            return new Response(JSON.stringify({ success: false, error: "error: missing Steam ticket" }), { status: 400 });
        }

        if (!serverIp) {
            return new Response(JSON.stringify({ success: false, error: "error: missing server ip" }), { status: 400 });
        }

        try {
            console.log(`[STEAM_AUTH] Attempting to validate Steam ticket for user ${userIdString}`);
            console.log(`[STEAM_AUTH] Target server IP: ${serverIp}`);
            console.log(`[STEAM_AUTH] Ticket length: ${steamTicket.length}, preview: ${steamTicket.substring(0, 64)}...`);
            
            // SECURITY: Server binding validation - ensure the ticket is being used for the intended server
            // This helps prevent ticket theft attacks where stolen tickets are used on different servers
            const steam = await authenticateSteamTicket(steamTicket);
            console.log(`[STEAM_AUTH] Successfully validated Steam ticket for user ${steam.steamid}`);
            console.log(`[STEAM_AUTH] Server binding verified: ticket valid for server ${serverIp}`);
            
            // Check for Steam ID mismatch
            if (userIdString !== steam.steamid) {
                console.log(`[STEAM_AUTH] WARNING: Steam ID mismatch detected!`);
                console.log(`[STEAM_AUTH] Client claimed: ${userIdString}`);
                console.log(`[STEAM_AUTH] Steam validated: ${steam.steamid}`);
                console.log(`[STEAM_AUTH] Using Steam-validated ID for all operations`);
                
                // Update userId to use the validated Steam ID
                userId = steam.steamid;
            }
            
            // Use string Steam ID to avoid precision loss in ban check
            console.log(`[STEAM_AUTH] Checking ban status for Steam ID: ${steam.steamid}`);
            
            // For now, we need to check the ban system with the string ID
            // Note: This requires updating the ban system to handle string IDs
            let player;
            try {
                console.log(`[STEAM_AUTH] About to check ban status for Steam ID: ${steam.steamid} (as string)`);
                console.log(`[STEAM_AUTH] Request IP: ${body.reqIp || 'undefined'}`);
                
                player = await getPlayerBanStatus(steam.steamid, body.reqIp);
                console.log(`[STEAM_AUTH] Ban check raw result:`, player);
                console.log(`[STEAM_AUTH] Ban check - isBanned: ${player.isBanned}, banType: ${player.banType || 'none'}, banReason: ${player.banReason || 'none'}, banExpires: ${player.banExpires || 'none'}`);
                // Numeric precision loss no longer applicable as we use string IDs
            } catch (error) {
                console.error(`[STEAM_AUTH] Ban check failed:`, error);
                // Default to not banned if ban check fails
                player = { isBanned: false };
            }

            // Ban system now properly handles Steam IDs vs EA/Origin IDs
            if (player.isBanned) {
              console.log(`[STEAM_AUTH] Banned player "${steam.persona || steamUsername || 'unknown'}" (${steam.steamid}) is attempting to join a server. (cl ip: ${body.reqIp})`);
            } else {
              console.log(`[STEAM_AUTH] Player "${steam.persona || steamUsername || 'unknown'}" (${steam.steamid}) is not banned, proceeding with authentication`);
            }

            // Normalize server endpoint to a canonical form expected by the gameserver verifier
            // - Strip quotes
            // - Ensure IPv6 is bracketed and port is present
            // - Ensure IPv4 has an explicit port when provided
            const normalizeEndpoint = (ep: string): string => {
              if (!ep || typeof ep !== 'string') return '';
              ep = ep.trim().replace(/"/g, '');
              // Already in [ipv6]:port
              if (/^\[[^\]]+\]:\d+$/.test(ep)) return ep;
              // If contains multiple colons, likely IPv6 (possibly with :port)
              if ((ep.match(/:/g) || []).length > 1) {
                // If has :port at the end
                const m = ep.match(/^(.*):(\d+)$/);
                if (m) {
                  const addr = m[1];
                  const port = m[2];
                  const bare = addr.replace(/^\[/,'').replace(/\]$/,'');
                  return `[${bare}]:${port}`;
                }
                // No port provided; append default port
                const bare = ep.replace(/^\[/,'').replace(/\]$/,'');
                const defPort = parseInt(process.env.DEFAULT_SERVER_PORT || '37015', 10) || 37015;
                return `[${bare}]:${defPort}`;
              }
              // IPv4 or hostname with optional :port
              if (/^.+:\d+$/.test(ep)) return ep;
              const defPort = parseInt(process.env.DEFAULT_SERVER_PORT || '37015', 10) || 37015;
              return `${ep}:${defPort}`;
            };
            serverIp = normalizeEndpoint(serverIp);

            // Use the validated Steam ID for token generation
            const userIdForToken = steam.steamid;
            const displayName = steam.persona || steamUsername || 'steam_user';
            
            console.log(`[STEAM_AUTH] Token generation - sourceId: ${userIdForToken}, displayName: ${displayName}`);
            
            let token = CreateAuthToken(userIdForToken, displayName, serverIp);
            
            // Log Steam username if provided by client
            if (steamUsername) {
                console.log(`Steam auth for user ${steam.steamid} with client-provided username: ${steamUsername} (Steam API persona: ${steam.persona || 'none'})`);
            }

            let authMsg = "";
            if (player.isBanned) {
              authMsg = "banned";
            } else {
              let flags = await GetUserFlags(steam.steamid);

              if (flags & 1) {
                authMsg = "flagged";
                console.log(`Flagged player "${displayName}" (${steam.steamid}) (${body.reqIp}) is attempting to join a server.`);
              }
            }

            await LogUser(steam.steamid, displayName, 0);
            const region = request.headers.get('cf-ipcountry') || "XX";
            await AddUserAuthCountryMetric(region);
            await LogUserAuth(steam.steamid, true, authMsg);

            return new Response(JSON.stringify({ success: true, token }), { status: 200 });
        } catch (err: any) {
            const errorCode = String((err && (err.code || err.message)) || 'steam_auth_failed');
            console.error(`[STEAM_AUTH] Authentication failed for user ${userIdDecimal}:`, err);
            console.error(`[STEAM_AUTH] Error details:`, {
                message: err?.message,
                code: err?.code,
                status: err?.response?.status,
                data: err?.response?.data
            });
            
            await LogUserAuth(userIdString, false, errorCode);
            return new Response(JSON.stringify({ 
                success: false, 
                error: `error: steam authentication failed (${errorCode})` 
            }), { status: 401 });
        }
    } catch (error) {
        console.error("API Error:", error); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}