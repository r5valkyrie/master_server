import { logger } from '../../../lib/logger';
import type { APIRoute } from 'astro';
import { getVerifiedMods, searchVerifiedMods, addVerifiedMod, removeVerifiedMod, updateVerifiedMod } from '../../../lib/verifiedMods';

export const GET: APIRoute = async ({ url }) => {
    try {
        const search = url.searchParams.get('search');
        
        let mods;
        if (search && search.trim()) {
            mods = await searchVerifiedMods(search.trim());
        } else {
            mods = await getVerifiedMods();
        }
        
        return new Response(JSON.stringify({ success: true, mods }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        logger.error(`Error fetching verified mods: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({ 
            success: false,
            error: 'Failed to fetch verified mods' 
        }), { 
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { type, name, owner, thunderstore_link, id } = body;

        // Session authentication is handled by middleware for /api/admin routes
        // No need to manually verify password here

        let result;
        
        switch (type) {
            case 'add':
                if (!name || !owner || !thunderstore_link) {
                    return new Response(JSON.stringify({ 
                        success: false, 
                        error: "Name, owner, and thunderstore link are required" 
                    }), { status: 400 });
                }
                result = await addVerifiedMod(name, owner, thunderstore_link);
                break;
                
            case 'remove':
                if (!id) {
                    return new Response(JSON.stringify({ 
                        success: false, 
                        error: "ID is required for removal" 
                    }), { status: 400 });
                }
                result = await removeVerifiedMod(id);
                break;
                
            case 'update':
                if (!id || !name || !owner || !thunderstore_link) {
                    return new Response(JSON.stringify({ 
                        success: false, 
                        error: "ID, name, owner, and thunderstore link are required for update" 
                    }), { status: 400 });
                }
                result = await updateVerifiedMod(id, name, owner, thunderstore_link);
                break;
                
            default:
                return new Response(JSON.stringify({ 
                    success: false, 
                    error: "Invalid operation type. Use 'add', 'remove', or 'update'" 
                }), { status: 400 });
        }
        
        return new Response(JSON.stringify(result), { 
            status: result.success ? 200 : 400,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
    } catch (error) {
        logger.error(`Admin Verified Mods API Error: ${error}`, { prefix: 'ADMIN' });
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
};
