import type { APIRoute } from 'astro';
import { getServerByIPAndPort } from '../../../lib/servers';
import { logger } from '../../../lib/logger';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { ip, port, password } = body;

        if (!ip || !port || !password) {
            return new Response(JSON.stringify({ success: false, error: "Missing required fields." }), { status: 400 });
        }

        const server = await getServerByIPAndPort(ip, parseInt(port));

        if (!server || Object.keys(server).length === 0) {
            return new Response(JSON.stringify({ success: false, error: "Server not found." }), { status: 404 });
        }

        if (server.hasPassword !== 'true') {
            return new Response(JSON.stringify({ success: false, error: "Server is not password protected." }), { status: 400 });
        }

        if (server.password === password) {
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ success: false, error: "Incorrect password." }), { status: 401 });
        }

    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        return new Response(JSON.stringify({
            success: false,
            error: "An internal server error occurred."
        }), { status: 500 });
    }
}
