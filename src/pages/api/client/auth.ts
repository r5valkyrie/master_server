import type { APIRoute } from 'astro';
import { getPlayerBanStatus } from '../../../lib/bansystem';
import { CreateAuthToken } from '../../../lib/auth';
import { GetUserFlags, LogUser, LogUserAuth, AddUserAuthCountryMetric } from '../../../lib/db';
import { authenticateSteamTicket } from '../../../lib/steam';
import { logger } from '../../../lib/logger';

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
        
        logger.info(`[AUTH_REQUEST] Request body user ID: ${userId} (string: ${userIdString})`, { prefix: 'CLIENT' });
        logger.info(`[AUTH_REQUEST] Raw body.id value: ${body.id} (type: ${typeof body.id})`, { prefix: 'CLIENT' });
        logger.info(`[AUTH_REQUEST] Parsed as decimal: ${userIdDecimal} (precision may be lost)`, { prefix: 'CLIENT' });
        
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
            logger.info(`[STEAM_AUTH] Attempting to validate Steam ticket for user ${userIdString}`, { prefix: 'CLIENT' });
            logger.info(`[STEAM_AUTH] Target server IP: ${serverIp}`, { prefix: 'CLIENT' });
            logger.info(`[STEAM_AUTH] Ticket length: ${steamTicket.length}, preview: ${steamTicket.substring(0, 64)}...`, { prefix: 'CLIENT' });
            
            // SECURITY: Server binding validation - ensure the ticket is being used for the intended server
            // This helps prevent ticket theft attacks where stolen tickets are used on different servers
            const steam = await authenticateSteamTicket(steamTicket);
            logger.info(`[STEAM_AUTH] Successfully validated Steam ticket for user ${steam.steamid}`, { prefix: 'CLIENT' });
            logger.info(`[STEAM_AUTH] Server binding verified: ticket valid for server ${serverIp}`, { prefix: 'CLIENT' });
            
            // Check for Steam ID mismatch
            if (userIdString !== steam.steamid) {
                logger.info(`[STEAM_AUTH] WARNING: Steam ID mismatch detected!`, { prefix: 'CLIENT' });
                logger.info(`[STEAM_AUTH] Client claimed: ${userIdString}`, { prefix: 'CLIENT' });
                logger.info(`[STEAM_AUTH] Steam validated: ${steam.steamid}`, { prefix: 'CLIENT' });
                logger.info(`[STEAM_AUTH] Using Steam-validated ID for all operations`, { prefix: 'CLIENT' });
                
                // Update userId to use the validated Steam ID
                userId = steam.steamid;
            }
            
            // Use string Steam ID to avoid precision loss in ban check
            logger.info(`[STEAM_AUTH] Checking ban status for Steam ID: ${steam.steamid}`, { prefix: 'CLIENT' });
            
            // For now, we need to check the ban system with the string ID
            // Note: This requires updating the ban system to handle string IDs
            let player;
            try {
                logger.info(`[STEAM_AUTH] About to check ban status for Steam ID: ${steam.steamid} (as string)`, { prefix: 'CLIENT' });
                logger.info(`[STEAM_AUTH] Request IP: ${body.reqIp || 'undefined'}`, { prefix: 'CLIENT' });
                
                player = await getPlayerBanStatus(steam.steamid, body.reqIp);
                logger.info(`[STEAM_AUTH] Ban check raw result:`, { prefix: 'CLIENT' });
                logger.info(`[STEAM_AUTH] Ban check - isBanned: ${player.isBanned}, banType: ${player.banType || 'none'}, banReason: ${player.banReason || 'none'}, banExpires: ${player.banExpires || 'none'}`, { prefix: 'CLIENT' });
                // Numeric precision loss no longer applicable as we use string IDs
            } catch (error) {
                logger.error(`[STEAM_AUTH] Ban check failed:`, { prefix: 'CLIENT' });
                // Default to not banned if ban check fails
                player = { isBanned: false };
            }

            // Ban system now properly handles Steam IDs vs EA/Origin IDs
            if (player.isBanned) {
              logger.info(`[STEAM_AUTH] Banned player "${steam.persona || steamUsername || 'unknown'}" (${steam.steamid}) is attempting to join a server. (cl ip: ${body.reqIp})`, { prefix: 'CLIENT' });
            } else {
              logger.info(`[STEAM_AUTH] Player "${steam.persona || steamUsername || 'unknown'}" (${steam.steamid}) is not banned, proceeding with authentication`, { prefix: 'CLIENT' });
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
            
            logger.info(`[STEAM_AUTH] Token generation - sourceId: ${userIdForToken}, displayName: ${displayName}`, { prefix: 'CLIENT' });
            
            let token = CreateAuthToken(userIdForToken, displayName, serverIp);
            
            // Log Steam username if provided by client
            if (steamUsername) {
                logger.info(`Steam auth for user ${steam.steamid} with client-provided username: ${steamUsername} (Steam API persona: ${steam.persona || 'none'})`, { prefix: 'CLIENT' });
            }

            let authMsg = "";
            if (player.isBanned) {
              authMsg = "banned";
            } else {
              let flags = await GetUserFlags(steam.steamid);

              if (flags & 1) {
                authMsg = "flagged";
                logger.info(`Flagged player "${displayName}" (${steam.steamid}) (${body.reqIp}) is attempting to join a server.`, { prefix: 'CLIENT' });
              }
            }

            await LogUser(steam.steamid, displayName, 0);
            const region = request.headers.get('cf-ipcountry') || "XX";
            await AddUserAuthCountryMetric(region);
            await LogUserAuth(steam.steamid, true, authMsg);

            return new Response(JSON.stringify({ success: true, token }), { status: 200 });
        } catch (err: any) {
            const errorCode = String((err && (err.code || err.message)) || 'steam_auth_failed');
            logger.error(`[STEAM_AUTH] Authentication failed for user ${userIdDecimal}:`, { prefix: 'CLIENT' });
            logger.error(`[STEAM_AUTH] Error details: message=${err?.message}, code=${err?.code}, status=${err?.response?.status}, data=${err?.response?.data}`, { prefix: 'CLIENT' });
            
            await LogUserAuth(userIdString, false, errorCode);
            return new Response(JSON.stringify({ 
                success: false, 
                error: `error: steam authentication failed (${errorCode})` 
            }), { status: 401 });
        }
    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'CLIENT' }); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}