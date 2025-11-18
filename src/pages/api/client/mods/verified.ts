import type { APIRoute } from 'astro';
import { getVerifiedMods, searchVerifiedMods } from '../../../../lib/verifiedMods';

export const GET: APIRoute = async ({ url }) => {
    try {
        const search = url.searchParams.get('search');
        
        let mods;
        if (search && search.trim()) {
            mods = await searchVerifiedMods(search.trim());
        } else {
            mods = await getVerifiedMods();
        }
        
        // Transform to match the requested format
        const formattedMods = mods.map(mod => ({
            name: mod.name,
            owner: mod.owner,
            thunderstore_link: mod.thunderstore_link
        }));
        
        return new Response(JSON.stringify(formattedMods), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
            }
        });
    } catch (error) {
        console.error('Error fetching verified mods:', error);
        return new Response(JSON.stringify({ 
            error: 'Failed to fetch verified mods' 
        }), { 
            status: 500,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
};
