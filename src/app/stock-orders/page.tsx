import { StockOrdersClient } from "@/components/StockOrdersClient";
import { approvedStockItems } from "@/lib/toc-data";
import { getApprovedStockItems } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function StockOrdersPage() {
  const stockItems = await getApprovedStockItems(approvedStockItems);

  return <StockOrdersClient stockItems={stockItems} />;
}
