import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';

export const GET: APIRoute = async () => {
  try {
    const pool = getPool();
    if (!pool) throw new Error('Database not initialized');

    // Get ban statistics for different time periods
    const queries = [
      // Bans in last 24 hours
      `SELECT COUNT(*) as count FROM banned_users WHERE created_at >= NOW() - INTERVAL 24 HOUR`,
      
      // Bans in last 7 days  
      `SELECT COUNT(*) as count FROM banned_users WHERE created_at >= NOW() - INTERVAL 7 DAY`,
      
      // Bans in last 30 days
      `SELECT COUNT(*) as count FROM banned_users WHERE created_at >= NOW() - INTERVAL 30 DAY`,
      
      // Daily ban trend for last 7 days
      `SELECT 
        DATE(created_at) as ban_date,
        COUNT(*) as daily_bans
       FROM banned_users 
       WHERE created_at >= NOW() - INTERVAL 7 DAY
       GROUP BY DATE(created_at)
       ORDER BY ban_date DESC`,
       
      // Most common ban reasons (top 5)
      `SELECT 
        ban_reason,
        COUNT(*) as count
       FROM banned_users 
       WHERE created_at >= NOW() - INTERVAL 30 DAY
       AND ban_reason IS NOT NULL
       AND ban_reason != ''
       GROUP BY ban_reason
       ORDER BY count DESC
       LIMIT 5`,
       
      // Temporary vs Permanent bans ratio
      `SELECT 
        CASE 
          WHEN ban_expiry_date IS NULL THEN 'Permanent'
          ELSE 'Temporary'
        END as ban_type,
        COUNT(*) as count
       FROM banned_users
       WHERE created_at >= NOW() - INTERVAL 30 DAY
       GROUP BY ban_type`
    ];

    const [
      [bans24h],
      [bans7d], 
      [bans30d],
      dailyTrend,
      topReasons,
      banTypes
    ] = await Promise.all(queries.map(query => pool.execute(query)));

    const banStats = {
      current: {
        last24Hours: (bans24h as any[])[0]?.count || 0,
        last7Days: (bans7d as any[])[0]?.count || 0, 
        last30Days: (bans30d as any[])[0]?.count || 0
      },
      trends: {
        dailyBans: dailyTrend as any[],
        averageDaily: Math.round(((bans7d as any[])[0]?.count || 0) / 7)
      },
      insights: {
        topReasons: topReasons as any[],
        banTypes: banTypes as any[]
      },
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify({
      success: true,
      banStats
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Ban stats API error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to get ban statistics'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
