import jsPDF from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

/**
 * Format a number for PDF output using period as thousand separator
 * (e.g. 800000 -> "800.000 FCFA").
 *
 * We use the de-DE locale because jsPDF's default Helvetica font does NOT
 * render the narrow no-break space (U+202F) that fr-FR uses for thousands —
 * this is what caused "8 0 0 / 0 0 0" instead of "800.000".
 */
export function fmtMoney(n: number | string | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  return new Intl.NumberFormat("de-DE").format(v) + " FCFA";
}

export function fmtNumber(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return new Intl.NumberFormat("de-DE").format(v);
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(v);
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function fmtDateLong(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

/** Create a new A4 portrait PDF document with Aicha Shop header. */
export function createPdf(title: string, subtitle?: string): { doc: jsPDF; cursorY: number } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text("Aicha Shop", 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(60, 60, 60);
  doc.text(title, 14, 24);

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Edite le ${fmtDateTime(new Date())}`, 14, 30);
  if (subtitle) doc.text(subtitle, 14, 35);

  doc.setDrawColor(220);
  doc.line(14, subtitle ? 38 : 33, 196, subtitle ? 38 : 33);

  return { doc, cursorY: subtitle ? 44 : 38 };
}

/** Render a key/value information block as a 2-column table (no header). */
export function pdfInfoTable(
  doc: jsPDF,
  startY: number,
  rows: [string, string][],
): number {
  autoTable(doc, {
    startY,
    theme: "plain",
    body: rows.map(([k, v]) => [
      { content: k, styles: { fontStyle: "bold", textColor: [80, 80, 80], cellWidth: 45 } },
      { content: v, styles: { textColor: [20, 20, 20] } },
    ]),
    styles: { fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 } },
    margin: { left: 14, right: 14 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 4;
}

/** Render a data table with header row. */
export function pdfDataTable(
  doc: jsPDF,
  startY: number,
  head: string[],
  body: (string | number)[][],
  opts: Partial<UserOptions> = {},
): number {
  autoTable(doc, {
    startY,
    head: [head],
    body: body.map((r) => r.map((c) => (c == null ? "" : String(c)))),
    theme: "striped",
    headStyles: { fillColor: [40, 40, 60], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    styles: { cellPadding: 2 },
    margin: { left: 14, right: 14 },
    ...opts,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 4;
}

/** Add a section title. */
export function pdfSectionTitle(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(text, 14, y);
  return y + 3;
}

/** Log a PDF export (or any custom event) into the audit trail. */
export async function logAuditEvent(params: {
  action: string;
  table_name: string;
  record_id?: string | null;
  details?: string | null;
  magasin_id?: string | null;
}): Promise<void> {
  try {
    await supabase.rpc("log_audit_event", {
      p_action: params.action,
      p_table_name: params.table_name,
      p_record_id: params.record_id ?? null,
      p_details: params.details ?? null,
      p_magasin_id: params.magasin_id ?? null,
      p_after_data: null,
    });
  } catch (e) {
    // Audit failure should never break the user action
    console.error("Audit log failed:", e);
  }
}
