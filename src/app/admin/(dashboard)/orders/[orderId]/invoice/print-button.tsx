"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" className="mb-6" onClick={() => window.print()}>
      <PrinterIcon /> Print / save as PDF
    </Button>
  );
}
