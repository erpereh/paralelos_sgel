"use client";

import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import DropZone from "@/components/DropZone";
import ResultsTable, { SortKey, SortDir } from "@/components/ResultsTable";
import DownloadButton from "@/components/DownloadButton";
import ConceptsResultsTable, { ConceptRow } from "@/components/ConceptsResultsTable";
import Link from "next/link";

/* ─── Types ─── */

type Mode = "nominas" | "conceptos";

interface ComparisonRow {
    nombre: string;
    id_empleado: string;
    empresa: string;
    devengos_xrp: number;
    deducciones_xrp: number;
    liquido_xrp: number;
    devengos_meta4: number;
    deducciones_meta4: number;
    liquido_meta4: number;
    diferencia: number;
    convenio_xrp: string;
    convenio_meta4: string;
    convenio_match: string;
    _merge: string;
}

interface ApiResponse {
    data: ComparisonRow[];
    total_rows: number;
    rows_with_diff: number;
}

interface ConceptResult {
    data: ConceptRow[];
    stats: { total: number; match: number; partial_match: number; xrp_only: number; meta4_only: number };
}

/* ─── Helpers: concept comparison ─── */

/** Elimina tildes, artículos, preposiciones y normaliza a mayúsculas. */
function normalize(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\b(DE|DEL|LA|EL|LAS|LOS|EN|POR|AL|A)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** Separa "TEXTO (contenido)" en { main: "TEXTO", paren: "contenido" }. */
function splitParentheses(s: string): { main: string; paren: string } {
    const match = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (match) return { main: match[1].trim(), paren: match[2].trim() };
    return { main: s, paren: "" };
}

/** Stemming muy básico para español: quita plurales (s/es final). */
function stem(word: string): string {
    if (word.length > 4 && word.endsWith("ES")) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith("S")) return word.slice(0, -1);
    return word;
}

/** Tokeniza y aplica stem a cada palabra. */
function stemTokens(s: string): Set<string> {
    return new Set(s.split(" ").filter(Boolean).map(stem));
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/**
 * Similitud combinada entre dos strings:
 * 1. Si todas las palabras (stemmed) del más corto están en el más largo → containment match
 * 2. Token overlap (stemmed) / max tokens
 * 3. Levenshtein normalizado
 * 4. Bonus si el contenido entre paréntesis también coincide
 */
function similarity(a: string, b: string): number {
    const normA = normalize(a);
    const normB = normalize(b);
    if (normA === normB) return 1;

    // Separar texto principal y paréntesis
    const partsA = splitParentheses(normA);
    const partsB = splitParentheses(normB);

    const mainA = partsA.main || normA;
    const mainB = partsB.main || normB;

    const tokA = stemTokens(mainA);
    const tokB = stemTokens(mainB);

    if (tokA.size === 0 || tokB.size === 0) return 0;

    // Containment: si todas las palabras del más corto están en el más largo → alto score
    const [smaller, larger] = tokA.size <= tokB.size ? [tokA, tokB] : [tokB, tokA];
    let containedCount = 0;
    smaller.forEach((t) => { if (larger.has(t)) containedCount++; });
    const containment = containedCount / smaller.size; // 1.0 si todas están contenidas

    // Token overlap clásico (sobre el max)
    let sharedCount = 0;
    tokA.forEach((t) => { if (tokB.has(t)) sharedCount++; });
    const tokenOverlap = sharedCount / Math.max(tokA.size, tokB.size);

    // Levenshtein normalizado sobre el texto principal
    const maxLen = Math.max(mainA.length, mainB.length);
    const levSim = maxLen === 0 ? 1 : 1 - levenshtein(mainA, mainB) / maxLen;

    // Score base: el mejor de los tres métodos
    let score = Math.max(containment, tokenOverlap, levSim);

    // Si containment es 100% (nombre corto totalmente incluido en el largo), mínimo 0.85
    if (containment === 1) score = Math.max(score, 0.85);

    // Bonus por coincidencia de paréntesis (si ambos tienen)
    if (partsA.paren && partsB.paren) {
        const parenTokA = stemTokens(partsA.paren);
        const parenTokB = stemTokens(partsB.paren);
        let parenShared = 0;
        parenTokA.forEach((t) => { if (parenTokB.has(t)) parenShared++; });
        const parenSim = parenShared / Math.max(parenTokA.size, parenTokB.size);
        score = Math.min(1, score + parenSim * 0.1); // bonus de hasta 10%
    }

    return score;
}

const FUZZY_THRESHOLD = 0.6;

/** Lee un Excel y devuelve arrays de [colA, colB] saltando la cabecera (fila 1). */
async function readExcelColumns(file: File): Promise<[string, string][]> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    // Saltar fila 0 (cabecera), leer columnas A y B por posición
    return raw.slice(1)
        .map((row): [string, string] => [String(row[0] ?? "").trim(), String(row[1] ?? "").trim()])
        .filter(([a, b]) => a || b);
}

