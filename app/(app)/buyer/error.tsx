"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useTransition} from "react";
import {Button} from "@/components/ui/button";
export default function BuyerError({reset}:{reset:()=>void}){const router=useRouter();const [pending,start]=useTransition();return <div role="alert" className="space-y-4 rounded-lg border border-border p-8"><h1 className="text-xl font-semibold">Your workspace could not be loaded.</h1><p className="text-muted-foreground">Please try again. Your saved tracks and existing purchase records are preserved.</p><div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={()=>start(()=>{router.refresh();reset();})}>{pending?"Reloading…":"Try again"}</Button><Button asChild variant="outline"><Link href="/buyer/dashboard">Buyer overview</Link></Button></div></div>;}
