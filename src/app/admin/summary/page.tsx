import SummaryReport from "@/components/SummaryReport";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  // The owner can correct a day's pump-test litres here; /accounts cannot.
  return <SummaryReport from={sp.from} to={sp.to} canEdit />;
}