function compareConceptos(
    xrpData: [string, string][],
    meta4Data: [string, string][]
): ConceptResult {
    // XRP: col A = ID_CONCEPTO, col B = NOMBRE_LARGO
    // Meta4: col A = Concepto (no se usa), col B = Descripción

    // Build Meta4 list from col B (descripción)
    interface Meta4Entry { descripcion: string; matched: boolean; }
    const meta4Entries: Meta4Entry[] = [];
    for (const [, desc] of meta4Data) {
        if (!desc) continue;
        meta4Entries.push({ descripcion: desc, matched: false });
    }

    // Build normalized map for exact matching
    const meta4ByKey = new Map<string, Meta4Entry[]>();
    for (const entry of meta4Entries) {
        const key = normalize(entry.descripcion);
        if (!meta4ByKey.has(key)) meta4ByKey.set(key, []);
        meta4ByKey.get(key)!.push(entry);
    }

    const results: ConceptRow[] = [];

    // Track XRP rows that didn't get an exact match (for fuzzy pass)
    interface UnmatchedXrp { nombre: string; idConcepto: string; }
    const unmatchedXrp: UnmatchedXrp[] = [];

    // ── Pass 1: Exact match (normalized) ──
    for (const [idConcepto, nombre] of xrpData) {
        if (!nombre) continue;
        const key = normalize(nombre);

        const candidates = meta4ByKey.get(key);
        if (candidates && candidates.length > 0) {
            const entry = candidates.find((e) => !e.matched) ?? candidates[0];
            entry.matched = true;
            results.push({
                id_concepto_xrp: idConcepto,
                nombre_xrp: nombre,
                descripcion_meta4: entry.descripcion,
                status: "match",
            });
        } else {
            unmatchedXrp.push({ nombre, idConcepto });
        }
    }

    // ── Pass 2: Fuzzy match for unmatched XRP rows ──
    for (const xrp of unmatchedXrp) {
        let bestEntry: Meta4Entry | null = null;
        let bestScore = 0;

        for (const entry of meta4Entries) {
            if (entry.matched) continue;
            const score = similarity(xrp.nombre, entry.descripcion);
            if (score > bestScore) {
                bestScore = score;
                bestEntry = entry;
            }
        }

        if (bestEntry && bestScore >= FUZZY_THRESHOLD) {
            bestEntry.matched = true;
            results.push({
                id_concepto_xrp: xrp.idConcepto,
                nombre_xrp: xrp.nombre,
                descripcion_meta4: bestEntry.descripcion,
                status: "partial_match",
                similarity: Math.round(bestScore * 100),
            });
        } else {
            results.push({
                id_concepto_xrp: xrp.idConcepto,
                nombre_xrp: xrp.nombre,
                descripcion_meta4: "",
                status: "xrp_only",
            });
        }
    }

    // Unmatched Meta4
    for (const entry of meta4Entries) {
        if (!entry.matched) {
            results.push({
                id_concepto_xrp: "",
                nombre_xrp: "",
                descripcion_meta4: entry.descripcion,
                status: "meta4_only",
            });
        }
    }

    const stats = {
        total: results.length,
        match: results.filter((r) => r.status === "match").length,
        partial_match: results.filter((r) => r.status === "partial_match").length,
        xrp_only: results.filter((r) => r.status === "xrp_only").length,
        meta4_only: results.filter((r) => r.status === "meta4_only").length,
    };

    return { data: results, stats };
}

