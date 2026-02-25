"use client";

import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useState } from "react";

// This layout will wrap all authenticated routes (dashboard, pda, documenti, ecc)
export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <>
            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
            <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
                <Header onMenuClick={() => setIsSidebarOpen(true)} />
                <main className="flex-1 p-6 md:p-8 w-full max-w-[1600px] mx-auto min-w-0">
                    {children}
                </main>
            </div>
        </>
    );
}
