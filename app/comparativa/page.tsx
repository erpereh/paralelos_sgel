"use client";

import { useState, useMemo } from "react";
import DropZone from "@/components/DropZone";
import ResultsTable, { SortKey, SortDir } from "@/components/ResultsTable";
import DownloadButton from "@/components/DownloadButton";

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

export default function Home() {
    const [fileXrp, setFileXrp] = useState<File | null>(null);
    const [fileMeta4, setFileMeta4] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ApiResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Sorting
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    // Filters
    const [showDescuadresOnly, setShowDescuadresOnly] = useState(false);
    const [showConvenioDescuadresOnly, setShowConvenioDescuadresOnly] = useState(false);
    const [showBothSystemsOnly, setShowBothSystemsOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const canSubmit = fileXrp && fileMeta4 && !loading;

    const handleSubmit = async () => {
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

    // Filtered + sorted data (memoized)
    const visibleData = useMemo(() => {
        if (!result) return [];
        let rows = [...result.data];

        // Filter 1: Solo empleados en ambos sistemas
        if (showBothSystemsOnly) {
            rows = rows.filter((r) => r._merge === "both");
        }

        // Filter 2: Ocultar coincidencias (diferencia != 0)
        if (showDescuadresOnly) {
            rows = rows.filter((r) => Math.abs(r.diferencia) > 0.01);
        }

        // Filter 3: Ocultar coincidencias de Convenio
        if (showConvenioDescuadresOnly) {
            rows = rows.filter((r) => r.convenio_match === "NO COINCIDE");
        }

        // Filter 3: Búsqueda por nombre o ID
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            rows = rows.filter(
                (r) =>
                    r.nombre.toLowerCase().includes(q) ||
                    r.id_empleado.toLowerCase().includes(q)
            );
        }

        // Sort
        if (sortKey) {
            rows.sort((a, b) => {
                const av = a[sortKey];
                const bv = b[sortKey];
                if (typeof av === "number" && typeof bv === "number") {
                    return sortDir === "asc" ? av - bv : bv - av;
                }
                // Try numeric comparison for string fields that look like numbers (e.g. id_empleado)
                const an = parseFloat(String(av));
                const bn = parseFloat(String(bv));
                if (!isNaN(an) && !isNaN(bn)) {
                    return sortDir === "asc" ? an - bn : bn - an;
                }
                const as = String(av ?? "").toLowerCase();
                const bs = String(bv ?? "").toLowerCase();
                if (as < bs) return sortDir === "asc" ? -1 : 1;
                if (as > bs) return sortDir === "asc" ? 1 : -1;
                return 0;
            });
        }

        return rows;
    }, [result, showBothSystemsOnly, showDescuadresOnly, showConvenioDescuadresOnly, searchQuery, sortKey, sortDir]);

    return (
        <main className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="text-center mb-12">
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-3">
                        Comparativa de{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-800">
                            Nóminas
                        </span>
                    </h1>
                    <p className="text-lg text-slate-500 max-w-xl mx-auto">
                        Sube los ficheros de haberes de XRP y Meta4 para detectar
                        discrepancias automáticamente.
                    </p>
                </header>

                {/* Upload section */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <DropZone
                        label="Fichero de Haberes XRP"
                        file={fileXrp}
                        onFile={setFileXrp}
                        icon="xrp"
                    />
                    <DropZone
                        label="Fichero de Haberes Meta4"
                        file={fileMeta4}
                        onFile={setFileMeta4}
                        icon="meta4"
                    />
                </section>

                {/* Action button */}
                <div className="flex justify-center mb-12">
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={`
              inline-flex items-center gap-3 px-8 py-3.5
              rounded-xl font-semibold text-base
              transition-all duration-200 ease-out
              focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2
              ${canSubmit
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
                                Generar Comparativa
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

                {/* Results */}
                {result && (
                    <section className="space-y-6">

                        {/* Filters */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 gap-4">

                            <div className="flex flex-col gap-3">
                                <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={showBothSystemsOnly}
                                            onChange={(e) => setShowBothSystemsOnly(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 rounded-full bg-slate-200 peer-checked:bg-brand-500 transition-colors" />
                                        <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">
                                        Mostrar solo empleados en ambos sistemas
                                    </span>
                                </label>

                                <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={showDescuadresOnly}
                                            onChange={(e) => setShowDescuadresOnly(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 rounded-full bg-slate-200 peer-checked:bg-red-500 transition-colors" />
                                        <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">
                                        Ocultar coincidencias (ver descuadres dinero)
                                    </span>
                                </label>

                                <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={showConvenioDescuadresOnly}
                                            onChange={(e) => setShowConvenioDescuadresOnly(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 rounded-full bg-slate-200 peer-checked:bg-orange-500 transition-colors" />
                                        <div className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">
                                        Ocultar coincidencias (ver descuadres Convenio)
                                    </span>
                                </label>
                            </div>

                            {/* Search filter */}
                            <div className="relative w-full sm:w-72">
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                                >
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

                        <ResultsTable
                            data={visibleData}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                        />


                    </section>
                )}
            </div>
        </main>
    );
}
