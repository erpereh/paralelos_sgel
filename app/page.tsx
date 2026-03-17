import Link from 'next/link';

export default function HubPage() {
    return (
        <main className="min-h-screen bg-slate-50 flex flex-col pt-12 sm:pt-20 px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <header className="text-center mb-16 max-w-3xl mx-auto animate-fade-in opacity-0" style={{ animationDelay: '100ms' }}>
                <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-4">
                    Quality <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-800">Solution</span>
                </h1>
                <p className="text-slate-500 text-lg md:text-xl font-medium">
                    Hub de Herramientas Internas y Análisis de Datos
                </p>
            </header>

            <div className="w-full max-w-6xl mx-auto flex-1 px-4 lg:px-8">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest text-center mb-8 animate-fade-in opacity-0" style={{ animationDelay: '200ms' }}>
                    Herramientas Disponibles
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    {/* Card Comparativa */}
                    <div
                        className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:shadow-brand-100/50 hover:border-brand-200 hover:-translate-y-1 transition-all duration-300 p-8 sm:p-10 flex flex-col text-center group animate-fade-in opacity-0"
                        style={{ animationDelay: '300ms' }}
                    >
                        <div className="w-16 h-16 mx-auto bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-sm border border-brand-100 group-hover:scale-110 group-hover:bg-brand-100 transition-all duration-300">
                            🌐
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-3">Comparativa de Nóminas y Conceptos</h3>
                        <p className="text-slate-500 mb-8 flex-1 leading-relaxed">
                            Compara haberes de nómina y conceptos entre XRP y Meta4. Detecta discrepancias y correspondencias automáticamente.
                        </p>
                        <Link
                            href="/comparativa"
                            className="w-full inline-flex justify-center items-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 shadow-md shadow-brand-200/50 hover:shadow-lg"
                        >
                            Abrir Comparador
                            <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                        </Link>
                    </div>

                    {/* Card Convertidor */}
                    <div
                        className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:shadow-slate-200/80 hover:border-slate-300 hover:-translate-y-1 transition-all duration-300 p-8 sm:p-10 flex flex-col text-center group animate-fade-in opacity-0"
                        style={{ animationDelay: '400ms' }}
                    >
                        <div className="w-16 h-16 mx-auto bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-sm border border-slate-100 group-hover:scale-110 group-hover:bg-slate-100 transition-all duration-300">
                            🔄
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-3">Convertidor de Archivos</h3>
                        <p className="text-slate-500 mb-8 flex-1 leading-relaxed">
                            Convierte y limpia archivos Excel y CSV cambiando delimitadores instantáneamente sin enviar datos al servidor.
                        </p>
                        <Link
                            href="/converter"
                            className="w-full inline-flex justify-center items-center gap-2 bg-slate-800 hover:bg-slate-900 active:bg-black text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 shadow-md shadow-slate-200/50 hover:shadow-lg"
                        >
                            Abrir Convertidor
                            <span className="group-hover:translate-x-1 transition-transform opacity-70">&rarr;</span>
                        </Link>
                    </div>

                    {/* Card Migrador Meta4 a Cegid */}
                    <div
                        className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:shadow-indigo-100/50 hover:border-indigo-200 hover:-translate-y-1 transition-all duration-300 p-8 sm:p-10 flex flex-col text-center group animate-fade-in opacity-0"
                        style={{ animationDelay: '500ms' }}
                    >
                        <div className="w-16 h-16 mx-auto bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-sm border border-indigo-100 group-hover:scale-110 group-hover:bg-indigo-100 transition-all duration-300">
                            ⚡
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-3">Migrador Meta4 a Cegid</h3>
                        <p className="text-slate-500 mb-8 flex-1 leading-relaxed">
                            Transforma pseudocódigo y conceptos de nómina de Meta4 a la formulación de Cegid XRP mediante Inteligencia Artificial.
                        </p>
                        <Link
                            href="/migrador-meta4-cegid"
                            className="w-full inline-flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-200 shadow-md shadow-indigo-200/50 hover:shadow-lg"
                        >
                            Abrir Migrador
                            <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                        </Link>
                    </div>
                </div>
            </div>

            <footer className="mt-8 py-8 text-center text-slate-400 text-sm w-full animate-fade-in opacity-0" style={{ animationDelay: '600ms' }}>
                <p className="mb-1 font-medium">&copy; 2026 Quality Solution. Todos los derechos reservados.</p>
                <p>Plataforma para la optimización de procesos y datos.</p>
            </footer>
        </main>
    );
}
