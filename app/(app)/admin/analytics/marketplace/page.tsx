import { IntelligencePage } from "@/components/admin-v2/intelligence-page";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
 return <IntelligencePage view="marketplace" params={await searchParams} />;
}
