import { logger } from '../../../../lib/logger';
import type { APIRoute } from 'astro';
import { getPool } from '../../../../lib/db';

function sanitiseSearchTerm(query: any) {
    if (query == null) return null;
    return query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildSearchQuery(searchTerm: string, searchType: string, filter?: string) {
    const baseQuery = `
        SELECT users.*, 
               COUNT(username_history.name) AS num_usernames, 
               EXISTS(SELECT * FROM banned_users WHERE identifier=users.steam_id) AS is_banned 
        FROM users 
        LEFT JOIN username_history ON users.steam_id = username_history.steam_id 
    `;
    
    let whereClause = '';
    let params: any[] = [];
    
    // Build search conditions based on type
    if (searchTerm) {
        switch (searchType) {
            case 'username':
                whereClause = 'WHERE users.name LIKE ?';
                params.push(`%${searchTerm}%`);
                break;
            case 'steam_id':
                whereClause = 'WHERE users.steam_id = ?';
                params.push(searchTerm);
                break;
            case 'exact':
                whereClause = 'WHERE users.name = ? OR users.steam_id = ?';
                params.push(searchTerm, searchTerm);
                break;
            default: // 'all'
                whereClause = 'WHERE users.name LIKE ? OR users.steam_id = ?';
                params.push(`%${searchTerm}%`, searchTerm);
                break;
        }
    }
    
    // Add filter conditions
    if (filter) {
        const filterCondition = whereClause ? ' AND ' : ' WHERE ';
        switch (filter) {
            case 'banned':
                whereClause += filterCondition + 'EXISTS(SELECT * FROM banned_users WHERE identifier=users.steam_id)';
                break;
            case 'recent':
                whereClause += filterCondition + 'users.last_seen >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
                break;
            case 'multiple-names':
                whereClause += filterCondition + '(SELECT COUNT(*) FROM username_history WHERE steam_id = users.steam_id) > 1';
                break;
        }
    }
    
    const groupBy = ' GROUP BY users.steam_id, users.name';
    const orderBy = ' ORDER BY users.last_seen DESC';
    
    return {
        query: baseQuery + whereClause + groupBy + orderBy,
        params
    };
}

export const GET: APIRoute = async ({ request }) => {
    try {
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const url = new URL(request.url);
        const searchTerm = sanitiseSearchTerm(url.searchParams.get('query'));
        const searchType = url.searchParams.get('type') || 'all';
        const filter = url.searchParams.get('filter');


        const { query, params } = buildSearchQuery(searchTerm, searchType, filter);
        

        const [rows] = await pool.execute(query, params);

        return new Response(JSON.stringify({ success: true, rows }), { status: 200 });
    } catch (error) {
        logger.error(`API Error: ${error}`, { prefix: 'ADMIN' }); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
