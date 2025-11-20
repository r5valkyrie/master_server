import type { APIRoute } from 'astro';
import { addChecksum, removeChecksum, updateChecksum, refreshChecksums } from '../../lib/checksumsystem';
import { logger } from '../../lib/logger';
import { verifyApiKey } from '../../lib/db';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { type, checksum, sdkversion, password, description } = body;

        const isValidKey = await verifyApiKey(password || '');
        if (!isValidKey) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
        }
        
        const numChecksum = Number(checksum);

        if (type === "add") {
            const res = await addChecksum(numChecksum, description, sdkversion);
            return new Response(JSON.stringify(res), { status: 200 });
        } else if (type === "remove") {
            const res = await removeChecksum(numChecksum);
            return new Response(JSON.stringify(res), { status: 200 });
        } else if (type === "update") {
            const res = await updateChecksum(numChecksum, description, sdkversion);
            return new Response(JSON.stringify(res), { status: 200 });
        } else if (request.url.endsWith("refreshchecksums")) {
            const res = await refreshChecksums();
            return new Response(JSON.stringify(res), { status: 200 });
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