/* ─── Component ─── */

export default function Home() {
    const [mode, setMode] = useState<Mode>("nominas");

    // ─── Nóminas state ───
    const [fileXrp, setFileXrp] = useState<File | null>(null);
    const [fileMeta4, setFileMeta4] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ApiResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [showDescuadresOnly, setShowDescuadresOnly] = useState(false);
    const [showConvenioDescuadresOnly, setShowConvenioDescuadresOnly] = useState(false);
    const [showBothSystemsOnly, setShowBothSystemsOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [matchBy, setMatchBy] = useState<"dni" | "id">("dni");

    // ─── Conceptos state ───
    const [conceptFileXrp, setConceptFileXrp] = useState<File | null>(null);
    const [conceptFileMeta4, setConceptFileMeta4] = useState<File | null>(null);
    const [conceptLoading, setConceptLoading] = useState(false);
    const [conceptResult, setConceptResult] = useState<ConceptResult | null>(null);
    const [conceptError, setConceptError] = useState<string | null>(null);

    // ─── Nóminas logic ───
    const canSubmitNominas = fileXrp && fileMeta4 && !loading;

    const handleSubmitNominas = async () => {
        if (!fileXrp || !fileMeta4) return;
        setLoading(true);
        setError(null);
        setResult(null);
        setSortKey(null);
        setSortDir("asc");

        try {
            const formData = new FormData();
            formData.append("file_xrp", fileXrp);
            formData.append("file_meta4", fileMeta4);
            formData.append("match_by", matchBy);

            const res = await fetch("/api/process", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => null);
                throw new Error(errBody?.detail || `Error del servidor (${res.status})`);
            }

            const data: ApiResponse = await res.json();
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error inesperado");
        } finally {
            setLoading(false);
        }
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    const visibleData = useMemo(() => {
        if (!result) return [];
        let rows = [...result.data];
        if (showBothSystemsOnly) rows = rows.filter((r) => r._merge === "both");
        if (showDescuadresOnly) rows = rows.filter((r) => Math.abs(r.diferencia) > 0.01);
        if (showConvenioDescuadresOnly) rows = rows.filter((r) => r.convenio_match === "NO COINCIDE");
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            rows = rows.filter((r) => r.nombre.toLowerCase().includes(q) || r.id_empleado.toLowerCase().includes(q));
        }
        if (sortKey) {
            rows.sort((a, b) => {
                const av = a[sortKey];
                const bv = b[sortKey];
                if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
                const an = parseFloat(String(av));
                const bn = parseFloat(String(bv));
                if (!isNaN(an) && !isNaN(bn)) return sortDir === "asc" ? an - bn : bn - an;
                const as = String(av ?? "").toLowerCase();
                const bs = String(bv ?? "").toLowerCase();
                if (as < bs) return sortDir === "asc" ? -1 : 1;
                if (as > bs) return sortDir === "asc" ? 1 : -1;
                return 0;
            });
        }
        return rows;
    }, [result, showBothSystemsOnly, showDescuadresOnly, showConvenioDescuadresOnly, searchQuery, sortKey, sortDir]);

    // ─── Conceptos logic ───
    const canSubmitConceptos = conceptFileXrp && conceptFileMeta4 && !conceptLoading;

    const handleSubmitConceptos = async () => {
        if (!conceptFileXrp || !conceptFileMeta4) return;
        setConceptLoading(true);
        setConceptError(null);
        setConceptResult(null);

        try {
            const [xrpData, meta4Data] = await Promise.all([
                readExcelColumns(conceptFileXrp),
                readExcelColumns(conceptFileMeta4),
            ]);
            const result = compareConceptos(xrpData, meta4Data);
            setConceptResult(result);
        } catch (err) {
            setConceptError(err instanceof Error ? err.message : "Error inesperado al procesar los ficheros");
        } finally {
            setConceptLoading(false);
        }
    };

    // ─── Mode config ───
    const modeConfig = {
        nominas: {
            titleHighlight: "Nóminas",
            subtitle: "Sube los ficheros de haberes de XRP y Meta4 para detectar discrepancias automáticamente.",
            labelXrp: "Fichero de Haberes XRP",
            labelMeta4: "Fichero de Haberes Meta4",
            buttonText: "Generar Comparativa",
        },
        conceptos: {
            titleHighlight: "Conceptos",
            subtitle: "Sube los ficheros de conceptos de XRP y Meta4 para identificar correspondencias y discrepancias.",
            labelXrp: "Fichero de Conceptos XRP",
            labelMeta4: "Fichero de Conceptos Meta4",
            buttonText: "Generar Comparativa de Conceptos",
        },
    };

    const cfg = modeConfig[mode];
    const isNominas = mode === "nominas";

    return (
        <main className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                {/* Back to Hub */}
                <div className="mb-6 flex justify-center text-center">
                    <Link href="/" className="inline-flex items-center self-start gap-2 text-sm text-brand-600 hover:text-brand-800 font-medium transition-colors">
                        <span>&larr;</span> Volver al Menú Principal
                    </Link>
                </div>

                {/* Header */}
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-3">
                        Comparativa de{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-800 transition-all duration-300">
                            {cfg.titleHighlight}
                        </span>
                    </h1>
                    <p className="text-lg text-slate-500 max-w-xl mx-auto transition-all duration-300">
                        {cfg.subtitle}
                    </p>
                </header>

                {/* Mode Selector — Pill segmented control */}
                <div className="flex justify-center mb-10">
                    <div className="relative inline-flex bg-slate-100 rounded-xl p-1 shadow-inner">
                        {/* Sliding indicator */}
                        <div
                            className={`
                                absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-md
                                transition-transform duration-300 ease-out
                                ${mode === "conceptos" ? "translate-x-[calc(100%+4px)]" : "translate-x-0"}
                            `}
                        />
                        <button
                            onClick={() => setMode("nominas")}
                            className={`
                                relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold
                                transition-colors duration-200
                                ${isNominas ? "text-brand-700" : "text-slate-500 hover:text-slate-700"}
                            `}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="18" rx="2" />
                                <path d="M8 7v10M12 7v10M16 7v10" />
                            </svg>
                            Nóminas
                        </button>
                        <button
                            onClick={() => setMode("conceptos")}
                            className={`
                                relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold
                                transition-colors duration-200
                                ${!isNominas ? "text-brand-700" : "text-slate-500 hover:text-slate-700"}
                            `}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                            Conceptos
                        </button>
                    </div>
                </div>

                {/* ═══════════ MODE: NÓMINAS ═══════════ */}
                <div className={`transition-all duration-300 ${isNominas ? "opacity-100" : "opacity-0 h-0 overflow-hidden pointer-events-none"}`}>
                    {/* Upload section */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <DropZone label={cfg.labelXrp} file={fileXrp} onFile={setFileXrp} icon="xrp" />
                        <DropZone label={cfg.labelMeta4} file={fileMeta4} onFile={setFileMeta4} icon="meta4" />
                    </section>

                    <div className="flex justify-center mb-4">
                        <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700">
                            Comparar por:
                            <select
                                value={matchBy}
                                onChange={(e) => setMatchBy(e.target.value as "dni" | "id")}
                                className="border border-slate-300 bg-white rounded-md px-2 py-1 text-sm"
                            >
                                <option value="dni">DNI</option>
                                <option value="id">ID empleado</option>
                            </select>
                        </label>
                    </div>

                    {/* Action button */}
                    <div className="flex justify-center mb-12">
                        <button
                            onClick={handleSubmitNominas}
                            disabled={!canSubmitNominas}
                            className={`
                                inline-flex items-center gap-3 px-8 py-3.5
                                rounded-xl font-semibold text-base
                                transition-all duration-200 ease-out
                                focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2
                                ${canSubmitNominas
                                    ? "bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-lg shadow-brand-200/40 hover:shadow-xl hover:shadow-brand-200/50 hover:-translate-y-0.5"
                                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                }
                            `}
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin-slow h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                    </svg>
                                    Procesando…
                                </>
                            ) : (
                                <>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                                        <path d="M12 12v9" />
                                        <path d="m8 17 4 4 4-4" />
                                    </svg>
                                    {cfg.buttonText}
                                </>
                            )}
                        </button>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-8 mx-auto max-w-2xl p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                            <strong className="font-semibold">Error:</strong> {error}
                        </div>
                    )}

                    {/* Nóminas Results */}
                    {result && (
                        <section className="space-y-6">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 gap-4">
                                <div className="flex flex-col gap-3">
                                    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                                        <div className="relative">
                                            <input type="checkbox" checked={showBothSystemsOnly} onChange={(e) => setShowBothSystemsOnly(e.target.checked)} className="sr-only peer" />
                                            <div className="w-11 h-6 rounded-full bg-slate-200 peer-checked:bg-brand-500 transition-colors" />
                                            <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-700">Mostrar solo empleados en ambos sistemas</span>
                                    </label>
                                    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                                        <div className="relative">
                                            <input type="checkbox" checked={showDescuadresOnly} onChange={(e) => setShowDescuadresOnly(e.target.checked)} className="sr-only peer" />
                                            <div className="w-11 h-6 rounded-full bg-slate-200 peer-checked:bg-red-500 transition-colors" />
                                            <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-700">Ocultar coincidencias (ver descuadres dinero)</span>
                                    </label>
                                    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                                        <div className="relative">
                                            <input type="checkbox" checked={showConvenioDescuadresOnly} onChange={(e) => setShowConvenioDescuadresOnly(e.target.checked)} className="sr-only peer" />
                                            <div className="w-11 h-6 rounded-full bg-slate-200 peer-checked:bg-orange-500 transition-colors" />
                                            <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-700">Ocultar coincidencias (ver descuadres Convenio)</span>
                                    </label>
                                </div>

                                <div className="relative w-full sm:w-72">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Buscar por nombre o ID…"
                                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white shadow-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-shadow"
                                    />
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="text-sm text-slate-500 bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm">
                                        Mostrando <strong className="text-slate-800">{visibleData.length}</strong> de <strong className="text-slate-800">{result.total_rows}</strong> filas
                                    </div>
                                    <DownloadButton data={visibleData} />
                                </div>
                            </div>

                            <ResultsTable data={visibleData} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                        </section>
                    )}
                </div>

                {/* ═══════════ MODE: CONCEPTOS ═══════════ */}
                <div className={`transition-all duration-300 ${!isNominas ? "opacity-100" : "opacity-0 h-0 overflow-hidden pointer-events-none"}`}>
                    {/* Upload section */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <DropZone label={cfg.labelXrp} file={conceptFileXrp} onFile={setConceptFileXrp} icon="xrp" />
                        <DropZone label={cfg.labelMeta4} file={conceptFileMeta4} onFile={setConceptFileMeta4} icon="meta4" />
                    </section>

                    {/* Action button */}
                    <div className="flex justify-center mb-12">
                        <button
                            onClick={handleSubmitConceptos}
                            disabled={!canSubmitConceptos}
                            className={`
                                inline-flex items-center gap-3 px-8 py-3.5
                                rounded-xl font-semibold text-base
                                transition-all duration-200 ease-out
                                focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2
                                ${canSubmitConceptos
                                    ? "bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-lg shadow-brand-200/40 hover:shadow-xl hover:shadow-brand-200/50 hover:-translate-y-0.5"
                                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                }
                            `}
                        >
                            {conceptLoading ? (
                                <>
                                    <svg className="animate-spin-slow h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                    </svg>
                                    Procesando…
                                </>
                            ) : (
                                <>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                    </svg>
                                    {cfg.buttonText}
                                </>
                            )}
                        </button>
                    </div>

                    {/* Error */}
                    {conceptError && (
                        <div className="mb-8 mx-auto max-w-2xl p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                            <strong className="font-semibold">Error:</strong> {conceptError}
                        </div>
                    )}

                    {/* Conceptos Results */}
                    {conceptResult && (
                        <section className="space-y-6">
                            <ConceptsResultsTable data={conceptResult.data} stats={conceptResult.stats} />
                        </section>
                    )}
                </div>
            </div>
        </main>
    );
}
