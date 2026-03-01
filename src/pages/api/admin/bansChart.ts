import { logger } from '../../../lib/logger';
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
  if (!checkRateLimit(`banschart-api-${clientIp}`, 120, 60000)) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Rate limit exceeded. Please wait before making more requests.'
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const timeRange = context.url.searchParams.get('timeRange') || '120';

  try {
    const pool = getPool();
    if (!pool) throw new Error("Database not initialized");

    const [rows] = await pool.execute(`
        SELECT DATE(created_at) AS date, COUNT(*) AS total_bans
        FROM banned_users
        WHERE created_at >= NOW() - INTERVAL ? DAY
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) ASC;
    `, [timeRange]);

    const banschartData: {
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
            label: 'Total Bans',
            borderColor: 'rgba(243, 86, 86, 1)',
            backgroundColor: 'rgba(243, 86, 86, 0.3)',
            data: [],
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: 'rgba(243, 86, 86, 1)',
        }]
    };

    if (Array.isArray(rows)) {
        rows.forEach((row: any) => {
            banschartData.labels.push(formatDate(row.date));
            banschartData.datasets[0].data.push(row.total_bans);
        });
    }

    return new Response(JSON.stringify(banschartData), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger.error(`API Error: ${error}`, { prefix: 'ADMIN' }); 
    
    return new Response(JSON.stringify({ 
        success: false, 
        error: "An internal server error occurred." 
    }), { status: 500 });
}
}
