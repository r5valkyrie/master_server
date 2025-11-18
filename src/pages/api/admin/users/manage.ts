import type { APIRoute } from 'astro';
import { getPool } from '../../../../lib/db';
import bcrypt from 'bcrypt';

export const GET: APIRoute = async ({ request }) => {
    try {
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        const [rows] = await pool.execute('SELECT username, role, must_change_password, created_at, updated_at FROM admin_users ORDER BY username ASC');
        return new Response(JSON.stringify({ success: true, users: rows }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const username = String(body.username || '').trim();
        const role = String(body.role || '').trim();
        if (!username || !['master','admin','moderator'].includes(role)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid input' }), { status: 400 });
        }
        const pool = getPool();
        if (!pool) return new Response(JSON.stringify({ success: false, error: 'Server not ready' }), { status: 503 });
        // Generate random first password
        const firstPass = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-4);
        const hash = await bcrypt.hash(firstPass, 12);
        await pool.execute('REPLACE INTO admin_users (username, password_hash, role, must_change_password) VALUES (?,?,?,1)', [username, hash, role]);
        return new Response(JSON.stringify({ success: true, firstPassword: firstPass }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};

export const PUT: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const username = String(body.username || '').trim();
        const role = body.role ? String(body.role).trim() : undefined;
        const setTempPassword = Boolean(body.setTempPassword);
        const pool = getPool();
        if (!pool) return new Response(JSON.stringify({ success: false, error: 'Server not ready' }), { status: 503 });
        const sets: string[] = [];
        const params: any[] = [];
        if (role && ['master','admin','moderator'].includes(role)) { sets.push('role=?'); params.push(role); }
        let tempPass: string | undefined;
        if (setTempPassword) {
            tempPass = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-4);
            const hash = await bcrypt.hash(tempPass, 12);
            sets.push('password_hash=?', 'must_change_password=1');
            params.push(hash);
        }
        if (sets.length === 0) return new Response(JSON.stringify({ success: false, error: 'No changes' }), { status: 400 });
        params.push(username);
        await pool.execute(`UPDATE admin_users SET ${sets.join(', ')} WHERE username=?`, params);
        return new Response(JSON.stringify({ success: true, tempPassword: tempPass }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const username = String(body.username || '').trim();
        
        if (!username) {
            return new Response(JSON.stringify({ success: false, error: 'Username is required' }), { status: 400 });
        }
        
        const pool = getPool();
        if (!pool) return new Response(JSON.stringify({ success: false, error: 'Server not ready' }), { status: 503 });
        
        // Check if user exists
        const [users] = await pool.execute('SELECT username FROM admin_users WHERE username = ?', [username]);
        if (!Array.isArray(users) || users.length === 0) {
            return new Response(JSON.stringify({ success: false, error: 'User not found' }), { status: 404 });
        }
        
        // Delete the user
        await pool.execute('DELETE FROM admin_users WHERE username = ?', [username]);
        
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err) {
        console.error('Delete user error:', err);
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};


