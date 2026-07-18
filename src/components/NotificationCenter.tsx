"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { Bell, CheckCircle, Package, AlertCircle } from "lucide-react";

interface Notification {
    id: string;
    title: string;
    message: string;
    type: "success" | "info" | "warning";
    timestamp: Date;
}

export function NotificationCenter() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);

    useEffect(() => {
        if (!user) return;

        // Supabase Realtime subscription for merchandise_orders
        const channel = supabase
            .channel("order_updates")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "merchandise_orders",
                },
                (payload) => {
                    const newOrder = payload.new;
                    const oldOrder = payload.old;

                    // Only notify if status changed
                    if (newOrder.status !== oldOrder.status) {
                        // Check visibility: Admin sees everything, Store Manager sees their store
                        const isAdmin = user.role === "admin" || user.role === "dev" || user.role === "back_office_caller";
                        const isMyStore = user.negozio && newOrder.store.toLowerCase().includes(user.negozio.toLowerCase().split(" ").pop()?.toLowerCase() || "");

                        // Heuristic for matching: user.negozio is "Store Roma Termini", newOrder.store is "roma_centro"
                        // Let's refine the store check if needed, but for now we look for any match
                        const shouldNotify = isAdmin || isMyStore;

                        if (shouldNotify && newOrder.status === "evaso") {
                            const newNotif: Notification = {
                                id: Math.random().toString(36).substr(2, 9),
                                title: "Ordine Evaso",
                                message: `L'ordine ${newOrder.order_number || newOrder.id} è stato evaso!`,
                                type: "success",
                                timestamp: new Date(),
                            };
                            setNotifications((prev) => [newNotif, ...prev]);

                            // Remove notification after 5 seconds
                            setTimeout(() => {
                                setNotifications((prev) => prev.filter((n) => n.id !== newNotif.id));
                            }, 5000);
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    if (notifications.length === 0) return null;

    return (
        <div className="fixed top-20 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
            {notifications.map((n) => (
                <div
                    key={n.id}
                    className="pointer-events-auto flex items-start gap-3 bg-[#1e2235] border border-white/10 p-4 rounded-xl shadow-2xl animate-in slide-in-from-right-full duration-300 w-80"
                    style={{ borderLeft: `4px solid ${n.type === "success" ? "#22c55e" : "#6366f1"}` }}
                >
                    <div className="p-2 rounded-lg bg-white/5">
                        {n.type === "success" ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                            <Package className="w-5 h-5 text-indigo-500" />
                        )}
                    </div>
                    <div className="flex-1">
                        <h4 className="text-sm font-bold text-white">{n.title}</h4>
                        <p className="text-xs text-slate-400 mt-1">{n.message}</p>
                    </div>
                    <button
                        onClick={() => setNotifications((prev) => prev.filter((notif) => notif.id !== n.id))}
                        className="text-slate-500 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
