import type { APIRoute } from 'astro';
import { refreshVersions } from '../../../lib/versionsystem';

export const POST: APIRoute = async () => {
    try {
        const res = await refreshVersions();
        return new Response(JSON.stringify({ success: true, result: res }), { status: 200 });
    } catch (error) {
        console.error('API Error (versions push):', error);
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};


