"use client";

import { createContext, useContext, useRef, useCallback, ReactNode } from "react";

type BackHandler = () => boolean;

const PageBackContext = createContext<{
  getOnBack: () => BackHandler | null;
  setOnBack: (fn: BackHandler | null) => void;
}>({ getOnBack: () => null, setOnBack: () => {} });

export function PageBackProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<BackHandler | null>(null);
  const getOnBack = useCallback(() => handlerRef.current, []);
  const setOnBack = useCallback((fn: BackHandler | null) => {
    handlerRef.current = fn;
  }, []);
  return (
    <PageBackContext.Provider value={{ getOnBack, setOnBack }}>
      {children}
    </PageBackContext.Provider>
  );
}

export function usePageBack() {
  return useContext(PageBackContext);
}
