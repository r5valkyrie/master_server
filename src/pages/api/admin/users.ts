import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { logger } from '../../../lib/logger';
import { escapeLikePattern } from '../../../lib/sql-security';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
        const q = (url.searchParams.get('q') || '').trim();
        const filter = url.searchParams.get('filter') || '';
        const offset = (page - 1) * limit;

        const pool = getPool();
        if (!pool) {
            logger.error('Database not initialized', { prefix: 'ADMIN' });
            throw new Error("Database not initialized");
        }

        let where = '';
        const params: any[] = [];
        
        // Build search conditions
        const conditions: string[] = [];
        
        if (q) {
            conditions.push('(name LIKE ? OR steam_id LIKE ?)');
            const escaped = escapeLikePattern(q);
            params.push(`%${escaped}%`, `%${escaped}%`);
        }
        
        // Add filter conditions
        if (filter) {
            switch (filter) {
                case 'banned':
                    conditions.push('EXISTS(SELECT 1 FROM banned_users WHERE identifier COLLATE utf8mb4_unicode_ci = CAST(users.steam_id AS CHAR) COLLATE utf8mb4_unicode_ci)');
                    break;
                case 'recent':
                    conditions.push('last_seen >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
                    break;
                case 'valid-steam':
                    conditions.push('steam_id REGEXP "^765611[0-9]{11}$"');
                    break;
                case 'multiple-names':
                    conditions.push('(SELECT COUNT(*) FROM username_history WHERE steam_id COLLATE utf8mb4_unicode_ci = users.steam_id COLLATE utf8mb4_unicode_ci) > 1');
                    break;
            }
        }
        
        if (conditions.length > 0) {
            where = 'WHERE ' + conditions.join(' AND ');
        }

        const basicQuery = `SELECT * FROM users ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`;
        const [rows] = await pool.execute(basicQuery, [...params, limit, offset]);

        // Add ban status to each row
        const enrichedRows = [];
        if (Array.isArray(rows)) {
            for (const user of rows as any[]) {
                try {
                    const [banRows] = await pool.execute(
                        'SELECT ban_reason, created_at, ban_expiry_date FROM banned_users WHERE identifier = ? LIMIT 1',
                        [user.steam_id.toString()]
                    );
                    
                    const banInfo = Array.isArray(banRows) && banRows.length > 0 ? banRows[0] as any : null;
                    
                    enrichedRows.push({
                        ...user,
                        is_banned: banInfo ? 1 : 0,
                        ban_reason: banInfo?.ban_reason || null,
                        ban_date: banInfo?.created_at || null,
                        ban_expires: banInfo?.ban_expiry_date || null
                    });
                } catch (banError) {
                    logger.error(`Error fetching ban info for user: ${banError}`, { prefix: 'ADMIN' });
                    enrichedRows.push({
                        ...user,
                        is_banned: 0,
                        ban_reason: null,
                        ban_date: null,
                        ban_expires: null
                    });
                }
            }
        }

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM users ${where}`,
            params
        );

        const total = Array.isArray(countRows) ? (countRows[0] as any).total : 0;

        return new Response(JSON.stringify({ data: enrichedRows, page, pageSize: limit, total }), { status: 200 });
    } catch (error) {
        logger.error(`Users API error: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred."
        }), { status: 500 });
    }
};