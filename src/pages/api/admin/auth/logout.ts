import type { APIRoute } from 'astro';
import { getSessionCookieName } from '../../../../lib/session';

export const POST: APIRoute = async () => {
    const cookieName = getSessionCookieName();
    const response = new Response(JSON.stringify({ success: true }), { status: 200 });
    response.headers.append('Set-Cookie', `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`);
    return response;
};


