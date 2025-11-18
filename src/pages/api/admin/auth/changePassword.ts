import type { APIRoute } from 'astro';
import { getPool } from '../../../../lib/db';
import bcrypt from 'bcrypt';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const username = String(body.username || '').trim();
        const newPassword = String(body.newPassword || '');
        if (!username || newPassword.length < 8) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), { status: 400 });
        }
        const pool = getPool();
        if (!pool) return new Response(JSON.stringify({ success: false, error: 'Server not ready' }), { status: 503 });
        const hash = await bcrypt.hash(newPassword, 12);
        await pool.execute('UPDATE admin_users SET password_hash=?, must_change_password=0 WHERE username=?', [hash, username]);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};


