"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TocShell } from "@/components/TocShell";

const publicRoutes = new Set(["/", "/worker-induction"]);

export function AppShellRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = publicRoutes.has(pathname || "/");

  if (isPublicRoute) return <>{children}</>;

  return <TocShell>{children}</TocShell>;
}
