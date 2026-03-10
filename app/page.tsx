import Link from 'next/link';

export default function HubPage() {
    return (
        <main className="min-h-screen bg-slate-50 font-sans flex flex-col">
            <header className="bg-[#0b5cd5] text-white py-12 px-6 text-center shadow-md">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">Quality Solutions</h1>
                <p className="text-blue-100 text-lg md:text-xl max-w-2xl mx-auto">Soluciones de Calidad para tu Negocio</p>
            </header>

            <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-16">
                <h2 className="text-3xl font-bold text-center text-slate-800 mb-12">Herramientas</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Card Comparativa */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-300 p-8 flex flex-col items-center text-center group">
                        <div className="w-16 h-16 bg-blue-50 text-[#0b5cd5] rounded-full flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300">
                            🌐
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-3">Comparativa de Nóminas</h3>
                        <p className="text-slate-600 mb-8 flex-1">
                            Herramienta para comparar nóminas de diferentes periodos o sistemas detectando descuadres.
                        </p>
                        <Link
                            href="/comparativa"
                            className="bg-[#0b5cd5] hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors w-full sm:w-auto"
                        >
                            Visitar Plataforma
                        </Link>
                    </div>

                    {/* Card Convertidor */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-300 p-8 flex flex-col items-center text-center group">
                        <div className="w-16 h-16 bg-blue-50 text-[#0b5cd5] rounded-full flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform duration-300">
                            🔄
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-3">Convertidor de Archivos</h3>
                        <p className="text-slate-600 mb-8 flex-1">
                            Convierte archivos Excel o CSV cambiando delimitadores según tus necesidades con limpieza avanzada.
                        </p>
                        <Link
                            href="/converter"
                            className="bg-[#0b5cd5] hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors w-full sm:w-auto"
                        >
                            Usar Herramienta
                        </Link>
                    </div>
                </div>
            </div>

            <footer className="bg-white border-t border-slate-200 py-8 text-center text-slate-500 text-sm px-6">
                <p className="mb-1">&copy; 2026 Quality Solutions. Todos los derechos reservados.</p>
                <p>Transformando ideas en soluciones de calidad.</p>
            </footer>
        </main>
    );
}
