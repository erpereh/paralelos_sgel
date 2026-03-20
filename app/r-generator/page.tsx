"use client";

import { useRef, useState, DragEvent, ChangeEvent, useMemo, useDeferredValue } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import RGeneratorIssues from "@/components/RGeneratorIssues";

const API_BASE_URL =
    process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "";

const GEOGRAPHY_CODE_RULES = [
    { column: "DesPais", width: 3 },
    { column: "DesProvincia", width: 2 },
    { column: "DesPoblacion", width: 3 },
    { column: "DesPaisNacim", width: 3 },
    { column: "DesProvinciaNacim", width: 2 },
    { column: "DesPoblacionNacim", width: 3 },
];

function cleanCode(value: string) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    return text.endsWith(".0") && /^\d+\.0$/.test(text) ? text.slice(0, -2) : text;
}

function getIssueRowIds(rows: Record<string, string>[]) {
    const affectedRows = new Set<number>();

    rows.forEach((row) => {
        const rowId = Number(row.__rowId);
        for (const rule of GEOGRAPHY_CODE_RULES) {
            if (!(rule.column in row)) continue;
            const code = cleanCode(row[rule.column]);
            if (!code) continue;
            if (!(code.length === rule.width && /^\d+$/.test(code))) {
                affectedRows.add(rowId);
                break;
            }
        }
    });

    return affectedRows;
}

