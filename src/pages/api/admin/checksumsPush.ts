import type { APIRoute } from 'astro';
import { refreshChecksums } from '../../../lib/checksumsystem';

export const POST: APIRoute = async () => {
    try {
        const res = await refreshChecksums();
        return new Response(JSON.stringify({ success: true, result: res }), { status: 200 });
    } catch (error) {
        console.error('API Error (checklists push):', error);
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};


