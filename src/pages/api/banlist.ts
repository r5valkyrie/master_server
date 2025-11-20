import type { APIRoute } from 'astro';
import { addBan, removeBan, updateBanReason } from '../../lib/bansystem';
import { logAdminEvent } from '../../lib/discord';
import { logger } from '../../lib/logger';
import { verifyApiKey } from '../../lib/db';

async function SendDiscordLog(msg: string) {
    await logAdminEvent(msg);
}

export const POST: APIRoute = async ({ request }) => {
    try {
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid JSON request" 
            }), { status: 400 });
        }

        // Validate input types
        const { type, ip, id, password, banType, reason, silent } = body;
        
        if (typeof type !== 'string' && type !== undefined) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid type parameter" 
            }), { status: 400 });
        }

        const keyResult = await verifyApiKey(password || '');
        if (!keyResult.valid) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
        }

        if (keyResult.keyId) {
            await logAdminEvent(`API key #${keyResult.keyId} used: banlist ${type || 'unknown'}`);
        }

        if (!ip && !id) {
            return new Response(JSON.stringify({ success: false, error: "No identification provided" }), { status: 400 });
        }

        const identifier = ip || id;

        if (type === "add") {
            const banRes = await addBan(identifier, reason, banType);
            if (banRes.success && !silent) {
                SendDiscordLog(`Ban added for \`${identifier}\`. Reason: \`${reason}\``);
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
            return new Response(JSON.stringify({ success: false, error: "Invalid operation type" }), { status: 400 });
        }
    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
