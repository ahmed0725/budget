import type { Metadata } from "next";
import { ItemsPage } from "../items/items-page";

export const metadata: Metadata = { title: "Revenue budget" };

export default function RevenueBudgetPage(props: PageProps<"/budget/revenue">) {
  return <ItemsPage searchParams={props.searchParams} kind="REVENUE" navLabel="nav.revenue" />;
}
