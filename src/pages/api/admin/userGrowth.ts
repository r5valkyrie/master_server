import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const pool = getPool();
    if (!pool) throw new Error('Database not initialized');

    const queries = [
      // New users today
      `SELECT COUNT(*) as count FROM users WHERE DATE(first_seen) = CURDATE()`,
      
      // New users in last 7 days
      `SELECT COUNT(*) as count FROM users WHERE first_seen >= NOW() - INTERVAL 7 DAY`,
      
      // New users in last 30 days  
      `SELECT COUNT(*) as count FROM users WHERE first_seen >= NOW() - INTERVAL 30 DAY`,
      
      // Daily registration trend for last 7 days
      `SELECT 
        DATE(first_seen) as registration_date,
        COUNT(*) as new_users
       FROM users 
       WHERE first_seen >= NOW() - INTERVAL 7 DAY
       GROUP BY DATE(first_seen)
       ORDER BY registration_date DESC`,
       
      // Total user count
      `SELECT COUNT(*) as count FROM users`,
      
      // Active users (seen in last 7 days)
      `SELECT COUNT(*) as count FROM users WHERE last_seen >= NOW() - INTERVAL 7 DAY`,
      
      // Users with multiple names (returning users indicator)
      `SELECT COUNT(DISTINCT u.steam_id) as count
       FROM users u
       JOIN username_history h ON h.steam_id COLLATE utf8mb4_unicode_ci = u.steam_id COLLATE utf8mb4_unicode_ci
       GROUP BY u.steam_id
       HAVING COUNT(h.name) > 1`
    ];

    const [
      [newToday],
      [new7Days],
      [new30Days],
      dailyGrowth,
      [totalUsers],
      [activeUsers],
      [returningUsers]
    ] = await Promise.all(queries.map(query => pool.execute(query)));

    const todayCount = (newToday as any[])[0]?.count || 0;
    const weekCount = (new7Days as any[])[0]?.count || 0;
    const monthCount = (new30Days as any[])[0]?.count || 0;
    const total = (totalUsers as any[])[0]?.count || 0;
    const active = (activeUsers as any[])[0]?.count || 0;

    const userGrowth = {
      current: {
        newToday: todayCount,
        newThisWeek: weekCount,
        newThisMonth: monthCount,
        totalUsers: total,
        activeUsers: active,
        returningUsers: (returningUsers as any[]).length || 0
      },
      trends: {
        dailyRegistrations: dailyGrowth as any[],
        averageDaily: Math.round(weekCount / 7),
        growthRate: total > 0 ? Math.round((weekCount / total) * 100 * 100) / 100 : 0 // % growth
      },
      insights: {
        activeUserRate: total > 0 ? Math.round((active / total) * 100) : 0,
        retentionIndicator: total > 0 ? Math.round(((returningUsers as any[]).length / total) * 100) : 0
      },
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify({
      success: true,
      userGrowth
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('User growth API error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to get user growth statistics'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
