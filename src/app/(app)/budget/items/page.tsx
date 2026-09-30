import type { Metadata } from "next";
import { ItemsPage } from "./items-page";

export const metadata: Metadata = { title: "Budget items" };

export default function BudgetItemsPage(props: PageProps<"/budget/items">) {
  return <ItemsPage searchParams={props.searchParams} navLabel="nav.budgetItems" />;
}
