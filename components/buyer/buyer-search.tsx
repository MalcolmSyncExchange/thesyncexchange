"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { useBuyerDiscovery } from "@/components/audio/buyer-discovery-provider";
import { Button } from "@/components/ui/button";
import { defaultCatalogFilters } from "@/lib/catalog-discovery";
import styles from "./buyer-workspace.module.css";

export function BuyerSearch() {
  const [query,setQuery] = useState("");
  const {setFilters} = useBuyerDiscovery();
  const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters(current => ({...defaultCatalogFilters, layout: current.layout, query: query.trim()}));
    router.push("/buyer/catalog");
  }
  return <form onSubmit={submit} role="search" className={styles.search}>
    <label htmlFor="buyer-overview-search" className="sr-only">Search music by track, artist, genre or mood</label>
    <Search aria-hidden="true" size={22} />
    <input id="buyer-overview-search" type="search" value={query} maxLength={200} onChange={event=>setQuery(event.target.value)} placeholder="Try a mood, genre or artist" />
    <Button type="submit">Find music<ArrowRight aria-hidden="true" size={18} /></Button>
  </form>;
}
