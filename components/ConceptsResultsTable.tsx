"use client";

import { useRef, useEffect, useState, useMemo } from "react";

export interface ConceptRow {
    convenio: string;
    id_concepto_xrp: string;
    nombre_xrp: string;
    descripcion_meta4: string;
    status: "match" | "xrp_only" | "meta4_only";
}

type SortKey = keyof ConceptRow;
type SortDir = "asc" | "desc";
type FilterTab = "all" | "match" | "xrp_only" | "meta4_only";

interface ConceptsResultsTableProps {
    data: ConceptRow[];
    stats: { total: number; match: number; xrp_only: number; meta4_only: number };
}

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

function StatusBadge({ status }: { status: ConceptRow["status"] }) {
    if (status === "match") {
        return <span className="inline-flex py-0.5 px-2.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">Coincidente</span>;
    }
    if (status === "xrp_only") {
        return <span className="inline-flex py-0.5 px-2.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">Solo XRP</span>;
    }
    return <span className="inline-flex py-0.5 px-2.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-700">Solo Meta4</span>;
}

const columns: { key: SortKey; label: string }[] = [
    { key: "convenio", label: "Convenio" },
    { key: "id_concepto_xrp", label: "ID Concepto XRP" },
    { key: "nombre_xrp", label: "Nombre XRP" },
    { key: "descripcion_meta4", label: "Descripción Meta4" },
    { key: "status", label: "Estado" },
];

const filterTabs: { key: FilterTab; label: string; color: string }[] = [
    { key: "all", label: "Todos", color: "brand" },
    { key: "match", label: "Coincidentes", color: "emerald" },
    { key: "xrp_only", label: "Solo XRP", color: "amber" },
    { key: "meta4_only", label: "Solo Meta4", color: "violet" },
];

