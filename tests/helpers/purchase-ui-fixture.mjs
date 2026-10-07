import fs from "node:fs/promises";
import path from "node:path";
const directory = path.resolve("app/(app)/buyer/purchase-fixture-local");
// This route exists only during an explicitly enabled localhost development test run.
export async function createPurchaseFixture() {
  const host = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3000")
    .hostname;
  if (
    process.env.SYNC_EXCHANGE_DEMO_MODE !== "true" ||
    !["localhost", "127.0.0.1"].includes(host)
  )
    throw new Error("Purchase fixtures require explicit local demo mode.");
  await fs.mkdir(directory); // Refuse to overwrite an existing route.
  await fs.writeFile(
    path.join(directory, "page.tsx"),
    `
import { notFound } from 'next/navigation';
import { ErrorPreview, PlayerPreviewButton } from './error-preview';
import { env } from '@/lib/env';
import { presentPurchase } from '@/lib/purchases/contract';
import { PurchaseDetail, PurchaseLibrary, PurchaseSkeleton } from '@/components/orders/purchase-workspace';
export default async function Fixture({ searchParams }: { searchParams: Promise<{ state?: string; view?: string }> }) {
  if (!env.demoMode || process.env.NODE_ENV !== 'development') notFound();
  const { state = 'ready', view = 'detail' } = await searchParams;
  const id = '11111111-1111-4111-8111-111111111111';
  const order = { id, buyer_user_id: 'fixture',track_id: 'fixture-track',license_type_id:'fixture-license',status:state==='refunded'?'refunded':'paid',created_at:'2026-10-01T00:00:00.000Z',paid_at:'2026-10-02T00:00:00.000Z',amount_cents:14900,currency:'USD' };
  const license = { order_id:id,buyer_id:'fixture',track_id:'fixture-track',license_type_id:'fixture-license',status:'generated',generated_at:'2026-10-02T00:00:00.000Z',pdf_storage_path:'LOCAL-NEVER-DELIVERED',agreement_number:'LOCAL-FIXTURE',terms_snapshot_json:{ orderId:id,buyer:{userId:'fixture'},track:{id:'fixture-track',title:'Midnight Run — an exceptionally long title for a multi-part cinematic recording',artistName:'Maya Sol'},license:{typeId:'fixture-license',typeName:'Online Video — Extended production and campaign license',pricePaidCents:14900,currency:'USD',permittedMedia:['None. Test transaction'],territory:'Test only',termLength:'Test only'},payment:{paymentMode:'test',livemode:false,commercialRightsGranted:false},templateVersion:'TEST'} };
  const p = presentPurchase(order,state==='processing'?{...license,status:'pending',generated_at:null,pdf_storage_path:null}:license);
  // Exception states are synthetic display facts, never production loaders or actions.
  if (['hold','disputed','partial-refund'].includes(state)) {
    const label = state==='hold'?'Security review':state==='disputed'?'Disputed':'Partially refunded';
    p.payment = {...p.payment,code:state,label,tone:'warning'};
    p.summary = {...p.summary,code:state,label,tone:'warning'};
    p.agreement = {...p.agreement,label:'Issued agreement · Historical copy',canDownload:false};
    p.hold = {...p.hold,label:state==='hold'?'Review required':'Not available'};
  }
  // UI fixture never authorizes a real download.
  if (!['ready','refunded'].includes(state)) p.agreement.canDownload = false;
  if (state==='error') return <ErrorPreview/>;
  if (state==='loading') return <PurchaseSkeleton/>;
  if (view==='list') return <PurchaseLibrary data={{items:['empty','filtered-empty'].includes(state)?[]:[p],nextCursor:null,query:state==='filtered-empty'?'missing':'',filter:'all',pageSize:25}}/>;
  return <><PlayerPreviewButton/><PurchaseDetail purchase={p}/></>;
}
`,
  );
  await fs.writeFile(
    path.join(directory, "error-preview.tsx"),
    `"use client";
import PurchaseError from '../orders/error';
import { usePreviewAudio } from '@/components/audio/preview-audio-provider';
export function ErrorPreview(){return <PurchaseError retry={()=>location.reload()}/>;}
export function PlayerPreviewButton(){const {toggle}=usePreviewAudio();return <button onClick={()=>void toggle({id:'LOCAL-PREVIEW',title:'Local Buyer preview fixture',artistName:'Fixture',artworkUrl:null,previewUrl:'/local-fixture-preview-unavailable.mp3',waveformUrl:null,durationSeconds:30})}>Start local preview fixture</button>;}
`,
  );
}
export async function removePurchaseFixture() {
  await fs.rm(directory, { recursive: true, force: true });
}
