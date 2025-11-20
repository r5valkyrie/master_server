import type { APIRoute } from 'astro';
import { getPlayerBanStatus } from '../../../lib/bansystem';
import { logGeneralEvent } from '../../../lib/discord';
import { logger } from '../../../lib/logger';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { id, ip } = body;

        if (!ip && !id) {
            return new Response(JSON.stringify({ success: false, error: "Missing 'ip' or 'id' field" }), { status: 400 });
        }
        
        const player = await getPlayerBanStatus(id, ip);

        if (player.isBanned && (ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "loopback")) {
            player.isBanned = false;
        }

        if (player.isBanned) {
            try {
                await logGeneralEvent(`Blocked connection: banned user ${id || ip} (type ${player.banType})`);
            } catch {}
        }

        return new Response(JSON.stringify({
            success: true,
            banned: player.isBanned,
            banType: player.isBanned ? player.banType : undefined,
            banExpires: player.isBanned ? player.banExpires : undefined,
            reason: player.isBanned ? player.banReason : undefined
        }), { status: 200 });

    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        try { await logGeneralEvent(`Error in /api/bans/hasActiveBan: ${String(error)}`); } catch {}
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
