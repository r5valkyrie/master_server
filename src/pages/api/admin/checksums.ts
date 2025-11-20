import type { APIRoute } from 'astro';
import { getPool } from '../../../lib/db';
import { logger } from '../../../lib/logger.ts';
import { logAdminEvent } from '../../../lib/discord';
import { RefreshChecksums } from '../../../lib/checksums';

export const GET: APIRoute = async ({ request }) => {
    try {
        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const [checksums] = await pool.execute("SELECT * FROM `checksums`");
        const [versions] = await pool.execute("SELECT * FROM `versions`");

        const groupedChecksums = (checksums as any[]).reduce((grouped, checkSum) => {
            const sdkVersion = checkSum.sdkversion;
            if (!grouped[sdkVersion]) {
                grouped[sdkVersion] = [];
            }
            grouped[sdkVersion].push(checkSum);
            return grouped;
        }, {} as Record<string, any[]>);

        const sortedGroupedChecksums = Object.keys(groupedChecksums).sort((a, b) => {
            const numA = parseInt((a.match(/\d+$/) || ["0"])[0], 10);
            const numB = parseInt((b.match(/\d+$/) || ["0"])[0], 10);
            return numB - numA;
        }).reduce((sortedGrouped, sdkVersion) => {
            sortedGrouped[sdkVersion] = groupedChecksums[sdkVersion];
            return sortedGrouped;
        }, {} as Record<string, any[]>);

        return new Response(JSON.stringify({ checksums: sortedGroupedChecksums, versions }), { status: 200 });
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
        console.log('Received checksum data:', body); // Debug logging
        
        const checksum = body.checksum?.toString().trim();
        const sdkversion = body.sdkversion?.toString().trim();
        const description = body.description ? body.description.toString().trim() : null;
        
        // Detailed validation
        if (!checksum) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Checksum is required',
                details: 'Please enter a valid checksum hash'
            }), { status: 400 });
        }
        
        if (!sdkversion || sdkversion === '') {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'SDK Version is required',
                details: 'Please select a valid SDK version from the dropdown'
            }), { status: 400 });
        }
        
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        
        // Check if checksum already exists
        const [existing] = await pool.execute('SELECT checksum FROM checksums WHERE checksum = ?', [checksum]);
        if (Array.isArray(existing) && existing.length > 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Checksum already exists',
                details: 'This checksum has already been added to the database'
            }), { status: 409 });
        }
        
        await pool.execute('INSERT INTO checksums (checksum, sdkversion, description) VALUES (?,?,?)', [checksum, sdkversion, description]);
        await logAdminEvent(`➕ Checksum added: ${checksum} (v ${sdkversion})`);
        await RefreshChecksums();
        return new Response(JSON.stringify({ success: true, message: 'Checksum added successfully' }), { status: 201 });
    } catch (error) {
        console.error('Checksum API Error:', error);
        
        // Provide more specific error information
        let errorMessage = 'An internal server error occurred.';
        if (error instanceof Error) {
            if (error.message.includes('Duplicate entry')) {
                errorMessage = 'This checksum already exists in the database.';
            } else if (error.message.includes('Data too long')) {
                errorMessage = 'One of the values is too long for the database field.';
            } else if (error.message.includes('cannot be null')) {
                errorMessage = 'A required field is missing or null.';
            }
        }
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }), { status: 500 });
    }
};

export const PUT: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const checksum = body.checksum?.toString();
        if (!checksum) return new Response(JSON.stringify({ success: false, error: 'Missing checksum' }), { status: 400 });

        const updates: string[] = [];
        const params: any[] = [];
        if (body.sdkversion !== undefined) { updates.push('sdkversion=?'); params.push(body.sdkversion.toString()); }
        if (body.description !== undefined) { updates.push('description=?'); params.push(body.description ?? null); }
        if (updates.length === 0) return new Response(JSON.stringify({ success: false, error: 'No fields to update' }), { status: 400 });

        params.push(checksum);
        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        await pool.execute(`UPDATE checksums SET ${updates.join(', ')} WHERE checksum=?`, params);
        await logAdminEvent(`✏️ Checksum updated: ${checksum}`);
        await RefreshChecksums();
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};

export const DELETE: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const checksum = url.searchParams.get('checksum');
        if (!checksum) return new Response(JSON.stringify({ success: false, error: 'Missing checksum' }), { status: 400 });

        const pool = getPool();
        if (!pool) throw new Error('Database not initialized');
        await pool.execute('DELETE FROM checksums WHERE checksum=?', [checksum]);
        await logAdminEvent(`🗑️ Checksum deleted: ${checksum}`);
        await RefreshChecksums();
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({ success: false, error: 'An internal server error occurred.' }), { status: 500 });
    }
};
