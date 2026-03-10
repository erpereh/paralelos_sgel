"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import Link from "next/link";

type ConversionType = "replace" | "add" | "remove";

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function ConverterPage() {
    const [originalContent, setOriginalContent] = useState("");
    const [convertedContent, setConvertedContent] = useState("");
    const [fileName, setFileName] = useState("");

    // Config states
    const [originalDelimiterType, setOriginalDelimiterType] = useState(";");
    const [customOriginalDelimiter, setCustomOriginalDelimiter] = useState("");
    const [newDelimiter, setNewDelimiter] = useState("#");
    const [conversionType, setConversionType] = useState<ConversionType>("replace");

    // Stats
    const [linesCount, setLinesCount] = useState(0);
    const [replacementsCount, setReplacementsCount] = useState(0);

    // UI state
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                setOriginalContent(e.target.result as string);
                setConvertedContent(""); // clear previous
            }
        };
        reader.readAsText(file, "utf-8");
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

    const getDelimiterValue = () => {
        if (originalDelimiterType === "custom") {
            return customOriginalDelimiter || "#";
        } else if (originalDelimiterType === "\\t") {
            return "\t";
        }
        return originalDelimiterType;
    };

    const handleConvert = () => {
        if (!originalContent) return;

        const originalDelimiter = getDelimiterValue();
        const targetDelimiter = newDelimiter || "#";

        if (originalDelimiter === targetDelimiter) {
            alert("El delimitador original y el nuevo no pueden ser iguales");
            return;
        }

        const lines = originalContent.split(/\r?\n/);

        const cleanLines = lines.filter(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.length === 0) return false;

            const contentWithoutDelimiters = trimmedLine.split(originalDelimiter).join('').trim();
            return contentWithoutDelimiters.length > 0;
        });

        const contentToProcess = cleanLines.join("\n");
        let result = contentToProcess;
        let diffCount = 0;

        const regex = new RegExp(escapeRegExp(originalDelimiter), "g");

        switch (conversionType) {
            case "replace":
                result = contentToProcess.replace(regex, targetDelimiter);
                diffCount = (contentToProcess.match(regex) || []).length;
                break;
            case "add":
                result = contentToProcess.replace(regex, originalDelimiter + targetDelimiter);
                diffCount = (contentToProcess.match(regex) || []).length;
                break;
            case "remove":
                result = contentToProcess.replace(regex, "");
                diffCount = (contentToProcess.match(regex) || []).length;
                break;
        }

        setConvertedContent(result);
        setLinesCount(cleanLines.length);
        setReplacementsCount(diffCount);
    };

    const downloadFile = (format: "csv" | "txt" | "tsv") => {
        if (!convertedContent) return;

        let mimeType = "text/csv;charset=utf-8;";
        let extension = "csv";

        switch (format) {
            case "txt":
                mimeType = "text/plain;charset=utf-8;";
                extension = "txt";
                break;
            case "tsv":
                mimeType = "text/tab-separated-values;charset=utf-8;";
                extension = "tsv";
                break;
            default:
                mimeType = "text/csv;charset=utf-8;";
                extension = "csv";
        }

        const blob = new Blob([convertedContent], { type: mimeType });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);

        const baseName = fileName ? fileName.replace(/\.[^/.]+$/, "") : "documento";
        link.setAttribute("download", `${baseName}_convertido.${extension}`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleClear = () => {
        setOriginalContent("");
        setConvertedContent("");
        setFileName("");
        setOriginalDelimiterType(";");
        setCustomOriginalDelimiter("");
        setNewDelimiter("#");
        setConversionType("replace");
        setLinesCount(0);
        setReplacementsCount(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <main className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <header className="flex flex-col items-center text-center">
                    <Link href="/" className="self-start text-blue-600 hover:text-blue-800 font-medium mb-4 flex items-center gap-2">
                        <span>&larr;</span> Volver al Menú Principal
                    </Link>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-2">
                        Convertidor de Delimitadores
                    </h1>
                    <p className="text-slate-500">Soluciones de Calidad para tu Negocio</p>
                </header>

                <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-6 sm:p-8">

                    {/* Settings Area */}
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b pb-2">Configuración de Conversión</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Delimitador Original</label>
                                <select
                                    value={originalDelimiterType}
                                    onChange={(e) => setOriginalDelimiterType(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value=";">Punto y coma (;)</option>
                                    <option value=",">Coma (,)</option>
                                    <option value="\t">Tabulador</option>
                                    <option value=" ">Espacio</option>
                                    <option value="|">Barra vertical (|)</option>
                                    <option value="custom">Personalizado</option>
                                </select>
                            </div>

                            {originalDelimiterType === "custom" && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Delimitador Original Personalizado</label>
                                    <input
                                        type="text"
                                        value={customOriginalDelimiter}
                                        onChange={(e) => setCustomOriginalDelimiter(e.target.value)}
                                        placeholder="Ej: ; o | o tab"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo Delimitador</label>
                                <input
                                    type="text"
                                    value={newDelimiter}
                                    onChange={(e) => setNewDelimiter(e.target.value)}
                                    placeholder="Ej: # o ; o ,"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Conversión</label>
                                <select
                                    value={conversionType}
                                    onChange={(e) => setConversionType(e.target.value as ConversionType)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="replace">Reemplazar delimitador</option>
                                    <option value="add">Añadir nuevo delimitador</option>
                                    <option value="remove">Eliminar delimitador original</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Dropzone Area */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`mb-8 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:bg-slate-50"
                            }`}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={onFileChange}
                            className="hidden"
                            accept=".csv,.txt,.tsv"
                        />
                        <div className="text-4xl mb-3">📁</div>
                        <h3 className="text-lg font-medium text-slate-800 mb-1">Arrastra y suelta tu archivo aquí</h3>
                        <p className="text-slate-500 text-sm">o haz clic para seleccionar</p>

                        {fileName && (
                            <div className="mt-4 inline-flex items-center text-sm font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                                ✅ {fileName} cargado correctamente
                            </div>
                        )}
                    </div>

                    {/* Actions Area */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                        <button
                            onClick={handleConvert}
                            disabled={!originalContent}
                            className={`px-6 py-2.5 rounded-lg font-medium shadow-sm transition-colors w-full sm:w-auto ${!originalContent
                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                                }`}
                        >
                            Convertir Archivo
                        </button>

                        <div className="flex items-center justify-center gap-3 w-full sm:w-auto flex-wrap">
                            <span className="text-sm font-medium text-slate-600 hidden sm:inline-block">Descargar como:</span>
                            <div className="flex flex-wrap gap-2">
                                <button disabled={!convertedContent} onClick={() => downloadFile('csv')} className="px-3 py-1.5 text-sm font-medium border border-blue-200 text-blue-700 rounded bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed">CSV</button>
                                <button disabled={!convertedContent} onClick={() => downloadFile('txt')} className="px-3 py-1.5 text-sm font-medium border border-blue-200 text-blue-700 rounded bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed">TXT</button>
                                <button disabled={!convertedContent} onClick={() => downloadFile('tsv')} className="px-3 py-1.5 text-sm font-medium border border-blue-200 text-blue-700 rounded bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed">TSV</button>
                            </div>
                        </div>

                        <button
                            onClick={handleClear}
                            className="px-6 py-2.5 text-red-600 bg-red-50 hover:bg-red-100 font-medium rounded-lg transition-colors w-full sm:w-auto"
                        >
                            Limpiar Todo
                        </button>
                    </div>

                </div>

                {/* Result Area */}
                {convertedContent && (
                    <div className="bg-slate-800 rounded-2xl shadow-sm border border-slate-700 overflow-hidden">
                        <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-white">
                            <h3 className="font-semibold text-lg">Contenido Convertido</h3>
                            <div className="flex gap-4 text-sm font-mono text-slate-300 bg-slate-800 px-4 py-1.5 rounded-lg border border-slate-700">
                                <span>{linesCount.toLocaleString()} líneas</span>
                                <span>{replacementsCount.toLocaleString()} reemplazos</span>
                            </div>
                        </div>
                        <div className="p-6">
                            <textarea
                                readOnly
                                value={convertedContent}
                                className="w-full h-64 bg-slate-800 text-slate-300 font-mono text-sm resize-none focus:outline-none custom-scrollbar"
                            />
                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}
