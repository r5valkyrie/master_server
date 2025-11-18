import type { APIRoute } from 'astro';
import { getServerByToken, ConvertServerDataTypes } from '../../../lib/servers';
import { IsVersionFlagSet, flags } from '../../../lib/versions';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();

        if (!body.token) {
            return new Response(JSON.stringify({ success: false, error: "Missing token." }), { status: 400 });
        }

        let server = await getServerByToken(body.token);

        if (body.version && await IsVersionFlagSet(body.version, flags.VF_REAL_TYPES)) {
            server = ConvertServerDataTypes(server, true);
        }

        if (server && !isNaN(server.port) && !isNaN(server.playerCount) && !isNaN(server.maxPlayers) && !isNaN(server.checksum) && !isNaN(server.numPlayers)) {
            return new Response(JSON.stringify({ success: true, server }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ success: false, error: "Server not found." }), { status: 200 });
        }
    } catch (error) {
        console.error("API Error:", error); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
