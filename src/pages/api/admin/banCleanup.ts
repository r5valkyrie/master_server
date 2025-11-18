import type { APIRoute } from 'astro';
import { cleanupExpiredBans } from '../../../lib/banCleanup';

export const POST: APIRoute = async () => {
    const removed = await cleanupExpiredBans();
    return new Response(JSON.stringify({ success: true, removed }), { status: 200 });
};


