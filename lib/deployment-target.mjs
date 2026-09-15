const netlifyTargets = { production: "production", "branch-deploy": "preview", "deploy-preview": "preview", dev: "local" };
const vercelTargets = { production: "production", preview: "preview", development: "local" };
const invalidConfiguration = () => new Error("Deployment context is missing, invalid, or contradictory.");

// Use platform configuration, never request headers or URL/branch-name guesses.
export function resolveDeploymentTarget(variables, buildTarget) {
  const targets = [];
  for (const [value, mapping] of [[variables.CONTEXT, netlifyTargets], [variables.VERCEL_ENV, vercelTargets]]) {
    if (value === undefined || value === "") continue;
    if (!Object.hasOwn(mapping, value)) throw invalidConfiguration();
    targets.push(mapping[value]);
  }

  if (buildTarget !== undefined && buildTarget !== "") {
    if (!["production", "preview", "local"].includes(buildTarget)) throw invalidConfiguration();
    targets.push(buildTarget);
  }
  if (new Set(targets).size > 1) throw invalidConfiguration();

  const target = targets[0] || "local";
  const hosted = variables.NETLIFY === "true" || Boolean(variables.SITE_ID) || variables.VERCEL === "1";
  const explicitDevelopment = variables.CONTEXT === "dev" || variables.VERCEL_ENV === "development";
  if (hosted && target === "local" && !explicitDevelopment) throw invalidConfiguration();
  return target;
}
