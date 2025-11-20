import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { logger } from '../../../lib/logger.ts';
import { logAdminEvent } from '../../../lib/discord';
import { RefreshVersions } from '../../../lib/versions';

export const GET: APIRoute = async ({ request }) => {
    try {
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const [rows] = await pool.execute("SELECT * FROM `versions`");

        return new Response(JSON.stringify({
            success: true,
            versions: rows
        }), { 
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        logger.error(`Versions GET error: ${error}`, { prefix: 'ADMIN' }); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred.",
            versions: []
        }), { 
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const name = (body.name || '').toString();
        // Flags are no longer user-configurable; default to VF_REAL_TYPES (1)
        const flags = 1;
        const checksums_enabled = body.checksums_enabled ? 1 : 0;
        const supported = body.supported ? 1 : 0;

        if (!name) return new Response(JSON.stringify({ success: false, error: 'Missing name' }), { status: 400 });

        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');

        await pool.execute(
            'INSERT INTO versions (name, flags, checksums_enabled, supported) VALUES (?,?,?,?)',
            [name, flags, checksums_enabled, supported]
        );
        await logAdminEvent(`➕ Version added: ${name} (checksums ${checksums_enabled ? 'on' : 'off'}, supported ${supported ? 'yes' : 'no'})`);

        await RefreshVersions();
        return new Response(JSON.stringify({ success: true }), { status: 201 });
    } catch (error) {
        logger.error(`Add version error: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};

export const PUT: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const name = (body.name || '').toString();
        if (!name) return new Response(JSON.stringify({ success: false, error: 'Missing name' }), { status: 400 });

        const updates: string[] = [];
        const params: any[] = [];
        if (body.checksums_enabled !== undefined) {
            updates.push('checksums_enabled=?'); params.push(body.checksums_enabled ? 1 : 0);
        }
        if (body.supported !== undefined) {
            updates.push('supported=?'); params.push(body.supported ? 1 : 0);
        }

        if (updates.length === 0) {
            return new Response(JSON.stringify({ success: false, error: 'No fields to update' }), { status: 400 });
        }

        params.push(name);
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');

        await pool.execute(`UPDATE versions SET ${updates.join(', ')} WHERE name=?`, params);
        await logAdminEvent(`✏️ Version updated: ${name}`);
        await RefreshVersions();
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        logger.error(`Update version error: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const name = url.searchParams.get('name');
        if (!name) return new Response(JSON.stringify({ success: false, error: 'Missing name' }), { status: 400 });

        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        await pool.execute('DELETE FROM versions WHERE name=?', [name]);
        await logAdminEvent(`🗑️ Version deleted: ${name}`);
        await RefreshVersions();
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        logger.error(`Delete version error: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};
