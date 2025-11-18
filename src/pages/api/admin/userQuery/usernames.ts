import type { APIRoute } from 'astro';
import { getPool } from '../../../../lib/db';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const uid = (url.searchParams.get('uid') || '').trim();
        if (!uid) {
            return new Response(JSON.stringify({ success: true, usernames: [] }), { status: 200 });
        }

        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');

        const [rows] = await pool.execute(
            'SELECT name, last_seen FROM username_history WHERE steam_id = ? ORDER BY last_seen DESC LIMIT 50',
            [uid]
        );

        return new Response(JSON.stringify({ success: true, usernames: rows }), { status: 200 });
    } catch (error) {
        console.error('API Error (usernames):', error);
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
}


