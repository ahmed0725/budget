import { redirect } from "next/navigation";
import { getWorkspace } from "./data";

export default async function WorkspaceIndex({ params }: PageProps<"/budget/workspace/[id]">) {
  const { id } = await params;
  const ws = await getWorkspace(id);
  // Returned budgets open on the corrections; reviewers on the review tab; others on Form A.
  if (ws.header.status === "RETURNED" && ws.permissions.isAgency) redirect(`/budget/workspace/${id}/review`);
  if (ws.permissions.isReviewer && !ws.permissions.isAgency && ["SUBMITTED", "UNDER_REVIEW", "RECOMMENDED", "ENDORSED"].includes(ws.header.status)) redirect(`/budget/workspace/${id}/review`);
  redirect(`/budget/workspace/${id}/a`);
}
