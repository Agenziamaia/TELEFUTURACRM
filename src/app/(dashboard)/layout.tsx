"use client";

import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { PageBackProvider } from "@/context/PageBackContext";
import { useState } from "react";

// This layout will wrap all authenticated routes (dashboard, pda, documenti, ecc)
export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <PageBackProvider>
            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
            <div className="flex-1 lg:ml-64 flex flex-col min-h-screen overflow-x-hidden">
                <Header onMenuClick={() => setIsSidebarOpen(true)} />
                <main className="flex-1 w-full min-w-0 p-4 sm:p-6 md:p-8">
                    {children}
                </main>
            </div>
        </PageBackProvider>
    );
}
