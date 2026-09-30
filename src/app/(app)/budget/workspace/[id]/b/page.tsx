import { getWorkspace } from "../data";
import { FormB } from "./form-b";

export default async function FormBPage({ params }: PageProps<"/budget/workspace/[id]/b">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(ws.bundle.notes)) if (k.startsWith("B:")) notes[k.slice(2)] = v;
  return (
    <FormB
      submissionId={id}
      revision={ws.header.updatedAt}
      canEdit={ws.canEdit}
      year={ws.header.year}
      baseYear={ws.header.type === "REVISION" ? ws.header.year : ws.header.year - 1}
      rows={ws.bundle.summary.formB.rows}
      total={ws.bundle.summary.formB.total}
      notes={notes}
    />
  );
}
