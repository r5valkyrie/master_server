import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { logger } from '../../../lib/logger';

// Check Redis connection (import the servers module to access Redis client)
async function checkRedisStatus() {
  try {
    // Import the servers module to access Redis functionality
    const { getServers } = await import('../../../lib/servers');
    
    // Try to perform a simple Redis operation
    await getServers(false);
    return {
      status: 'connected',
      message: 'Redis connection healthy'
    };
  } catch (error) {
    logger.error(`Redis health check failed: ${error}`, { prefix: 'HEALTH' });
    return {
      status: 'disconnected', 
      message: 'Redis connection failed'
    };
  }
}

// Check Database connection
async function checkDatabaseStatus() {
  try {
    const pool = getPool();
    if (!pool) {
      return {
        status: 'disconnected',
        message: 'Database pool not initialized'
      };
    }

    // Try a simple query
    await pool.execute('SELECT 1');
    return {
      status: 'connected',
      message: 'Database connection healthy'
    };
  } catch (error) {
    logger.error(`Database health check failed: ${error}`, { prefix: 'HEALTH' });
    return {
      status: 'disconnected',
      message: 'Database connection failed'
    };
  }
}

// Check system performance metrics
async function getPerformanceMetrics() {
  const startTime = Date.now();
  
  try {
    const pool = getPool();
    if (pool) {
      await pool.execute('SELECT COUNT(*) FROM users LIMIT 1');
    }
    const dbResponseTime = Date.now() - startTime;

    return {
      dbResponseTime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  } catch (error) {
    logger.error(`Performance metrics check failed: ${error}`, { prefix: 'HEALTH' });
    return {
      dbResponseTime: Date.now() - startTime,
      error: 'Performance check failed'
    };
  }
}

export const GET: APIRoute = async () => {
  try {
    const [databaseStatus, redisStatus, performanceMetrics] = await Promise.all([
      checkDatabaseStatus(),
      checkRedisStatus(), 
      getPerformanceMetrics()
    ]);

    const systemHealth = {
      database: databaseStatus,
      redis: redisStatus,
      performance: performanceMetrics,
      timestamp: new Date().toISOString(),
      overallStatus: (databaseStatus.status === 'connected' && redisStatus.status === 'connected') ? 'healthy' : 'degraded'
    };

    return new Response(JSON.stringify({
      success: true,
      systemHealth
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    logger.error(`System health check error: ${error}`, { prefix: 'HEALTH' });
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to check system health',
      systemHealth: {
        database: { status: 'unknown', message: 'Health check failed' },
        redis: { status: 'unknown', message: 'Health check failed' },
        overallStatus: 'unknown'
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
