"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type BackHandler = () => boolean;

const PageBackContext = createContext<{
  onBack: BackHandler | null;
  setOnBack: (fn: BackHandler | null) => void;
}>({ onBack: null, setOnBack: () => {} });

export function PageBackProvider({ children }: { children: ReactNode }) {
  const [onBack, setOnBack] = useState<BackHandler | null>(null);
  return (
    <PageBackContext.Provider value={{ onBack, setOnBack }}>
      {children}
    </PageBackContext.Provider>
  );
}

export function usePageBack() {
  return useContext(PageBackContext);
}
