import type { APIRoute } from 'astro';
import { addChecksum, removeChecksum, updateChecksum, refreshChecksums } from '../../lib/checksumsystem';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { type, checksum, sdkversion, password, description } = body;

        if (password !== process.env.API_KEY) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid credentials" 
            }), { status: 401 });
        }
        
        const numChecksum = Number(checksum);

        if (type === "add") {
            const res = await addChecksum(numChecksum, description, sdkversion);
            return new Response(JSON.stringify(res), { status: 200 });
        } else if (type === "remove") {
            const res = await removeChecksum(numChecksum);
            return new Response(JSON.stringify(res), { status: 200 });
        } else if (type === "update") {
            const res = await updateChecksum(numChecksum, description, sdkversion);
            return new Response(JSON.stringify(res), { status: 200 });
        } else if (request.url.endsWith("refreshchecksums")) {
            const res = await refreshChecksums();
            return new Response(JSON.stringify(res), { status: 200 });
        } else {
            return new Response(JSON.stringify({ success: false, error: "Invalid operation type" }), { status: 400 });
        }
    } catch (error) {
        console.error("API Error:", error); 
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "An internal server error occurred." 
        }), { status: 500 });
    }
}
