import type { APIRoute } from 'astro';
import { addBan, removeBan, updateBanReason } from '../../../lib/bansystem';
import { checkRateLimit, isValidSteamId, isValidBanReason, validateBanDuration } from '../../../lib/security';
import { logAdminEvent } from '../../../lib/discord';
import { logger } from '../../../lib/logger.ts';

async function SendDiscordLog(msg: string) {
    await logAdminEvent(msg);
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
    try {
        // Rate limiting - 30 requests per minute per IP
        const clientIp = clientAddress || 'unknown';
        if (!checkRateLimit(`ban-api-${clientIp}`, 30, 60000)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Rate limit exceeded. Please wait before making more requests.'
            }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const body = await request.json();
        const { type, ip, id, banType, reason, silent, expiryDate } = body;

        // Input validation
        if (!ip && !id) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "No identification provided" 
            }), { status: 400 });
        }

        // Validate Steam ID if provided
        if (id && !isValidSteamId(id)) {
            return new Response(JSON.stringify({
                success: false,
                error: "Invalid Steam ID format"
            }), { status: 400 });
        }

        const identifier = ip || id;

        if (type === "add") {
            // Validate ban reason
            if (!isValidBanReason(reason || '')) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "Ban reason must be between 3 and 500 characters"
                }), { status: 400 });
            }

            // Parse expiry date if provided
            let banExpiryDate = null;
            if (expiryDate) {
                banExpiryDate = new Date(expiryDate);
                if (isNaN(banExpiryDate.getTime())) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: "Invalid expiry date format"
                    }), { status: 400 });
                }
            }

            const banRes = await addBan(identifier, reason, banType, banExpiryDate);
            if (banRes.success && !silent) {
                const durationText = banExpiryDate ? ` (expires ${banExpiryDate.toLocaleDateString()})` : ' (permanent)';
                SendDiscordLog(`Ban added for \`${identifier}\`${durationText}. Reason: \`${reason}\``);
            }
            return new Response(JSON.stringify(banRes), { status: 200 });
        } else if (type === "remove") {
            const unbanRes = await removeBan(identifier);
            if (unbanRes.success && !silent) {
                SendDiscordLog(`Ban removed for \`${identifier}\`.`);
            }
            return new Response(JSON.stringify(unbanRes), { status: 200 });
        } else if (type === "update") {
            const updateRes = await updateBanReason(identifier, reason);
            return new Response(JSON.stringify(updateRes), { status: 200 });
        } else {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid operation type" 
            }), { status: 400 });
        }
    } catch (error) {
        logger.error(`Ban API error: ${error}`, { prefix: 'ADMIN' });
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
};
