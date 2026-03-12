import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;

const SYSTEM_PROMPT = `Eres un consultor técnico senior especializado en nóminas y sistemas de RRHH, experto en migraciones de Meta4 a Cegid XRP. Analiza los conceptos salariales extraídos de Meta4 y tradúcelos a la sintaxis equivalente en Cegid XRP. Tu respuesta DEBE SER ÚNICAMENTE un objeto JSON válido con estas 9 claves exactas:
1. 'concepto': Nombre original.
2. 'meta4_formula': Fórmula original.
3. 'meta4_unidades': Unidades originales.
4. 'meta4_precio': Precio original.
5. 'cegid_formula': Fórmula adaptada a Cegid XRP.
6. 'cegid_unidades': Lógica de unidades adaptada a Cegid XRP.
7. 'cegid_precio': Lógica de precio adaptada a Cegid XRP.
8. 'logica_aplicada': Breve explicación técnica de la transformación.
9. 'anotaciones': Advertencias técnicas.`;

interface RawRow {
    concepto: string;
    formula: string;
    unidades: string;
    precio: string;
}

interface MigracionResult {
    concepto: string;
    meta4_formula: string;
    meta4_unidades: string;
    meta4_precio: string;
    cegid_formula: string;
    cegid_unidades: string;
    cegid_precio: string;
    logica_aplicada: string;
    anotaciones: string;
}

async function processRow(
    openai: OpenAI,
    row: RawRow
): Promise<MigracionResult> {
    try {
        const completion = await openai.chat.completions.create({
            model: "stepfun/step-3.5-flash:free",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: `Concepto: ${row.concepto}\nFórmula Meta4: ${row.formula}\nUnidades Meta4: ${row.unidades}\nPrecio Meta4: ${row.precio}`,
                },
            ],
        });

        const raw = completion.choices[0]?.message?.content || "{}";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");

        return {
            concepto: row.concepto,
            meta4_formula: row.formula,
            meta4_unidades: row.unidades,
            meta4_precio: row.precio,
            cegid_formula: parsed.cegid_formula || "",
            cegid_unidades: parsed.cegid_unidades || "",
            cegid_precio: parsed.cegid_precio || "",
            logica_aplicada: parsed.logica_aplicada || "",
            anotaciones: parsed.anotaciones || "",
        };
    } catch (err) {
        return {
            concepto: row.concepto,
            meta4_formula: row.formula,
            meta4_unidades: row.unidades,
            meta4_precio: row.precio,
            cegid_formula: "",
            cegid_unidades: "",
            cegid_precio: "",
            logica_aplicada: "",
            anotaciones: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

export async function POST(request: NextRequest) {
    try {
        const { concepto, formula, unidades, precio } = await request.json();

        if (!concepto || !formula || unidades === undefined || precio === undefined) {
            return NextResponse.json(
                { error: "Faltan datos requeridos (concepto, formula, unidades, precio)" },
                { status: 400 }
            );
        }

        if (!process.env.OPENROUTER_API_KEY) {
            return NextResponse.json(
                { error: "OPENROUTER_API_KEY no configurada en el servidor" },
                { status: 500 }
            );
        }

        const openai = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY,
        });

        const result = await processRow(openai, {
            concepto: String(concepto),
            formula: String(formula),
            unidades: String(unidades),
            precio: String(precio),
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : String(error);
        console.error("Error en /api/migrar:", message);
        return NextResponse.json(
            { error: "Error interno del servidor", details: message },
            { status: 500 }
        );
    }
}
