import type { APIRoute } from 'astro';
import { getSessionCookieName, verifyAdminSessionToken } from '../../../../lib/session';

export const GET: APIRoute = async ({ request }) => {
    const cookieName = getSessionCookieName();
    const cookieHeader = request.headers.get('cookie') || '';
    const cookieValue = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.split('=')[1];

    if (!cookieValue) {
        return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
    }

    const session = verifyAdminSessionToken(cookieValue);
    if (!session) {
        return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
    }

    return new Response(JSON.stringify({ authenticated: true, user: session }), { status: 200 });
};