export default function RGeneratorPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [previewColumns, setPreviewColumns] = useState<string[]>([]);
    const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [issueRows, setIssueRows] = useState<Set<number>>(new Set());
    const [issueSummary, setIssueSummary] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const deferredFilters = useDeferredValue(filters);

    const onFile = (f: File) => {
        setFile(f);
        setError(null);
        setSuccess(false);
        setPreviewColumns([]);
        setPreviewRows([]);
        setFilters({});
        setSelectedRows(new Set());
        setIssueRows(new Set());
        setIssueSummary([]);
    };

    const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFile(e.target.files[0]);
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
            onFile(e.dataTransfer.files[0]);
        }
    };

    const handleGenerate = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch(`${API_BASE_URL}/api/generate-sgel-r`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => null);
                const errText = errJson ? "" : await res.text().catch(() => "");
                throw new Error(
                    errJson?.detail ||
                    errText ||
                    `Error del servidor (${res.status})`
                );
            }

            const blob = await res.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
            const [headerRow = [], ...dataRows] = rows;
            const columns = headerRow.map((c) => String(c || "").trim()).filter(Boolean);
            const data = dataRows.map((row, rowIndex) => {
                const record: Record<string, string> = { __rowId: String(rowIndex) };
                columns.forEach((col, idx) => {
                    record[col] = String(row[idx] ?? "");
                });
                return record;
            });
            setPreviewColumns(columns);
            setPreviewRows(data);
            setFilters({});
            const detectedIssueRows = getIssueRowIds(data);
            setSelectedRows(new Set(detectedIssueRows));
            const validationSheet = workbook.Sheets["Validaciones"];
            if (validationSheet) {
                const validationRows = XLSX.utils.sheet_to_json(validationSheet, { defval: "" }) as Array<Record<string, string | number>>;
                const affectedRows = new Set<number>();
                validationRows.forEach((validation) => {
                    const fila = Number(validation.fila);
                    if (!Number.isNaN(fila) && fila > 0) {
                        affectedRows.add(fila - 1);
                    }
                });
                const mergedRows = new Set<number>([...detectedIssueRows, ...affectedRows]);
                setIssueRows(mergedRows);
                setSelectedRows(new Set(mergedRows));
                const visibleLines = Array.from(affectedRows)
                    .sort((a, b) => a - b)
                    .map((rowId) => rowId + 1);
                const mergedLines = Array.from(mergedRows)
                    .sort((a, b) => a - b)
                    .map((rowId) => String(rowId + 1));
                setIssueSummary(mergedLines);
            } else {
                setIssueRows(detectedIssueRows);
                setIssueSummary(
                    Array.from(detectedIssueRows)
                        .sort((a, b) => a - b)
                        .map((rowId) => String(rowId + 1))
                );
            }

            setSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error inesperado");
        } finally {
            setLoading(false);
        }
    };

    const filteredRows = useMemo(() => {
        if (!previewRows.length) return [];
        return previewRows.filter((row) =>
            previewColumns.every((col) => {
                const value = deferredFilters[col];
                if (!value) return true;
                return String(row[col] ?? "").toLowerCase().includes(value.toLowerCase());
            })
        );
    }, [previewRows, previewColumns, deferredFilters]);

    const visibleRowIds = useMemo(
        () => filteredRows.map((row) => Number(row.__rowId)),
        [filteredRows]
    );

    const visibleIssueRowIds = useMemo(
        () => visibleRowIds.filter((id) => issueRows.has(id)),
        [visibleRowIds, issueRows]
    );

    const bulkSelectableRowIds = visibleIssueRowIds.length > 0 ? visibleIssueRowIds : visibleRowIds;

    const allVisibleSelected = useMemo(
        () => bulkSelectableRowIds.length > 0 && bulkSelectableRowIds.every((id) => selectedRows.has(id)),
        [bulkSelectableRowIds, selectedRows]
    );

    const handleDownloadFiltered = () => {
        if (!previewColumns.length) return;
        const rowsToDownload = selectedRows.size
            ? filteredRows.filter((row) => selectedRows.has(Number(row.__rowId)))
            : filteredRows;
        const data = [previewColumns, ...rowsToDownload.map((row) => previewColumns.map((col) => row[col] ?? ""))];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla R");
        XLSX.writeFile(wb, "Plantilla_R_Resultado.xlsx");
    };

    const toggleRow = (rowId: number) => {
        setSelectedRows((prev) => {
            const next = new Set(prev);
            if (next.has(rowId)) next.delete(rowId);
            else next.add(rowId);
            return next;
        });
    };

    const toggleAllVisible = () => {
        setSelectedRows((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                bulkSelectableRowIds.forEach((id) => next.delete(id));
            } else {
                bulkSelectableRowIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    return (
        <main className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl space-y-10">
                <header className="text-center space-y-4 animate-fade-in opacity-0" style={{ animationDelay: "80ms" }}>
                    <div className="flex justify-center">
                        <Link href="/" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800 font-medium transition-colors">
                            <span>&larr;</span> Volver al Menú Principal
                        </Link>
                    </div>
                    <div className="mx-auto max-w-3xl">
                        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
                            Generador de{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 via-brand-700 to-brand-800">
                                Plantilla R
                            </span>
                        </h1>
                        <p className="text-lg text-slate-600 mt-4">
                            Sube tu Excel y deja que la IA transforme tus columnas al formato R seleccionado sin esfuerzo.
                        </p>
                    </div>
                </header>

                <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-lg animate-fade-in opacity-0" style={{ animationDelay: "160ms" }}>
                    <div className="absolute inset-0">
                        <div className="absolute -top-20 -right-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
                        <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
                    </div>

                    <div className="relative p-6 sm:p-10">
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 ease-out cursor-pointer
                                ${isDragging
                                    ? "border-brand-500 bg-brand-50 scale-[1.01] shadow-lg shadow-brand-200/50"
                                    : file
                                        ? "border-emerald-400 bg-emerald-50/60"
                                        : "border-slate-300 bg-white/70 hover:border-brand-400 hover:bg-brand-50/40"
                                }`}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={onFileChange}
                                className="hidden"
                                accept=".xlsx,.xls,.csv"
                            />
                            <div className={`rounded-2xl p-4 flex items-center justify-center transition-all duration-300 ${
                                file
                                    ? "bg-emerald-100 text-emerald-600 shadow-inner"
                                    : "bg-slate-100 text-slate-400 border-2 border-dashed border-slate-200"
                                }`}>
                                {file ? (
                                    // Icono de Archivo Cargado (Check)
                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                    </svg>
                                ) : (
                                    // Icono de Subida (Upload)
                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                    </svg>
                                )}
                            </div>
                            <h3 className="text-base font-semibold text-slate-800">
                                Arrastra tu Excel o haz clic para seleccionar
                            </h3>
                            <p className="text-xs text-slate-500">Formatos soportados: .xlsx, .xls, .csv</p>
                            {file && (
                                <p className="mt-2 text-xs font-medium text-emerald-700 truncate max-w-full px-4">
                                    OK {file.name}
                                </p>
                            )}
                        </div>

                        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                            <div className="text-sm text-slate-500">
                                El resultado se descargará como{" "}
                                <span className="font-semibold text-slate-700">Plantilla_R_Resultado.xlsx</span>.
                            </div>
                            <button
                                onClick={handleGenerate}
                                disabled={!file || loading}
                                className={`inline-flex items-center justify-center gap-3 rounded-xl px-7 py-3.5 text-base font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2
                                    ${(!file || loading)
                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                        : "bg-brand-700 text-white hover:bg-brand-800 shadow-lg shadow-brand-200/50 hover:-translate-y-0.5"
                                    }`}
                            >
                                {loading ? (
                                    <>
                                        <svg className="h-5 w-5 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                        </svg>
                                        Procesando...
                                    </>
                                ) : (
                                    <>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="17 8 12 3 7 8" />
                                            <line x1="12" y1="3" x2="12" y2="15" />
                                        </svg>
                                        Generar Plantilla R
                                    </>
                                )}
                            </button>
                        </div>

                        {loading && (
                            <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-brand-700">
                                <span className="font-semibold">La IA está mapeando tus columnas al formato SGEL...</span>
                            </div>
                        )}

                        {error && (
                            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                                <strong className="font-semibold">Error:</strong> {error}
                            </div>
                        )}

                        {success && !loading && !error && (
                            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                                <strong className="font-semibold">Listo:</strong> Tu archivo SGEL ya está descargado.
                            </div>
                        )}
                    </div>
                </section>

                {previewColumns.length > 0 && (
                    <>
                    <RGeneratorIssues issueSummary={issueSummary} />
                    <section className="rounded-3xl border border-slate-200 bg-white/80 shadow-lg animate-fade-in opacity-0" style={{ animationDelay: "220ms" }}>
                        <div className="px-6 py-5 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Previsualización del resultado</h2>
                                <p className="text-sm text-slate-500">Mostrando todas las filas generadas por la IA.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleDownloadFiltered}
                                    className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                                >
                                    Descargar selección
                                </button>
                                <div className="text-xs text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full">
                                    Seleccionadas: <span className="font-semibold text-slate-700">{selectedRows.size}</span>
                                </div>
                                <div className="text-xs text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full">
                                    Filas visibles: <span className="font-semibold text-slate-700">{filteredRows.length}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4">
                            <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner">
                                <table className="min-w-max w-full text-sm">
                                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold border-b border-slate-200">
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-xs uppercase tracking-wide text-slate-500">Sel</span>
                                                    <button
                                                        onClick={toggleAllVisible}
                                                        type="button"
                                                        className="w-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 text-center"
                                                    >
                                                        {allVisibleSelected ? "None" : "All"}
                                                    </button>
                                                </div>
                                            </th>
                                            {previewColumns.map((col) => (
                                                <th key={col} className="px-3 py-2 text-left font-semibold border-b border-slate-200">
                                                    <div className="flex flex-col gap-2">
                                                        <span className="text-xs uppercase tracking-wide text-slate-500">{col}</span>
                                                        <input
                                                            type="text"
                                                            value={filters[col] ?? ""}
                                                            onChange={(e) => setFilters((prev) => ({ ...prev, [col]: e.target.value }))}
                                                            placeholder="Filtrar..."
                                                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                                                        />
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredRows.map((row) => (
                                            <tr
                                                key={row.__rowId}
                                                id={`preview-row-${Number(row.__rowId) + 1}`}
                                                className={`transition-colors ${
                                                    issueRows.has(Number(row.__rowId))
                                                        ? "bg-amber-50 hover:bg-amber-100/70"
                                                        : "hover:bg-slate-50"
                                                } scroll-mt-32`}
                                            >
                                                <td className="px-3 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedRows.has(Number(row.__rowId))}
                                                        onChange={() => toggleRow(Number(row.__rowId))}
                                                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                                                    />
                                                </td>
                                                {previewColumns.map((col) => (
                                                    <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                                        {row[col]}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                        {filteredRows.length === 0 && (
                                            <tr>
                                                <td colSpan={previewColumns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                                                    No hay filas que coincidan con los filtros.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                    </>
                )}
            </div>
        </main>
    );
}
