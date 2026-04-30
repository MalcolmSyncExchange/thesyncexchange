export type AuthMode = "supabase" | "demo" | "misconfigured";
export type DeploymentTarget = "local" | "preview" | "production";
export type ForgotPasswordActionState = {
  status: "idle" | "success" | "error";
  message: string;
  email?: string;
};
export type ForgotPasswordLogger = (event: string, message: string, context?: Record<string, unknown>) => void;
export type ForgotPasswordErrorLogger = (event: string, error: unknown, context?: Record<string, unknown>) => void;
export type SupabasePasswordResetClient = {
  auth: {
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo: string }
    ) => Promise<{ data: unknown; error: { code?: string; status?: number; message: string } | null }>;
  };
};

export const DEMO_ACCOUNT_NOT_FOUND_MESSAGE = "No demo account was found for that email. Create an account first.";
export const SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE =
  "Supabase authentication is not configured. Check the public Supabase URL and anon key before signing in.";
export const FORGOT_PASSWORD_SUCCESS_MESSAGE = "If an account exists for this email, we sent password reset instructions.";
export const FORGOT_PASSWORD_UNAVAILABLE_MESSAGE = "Password reset is temporarily unavailable. Please try again shortly.";
export const RESET_PASSWORD_SESSION_MISSING_MESSAGE =
  "Your password reset session is missing or expired. Request a new reset link and try again.";
export const RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE =
  "This password reset link format cannot be completed securely. Request a new reset link and try again.";

export function normalizeAuthEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function resolveAuthMode({
  hasSupabaseEnv,
  demoMode
}: {
  hasSupabaseEnv: boolean;
  demoMode: boolean;
}): AuthMode {
  if (demoMode) {
    return "demo";
  }

  return hasSupabaseEnv ? "supabase" : "misconfigured";
}

export function shouldRequestSupabasePasswordReset(authMode: AuthMode) {
  return authMode === "supabase";
}

export function getMissingLoginAccountMessage(authMode: AuthMode) {
  return authMode === "demo" ? DEMO_ACCOUNT_NOT_FOUND_MESSAGE : SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE;
}

