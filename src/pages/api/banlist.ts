import type { APIRoute } from 'astro';
import { addBan, removeBan, updateBanReason } from '../../lib/bansystem';
import { logAdminEvent } from '../../lib/discord';
import { logger } from '../../lib/logger';

async function SendDiscordLog(msg: string) {
    await logAdminEvent(msg);
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { type, ip, id, password, banType, reason, silent } = body;

        if (password !== process.env.API_KEY) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
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
