import { getFormCodes, getWorkspace } from "../data";
import { LineForm } from "../line-form";

export default async function FormDPage({ params }: PageProps<"/budget/workspace/[id]/d">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const b = ws.bundle;
  const categories = b.categories.filter((c) => c.kind === "EXPENDITURE" && !c.isCapital);
  const codes = (await getFormCodes("EXPENDITURE", ws.header.year)).filter((c) => categories.some((cat) => cat.id === c.categoryId));
  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.notes)) if (k.startsWith("D:")) notes[k.slice(2)] = v;
  return (
    <LineForm
      variant="D"
      submissionId={id}
      revision={ws.header.updatedAt}
      canEdit={ws.canEdit}
      year={ws.header.year}
      baseYear={ws.header.type === "REVISION" ? ws.header.year : ws.header.year - 1}
      categories={categories}
      codes={codes}
      lines={b.expenditureLines.map((l) => ({
        key: l.id,
        id: l.id,
        budgetCodeId: l.budgetCodeId,
        description: l.description ?? "",
        amount: String(l.amount),
        priorYearActual: "",
        currentYearEstimate: "",
        justification: l.justification ?? "",
      }))}
      notes={notes}
      baselineByCode={b.baselineByCode}
      categoryBaseline={b.data.baseline.expenditureByCategory}
      completion={ws.header.completion.D}
    />
  );
}
