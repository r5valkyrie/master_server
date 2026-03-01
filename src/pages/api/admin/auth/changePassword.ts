import type { APIRoute } from 'astro';
import { getPool } from '../../../../lib/db';
import { getSessionCookieName, verifyAdminSessionToken } from '../../../../lib/session';
import bcrypt from 'bcrypt';

export const POST: APIRoute = async ({ request }) => {
    try {
        // Extract caller identity from session
        const cookieHeader = request.headers.get('cookie') || '';
        const cookieName = getSessionCookieName();
        const cookieValue = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.split('=')[1];
        const session = cookieValue ? verifyAdminSessionToken(cookieValue) : null;
        if (!session) {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
        }

        const body = await request.json();
        const targetUsername = String(body.username || '').trim();
        const newPassword = String(body.newPassword || '');
        if (!targetUsername || newPassword.length < 8) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), { status: 400 });
        }

        // Non-master users can only change their OWN password
        if (session.role !== 'master' && session.username !== targetUsername) {
            return new Response(JSON.stringify({ success: false, error: 'Forbidden: you can only change your own password' }), { status: 403 });
        }

        const pool = getPool();
        if (!pool) return new Response(JSON.stringify({ success: false, error: 'Server not ready' }), { status: 503 });
        const hash = await bcrypt.hash(newPassword, 12);
        await pool.execute('UPDATE admin_users SET password_hash=?, must_change_password=0 WHERE username=?', [hash, targetUsername]);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};


