import type { APIRoute } from 'astro';
import { getPool } from '../../lib/db';
import { ValidateLanguage } from '../../lib/utils';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const language = ValidateLanguage(url.searchParams.get('language'));

        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const [rows] = await pool.execute("SELECT eula.*, lang AS language FROM `eula` WHERE lang = ( SELECT lang FROM eula ORDER BY FIELD(lang, 'english', ?) DESC LIMIT 1)", [language]);

        if (Array.isArray(rows) && rows.length === 1) {
            const data = rows[0] as { contents: string, modified: string };
            data.contents = `Valkyrie Privacy Policy\nLast Modified: ${new Date(data.modified).toUTCString()}\n\n` + data.contents;
            return new Response(JSON.stringify({ success: true, data }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ success: false, error: `Unable to find EULA text for locale '${language}'` }), { status: 404 });
        }
    } catch (error) {
        console.error("API Error:", error);
        return new Response(JSON.stringify({ success: false, error: "An internal server error occurred." }), { status: 500 });
    }
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const language = ValidateLanguage(url.searchParams.get('language'));

        const pool = getPool();
        if (!pool) throw new Error("Database not initialized");

        const [rows] = await pool.execute("SELECT eula.*, lang AS language FROM `eula` WHERE lang = ( SELECT lang FROM eula ORDER BY FIELD(lang, 'english', ?) DESC LIMIT 1)", [language]);

        if (Array.isArray(rows) && rows.length === 1) {
            const data = rows[0] as { contents: string, modified: string };
            data.contents = `Valkyrie Privacy Policy\nLast Modified: ${new Date(data.modified).toUTCString()}\n\n` + data.contents;
            return new Response(JSON.stringify({ success: true, data }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ success: false, error: `Unable to find EULA text for locale '${language}'` }), { status: 404 });
        }
    } catch (error) {
        console.error("API Error:", error); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