export function buildAuthCallbackRedirectUrl({
  appUrl,
  deploymentTarget,
  nextPath
}: {
  appUrl: string;
  deploymentTarget: DeploymentTarget;
  nextPath: string;
}) {
  let parsedAppUrl: URL;

  try {
    parsedAppUrl = new URL(appUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL is invalid. Set the public app origin before sending authentication emails.");
  }

  if (deploymentTarget === "production" && isLocalhostHost(parsedAppUrl.hostname)) {
    throw new Error("NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL points to a local-only address. Update it to the public app domain before sending authentication emails.");
  }

  if (deploymentTarget === "production" && parsedAppUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL must use https:// before sending production authentication emails.");
  }

  const callbackUrl = new URL("/auth/confirm", parsedAppUrl);
  callbackUrl.searchParams.set("next", nextPath);
  return callbackUrl.toString();
}

export function buildRecoveryConfirmPath({
  code,
  tokenHash,
  type,
  nextPath = "/reset-password"
}: {
  code?: string | null;
  tokenHash?: string | null;
  type?: string | null;
  nextPath?: string;
}) {
  const params = new URLSearchParams();

  if (code) {
    params.set("code", code);
  }

  if (tokenHash) {
    params.set("token_hash", tokenHash);
  }

  if (type) {
    params.set("type", type);
  }

  params.set("next", nextPath);
  return `/auth/confirm?${params.toString()}`;
}

export function isRecoveryAuthFlow({
  type,
  nextPath
}: {
  type?: string | null;
  nextPath: string;
}) {
  return type === "recovery" || nextPath === "/reset-password";
}

export function shouldExchangeAuthCode({
  hasCode,
  hasTokenHash,
  isRecoveryFlow,
  hasPkceVerifier
}: {
  hasCode: boolean;
  hasTokenHash: boolean;
  isRecoveryFlow: boolean;
  hasPkceVerifier: boolean;
}) {
  if (!hasCode || hasTokenHash) {
    return false;
  }

  if (isRecoveryFlow) {
    return hasPkceVerifier;
  }

  return true;
}

export function getAuthConfirmSuccessRedirectPath({
  nextPath,
  recoveryFlow
}: {
  nextPath: string;
  recoveryFlow: boolean;
}) {
  return recoveryFlow ? "/reset-password" : nextPath;
}

export function getResetPasswordRecoveryRoutingDecision({
  hasAuthParams,
  hasSession
}: {
  hasAuthParams: boolean;
  hasSession: boolean;
}): "render" | "clean-url" | "confirm" {
  if (!hasAuthParams) {
    return "render";
  }

  return hasSession ? "clean-url" : "confirm";
}

export function canUpdatePasswordWithSession(hasSession: boolean) {
  return hasSession;
}

export function resolveAuthAppOrigin({
  configuredAppUrl,
  requestOrigin,
  deploymentTarget,
  localFallbackUrl = "http://127.0.0.1:3000"
}: {
  configuredAppUrl?: string | null;
  requestOrigin?: string | null;
  deploymentTarget: DeploymentTarget;
  localFallbackUrl?: string;
}) {
  const rawCandidate = normalizeOptionalString(configuredAppUrl) || normalizeOptionalString(requestOrigin) || (deploymentTarget === "production" ? undefined : localFallbackUrl);

  if (!rawCandidate) {
    throw new Error("NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL is required before sending authentication emails.");
  }

  let parsedAppUrl: URL;

  try {
    parsedAppUrl = new URL(rawCandidate);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SITE_URL, or the request origin is not a valid URL.");
  }

  if (deploymentTarget === "production" && isLocalhostHost(parsedAppUrl.hostname)) {
    throw new Error("Authentication email redirects cannot use localhost in production.");
  }

  if (deploymentTarget === "production" && parsedAppUrl.protocol !== "https:") {
    throw new Error("Authentication email redirects must use https:// in production.");
  }

  return parsedAppUrl.origin;
}

export function buildPasswordResetRedirectUrl({
  configuredAppUrl,
  requestOrigin,
  deploymentTarget
}: {
  configuredAppUrl?: string | null;
  requestOrigin?: string | null;
  deploymentTarget: DeploymentTarget;
}) {
  return new URL(
    "/reset-password",
    resolveAuthAppOrigin({
      configuredAppUrl,
      requestOrigin,
      deploymentTarget
    })
  ).toString();
}

export async function requestPasswordResetEmail({
  authMode,
  email,
  emailDomain,
  redirectTo,
  supabase,
  logEvent,
  logError
}: {
  authMode: AuthMode;
  email: string;
  emailDomain: string | null;
  redirectTo: string;
  supabase?: SupabasePasswordResetClient;
  logEvent: ForgotPasswordLogger;
  logError: ForgotPasswordErrorLogger;
}): Promise<ForgotPasswordActionState> {
  if (authMode === "misconfigured") {
    logError("forgot_password_config_error", new Error(SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE), {
      emailDomain,
      redirectTo,
      resetPasswordForEmailCalled: false
    });
    return {
      status: "error",
      message: FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
      email
    };
  }

  if (authMode === "demo") {
    logEvent("forgot_password_demo_mode", "Password reset requested while explicit demo mode is enabled.", {
      emailDomain,
      redirectTo,
      resetPasswordForEmailCalled: false
    });
    return {
      status: "success",
      message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
      email
    };
  }

  if (!supabase) {
    logError("forgot_password_client_missing", new Error("Supabase password reset client is missing."), {
      emailDomain,
      redirectTo,
      resetPasswordForEmailCalled: false
    });
    return {
      status: "error",
      message: FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
      email
    };
  }

  logEvent("forgot_password_supabase_call_started", "Calling Supabase password reset.", {
    emailDomain,
    redirectTo,
    resetPasswordForEmailCalled: true
  });

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  logEvent("forgot_password_supabase_response", "Supabase password reset request completed.", {
    emailDomain,
    redirectTo,
    resetPasswordForEmailCalled: true,
    hasError: Boolean(error),
    supabaseErrorCode: error?.code || null,
    supabaseErrorStatus: error?.status || null,
    supabaseErrorMessage: error?.message || null,
    responseKeys: data && typeof data === "object" ? Object.keys(data) : []
  });

  if (error) {
    logError("forgot_password_failed", error, {
      emailDomain,
      redirectTo,
      resetPasswordForEmailCalled: true,
      supabaseErrorCode: error.code || null,
      supabaseErrorStatus: error.status || null,
      supabaseErrorMessage: error.message
    });
    return {
      status: "error",
      message: FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
      email
    };
  }

  return {
    status: "success",
    message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
    email
  };
}

function isLocalhostHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1";
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
