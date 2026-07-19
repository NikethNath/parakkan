import SummaryReport from "@/components/SummaryReport";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  return <SummaryReport from={sp.from} to={sp.to} />;
}
