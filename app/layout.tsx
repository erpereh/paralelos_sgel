import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
    subsets: ["latin"],
    variable: "--font-dm-sans",
    display: "swap",
});

const jetbrains = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-jetbrains",
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        template: "%s | Quality Solutions",
        default: "Quality Solutions Hub",
    },
    description: "Plataforma de herramientas internas de Quality Solutions",
    icons: {
        icon: "/logo.png",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" className={`${dmSans.variable} ${jetbrains.variable}`}>
            <body className="font-sans antialiased text-slate-800">{children}</body>
        </html>
    );
}
