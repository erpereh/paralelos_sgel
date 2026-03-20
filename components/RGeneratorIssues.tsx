"use client";

type RGeneratorIssuesProps = {
    issueSummary: string[];
};

export default function RGeneratorIssues({ issueSummary }: RGeneratorIssuesProps) {
    if (issueSummary.length === 0) {
        return null;
    }

    return (
        <section className="rounded-3xl border border-amber-200 bg-white/80 shadow-lg animate-fade-in opacity-0" style={{ animationDelay: "200ms" }}>
            <div className="border-b border-amber-200 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Errores detectados</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Revisamos las filas donde no se pudieron convertir correctamente algunos códigos.
                </p>
            </div>
            <div className="px-6 py-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <span className="font-semibold">Errores encontrados: {issueSummary.length}</span>
                    <span className="ml-2">Filas afectadas: </span>
                    {issueSummary.map((line, index) => (
                        <span key={line}>
                            <a
                                href={`#preview-row-${line}`}
                                className="font-semibold underline decoration-amber-500 underline-offset-2 transition-colors hover:text-amber-950"
                            >
                                {line}
                            </a>
                            {index < issueSummary.length - 1 ? ", " : "."}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
