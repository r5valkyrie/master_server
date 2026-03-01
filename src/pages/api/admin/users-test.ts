import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { logger } from '../../../lib/logger.ts';

export const GET: APIRoute = async ({ request }) => {
    try {
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        logger.debug('Testing basic users query', { prefix: 'ADMIN' });
        
        // Test basic query first
        const [rows] = await pool.execute(
            `SELECT * FROM users ORDER BY last_seen DESC LIMIT 10`
        );

        logger.debug(`Basic query successful, rows: ${Array.isArray(rows) ? rows.length : 0}`, { prefix: 'ADMIN' });

        // Test with ban status
        const [rowsWithBan] = await pool.execute(
            `SELECT users.*, 
                    (SELECT COUNT(*) FROM banned_users WHERE identifier = users.steam_id) > 0 AS is_banned
             FROM users 
             ORDER BY users.last_seen DESC LIMIT 10`
        );

        logger.debug(`Query with ban status successful, rows: ${Array.isArray(rowsWithBan) ? rowsWithBan.length : 0}`, { prefix: 'ADMIN' });

        return new Response(JSON.stringify({ 
            success: true, 
            basicQuery: Array.isArray(rows) ? rows.length : 0,
            withBanQuery: Array.isArray(rowsWithBan) ? rowsWithBan.length : 0,
        }), { status: 200 });
    } catch (error) {
        logger.error(`Test API error: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({ 
            success: false, 
            error: 'An internal server error occurred.'
        }), { status: 500 });
    }
};
