import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Convertidor de Archivos',
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
