import type { APIRoute } from 'astro';
import { getBulkBanStatusArray } from '../../../lib/bansystem';
import { logGeneralEvent } from '../../../lib/discord';
import { logger } from '../../../lib/logger';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { players } = body;

        if (!players) {
            return new Response(JSON.stringify({ success: false, error: "Failed to execute bulkCheck: Please update to the latest version of R5Valkyrie." }), { status: 400 });
        }

        if (!Array.isArray(players)) {
            return new Response(JSON.stringify({ success: false, error: "Invalid request body: 'players' must be an array of objects" }), { status: 400 });
        }

        if (players.length > 130) {
            return new Response(JSON.stringify({ success: false, error: "Failed to execute bulkCheck: Unauthorized." }), { status: 401 });
        }

        const bannedPlayers = await getBulkBanStatusArray(players);
        if (Array.isArray(bannedPlayers) && bannedPlayers.length > 0) {
            const sample = bannedPlayers.slice(0, 3).map(p => `${p.id || p.ip}`).join(', ');
            await logGeneralEvent(`🚫 Bulk check: ${bannedPlayers.length} banned player(s) detected${sample ? ` (e.g. ${sample})` : ''}`);
        }
        return new Response(JSON.stringify({ success: true, bannedPlayers }), { status: 200 });

    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        try { await logGeneralEvent(`❗ Error in /api/bans/check: ${String(error)}`); } catch {}
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
