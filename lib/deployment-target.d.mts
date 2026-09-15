export type DeploymentTarget = "local" | "preview" | "production";

export function resolveDeploymentTarget(
  variables: Readonly<Record<string, string | undefined>>,
  buildTarget?: string
): DeploymentTarget;
