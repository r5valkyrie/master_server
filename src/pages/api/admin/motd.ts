import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';

export const GET: APIRoute = async () => {
    try {
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        const [rows]: any = await pool.execute('SELECT content FROM motd LIMIT 1');
        const content = Array.isArray(rows) && rows.length > 0 ? rows[0].content : '';
        return new Response(JSON.stringify({ success: true, content }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        const body = await request.json();
        const content = String(body.content || '');
        await pool.execute('REPLACE INTO motd (`id`, `content`, `updated_at`) VALUES (1, ?, NOW())', [content]);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};


