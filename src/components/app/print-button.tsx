"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog; print styles hide navigation and controls. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
