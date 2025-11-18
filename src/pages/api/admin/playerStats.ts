import type { APIRoute } from 'astro';
import { getServers } from '../../../lib/servers';

// Simple in-memory tracking for peak players (would be better in Redis/DB for production)
let dailyPeakPlayers = 0;
let lastResetDate = new Date().toDateString();

function resetDailyStatsIfNeeded() {
  const currentDate = new Date().toDateString();
  if (currentDate !== lastResetDate) {
    dailyPeakPlayers = 0;
    lastResetDate = currentDate;
  }
}

export const GET: APIRoute = async () => {
  try {
    resetDailyStatsIfNeeded();

    // Get current server data
    const servers = await getServers(true);
    
    let currentPlayers = 0;
    let totalSlots = 0;
    let activeServers = 0;

    if (Array.isArray(servers)) {
      for (const server of servers) {
        if (server && typeof server.playerCount === 'number' && typeof server.maxPlayers === 'number') {
          currentPlayers += server.playerCount;
          totalSlots += server.maxPlayers;
          activeServers++;
        }
      }
    }

    // Update daily peak if current is higher
    if (currentPlayers > dailyPeakPlayers) {
      dailyPeakPlayers = currentPlayers;
    }

    const capacityUsed = totalSlots > 0 ? Math.round((currentPlayers / totalSlots) * 100) : 0;
    const averagePlayersPerServer = activeServers > 0 ? Math.round(currentPlayers / activeServers) : 0;

    const playerStats = {
      current: {
        onlinePlayers: currentPlayers,
        activeServers: activeServers,
        totalSlots: totalSlots,
        capacityUsed: capacityUsed
      },
      peaks: {
        todayPeak: dailyPeakPlayers,
        peakTime: lastResetDate // Simple tracking for now
      },
      performance: {
        averagePlayersPerServer: averagePlayersPerServer,
        serverUtilization: activeServers > 0 ? Math.round((currentPlayers / activeServers) * 100) / 100 : 0
      },
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify({
      success: true,
      playerStats
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Player stats API error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to get player statistics',
      playerStats: {
        current: { onlinePlayers: 0, activeServers: 0, totalSlots: 0, capacityUsed: 0 },
        peaks: { todayPeak: 0 },
        performance: { averagePlayersPerServer: 0, serverUtilization: 0 }
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
