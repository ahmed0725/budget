import { getWorkspace } from "../data";
import { FormA } from "./form-a";

export default async function FormAPage({ params }: PageProps<"/budget/workspace/[id]/a">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const s = ws.bundle.submission;
  return (
    <FormA
      submissionId={id}
      revision={ws.header.updatedAt}
      canEdit={ws.canEdit}
      completion={ws.header.completion.A}
      agency={`${s.mda.code} — ${s.mda.name}`}
      defaults={{
        allocationNumber: s.allocationNumber ?? "",
        agencyCategory: s.agencyCategory ?? "",
        accountingOfficer: s.accountingOfficer ?? "",
        contactPerson: s.contactPerson ?? "",
        telephone: s.telephone ?? "",
        email: s.email ?? "",
      }}
    />
  );
}
