import 'dotenv/config';
import type { APIRoute } from 'astro';
import { getServers } from '../../lib/servers';
import { IsVersionFlagSet, IsVersionSupported, flags, GetLatestVersion, initializeVersions } from '../../lib/versions';
import { ValidateLanguage } from '../../lib/utils';
import { logger } from '../../lib/logger';

export const POST: APIRoute = async ({ request }) => {
    try {
        await initializeVersions(); // Ensure versions are loaded before proceeding

        const body = await request.json();
        let language = ValidateLanguage(body.language);

        if (!language) {
            language = "english";
        }

        let useRealTypes = await IsVersionFlagSet(body.version, flags.VF_REAL_TYPES);
        let servers = (await getServers(useRealTypes)) || [];

        if (!body.password || body.password != process.env.API_KEY) {
            if (body.version) {
                servers = servers.filter(s => (body.version == s.version));
            }
            servers = servers.map(({ version, ...keepAttrs }) => keepAttrs);
            servers = servers.filter(s => (s.hidden === false || s.hidden === 'false'));
        }

        servers.sort((a, b) => (parseInt(b.playerCount) - parseInt(a.playerCount)));

        if (body.version && !await IsVersionSupported(body.version)) {
            const fakeServers = [
                {
                    name: "--- UPDATE REQUIRED ---",
                    description: "Your version is no longer supported. Please update to continue playing.",
                    playlist: "Visit: discord.gg/GcJSMUGJyD",
                    map: "",
                    ip: "::1",
                    port: 0,
                    key: "",
                    hidden: false,
                    playerCount: 0,
                    maxPlayers: 0,
                    checksum: 0,
                    hasPassword: false,
                },
                {
                    name: "Get the New Version Here",
                    description: "^A100FF00Our Discord has the download link in #announcements.",
                    playlist: "discord.gg/GcJSMUGJyD",
                    map: "",
                    ip: "::1",
                    port: 0,
                    key: "",
                    hidden: false,
                    playerCount: 0,
                    maxPlayers: 0,
                    checksum: 0,
                    hasPassword: false,
                }
            ];

            return new Response(JSON.stringify({ success: true, servers: fakeServers }), { status: 200 });
        }

        return new Response(JSON.stringify({ success: true, servers }), { status: 200 });
    } catch (error) {
        logger.error(`API error: ${error}`, { prefix: 'API' });
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
