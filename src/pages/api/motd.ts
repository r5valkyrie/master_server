import type { APIRoute } from 'astro';
import { getPool } from '../../lib/db';

export const GET: APIRoute = async () => {
    try {
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        const [rows]: any = await pool.execute('SELECT content FROM motd WHERE id=1 LIMIT 1');
        const motd = Array.isArray(rows) && rows.length > 0 ? rows[0].content : '';
        return new Response(JSON.stringify({ success: true, motd }), { status: 200 });
    } catch (error) {
        console.error("API Error:", error); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
