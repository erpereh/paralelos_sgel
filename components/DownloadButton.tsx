"use client";

import { useState } from "react";
import ExcelJS from "exceljs";

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

interface DownloadButtonProps {
    data: ComparisonRow[];
}

const mergeLabel: Record<string, string> = {
    both: "Ambos",
    left_only: "Solo Meta4",
    right_only: "Solo XRP",
};

export default function DownloadButton({ data }: DownloadButtonProps) {
    const [loading, setLoading] = useState(false);

    const handleDownload = async () => {
        if (!data || data.length === 0) {
            alert("No hay datos para descargar.");
            return;
        }

        setLoading(true);

        try {
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet("Comparativa Nóminas", {
                pageSetup: { paperSize: 9, orientation: "landscape" },
            });

            const cols = [
                { header: "Nombre", key: "nombre", width: 30 },
                { header: "ID Empleado", key: "id_empleado", width: 16 },
                { header: "Empresa", key: "empresa", width: 20 },
                { header: "Devengos XRP", key: "devengos_xrp", width: 16 },
                { header: "Deducciones XRP", key: "deducciones_xrp", width: 16 },
                { header: "Líquido XRP", key: "liquido_xrp", width: 16 },
                { header: "Devengos Meta4", key: "devengos_meta4", width: 16 },
                { header: "Deducciones Meta4", key: "deducciones_meta4", width: 16 },
                { header: "Líquido Meta4", key: "liquido_meta4", width: 16 },
                { header: "Diferencia", key: "diferencia", width: 14 },
                { header: "Convenio XRP", key: "convenio_xrp", width: 22 },
                { header: "Convenio Meta4", key: "convenio_meta4", width: 22 },
                { header: "Coincidencia", key: "convenio_match", width: 16 },
                { header: "Sistema", key: "sistema", width: 14 },
            ];

            ws.columns = cols;

            // Header style — only data columns
            const headerRow = ws.getRow(1);
            headerRow.height = 30;
            for (let col = 1; col <= cols.length; col++) {
                const cell = headerRow.getCell(col);
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2574F2" } } as any;
                cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
                cell.alignment = { horizontal: "center", vertical: "center", wrapText: true } as any;
            }

            // Numeric columns (1-indexed): 4,5,6,7,8,9,10
            const numericCols = new Set([4, 5, 6, 7, 8, 9, 10]);

            // Data rows
            data.forEach((row) => {
                const dataRow = ws.addRow({
                    nombre: row.nombre || "",
                    id_empleado: row.id_empleado || "",
                    empresa: row.empresa || "",
                    devengos_xrp: row.devengos_xrp ?? 0,
                    deducciones_xrp: row.deducciones_xrp ?? 0,
                    liquido_xrp: row.liquido_xrp ?? 0,
                    devengos_meta4: row.devengos_meta4 ?? 0,
                    deducciones_meta4: row.deducciones_meta4 ?? 0,
                    liquido_meta4: row.liquido_meta4 ?? 0,
                    diferencia: row.diferencia ?? 0,
                    convenio_xrp: row.convenio_xrp || "",
                    convenio_meta4: row.convenio_meta4 || "",
                    convenio_match: row.convenio_match || "",
                    sistema: mergeLabel[row._merge] || row._merge || "",
                });

                dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    cell.alignment = {
                        horizontal: numericCols.has(colNumber) ? "right" : "left",
                        vertical: "top",
                        wrapText: true,
                    } as any;
                    cell.border = {
                        top: { style: "thin", color: { argb: "FFD1D5DB" } },
                        left: { style: "thin", color: { argb: "FFD1D5DB" } },
                        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
                        right: { style: "thin", color: { argb: "FFD1D5DB" } },
                    } as any;
                    cell.font = { name: "Calibri", size: 10, color: { argb: "FF1F2937" } };

                    if (numericCols.has(colNumber)) {
                        cell.numFmt = "#,##0.00";
                    }
                });

                // Highlight rows with differences
                const hasDiff = Math.abs(row.diferencia) > 0.01;
                const convenioMismatch = row.convenio_match === "NO COINCIDE";
                if (hasDiff) {
                    dataRow.eachCell((cell) => {
                        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } } as any; // red-100
                    });
                } else if (convenioMismatch) {
                    dataRow.eachCell((cell) => {
                        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } } as any; // amber-100
                    });
                }
            });

            ws.views = [{ state: "frozen", ySplit: 1 }];

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `comparativa_nominas_${new Date().toISOString().split("T")[0]}.xlsx`;
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
