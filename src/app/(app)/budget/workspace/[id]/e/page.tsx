import { getWorkspace } from "../data";
import { FormE } from "./form-e";

export default async function FormEPage({ params }: PageProps<"/budget/workspace/[id]/e">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const b = ws.bundle;
  const personnelBudget = b.summary.formB.rows.find((r) => r.key === "PERSONNEL")?.proposed ?? 0;
  const cert = b.submission.certification;
  return (
    <FormE
      submissionId={id}
      revision={ws.header.updatedAt}
      canEdit={ws.canEdit}
      completion={ws.header.completion.E}
      formDPersonnel={personnelBudget}
      hrCertification={cert?.hrCertifiedAt ? { name: cert.hrCertifiedByName ?? "", at: cert.hrCertifiedAt.toISOString() } : null}
      rows={b.personnel.map((p) => ({
        key: p.id,
        id: p.id,
        positionTitle: p.positionTitle,
        grade: p.grade ?? "",
        department: p.department ?? "",
        approvedEstablishment: String(p.approvedEstablishment),
        filledPositions: String(p.filledPositions),
        monthlyCost: String(p.monthlyCost),
        remarks: p.remarks ?? "",
      }))}
    />
  );
}
