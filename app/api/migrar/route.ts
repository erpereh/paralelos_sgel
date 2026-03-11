import { NextRequest, NextResponse } from "next/server";

const N8N_WEBHOOK_URL = "https://d4vbit-n8n.hf.space/webhook/migrar-nomina";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const jobId = formData.get("job_id") as string;

        if (!file || !jobId) {
            return NextResponse.json(
                { error: "Faltan datos requeridos (file o job_id)" },
                { status: 400 }
            );
        }

        // Crear una nueva instancia de FormData para Vercel
        const newFormData = new FormData();
        newFormData.append("file", file);
        newFormData.append("job_id", jobId);

        // Forward it to the real n8n webhook
        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            body: newFormData,
        });

        if (!n8nResponse.ok) {
            const errorText = await n8nResponse.text();
            console.error("n8n webhook error:", n8nResponse.status, errorText);
            return NextResponse.json(
                { error: "Error en el webhook de n8n", details: errorText },
                { status: n8nResponse.status }
            );
        }

        const data = await n8nResponse.json().catch(() => ({ ok: true }));
        return NextResponse.json(data);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Proxy error:", message, error);
        return NextResponse.json(
            { error: "Error interno del proxy", details: message },
            { status: 500 }
        );
    }
}
