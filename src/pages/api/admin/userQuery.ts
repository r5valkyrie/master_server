import { logger } from '../../../lib/logger';
import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { checkRateLimit, sanitizeSearchInput, isValidSteamId } from '../../../lib/security';

const USER_QUERY = `
SELECT 
  u.steam_id,
  u.first_seen,
  u.last_seen,
  u.name,
  u.flags,
  COUNT(h.name)                                     AS num_usernames,
  (CASE WHEN COUNT(b.identifier) > 0 THEN 1 ELSE 0 END) AS is_banned
FROM users u
LEFT JOIN username_history h 
  ON h.steam_id COLLATE utf8mb4_unicode_ci = u.steam_id COLLATE utf8mb4_unicode_ci
LEFT JOIN banned_users b 
  ON b.identifier COLLATE utf8mb4_unicode_ci = u.steam_id COLLATE utf8mb4_unicode_ci
WHERE (
  u.name COLLATE utf8mb4_unicode_ci LIKE ? OR 
  u.steam_id COLLATE utf8mb4_unicode_ci LIKE ? OR 
  h.name COLLATE utf8mb4_unicode_ci LIKE ?
)
GROUP BY u.steam_id, u.first_seen, u.last_seen, u.name, u.flags
ORDER BY u.last_seen DESC`;

function sanitiseSearchTerm(query: any) {
    if (query == null) return null;
    return query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export const GET: APIRoute = async ({ request, clientAddress }) => {
    try {
        // Rate limiting - 60 requests per minute per IP
        const clientIp = clientAddress || 'unknown';
        if (!checkRateLimit(`userquery-api-${clientIp}`, 60, 60000)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Rate limit exceeded. Please wait before making more requests.'
            }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const url = new URL(request.url);
        const raw = url.searchParams.get('query') || url.searchParams.get('uid') || '';
        const searchTerm = sanitiseSearchTerm(sanitizeSearchInput(raw || ''));

        if (!searchTerm || searchTerm.length === 0) {
            return new Response(JSON.stringify({ success: true, rows: [] }), { status: 200 });
        }

        const like = `%${searchTerm}%`;
        const [rows] = await pool.execute(USER_QUERY, [like, like, like]);

        return new Response(JSON.stringify({ success: true, rows }), { status: 200 });
    } catch (error) {
        logger.error(`API Error (userQuery): ${error}`, { prefix: 'ADMIN' }); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
