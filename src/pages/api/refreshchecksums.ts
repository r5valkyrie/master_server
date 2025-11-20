import type { APIRoute } from 'astro';
import { refreshChecksums } from '../../lib/checksumsystem';
import { logger } from '../../lib/logger';
import { verifyApiKey } from '../../lib/db';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { password } = await request.json();

        const isValidKey = await verifyApiKey(password || '');
        if (!isValidKey) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
        }
        
        const res = await refreshChecksums();
        return new Response(JSON.stringify(res), { status: 200 });
    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
