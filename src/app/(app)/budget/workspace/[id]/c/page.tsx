import { getFormCodes, getWorkspace } from "../data";
import { LineForm } from "../line-form";

export default async function FormCPage({ params }: PageProps<"/budget/workspace/[id]/c">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const b = ws.bundle;
  const categories = b.categories.filter((c) => c.kind === "REVENUE");
  const codes = await getFormCodes("REVENUE", ws.header.year);
  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.notes)) if (k.startsWith("C:") && k !== "C:NO_REVENUE") notes[k.slice(2)] = v;
  const amt = (v: number | null) => (v === null ? "" : String(v));
  return (
    <LineForm
      variant="C"
      submissionId={id}
      revision={ws.header.updatedAt}
      canEdit={ws.canEdit}
      year={ws.header.year}
      baseYear={ws.header.type === "REVISION" ? ws.header.year : ws.header.year - 1}
      categories={categories}
      codes={codes}
      lines={b.revenueLines.map((l) => ({
        key: l.id,
        id: l.id,
        budgetCodeId: l.budgetCodeId,
        description: l.description ?? "",
        amount: String(l.amount),
        priorYearActual: amt(l.priorYearActual),
        currentYearEstimate: amt(l.currentYearEstimate),
        justification: l.justification ?? "",
      }))}
      notes={notes}
      baselineByCode={b.baselineByCode}
      categoryBaseline={b.data.baseline.revenueByCategory}
      noRevenue={Boolean(b.notes["C:NO_REVENUE"])}
      completion={ws.header.completion.C}
    />
  );
}
