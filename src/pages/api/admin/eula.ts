import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';

export const GET: APIRoute = async () => {
    try {
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        const [rows]: any = await pool.execute('SELECT lang, contents, modified FROM eula ORDER BY FIELD(lang, "english") DESC, modified DESC LIMIT 1');
        if (Array.isArray(rows) && rows.length > 0) {
            return new Response(JSON.stringify({ success: true, eula: rows[0] }), { status: 200 });
        }
        return new Response(JSON.stringify({ success: true, eula: { lang: 'english', contents: '', modified: new Date().toISOString() } }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        const body = await request.json();
        const contents = String(body.contents || '');
        const lang = String(body.lang || 'english');
        await pool.execute('REPLACE INTO eula (lang, contents, modified) VALUES (?,?, NOW())', [lang, contents]);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: 'Internal error' }), { status: 500 });
    }
};


