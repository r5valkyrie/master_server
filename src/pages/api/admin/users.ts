import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
        const q = (url.searchParams.get('q') || '').trim();
        const filter = url.searchParams.get('filter') || '';
        const offset = (page - 1) * limit;

        console.log('Users API called with:', { page, limit, q, filter }); // Debug log

        const pool = getPool();
        if (!pool) {
            console.error("Database not initialized");
            throw new Error("Database not initialized");
        }

        console.log('Database pool initialized successfully'); // Debug log

        let where = '';
        const params: any[] = [];
        
        // Build search conditions
        const conditions: string[] = [];
        
        if (q) {
            conditions.push('(name LIKE ? OR steam_id LIKE ?)');
            params.push(`%${q}%`, `%${q}%`);
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

        console.log('Users API - Filter:', filter, 'Query:', q, 'Where clause:', where); // Debug log
        console.log('Users API - Params:', params); // Debug log
        
        if (filter === 'banned') {
            console.log('DEBUG: Banned filter applied, checking for banned users...'); // Debug log
        }

        // First try basic query without ban status
        const basicQuery = `SELECT * FROM users ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`;
        console.log('Executing basic query:', basicQuery); // Debug log
        
        const [rows] = await pool.execute(basicQuery, [...params, limit, offset]);
        
        console.log('Basic query successful, adding ban status...'); // Debug log

        // Add ban status to each row
        const enrichedRows = [];
        if (Array.isArray(rows)) {
            for (const user of rows) {
                try {
                    const [banRows] = await pool.execute(
                        'SELECT ban_reason, created_at, ban_expiry_date FROM banned_users WHERE identifier = ? LIMIT 1',
                        [user.steam_id.toString()]
                    );
                    
                    const banInfo = Array.isArray(banRows) && banRows.length > 0 ? banRows[0] : null;
                    
                    enrichedRows.push({
                        ...user,
                        is_banned: banInfo ? 1 : 0,
                        ban_reason: banInfo?.ban_reason || null,
                        ban_date: banInfo?.created_at || null,
                        ban_expires: banInfo?.ban_expiry_date || null
                    });
                } catch (banError) {
                    console.error('Error fetching ban info for user:', user.steam_id, banError);
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

        console.log('Ban status added successfully'); // Debug log

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM users ${where}`,
            params
        );

        const total = Array.isArray(countRows) ? (countRows[0] as any).total : 0;

        console.log('Users API completed successfully, returning', enrichedRows.length, 'users'); // Debug log

        return new Response(JSON.stringify({ data: enrichedRows, page, pageSize: limit, total }), { status: 200 });
    } catch (error) {
        console.error("Users API Error:", error);
        console.error("Error details:", error?.message);
        console.error("Error stack:", error?.stack);
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred.",
            details: process.env.NODE_ENV === 'development' ? error?.message : undefined
        }), { status: 500 });
    }
};