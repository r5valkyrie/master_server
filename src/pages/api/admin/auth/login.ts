import type { APIRoute } from 'astro';
import { createAdminSessionToken, getSessionCookieName } from '../../../../lib/session';
import { getPool } from '../../../../lib/db';
import bcrypt from 'bcrypt';

type LoginBody = {
    username: string;
    password: string;
};

function parseCookies(header: string | null): Record<string, string> {
    if (!header) return {};
    return header.split(';').reduce((acc, part) => {
        const [k, v] = part.trim().split('=');
        if (k) acc[k] = v || '';
        return acc;
    }, {} as Record<string, string>);
}

export const POST: APIRoute = async ({ request }) => {
    let username = '';
    let password = '';
    
    try {
        const ctype = request.headers.get('content-type') || '';
        if (ctype.includes('application/json')) {
            const body = await request.json() as Partial<LoginBody>;
            username = (body.username || '').toString();
            password = (body.password || '').toString();
        } else if (ctype.includes('application/x-www-form-urlencoded')) {
            const text = await request.text();
            const params = new URLSearchParams(text);
            username = (params.get('username') || '').toString();
            password = (params.get('password') || '').toString();
        } else {
            // Try JSON first, then URLSearchParams from text fallback
            try {
                const body = await request.json() as Partial<LoginBody>;
                username = (body.username || '').toString();
                password = (body.password || '').toString();
            } catch {
                const text = await request.text();
                const params = new URLSearchParams(text);
                username = (params.get('username') || '').toString();
                password = (params.get('password') || '').toString();
            }
        }
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), { status: 400 });
    }

    // DB auth
    const pool = getPool();
    if (!pool) return new Response(JSON.stringify({ success: false, error: 'Server not ready' }), { status: 503 });
    const [rows]: any = await pool.execute('SELECT username, password_hash, role, must_change_password FROM admin_users WHERE username=? LIMIT 1', [username]);
    if (!Array.isArray(rows) || rows.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401 });
    }
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid credentials' }), { status: 401 });
    }

    const role: 'master' | 'admin' | 'moderator' = user.role;
    const token = createAdminSessionToken({ username, role });
    const cookieName = getSessionCookieName();

    const response = new Response(JSON.stringify({ success: true, mustChangePassword: !!user.must_change_password }), { status: 200 });
    const isProd = process.env.NODE_ENV === 'production';
    response.headers.append('Set-Cookie', `${cookieName}=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Strict${isProd ? '; Secure' : ''}`);
    return response;
};


