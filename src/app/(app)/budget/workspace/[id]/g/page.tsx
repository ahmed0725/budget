import { getFormLookups, getWorkspace } from "../data";
import { FormG } from "./form-g";

export default async function FormGPage({ params }: PageProps<"/budget/workspace/[id]/g">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const b = ws.bundle;
  const lookups = await getFormLookups();
  const eligibleCategories = b.categories.filter((c) => c.kind === "EXPENDITURE" && !c.isCapital);
  const proposedByCategory = Object.fromEntries(b.summary.formD.rows.map((r) => [r.categoryId, r.proposed]));
  return (
    <FormG
      submissionId={id}
      revision={ws.header.updatedAt}
      canEdit={ws.canEdit}
      completion={ws.header.completion.G}
      methods={lookups.methods}
      categories={eligibleCategories.map((c) => ({ id: c.id, name: c.name, nameSo: c.nameSo, eligible: c.procurementEligible, proposed: proposedByCategory[c.id] ?? 0 }))}
      projects={b.capital.filter((c) => c.projectId).map((c) => ({ id: c.projectId!, name: c.name, allocation: c.allocation }))}
      eligibleTotal={b.summary.totals.procurementEligible}
      noProcurement={Boolean(b.notes["G:NO_PROCUREMENT"])}
      rows={b.procurement.map((p) => ({
        key: p.id,
        id: p.id,
        itemDescription: p.itemDescription,
        estimatedCost: String(p.estimatedCost),
        procurementMethodId: p.procurementMethodId ?? "",
        quarter: p.quarter,
        responsibleDepartment: p.responsibleDepartment ?? "",
        fundedFrom: p.capitalProjectId ? `project:${p.capitalProjectId}` : p.budgetCategoryId ? `category:${p.budgetCategoryId}` : "",
        remarks: p.remarks ?? "",
      }))}
    />
  );
}
