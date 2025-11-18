import type { APIRoute } from 'astro';
import { cleanupInactiveUsers } from '../../../lib/userCleanup';

export const POST: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const hours = Math.max(1, parseInt(url.searchParams.get('hours') || '24', 10));
    const removed = await cleanupInactiveUsers(hours);
    return new Response(JSON.stringify({ success: true, removed }), { status: 200 });
};


