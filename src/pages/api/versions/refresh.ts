import type { APIRoute } from 'astro';
import { refreshVersions } from '../../../lib/versionsystem';
import { logger } from '../../../lib/logger';
import { logAdminEvent } from '../../../lib/discord';
import { verifyApiKey } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { password } = await request.json();

        const keyResult = await verifyApiKey(password || '');
        if (!keyResult.valid) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
        }

        if (keyResult.keyId) {
            await logAdminEvent(`API key #${keyResult.keyId} used: versions/refresh`);
        }
        
        const res = await refreshVersions();
        return new Response(JSON.stringify(res), { status: 200 });
    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
