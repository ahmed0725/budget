import { getFormCodes, getFormLookups, getWorkspace } from "../data";
import { FormF } from "./form-f";

export default async function FormFPage({ params }: PageProps<"/budget/workspace/[id]/f">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const b = ws.bundle;
  const capitalCategory = b.categories.find((c) => c.isCapital);
  const [codes, lookups] = await Promise.all([getFormCodes("EXPENDITURE", ws.header.year), getFormLookups()]);
  return (
    <FormF
      submissionId={id}
      revision={ws.header.updatedAt}
      canEdit={ws.canEdit}
      year={ws.header.year}
      completion={ws.header.completion.F}
      codes={codes.filter((c) => c.categoryId === capitalCategory?.id)}
      fundingSources={lookups.funding}
      noCapital={Boolean(b.notes["F:NO_CAPITAL"])}
      rows={b.capital.map((c) => ({
        key: c.lineId,
        lineId: c.lineId,
        projectId: c.projectId,
        projectCode: c.projectCode ?? "",
        name: c.name,
        location: c.location ?? "",
        description: c.description ?? "",
        justification: c.justification ?? "",
        budgetCodeId: c.budgetCodeId,
        totalCost: String(c.totalCost),
        spentToDate: String(c.spentToDate),
        allocation: String(c.allocation),
        priorApproved: c.priorApproved,
        fundingSourceId: c.fundingSourceId ?? "",
        fundingType: c.fundingType,
        projectType: c.projectType,
        isMultiYear: c.isMultiYear,
        startYear: c.startYear ? String(c.startYear) : "",
        expectedCompletionDate: c.expectedCompletionDate ?? "",
        status: c.status,
      }))}
    />
  );
}
