import type { APIRoute } from 'astro';
import { refreshVersions } from '../../../lib/versionsystem';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { password } = await request.json();

        if (password !== process.env.API_KEY) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
        }
        
        const res = await refreshVersions();
        return new Response(JSON.stringify(res), { status: 200 });
    } catch (error) {
        console.error("API Error:", error); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
