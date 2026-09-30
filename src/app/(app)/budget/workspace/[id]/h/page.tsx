import { getWorkspace } from "../data";
import { FormH } from "./form-h";

export default async function FormHPage({ params }: PageProps<"/budget/workspace/[id]/h">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const b = ws.bundle;
  return (
    <FormH
      submissionId={id}
      revision={ws.header.updatedAt}
      canEdit={ws.canEdit}
      completion={ws.header.completion.H}
      year={ws.header.year}
      totalBudget={b.summary.formB.total.proposed}
      procurementByQuarter={b.summary.formG.byQuarter}
      rows={b.cashFlow.map((c) => ({ quarter: c.quarter, amount: String(c.amount), remarks: c.remarks ?? "" }))}
    />
  );
}
