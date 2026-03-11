"use client";

import { useState, useRef, ChangeEvent, DragEvent, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DownloadButton from "@/components/DownloadButton"; // Assuming this handles array of objects

// Initialize Supabase. Requires user to set these in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rxdnylmzkqevzrlxwyri.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_orRtPGJIVhyKwjrp7C5aXQ_gY-os-rp";
const supabase = createClient(supabaseUrl, supabaseKey);

interface MigracionRow {
    id: string;
    job_id: string;
    concepto: string;
    meta4_formula: string;
    cegid_formula: string;
    logica_aplicada: string;
    anotaciones: string;
    status?: string;
    created_at: string;
}

export type SortKey = keyof MigracionRow;
export type SortDir = "asc" | "desc";

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) {
        return (
            <svg className="ml-1 inline-block w-3 h-3 opacity-30" viewBox="0 0 10 14" fill="currentColor">
                <path d="M5 0L10 5H0z" />
                <path d="M5 14L0 9H10z" />
            </svg>
        );
    }
    return (
        <svg className="ml-1 inline-block w-3 h-3 opacity-90" viewBox="0 0 10 6" fill="currentColor">
            {dir === "asc" ? <path d="M5 0L10 6H0z" /> : <path d="M5 6L0 0H10z" />}
        </svg>
    );
}

