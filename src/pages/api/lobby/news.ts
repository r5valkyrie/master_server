import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { logger } from '../../../lib/logger';

export const POST: APIRoute = async () => {
    try {
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const [rows] = await pool.execute("SELECT * FROM lobby_news");

        if (Array.isArray(rows)) {
            const news_items = rows.map((row: any) => ({
                title: row.title,
                description: row.description,
                asset_path: row.asset_path,
                rpak_name: row.rpak_name,
                rpak_data: row.rpak_data.toString('base64')
            }));
            return new Response(JSON.stringify({ success: true, news_items }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ success: true, news_items: [] }), { status: 200 });
        }
    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
