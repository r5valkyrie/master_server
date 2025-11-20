import type { APIRoute } from 'astro';
import { addVersions, removeVersions, updateVersions } from '../../../lib/versionsystem';
import { logger } from '../../../lib/logger';
import { verifyApiKey } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { type, version, checksums_enabled, supported, flags, password } = body;

        const isValidKey = await verifyApiKey(password || '');
        if (!isValidKey) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
        }
        
        const numChecksums = Number(checksums_enabled);
        const numSupported = Number(supported);
        const numFlags = Number(flags);

        if (type === "add") {
            const res = await addVersions(version, numChecksums, numSupported, numFlags);
            return new Response(JSON.stringify(res), { status: 200 });
        } else if (type === "remove") {
            const res = await removeVersions(version);
            return new Response(JSON.stringify(res), { status: 200 });
        } else if (type === "update") {
            const res = await updateVersions(version, numChecksums, numSupported, numFlags);
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
