import type { APIRoute } from 'astro';
import { getSessionCookieName, extractJti, revokeToken } from '../../../../lib/session';

export const POST: APIRoute = async ({ request }) => {
    const cookieName = getSessionCookieName();

    // Revoke the token server-side so it can't be reused even if intercepted
    const cookieHeader = request.headers.get('cookie') || '';
    const cookieValue = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.split('=')[1];
    if (cookieValue) {
        const jti = extractJti(cookieValue);
        if (jti) revokeToken(jti);
    }

    const response = new Response(JSON.stringify({ success: true }), { status: 200 });
    const isProd = process.env.NODE_ENV === 'production';
    response.headers.append('Set-Cookie', `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${isProd ? '; Secure' : ''}`);
    return response;
};


