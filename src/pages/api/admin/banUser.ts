import type { APIRoute } from 'astro';
import { addBan } from '../../../lib/bansystem';

function sanitiseSearchTerm(query: any) {
    if (query == null) return null;
    return query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const steamId = sanitiseSearchTerm(url.searchParams.get('steamId'));
        const ipAddr = sanitiseSearchTerm(url.searchParams.get('ipAddr'));
        const days = url.searchParams.get('days');
        const reason = url.searchParams.get('reason');
        let expiry: Date | null = null;
        if (days) {
            const d = parseInt(days, 10);
            if (!isNaN(d) && d > 0) {
                expiry = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
            }
        }

        if (steamId) {
            const banStatus = await addBan(steamId, reason, 1, expiry);
            return new Response(JSON.stringify(banStatus), { status: 200 });
        } else if (ipAddr) {
            const banStatus = await addBan(ipAddr, reason, 0, expiry);
            return new Response(JSON.stringify(banStatus), { status: 200 });
        } else {
            return new Response(JSON.stringify({ success: false, message: "oops! no params!" }), { status: 400 });
        }
    } catch (error) {
        console.error("API Error:", error); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
