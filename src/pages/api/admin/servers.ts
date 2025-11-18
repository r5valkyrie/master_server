import type { APIRoute } from 'astro';
import { getServers, getServerKeys } from '../../../lib/servers';
import { logAdminEvent } from '../../../lib/discord';

export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
        const q = (url.searchParams.get('q') || '').trim();
        const filter = url.searchParams.get('filter') || '';
        const sortBy = url.searchParams.get('sortBy') || 'playerCount';
        const sortOrder = url.searchParams.get('sortOrder') || 'desc';

        // Get all servers with real types for admin view
        let servers = await getServers(true) || [];

        // Apply search filter
        if (q) {
            const searchTerm = q.toLowerCase();
            servers = servers.filter(server => 
                server.name?.toLowerCase().includes(searchTerm) ||
                server.ip?.toLowerCase().includes(searchTerm) ||
                server.region?.toLowerCase().includes(searchTerm) ||
                server.map?.toLowerCase().includes(searchTerm) ||
                server.playlist?.toLowerCase().includes(searchTerm)
            );
        }

        // Apply filters
        if (filter) {
            switch (filter) {
                case 'active':
                    servers = servers.filter(server => server.playerCount > 0);
                    break;
                case 'empty':
                    servers = servers.filter(server => server.playerCount === 0);
                    break;
                case 'full':
                    servers = servers.filter(server => server.playerCount >= server.maxPlayers);
                    break;
                case 'password':
                    servers = servers.filter(server => server.hasPassword === true || server.hasPassword === 'true');
                    break;
                case 'public':
                    servers = servers.filter(server => server.hasPassword === false || server.hasPassword === 'false');
                    break;
                case 'modded':
                    servers = servers.filter(server => {
                        if (Array.isArray(server.requiredMods)) {
                            return server.requiredMods.length > 0;
                        } else if (typeof server.requiredMods === 'string') {
                            try {
                                const parsed = JSON.parse(server.requiredMods);
                                return Array.isArray(parsed) && parsed.length > 0;
                            } catch {
                                return false;
                            }
                        }
                        return false;
                    });
                    break;
                case 'vanilla':
                    servers = servers.filter(server => {
                        if (Array.isArray(server.requiredMods)) {
                            return server.requiredMods.length === 0;
                        } else if (typeof server.requiredMods === 'string') {
                            try {
                                const parsed = JSON.parse(server.requiredMods);
                                return !Array.isArray(parsed) || parsed.length === 0;
                            } catch {
                                return true;
                            }
                        }
                        return true;
                    });
                    break;
            }
        }

        // Sort servers
        servers.sort((a, b) => {
            let aVal, bVal;
            
            switch (sortBy) {
                case 'name':
                    aVal = a.name?.toLowerCase() || '';
                    bVal = b.name?.toLowerCase() || '';
                    break;
                case 'playerCount':
                    aVal = parseInt(a.playerCount) || 0;
                    bVal = parseInt(b.playerCount) || 0;
                    break;
                case 'maxPlayers':
                    aVal = parseInt(a.maxPlayers) || 0;
                    bVal = parseInt(b.maxPlayers) || 0;
                    break;
                case 'region':
                    aVal = a.region?.toLowerCase() || '';
                    bVal = b.region?.toLowerCase() || '';
                    break;
                case 'map':
                    aVal = a.map?.toLowerCase() || '';
                    bVal = b.map?.toLowerCase() || '';
                    break;
                default:
                    aVal = parseInt(a.playerCount) || 0;
                    bVal = parseInt(b.playerCount) || 0;
            }
            
            if (sortOrder === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });

        // Calculate pagination
        const total = servers.length;
        const offset = (page - 1) * limit;
        const paginatedServers = servers.slice(offset, offset + limit);

        // Calculate statistics
        const stats = {
            total: servers.length,
            active: servers.filter(s => s.playerCount > 0).length,
            empty: servers.filter(s => s.playerCount === 0).length,
            full: servers.filter(s => s.playerCount >= s.maxPlayers).length,
            totalPlayers: servers.reduce((sum, s) => sum + (parseInt(s.playerCount) || 0), 0),
            totalMaxPlayers: servers.reduce((sum, s) => sum + (parseInt(s.maxPlayers) || 0), 0),
            withPassword: servers.filter(s => s.hasPassword === true || s.hasPassword === 'true').length,
            modded: servers.filter(s => {
                if (Array.isArray(s.requiredMods)) {
                    return s.requiredMods.length > 0;
                } else if (typeof s.requiredMods === 'string') {
                    try {
                        const parsed = JSON.parse(s.requiredMods);
                        return Array.isArray(parsed) && parsed.length > 0;
                    } catch {
                        return false;
                    }
                }
                return false;
            }).length
        };

        return new Response(JSON.stringify({ 
            success: true,
            data: paginatedServers, 
            page, 
            pageSize: limit, 
            total,
            stats
        }), { status: 200 });
    } catch (error) {
        console.error("Admin Servers API Error:", error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
};

// Additional endpoint for server statistics
export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const action = body.action;

        if (action === 'refresh') {
            // Force refresh server list
            const serverKeys = await getServerKeys();
            await logAdminEvent(`🔄 Server list refreshed (${serverKeys.length} servers)`);
            
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'Server list refreshed',
                serverCount: serverKeys.length
            }), { status: 200 });
        } else if (action === 'stats') {
            // Get detailed statistics
            const servers = await getServers(true) || [];
            
            const regionStats = servers.reduce((acc: any, server) => {
                const region = server.region || 'Unknown';
                if (!acc[region]) {
                    acc[region] = { count: 0, players: 0 };
                }
                acc[region].count++;
                acc[region].players += parseInt(server.playerCount) || 0;
                return acc;
            }, {});

            const gamemodeStats = servers.reduce((acc: any, server) => {
                const gamemode = server.playlist || 'Unknown';
                if (!acc[gamemode]) {
                    acc[gamemode] = { count: 0, players: 0 };
                }
                acc[gamemode].count++;
                acc[gamemode].players += parseInt(server.playerCount) || 0;
                return acc;
            }, {});

            return new Response(JSON.stringify({ 
                success: true,
                regionStats,
                gamemodeStats,
                totalServers: servers.length,
                totalPlayers: servers.reduce((sum, s) => sum + (parseInt(s.playerCount) || 0), 0)
            }), { status: 200 });
        }

        return new Response(JSON.stringify({ 
            success: false, 
            error: 'Invalid action' 
        }), { status: 400 });
    } catch (error) {
        console.error("Admin Servers API Error:", error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
};