export default function MigradorPage() {
    const [fileName, setFileName] = useState("");
    const [fileFile, setFileFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Data & Realtime State
    const [jobId, setJobId] = useState<string | null>(null);
    const [results, setResults] = useState<MigracionRow[]>([]);

    // UI State
    const [searchQuery, setSearchQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    // Refs for synchronized scrolling
    const topScrollRef = useRef<HTMLDivElement>(null);
    const bottomScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState<number>(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!tableRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setTableWidth(entry.target.scrollWidth);
            }
        });
        observer.observe(tableRef.current);
        return () => observer.disconnect();
    }, [results]);

    const handleTopScroll = () => {
        if (bottomScrollRef.current && topScrollRef.current) {
            bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
        }
    };

    const handleBottomScroll = () => {
        if (topScrollRef.current && bottomScrollRef.current) {
            topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
        }
    };

    // Subscripción a Supabase Realtime
    useEffect(() => {
        if (!jobId) return;

        // Fetch existing just in case
        const fetchInitial = async () => {
            const { data } = await supabase
                .from("migracion_conceptos")
                .select("*")
                .eq("job_id", jobId);
            if (data) {
                setResults(data as MigracionRow[]);
            }
        };
        fetchInitial();

        // Subscribe to incoming rows linked to the active job_id
        const channel = supabase
            .channel(`realtime:migracion_conceptos:${jobId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "migracion_conceptos",
                    filter: `job_id=eq.${jobId}`
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setResults((prev) => [...prev, payload.new as MigracionRow]);
                    } else if (payload.eventType === 'UPDATE') {
                        setResults((prev) => prev.map(row => row.id === payload.new.id ? payload.new as MigracionRow : row));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [jobId]);

    const handleFile = (file: File) => {
        setFileName(file.name);
        setFileFile(file);
        setResults([]);
        setJobId(null);
    };

    const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleProcess = async () => {
        if (!fileFile) return;
        setIsProcessing(true);
        // Clear old state
        setResults([]);

        // Generate Unique Job ID
        const currentJobId = crypto.randomUUID();
        setJobId(currentJobId);

        try {
            const formData = new FormData();
            formData.append("file", fileFile);
            formData.append("job_id", currentJobId);

            // Fetch to the specific n8n webhook URL
            const response = await fetch("/api/migrar", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                console.error("HTTP error during upload");
                setIsProcessing(false);
                return;
            }

            // Wait out just a second so user can read "Procesando..." label
            setTimeout(() => {
                // Not closing `isProcessing` intentionally so they know it is background loading, 
                // but for UX, let's unlock button if they want to run a new one later.
                setIsProcessing(false);
            }, 2000);

        } catch (error) {
            console.error("Error procesando el archivo:", error);
            alert("Error al procesar el archivo. Inténtalo de nuevo.");
            setIsProcessing(false);
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
        let rows = [...results];

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            rows = rows.filter(
                (r) =>
                    (r.concepto && r.concepto.toLowerCase().includes(q)) ||
                    (r.meta4_formula && r.meta4_formula.toLowerCase().includes(q)) ||
                    (r.cegid_formula && r.cegid_formula.toLowerCase().includes(q))
            );
        }

        if (sortKey) {
            rows.sort((a, b) => {
                const av = String(a[sortKey] || "").toLowerCase();
                const bv = String(b[sortKey] || "").toLowerCase();
                if (av < bv) return sortDir === "asc" ? -1 : 1;
                if (av > bv) return sortDir === "asc" ? 1 : -1;
                return 0;
            });
        }
        return rows;
    }, [results, searchQuery, sortKey, sortDir]);

    return (
        <main className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <header className="text-center mb-12 animate-fade-in opacity-0" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
                    <div className="mb-6 flex justify-center text-center">
                        <Link href="/" className="inline-flex items-center self-start gap-2 text-sm text-brand-600 hover:text-brand-800 font-medium transition-colors">
                            <span>&larr;</span> Volver al Menú Principal
                        </Link>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-3">
                        Migrador de{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-800">
                            Nóminas
                        </span>
                    </h1>
                    <p className="text-lg text-slate-500 max-w-xl mx-auto">
                        Transforma pseudocódigo y lógicas de convenio automáticamente utilizando IA.
                    </p>
                </header>

                {/* Upload Panel */}
                <div className="bg-white/80 backdrop-blur-sm shadow-sm border border-slate-200 rounded-2xl p-6 sm:p-8 animate-fade-in opacity-0 max-w-4xl mx-auto" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>

                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            relative flex flex-col items-center justify-center mb-8
                            rounded-2xl border-2 border-dashed p-8 cursor-pointer
                            transition-all duration-300 ease-out min-h-[200px]
                            ${isDragging
                                ? "border-brand-500 bg-brand-50 scale-[1.02] shadow-lg shadow-brand-100/40"
                                : fileName
                                    ? "border-emerald-400 bg-emerald-50/60"
                                    : "border-slate-300 bg-white/70 hover:border-brand-400 hover:bg-brand-50/30"
                            }
                        `}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={onFileChange}
                            className="hidden"
                            accept=".csv,.xlsx,.xls"
                        />
                        <div className={`mb-4 rounded-xl p-3 transition-colors ${fileName ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-700 mb-1">Arrastra aquí o haz clic para seleccionar</h3>
                        <p className="text-xs text-slate-400">Sube tu archivo de extracción de Meta4 (.xlsx, .csv)</p>

                        {fileName && (
                            <p className="mt-3 text-xs text-emerald-700 font-medium truncate max-w-full px-4">
                                ✓ {fileName}
                            </p>
                        )}
                    </div>

                    <div className="flex justify-center pt-4 border-t border-slate-100">
                        <button
                            onClick={handleProcess}
                            disabled={!fileFile || isProcessing}
                            className={`
                                inline-flex items-center justify-center gap-3 px-8 py-3.5
                                rounded-xl font-semibold text-base
                                transition-all duration-200 ease-out
                                focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2
                                w-full sm:w-auto min-w-[260px]
                                ${(!fileFile)
                                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                    : isProcessing
                                        ? "bg-brand-400 text-white cursor-wait"
                                        : "bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-lg shadow-brand-200/40 hover:shadow-xl hover:-translate-y-0.5"
                                }
                            `}
                        >
                            {isProcessing ? (
                                <>
                                    <svg className="animate-spin-slow h-5 w-5" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                    </svg>
                                    Procesando...
                                </>
                            ) : (
                                <>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                        <line x1="12" y1="22.08" x2="12" y2="12" />
                                    </svg>
                                    Transformar con IA
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Results Section */}
                {(results.length > 0 || jobId) && (
                    <section className="space-y-6 animate-fade-in opacity-0" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
                        {/* Filters and Actions Bar */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 gap-4">
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
                                    placeholder="Buscar por concepto..."
                                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white shadow-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-shadow"
                                />
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-sm text-slate-500 bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm">
                                    Mostrando <strong className="text-slate-800">{visibleData.length}</strong> de <strong className="text-slate-800">{results.length}</strong> filas
                                </div>
                                <DownloadButton data={visibleData as any[]} />
                            </div>
                        </div>

                        {/* Replicated table styling */}
                        <div className="w-full space-y-2">
                            <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto w-full">
                                <div style={{ height: "1px", width: tableWidth ? `${tableWidth}px` : "100%" }}></div>
                            </div>

                            <div ref={bottomScrollRef} onScroll={handleBottomScroll} className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                                <table ref={tableRef} className="w-full text-left">
                                    <thead>
                                        <tr className="bg-brand-800 text-white text-[11px] uppercase tracking-wider">
                                            <th className="px-3 py-3 font-semibold cursor-pointer select-none hover:bg-brand-700 transition-colors rounded-tl-xl" onClick={() => handleSort("concepto")}>
                                                CONCEPTO <SortArrow active={sortKey === "concepto"} dir={sortDir} />
                                            </th>
                                            <th className="px-3 py-3 font-semibold cursor-pointer select-none hover:bg-brand-700 transition-colors w-[30%]" onClick={() => handleSort("meta4_formula")}>
                                                FÓRMULA META4 <SortArrow active={sortKey === "meta4_formula"} dir={sortDir} />
                                            </th>
                                            <th className="px-3 py-3 font-semibold cursor-pointer select-none hover:bg-brand-700 transition-colors w-[30%]" onClick={() => handleSort("cegid_formula")}>
                                                FÓRMULA CEGID XRP <SortArrow active={sortKey === "cegid_formula"} dir={sortDir} />
                                            </th>
                                            <th className="px-3 py-3 font-semibold cursor-pointer select-none hover:bg-brand-700 transition-colors w-[10%]" onClick={() => handleSort("status")}>
                                                ESTADO <SortArrow active={sortKey === "status"} dir={sortDir} />
                                            </th>
                                            <th className="px-3 py-3 font-semibold cursor-pointer select-none hover:bg-brand-700 transition-colors rounded-tr-xl" onClick={() => handleSort("logica_aplicada")}>
                                                LÓGICA Y ANOTACIONES <SortArrow active={sortKey === "logica_aplicada"} dir={sortDir} />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {visibleData.map((row, i) => (
                                            <tr key={row.id || i} className="table-row-hover">
                                                <td className="px-3 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">
                                                    {row.concepto}
                                                </td>
                                                <td className="px-3 py-3 text-sm text-slate-500 font-mono bg-slate-50/30">
                                                    {row.meta4_formula}
                                                </td>
                                                <td className="px-3 py-3 text-sm text-brand-700 font-mono bg-brand-50/20">
                                                    {row.cegid_formula}
                                                </td>
                                                <td className="px-3 py-3 text-sm">
                                                    {row.status === 'completado' ? (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium">✓ Completado</span>
                                                    ) : row.status === 'error' ? (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-100 text-red-700 text-xs font-medium">✕ Error</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-medium animate-pulse">⟳ Procesando</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-sm text-slate-600">
                                                    <div className="flex flex-col gap-1">
                                                        <span>{row.logica_aplicada}</span>
                                                        {row.anotaciones && (
                                                            <span className="text-xs text-amber-600 font-medium">✨ {row.anotaciones}</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {visibleData.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                                                    {isProcessing ? "Esperando la respuesta de la IA (Realtime activado)..." : "No hay resultados."}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </section>
                )}
            </div>
        </main>
    );
}
