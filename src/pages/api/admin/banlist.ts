import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { logger } from '../../../lib/logger.ts';
import { logAdminEvent } from '../../../lib/discord';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
        const q = (url.searchParams.get('q') || '').trim();
        const offset = (page - 1) * limit;

        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        let where = '';
        const params: any[] = [];
        if (q) {
            where = 'WHERE identifier LIKE ? OR ban_reason LIKE ?';
            params.push(`%${q}%`, `%${q}%`);
        }

        const [rows] = await pool.execute(
            `SELECT * FROM banned_users ${where} ORDER BY ban_date DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM banned_users ${where}`,
            params
        );

        const total = Array.isArray(countRows) ? (countRows[0] as any).total : 0;

        return new Response(JSON.stringify({ data: rows, page, pageSize: limit, total }), { status: 200 });
    } catch (error) {
        console.error("API Error:", error); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const identifier = body.identifier as string;
        const banType = typeof body.banType === 'number' ? body.banType : parseInt(body.banType || '0', 10) || 0; // 0 connect, 1 comms
        const reason = (body.reason ?? null) as string | null;
        const permanent = Boolean(body.permanent);
        const endDate = body.endDate ? new Date(body.endDate) : null;

        if (!identifier) {
            return new Response(JSON.stringify({ success: false, error: 'Missing identifier' }), { status: 400 });
        }

        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');

        // Determine identifier_type without numeric parsing: 1 = numeric string (IDs), 0 = ip/text
        const identifierType = /^\d+$/.test(identifier) ? 1 : 0;

        // Check if exists
        const [existing] = await pool.execute("SELECT identifier FROM banned_users WHERE identifier=?", [identifier]);
        if (Array.isArray(existing) && existing.length > 0) {
            return new Response(JSON.stringify({ success: false, error: 'Already banned' }), { status: 409 });
        }

        await pool.execute(
            "INSERT INTO banned_users (identifier, identifier_type, ban_reason, ban_type, ban_expiry_date) VALUES (?,?,?,?,?)",
            [identifier, identifierType, reason, banType, permanent ? null : endDate]
        );
        await logAdminEvent(`Ban added: ${identifier} (type ${banType})${reason ? ` – ${reason}` : ''}`);

        return new Response(JSON.stringify({ success: true }), { status: 201 });
    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};

export const PUT: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const identifier = body.identifier as string;
        const reason = body.reason ?? undefined;
        const endDate = body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : undefined;

        if (!identifier) {
            return new Response(JSON.stringify({ success: false, error: 'Missing identifier' }), { status: 400 });
        }

        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');

        // Build dynamic update
        const sets: string[] = [];
        const params: any[] = [];
        if (reason !== undefined) { sets.push('ban_reason=?'); params.push(reason); }
        if (endDate !== undefined) { sets.push('ban_expiry_date=?'); params.push(endDate); }

        if (sets.length === 0) {
            return new Response(JSON.stringify({ success: false, error: 'No fields to update' }), { status: 400 });
        }

        params.push(identifier);
        await pool.execute(`UPDATE banned_users SET ${sets.join(', ')} WHERE identifier=?`, params);
        await logAdminEvent(`Ban updated: ${identifier}${reason !== undefined ? ` reason→${reason || '(none)'}` : ''}${endDate !== undefined ? ` expiry→${endDate || 'Permanent'}` : ''}`);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const identifier = url.searchParams.get('identifier');
        if (!identifier) {
            return new Response(JSON.stringify({ success: false, error: 'Missing identifier' }), { status: 400 });
        }

        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');

        await pool.execute('DELETE FROM banned_users WHERE identifier=?', [identifier]);
        await logAdminEvent(`Unbanned: ${identifier}`);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};