import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { logger } from '../../../lib/logger';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { id: userId, name: userName, password } = body;

        if (password !== process.env.API_KEY) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
        }

        if (!userId && !userName) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Missing required parameter. Please provide either 'id' or 'name'." 
            }), { status: 400 });
        }

        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const statement = "SELECT * FROM users WHERE " + (userName ? "name=?" : "steam_id=?");
        const [rows] = await pool.execute(statement, [userName ? userName : userId]);

        if (Array.isArray(rows) && rows.length > 0) {
            return new Response(JSON.stringify({ success: true, data: rows[0] }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "User not found" 
            }), { status: 404 });
        }
    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