export default function ConceptsResultsTable({ data, stats }: ConceptsResultsTableProps) {
    const topScrollRef = useRef<HTMLDivElement>(null);
    const bottomScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);

    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedConvenio, setSelectedConvenio] = useState("__all__");

    // Sync scroll
    useEffect(() => {
        if (!tableRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) setTableWidth(entry.target.scrollWidth);
        });
        observer.observe(tableRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (tableRef.current) setTableWidth(tableRef.current.scrollWidth);
    }, [data]);

    const handleTopScroll = () => {
        if (bottomScrollRef.current && topScrollRef.current)
            bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    };
    const handleBottomScroll = () => {
        if (topScrollRef.current && bottomScrollRef.current)
            topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    // Unique convenios
    const convenios = useMemo(() => {
        const set = new Set<string>();
        data.forEach((r) => { if (r.convenio) set.add(r.convenio); });
        return Array.from(set).sort();
    }, [data]);

    // Filtered + sorted
    const visibleData = useMemo(() => {
        let rows = [...data];

        if (activeFilter !== "all") {
            rows = rows.filter((r) => r.status === activeFilter);
        }

        if (selectedConvenio !== "__all__") {
            rows = rows.filter((r) => r.convenio === selectedConvenio);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            rows = rows.filter(
                (r) =>
                    r.nombre_xrp.toLowerCase().includes(q) ||
                    r.descripcion_meta4.toLowerCase().includes(q) ||
                    r.id_concepto_xrp.toLowerCase().includes(q) ||
                    r.convenio.toLowerCase().includes(q)
            );
        }

        if (sortKey) {
            rows.sort((a, b) => {
                const av = a[sortKey];
                const bv = b[sortKey];
                const as = String(av ?? "").toLowerCase();
                const bs = String(bv ?? "").toLowerCase();
                // Try numeric
                const an = parseFloat(as);
                const bn = parseFloat(bs);
                if (!isNaN(an) && !isNaN(bn)) return sortDir === "asc" ? an - bn : bn - an;
                if (as < bs) return sortDir === "asc" ? -1 : 1;
                if (as > bs) return sortDir === "asc" ? 1 : -1;
                return 0;
            });
        }

        return rows;
    }, [data, activeFilter, selectedConvenio, searchQuery, sortKey, sortDir]);

    const tabCount = (key: FilterTab) => {
        if (key === "all") return stats.total;
        return stats[key];
    };

    return (
        <div className="space-y-4">
            {/* Toolbar: tabs + convenio filter + search + counter */}
            <div className="flex flex-col gap-4">
                {/* Filter tabs */}
                <div className="flex flex-wrap items-center gap-2">
                    {filterTabs.map((tab) => {
                        const isActive = activeFilter === tab.key;
                        const count = tabCount(tab.key);
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveFilter(tab.key)}
                                className={`
                                    inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                                    transition-all duration-200
                                    ${isActive
                                        ? tab.key === "all"
                                            ? "bg-brand-600 text-white shadow-md shadow-brand-200/40"
                                            : tab.key === "match"
                                                ? "bg-emerald-600 text-white shadow-md shadow-emerald-200/40"
                                                : tab.key === "xrp_only"
                                                    ? "bg-amber-500 text-white shadow-md shadow-amber-200/40"
                                                    : "bg-violet-600 text-white shadow-md shadow-violet-200/40"
                                        : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                    }
                                `}
                            >
                                {tab.label}
                                <span className={`text-xs font-bold ${isActive ? "text-white/80" : "text-slate-400"}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Second row: convenio select + search + counter */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {/* Convenio filter */}
                    {convenios.length > 0 && (
                        <select
                            value={selectedConvenio}
                            onChange={(e) => setSelectedConvenio(e.target.value)}
                            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white shadow-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-shadow"
                        >
                            <option value="__all__">Todos los convenios</option>
                            {convenios.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    )}

                    {/* Search */}
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
                            placeholder="Buscar por nombre, ID o convenio…"
                            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white shadow-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-shadow"
                        />
                    </div>

                    {/* Counter */}
                    <div className="text-sm text-slate-500 bg-white border border-slate-200 px-4 py-2 rounded-lg shadow-sm whitespace-nowrap ml-auto">
                        Mostrando <strong className="text-slate-800">{visibleData.length}</strong> de <strong className="text-slate-800">{stats.total}</strong> conceptos
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="w-full space-y-2">
                <div
                    ref={topScrollRef}
                    onScroll={handleTopScroll}
                    className="overflow-x-auto w-full"
                >
                    <div style={{ height: "1px", width: tableWidth ? `${tableWidth}px` : "100%" }} />
                </div>

                <div
                    ref={bottomScrollRef}
                    onScroll={handleBottomScroll}
                    className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                    <table ref={tableRef} className="w-full text-left">
                        <thead>
                            <tr className="bg-brand-800 text-white text-[11px] uppercase tracking-wider">
                                {columns.map((col, i) => (
                                    <th
                                        key={col.key}
                                        className={`px-4 py-3 font-semibold cursor-pointer select-none hover:bg-brand-700 transition-colors
                                            ${i === 0 ? "rounded-tl-xl" : ""} ${i === columns.length - 1 ? "rounded-tr-xl" : ""}`}
                                        onClick={() => handleSort(col.key)}
                                    >
                                        {col.label}
                                        <SortArrow active={sortKey === col.key} dir={sortDir} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visibleData.map((row, i) => (
                                <tr
                                    key={i}
                                    className={`table-row-hover ${
                                        row.status === "match"
                                            ? "bg-emerald-50/40"
                                            : row.status === "xrp_only"
                                                ? "bg-amber-50/40"
                                                : "bg-violet-50/40"
                                    }`}
                                >
                                    <td className="px-4 py-2.5 text-sm text-slate-600 whitespace-nowrap">
                                        {row.convenio || "-"}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm font-mono font-medium text-slate-700 whitespace-nowrap">
                                        {row.id_concepto_xrp || "-"}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm text-slate-700 max-w-[300px] truncate">
                                        {row.nombre_xrp || "-"}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm text-slate-700 max-w-[300px] truncate">
                                        {row.descripcion_meta4 || "-"}
                                    </td>
                                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                        <StatusBadge status={row.status} />
                                    </td>
                                </tr>
                            ))}
                            {visibleData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm">
                                        No se encontraron conceptos con los filtros aplicados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
