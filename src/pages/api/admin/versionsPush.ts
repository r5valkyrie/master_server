import type { APIRoute } from 'astro';
import { refreshVersions } from '../../../lib/versionsystem';
import { logger } from '../../../lib/logger.ts';

export const POST: APIRoute = async () => {
    try {
        const res = await refreshVersions();
        return new Response(JSON.stringify({ success: true, result: res }), { status: 200 });
    } catch (error) {
        logger.error(`Versions push error: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};


