"use client";

import { useState } from "react";
import ExcelJS from "exceljs";
import type { ConceptRow } from "./ConceptsResultsTable";

interface ConceptsDownloadButtonProps {
    data: ConceptRow[];
}

const statusLabel: Record<ConceptRow["status"], string> = {
    match: "Coincidente",
    xrp_only: "Solo XRP",
    meta4_only: "Solo Meta4",
};

const statusFill: Record<ConceptRow["status"], string> = {
    match: "FFD1FAE5",       // emerald-100
    xrp_only: "FFFEF3C7",   // amber-100
    meta4_only: "FFEDE9FE",  // violet-100
};

export default function ConceptsDownloadButton({ data }: ConceptsDownloadButtonProps) {
    const [loading, setLoading] = useState(false);

    const handleDownload = async () => {
        if (!data || data.length === 0) return;
        setLoading(true);

        try {
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet("Comparativa Conceptos", {
                pageSetup: { paperSize: 9, orientation: "landscape" },
            });

            ws.columns = [
                { header: "Convenio", key: "convenio", width: 22 },
                { header: "ID Concepto XRP", key: "id_concepto_xrp", width: 18 },
                { header: "Nombre XRP", key: "nombre_xrp", width: 40 },
                { header: "Descripción Meta4", key: "descripcion_meta4", width: 40 },
                { header: "Estado", key: "status", width: 16 },
            ];

            // Header style
            const headerRow = ws.getRow(1);
            headerRow.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF2574F2" },
            } as any;
            headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
            headerRow.alignment = { horizontal: "center", vertical: "center", wrapText: true } as any;
            ws.getRow(1).height = 30;

            // Data rows
            data.forEach((row) => {
                const dataRow = ws.addRow({
                    convenio: row.convenio || "",
                    id_concepto_xrp: row.id_concepto_xrp || "",
                    nombre_xrp: row.nombre_xrp || "",
                    descripcion_meta4: row.descripcion_meta4 || "",
                    status: statusLabel[row.status],
                });

                dataRow.eachCell((cell) => {
                    cell.alignment = { horizontal: "left", vertical: "top", wrapText: true } as any;
                    cell.border = {
                        top: { style: "thin", color: { argb: "FFD1D5DB" } },
                        left: { style: "thin", color: { argb: "FFD1D5DB" } },
                        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
                        right: { style: "thin", color: { argb: "FFD1D5DB" } },
                    } as any;
                    cell.font = { name: "Calibri", size: 10, color: { argb: "FF1F2937" } };
                    cell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: statusFill[row.status] },
                    } as any;
                });
            });

            ws.views = [{ state: "frozen", ySplit: 1 }];

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `comparativa_conceptos_${new Date().toISOString().split("T")[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Error generando el Excel:", err);
            alert(err instanceof Error ? err.message : "Error descargando Excel");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleDownload}
            disabled={loading || !data || data.length === 0}
            className={`
                inline-flex items-center gap-2.5 px-6 py-3
                font-semibold rounded-xl
                shadow-md transition-all duration-200 ease-out
                focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2
                ${loading
                    ? "bg-slate-300 text-slate-500 cursor-wait"
                    : (!data || data.length === 0)
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-200/50 hover:shadow-lg hover:shadow-emerald-200/60"
                }
            `}
        >
            {loading ? (
                <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Generando…
                </>
            ) : (
                <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Descargar Excel
                </>
            )}
        </button>
    );
}
