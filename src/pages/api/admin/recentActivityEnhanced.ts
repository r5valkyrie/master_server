import { logger } from '../../../lib/logger';
import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
        
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        // If admin_activity_log table exists, use it for more comprehensive data
        try {
            const [loggedActivities] = await pool.execute(`
                SELECT 
                    id,
                    activity_type,
                    user_steam_id,
                    user_name,
                    admin_user,
                    description,
                    metadata,
                    timestamp
                FROM admin_activity_log 
                WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                ORDER BY timestamp DESC 
                LIMIT ?
            `, [limit]);

            if (Array.isArray(loggedActivities) && loggedActivities.length > 0) {
                const formattedActivities = (loggedActivities as any[]).map(activity => ({
                    id: `log_${activity.id}`,
                    type: activity.activity_type,
                    user: {
                        steam_id: activity.user_steam_id,
                        name: activity.user_name || 'Unknown User'
                    },
                    description: activity.description,
                    timestamp: activity.timestamp,
                    metadata: activity.metadata ? JSON.parse(activity.metadata) : {},
                    admin_user: activity.admin_user
                }));

                return new Response(JSON.stringify({
                    success: true,
                    activities: formattedActivities,
                    total: formattedActivities.length,
                    source: 'activity_log'
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        } catch (logError) {
        }

        // Fallback to original method if activity log table doesn't exist
        const activities = [];

        // 1. Recent user logins (last 24 hours)
        const [recentLogins] = await pool.execute(`
            SELECT 
                'login' as activity_type,
                steam_id,
                name,
                last_seen as timestamp,
                'User logged in' as description
            FROM users 
            WHERE last_seen >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY last_seen DESC 
            LIMIT ?
        `, [Math.floor(limit * 0.4)]);

        // 2. Recent bans (get all bans, we'll sort by identifier for consistency)
        const [recentBans] = await pool.execute(`
            SELECT 
                'ban' as activity_type,
                b.identifier as steam_id,
                COALESCE(u.name, 'Unknown User') as name,
                COALESCE(b.created_at, NOW()) as timestamp,
                CONCAT('User banned: ', COALESCE(b.ban_reason, 'No reason specified')) as description,
                b.ban_reason
            FROM banned_users b
            LEFT JOIN users u ON u.steam_id = b.identifier
            ORDER BY b.identifier DESC 
            LIMIT ?
        `, [Math.floor(limit * 0.3)]);

        // 3. Recent username changes (last 3 days)
        const [recentNameChanges] = await pool.execute(`
            SELECT 
                'name_change' as activity_type,
                h.steam_id,
                h.name,
                h.last_seen as timestamp,
                CONCAT('Username updated to: ', h.name) as description
            FROM username_history h
            WHERE h.last_seen >= DATE_SUB(NOW(), INTERVAL 3 DAY)
            AND h.steam_id IS NOT NULL 
            AND h.name IS NOT NULL
            ORDER BY h.last_seen DESC 
            LIMIT ?
        `, [Math.floor(limit * 0.2)]);

        // 4. New user registrations (last 7 days)
        const [newUsers] = await pool.execute(`
            SELECT 
                'registration' as activity_type,
                steam_id,
                name,
                first_seen as timestamp,
                'New user registered' as description
            FROM users 
            WHERE first_seen >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY first_seen DESC 
            LIMIT ?
        `, [Math.floor(limit * 0.1)]);

        // Combine all activities
        activities.push(...(recentLogins as any[]));
        activities.push(...(recentBans as any[]));
        activities.push(...(recentNameChanges as any[]));
        activities.push(...(newUsers as any[]));

        // Sort by timestamp descending and limit
        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const limitedActivities = activities.slice(0, limit);

        // Format the response
        const formattedActivities = limitedActivities.map(activity => ({
            id: `${activity.activity_type}_${activity.steam_id}_${new Date(activity.timestamp).getTime()}`,
            type: activity.activity_type,
            user: {
                steam_id: activity.steam_id,
                name: activity.name
            },
            description: activity.description,
            timestamp: activity.timestamp,
            metadata: {
                ban_reason: activity.ban_reason || null
            }
        }));

        return new Response(JSON.stringify({
            success: true,
            activities: formattedActivities,
            total: formattedActivities.length,
            source: 'individual_queries'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        logger.error(`Recent Activity API Error: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({
            success: false,
            message: 'Failed to fetch recent activity',
            activities: []
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

// Helper function to log activities (call this from other parts of your application)
export async function logActivity(
    activityType: 'login' | 'ban' | 'unban' | 'registration' | 'name_change' | 'admin_action' | 'system',
    userSteamId: string | null,
    userName: string | null,
    description: string,
    adminUser: string | null = null,
    metadata: any = null,
    ipAddress: string | null = null
) {
    try {
        const pool = getPool();
        if (!pool) return;

        await pool.execute(`
            INSERT INTO admin_activity_log 
            (activity_type, user_steam_id, user_name, admin_user, description, metadata, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            activityType,
            userSteamId,
            userName,
            adminUser,
            description,
            metadata ? JSON.stringify(metadata) : null,
            ipAddress
        ]);
    } catch (error) {
        logger.error(`Failed to log activity: ${error}`, { prefix: 'ADMIN' });
    }
}
