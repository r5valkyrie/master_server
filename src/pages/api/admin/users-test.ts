import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';

export const GET: APIRoute = async ({ request }) => {
    try {
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        console.log('Testing basic users query...');
        
        // Test basic query first
        const [rows] = await pool.execute(
            `SELECT * FROM users ORDER BY last_seen DESC LIMIT 10`
        );

        console.log('Basic query successful, rows:', Array.isArray(rows) ? rows.length : 0);

        // Test with ban status
        const [rowsWithBan] = await pool.execute(
            `SELECT users.*, 
                    (SELECT COUNT(*) FROM banned_users WHERE identifier = users.steam_id) > 0 AS is_banned
             FROM users 
             ORDER BY users.last_seen DESC LIMIT 10`
        );

        console.log('Query with ban status successful, rows:', Array.isArray(rowsWithBan) ? rowsWithBan.length : 0);

        return new Response(JSON.stringify({ 
            success: true, 
            basicQuery: Array.isArray(rows) ? rows.length : 0,
            withBanQuery: Array.isArray(rowsWithBan) ? rowsWithBan.length : 0,
            sampleData: Array.isArray(rowsWithBan) ? rowsWithBan[0] : null
        }), { status: 200 });
    } catch (error) {
        console.error("Test API Error:", error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message,
            stack: error.stack
        }), { status: 500 });
    }
};
