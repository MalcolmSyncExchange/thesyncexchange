// Exact component evidence and bounded Medium/Low dispositions; never a C/H waiver.
export const NODE_VERSION='26.11.1', OPENSSL_VERSION='3.5.9';
export function requireFixedRuntime(versions) {
 if(versions.node!==NODE_VERSION||versions.openssl!==OPENSSL_VERSION)throw Error('Unreviewed Node/OpenSSL runtime; release blocked');
}
export function residualDispositions(scan,kind,policy) {
 if(policy.version!==1||!Array.isArray(policy.rows))throw Error('Missing reviewed residual policy');
 const matched=[];
 for(const result of scan.Results||[])for(const v of result.Vulnerabilities||[]) {
  if(!['MEDIUM','LOW'].includes(v.Severity))throw Error('Critical/High/unknown vulnerability cannot be dispositioned');
  const matches=policy.rows.filter(r=>r.advisory===v.VulnerabilityID&&r.package===v.PkgName&&r.installed===v.InstalledVersion&&r.severity===v.Severity&&r.images.includes(kind));
  if(matches.length!==1)throw Error('Missing or ambiguous exact residual disposition');
  const r=matches[0];
  if(!['PATCHED','REMOVED','NOT AFFECTED','NO FIX AVAILABLE','FALSE POSITIVE'].includes(r.disposition)||!r.evidence?.startsWith('https://security-tracker.debian.org/tracker/')||!r.reachability_or_risk||!r.upstream_status||!r.remediation_option||!r.scope)throw Error('Incomplete residual evidence');
  // A new vendor fix reported by the scanner invalidates an old no-fix decision.
  if(r.disposition==='NO FIX AVAILABLE'&&v.FixedVersion)throw Error('New fixed package requires re-review');
  matched.push({advisory:v.VulnerabilityID,package:v.PkgName,installed:v.InstalledVersion,severity:v.Severity,disposition:r.disposition,evidence:r.evidence});
 }
 return matched;
}
