import type { BuyerAsset } from "@/services/delivery/server";
import { AssetDownloadButton } from "./asset-download-button";

export function LicensedAssets({ orderId, assets, unavailable = false }: { orderId: string; assets: BuyerAsset[]; unavailable?: boolean }) {
  return <div className="space-y-4">
    {unavailable ? <p role="status">File availability could not be verified. Refresh this purchase or contact support.</p> : !assets.length ? <p>No included asset entitlements are recorded for this purchase. Your agreement is shown separately.</p> : assets.map(asset => <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div><p className="font-medium">{asset.label}</p><p className="text-sm text-muted-foreground">{asset.kind} · {asset.byteSize.toLocaleString()} bytes · {asset.available ? "Available" : "Access unavailable"}</p></div>
      <AssetDownloadButton orderId={orderId} assetId={asset.id} label={asset.label} available={asset.available}/>
    </div>)}
    <p className="text-sm text-muted-foreground">Access is checked again for every download. Refunds, disputes, expired permissions and security restrictions can suspend file access.</p>
  </div>;
}
