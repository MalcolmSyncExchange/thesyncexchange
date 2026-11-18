"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { countryOptions, collaboratorRoles, type ArtistAccountValues } from "@/lib/artist/account-contract";
import notice from "@/lib/artist/onboarding-notice.json";

const selectStyle = "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
export function ArtistIdentityFields({ values }: { values: ArtistAccountValues }) {
  const [entity, setEntity] = useState(values.entityType);
  return <fieldset className="space-y-5 rounded-lg border border-border p-5">
    <legend className="px-2 font-semibold">Private account identity</legend>
    <p className="text-sm text-muted-foreground">Only you and authorized administrators can see these details. Buyer Preview excludes this section. Do not provide identity documents, tax numbers or banking details.</p>
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="legalName">Representative’s legal name</Label><Input id="legalName" name="legalName" autoComplete="name" minLength={2} maxLength={120} defaultValue={values.legalName} required /></div>
      <div className="space-y-2"><Label htmlFor="entityType">Account ownership</Label><select className={selectStyle} id="entityType" name="entityType" value={entity} onChange={e => setEntity(e.target.value as "individual" | "company")}><option value="individual">Individual artist / sole proprietor</option><option value="company">Company / organization</option></select></div>
      <div className="space-y-2"><Label htmlFor="businessName">Legal business name {entity === "individual" ? "(optional)" : ""}</Label><Input id="businessName" name="businessName" autoComplete="organization" minLength={entity === "company" ? 2 : undefined} maxLength={160} defaultValue={values.businessName} required={entity === "company"} /></div>
      <div className="space-y-2"><Label htmlFor="country">Country of residence / business</Label><select className={selectStyle} id="country" name="country" defaultValue={values.country} required><option value="">Choose country</option>{countryOptions.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></div>
      <div className="space-y-2 md:col-span-2"><Label htmlFor="contactEmail">Private contact email</Label><Input id="contactEmail" name="contactEmail" type="email" autoComplete="email" maxLength={254} defaultValue={values.contactEmail} required /><p className="text-xs text-muted-foreground">This contact preference does not change your sign-in email. Manage sign-in access in Account Security.</p></div>
    </div>
  </fieldset>;
}
const rightsLabels = { owner: "I own or control this right", representative: "I represent the rightsholders", shared: "Shared / multiple rightsholders", none: "I do not control this right", unknown: "Details still being established" };
export function ArtistDeclarationFields({ values }: { values: ArtistAccountValues }) {
  const [status, setStatus] = useState(values.collaboratorStatus);
  const [people, setPeople] = useState(values.collaborators);
  return <fieldset className="space-y-5 rounded-lg border border-border p-5">
    <legend className="px-2 font-semibold">Rights preparation — private declarations</legend>
    <p className="text-sm text-muted-foreground">Recordings and compositions have separate rights. These account-level statements prepare later review; every submitted track needs its own evidence, permissions and approval. Unknown or shared rights do not become cleared rights.</p>
    <div className="grid gap-5 md:grid-cols-2">{[["masterRights", "Master recording rights"], ["publishingRights", "Composition / publishing rights"]].map(([key,label]) => <div className="space-y-2" key={key}><Label htmlFor={key}>{label}</Label><select className={selectStyle} id={key} name={key} defaultValue={values[key as "masterRights" | "publishingRights"]} required><option value="">Choose your current position</option>{Object.entries(rightsLabels).map(([value,text]) => <option value={value} key={value}>{text}</option>)}</select></div>)}</div>
    <div className="space-y-2"><Label htmlFor="collaboratorStatus">Contributors and collaborators</Label><select className={selectStyle} id="collaboratorStatus" name="collaboratorStatus" value={status} onChange={e => { const selected=e.target.value as typeof status;setStatus(selected);if(selected === "listed" && !people.length)setPeople([{name:"",role:"songwriter"}]); }} required><option value="unknown">Details still being confirmed</option><option value="solo">No other collaborators to declare</option><option value="listed">List known collaborators</option></select></div>
    {status === "listed" ? <div className="space-y-4">{people.map((person,index) => <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
      <div><Label htmlFor={`person-${index}`}>Collaborator {index+1} name</Label><Input id={`person-${index}`} name="collaboratorName" minLength={2} maxLength={120} required value={person.name} onChange={e => setPeople(people.map((p,i) => i===index ? {...p,name:e.target.value} : p))} /></div>
      <div><Label htmlFor={`person-role-${index}`}>Role</Label><select className={selectStyle} id={`person-role-${index}`} name="collaboratorRole" value={person.role} onChange={e => setPeople(people.map((p,i) => i===index ? {...p,role:e.target.value as typeof p.role} : p))}>{collaboratorRoles.map(role => <option key={role} value={role}>{role.replaceAll("-"," ")}</option>)}</select></div>
      <Button type="button" variant="outline" aria-label={`Remove collaborator ${index+1}`} onClick={() => setPeople(people.filter((_,i)=>i!==index))}>Remove</Button>
    </div>)}<Button type="button" variant="outline" disabled={people.length>=20} onClick={() => setPeople([...people,{name:"",role:"songwriter"}])}>Add collaborator</Button></div> : null}
    <p className="text-xs text-muted-foreground">Names and roles only. Track-specific ownership percentages, authority documents and contributor allocations are handled in their respective workflows.</p>
  </fieldset>;
}
export function ArtistNoticeField({ accepted }: { accepted: boolean }) {
  return <fieldset className="space-y-4 rounded-lg border border-border p-5">
    <legend className="px-2 font-semibold">Account acknowledgment</legend>
    <p className="text-sm leading-6">{notice.text}</p>
    <p className="flex flex-wrap gap-4 text-sm"><Link href="/terms" target="_blank" rel="noreferrer" className="underline">Read Terms of Use (draft)</Link><Link href="/privacy" target="_blank" rel="noreferrer" className="underline">Read Privacy Policy</Link></p>
    <input type="hidden" name="noticeVersion" value={notice.version} />
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="acceptNotice" required defaultChecked={accepted} className="mt-1 h-4 w-4" /><span>I acknowledge the account declaration above and the linked documents. This is not purchase-specific license acceptance.</span></label>
    <p className="text-xs text-muted-foreground">Notice version: {notice.version}. Your account, exact notice/document references and acceptance time are recorded. Commercial legal approval remains separate.</p>
  </fieldset>;
}
