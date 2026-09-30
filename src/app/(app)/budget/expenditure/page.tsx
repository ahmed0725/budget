import type { Metadata } from "next";
import { ItemsPage } from "../items/items-page";

export const metadata: Metadata = { title: "Expenditure budget" };

export default function ExpenditureBudgetPage(props: PageProps<"/budget/expenditure">) {
  return <ItemsPage searchParams={props.searchParams} kind="EXPENDITURE" navLabel="nav.expenditure" />;
}
