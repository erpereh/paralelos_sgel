"use client";

import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import DropZone from "@/components/DropZone";
import ResultsTable, { SortKey, SortDir } from "@/components/ResultsTable";
import DownloadButton from "@/components/DownloadButton";
import ConceptsResultsTable, { ConceptRow } from "@/components/ConceptsResultsTable";
import ConceptsDownloadButton from "@/components/ConceptsDownloadButton";
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
    stats: { total: number; match: number; xrp_only: number; meta4_only: number };
}

/* ─── Helpers: concept comparison ─── */

function normalize(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
}

function findColumn(headers: string[], variants: string[]): string | null {
    const normalized = variants.map((v) => normalize(v));
    return headers.find((h) => normalized.includes(normalize(h))) ?? null;
}

async function readExcelAsJson(file: File): Promise<Record<string, unknown>[]> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function compareConceptos(
    xrpRows: Record<string, unknown>[],
    meta4Rows: Record<string, unknown>[]
): ConceptResult {
    // Detect XRP columns
    const xrpHeaders = xrpRows.length > 0 ? Object.keys(xrpRows[0]) : [];
    const xrpIdCol = findColumn(xrpHeaders, ["ID_CONCEPTO", "id_concepto", "Id_Concepto", "ID CONCEPTO", "Codigo", "CODIGO"]);
    const xrpNameCol = findColumn(xrpHeaders, ["NOMBRE_LARGO", "nombre_largo", "Nombre_Largo", "NOMBRE LARGO", "Descripcion", "DESCRIPCION", "Nombre"]);
    const xrpConvCol = findColumn(xrpHeaders, ["Convenio", "CONVENIO", "convenio"]);

    // Detect Meta4 columns
    const meta4Headers = meta4Rows.length > 0 ? Object.keys(meta4Rows[0]) : [];
    const meta4DescCol = findColumn(meta4Headers, ["Descripcion", "DESCRIPCION", "Descripción", "descripcion", "Nombre", "NOMBRE"]);
    const meta4ConvCol = findColumn(meta4Headers, ["Convenio", "CONVENIO", "convenio"]);

    if (!xrpNameCol) throw new Error(`No se encontró la columna de nombre/descripción en el fichero XRP. Columnas disponibles: ${xrpHeaders.join(", ")}`);
    if (!meta4DescCol) throw new Error(`No se encontró la columna de descripción en el fichero Meta4. Columnas disponibles: ${meta4Headers.join(", ")}`);

    // Build Meta4 map: normalizedDesc → { descripcion, convenio }
    interface Meta4Entry { descripcion: string; convenio: string; matched: boolean; }
    const meta4Map = new Map<string, Meta4Entry[]>();

    for (const row of meta4Rows) {
        const desc = String(row[meta4DescCol] ?? "").trim();
        if (!desc) continue;
        const conv = meta4ConvCol ? String(row[meta4ConvCol] ?? "").trim() : "";
        const key = normalize(desc);
        if (!meta4Map.has(key)) meta4Map.set(key, []);
        meta4Map.get(key)!.push({ descripcion: desc, convenio: conv, matched: false });
    }

    const results: ConceptRow[] = [];

    // Match XRP → Meta4
    for (const row of xrpRows) {
        const nombre = String(row[xrpNameCol] ?? "").trim();
        if (!nombre) continue;
        const idConcepto = xrpIdCol ? String(row[xrpIdCol] ?? "").trim() : "";
        const convenio = xrpConvCol ? String(row[xrpConvCol] ?? "").trim() : "";
        const key = normalize(nombre);

        const meta4Entries = meta4Map.get(key);
        if (meta4Entries && meta4Entries.length > 0) {
            // Take first unmatched, or first if all matched
            const entry = meta4Entries.find((e) => !e.matched) ?? meta4Entries[0];
            entry.matched = true;
            results.push({
                convenio: convenio || entry.convenio,
                id_concepto_xrp: idConcepto,
                nombre_xrp: nombre,
                descripcion_meta4: entry.descripcion,
                status: "match",
            });
        } else {
            results.push({
                convenio,
                id_concepto_xrp: idConcepto,
                nombre_xrp: nombre,
                descripcion_meta4: "",
                status: "xrp_only",
            });
        }
    }

    // Unmatched Meta4
    meta4Map.forEach((entries) => {
        for (const entry of entries) {
            if (!entry.matched) {
                results.push({
                    convenio: entry.convenio,
                    id_concepto_xrp: "",
                    nombre_xrp: "",
                    descripcion_meta4: entry.descripcion,
                    status: "meta4_only",
                });
            }
        }
    });

    const stats = {
        total: results.length,
        match: results.filter((r) => r.status === "match").length,
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
            const [xrpRows, meta4Rows] = await Promise.all([
                readExcelAsJson(conceptFileXrp),
                readExcelAsJson(conceptFileMeta4),
            ]);
            const result = compareConceptos(xrpRows, meta4Rows);
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
                            <div className="flex items-center justify-end px-2">
                                <ConceptsDownloadButton data={conceptResult.data} />
                            </div>
                            <ConceptsResultsTable data={conceptResult.data} stats={conceptResult.stats} />
                        </section>
                    )}
                </div>
            </div>
        </main>
    );
}
