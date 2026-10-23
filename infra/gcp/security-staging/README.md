# Non-executed staging infrastructure

Terraform 1.13.4 / Google provider 7.0.1, locked. `init -backend=false`, `fmt` and `validate` are local checks; no plan/apply was authorized. Proposed existing project `tse-security-staging-media` requires separately approved bootstrap/billing and availability verification. No project or billing resources exist here. Region us-east5.

Resources: four APIs, private immutable-tag Docker registry, three service accounts, two empty Secret Manager resources, authenticated gen2 broker service, worker Job, exact-resource IAM. Secret values/versions are provisioned separately; no secret data enters state. Image variables require the exact staging registry and SHA-256 digest. Worker receives no static secrets. Worker: 2 CPU/2 GiB, tasks1/parallelism1/retries0/timeout600s, 512 MiB memory scratch. Broker: 1 CPU/512 MiB, min0/max1, concurrency4, 32 MiB scratch. Non-root is enforced by pinned images.

Worker and dispatcher invoke broker. Dispatcher executes the exact Job with overrides. Broker reads only its two secret resources. No Owner/Editor/IAM-admin grants, allUsers, production references, scheduler or queue draining. Build/deploy identities remain separately reviewed prerequisites. Platform Artifact Registry service-agent read access must be verified before deployment.

Gates: reviewed source → separate D/E migration/login install → separate project/bootstrap/IaC/secret/image authorization → native gen2 runtime probe with capabilities OFF and no permit → broker identity/login/Storage dry-run checks → separate exact-job activation authorization. The four retained hosted jobs must remain untouched throughout provisioning/preflight.

Cloud Run Jobs use gen2. Local/emulated Linux tests do not prove Cloud Run Landlock/seccomp support; startup must complete the full isolation suite before claim, or exit. No fallback weakens isolation. Broker URL/audience must match the canonical project-number URL and actual Cloud Run URI before use. Output/claim reconciliation and per-Artist DB attempts remain authoritative.
