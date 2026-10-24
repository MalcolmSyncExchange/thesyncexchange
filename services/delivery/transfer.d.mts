export declare const MAX_ASSET_BYTES: number;
export declare const MAX_INLINE_BYTES: number;
export declare const privateDeliveryHeaders: Record<string, string>;
export declare class DeliveryFailure extends Error { code: string; constructor(code: string); }
export type AuthorizedAsset = { allowed: true; authorizationId: string; expiresAt: string; bucket: string; path: string; sha256: string; byteSize: number; mimeType: string; kind: string; assetVersionId: string; label: string };
export type Authorization = AuthorizedAsset | { allowed: false; reason: string };
export function verifyArtifact(bytes: Uint8Array, expected: { sha256: string; byteSize: number }): Uint8Array<ArrayBuffer>;
export function fetchPrivateArtifact(input: { projectUrl: string; serviceKey: string; bucket: string; path: string; byteSize: number; signal?: AbortSignal; fetcher?: typeof fetch }): Promise<Uint8Array<ArrayBuffer>>;
export function openPrivateArtifact(input: { projectUrl: string; serviceKey: string; bucket: string; path: string; byteSize: number; signal?: AbortSignal; fetcher?: typeof fetch }): Promise<Response>;
export function deliverAsset(request: Request, orderId: string, entitlementId: string, dependencies: {
 appOrigin: string;
 randomUUID(): string;
 authenticate(): Promise<{ id: string; role: string | null } | null>;
 ownsOrder(buyerId: string, orderId: string): Promise<boolean>;
 deny(orderId: string, entitlementId: string, requestId: string): Promise<void>;
 begin(buyerId: string, orderId: string, entitlementId: string, requestId: string): Promise<Authorization>;
 read(authorization: AuthorizedAsset, signal: AbortSignal): Promise<Uint8Array>;
 finish(buyerId: string, authorizationId: string, outcome: string): Promise<boolean>;
 stream?(bytes: Uint8Array, buyerId: string, authorization: AuthorizedAsset, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
 ticket?(buyerId: string, authorization: AuthorizedAsset): Promise<{ brokerUrl: string; ticket: string }>;
}): Promise<Response>;
