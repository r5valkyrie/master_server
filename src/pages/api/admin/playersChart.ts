import type { APIContext } from "astro";
import { getPool } from "../../../lib/db";
import { checkRateLimit } from "../../../lib/security";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export async function GET(context: APIContext) {
  // Rate limiting for chart API - 120 requests per minute per IP
  const clientIp = context.clientAddress || 'unknown';
  if (!checkRateLimit(`playerschart-api-${clientIp}`, 120, 60000)) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Rate limit exceeded. Please wait before making more requests.'
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const timeRange = context.url.searchParams.get('timeRange') || '14';
  
  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not initialized");

    const [rows] = await pool.execute(`
      SELECT date AS date, total_players
      FROM daily_playercount
      WHERE date >= CURDATE() - INTERVAL ? DAY
      ORDER BY date ASC;
    `, [timeRange]);

    const playerchartData: {
      labels: string[];
      datasets: {
        label: string;
        borderColor: string;
        backgroundColor: string;
        data: any[];
        fill: boolean;
        tension: number;
        pointRadius: number;
        pointBackgroundColor: string;
      }[];
    } = {
      labels: [],
      datasets: [{
        label: 'Total Players',
        borderColor: '#567bf3',
        backgroundColor: 'rgba(28, 80, 250, 0.3)',
        data: [],
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointBackgroundColor: '#567bf3',
      }]
    };

    if (Array.isArray(rows)) {
      rows.forEach((row: any) => {
        playerchartData.labels.push(formatDate(row.date));
        playerchartData.datasets[0].data.push(row.total_players);
      });
    }

    return new Response(JSON.stringify(playerchartData), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("API Error:", error); 
    
    return new Response(JSON.stringify({ 
        success: false, 
        error: "An internal server error occurred." 
    }), { status: 500 });
}
}
