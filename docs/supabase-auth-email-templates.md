# Supabase Auth Email Templates

Use these templates in **Supabase Dashboard -> Authentication -> Email Templates**.

They route users through the branded interstitial page at:

- `/auth/email-action`

That page prevents one-time auth links from being consumed by email prefetching before the user intentionally clicks the final action.

## Dashboard setup before pasting templates

Supabase Dashboard -> **Authentication -> URL Configuration**

- **Site URL**
  - `https://thesyncexchange.com`
- **Additional Redirect URLs**
  - `https://thesyncexchange.com/auth/confirm`
  - `https://thesyncexchange.com/auth/email-action`
  - `https://thesyncexchange.com/reset-password`
  - `https://thesyncexchange.com/login`
  - `http://127.0.0.1:3000/auth/confirm`
  - `http://127.0.0.1:3000/auth/email-action`
  - `http://127.0.0.1:3000/reset-password`
  - `http://127.0.0.1:3000/login`

Supabase Dashboard -> **Authentication -> Email -> SMTP Settings**

- enable **Custom SMTP**
- configure Resend:
  - **Host:** `smtp.resend.com`
  - **Port:** `465` or `587`
  - **Username:** `resend`
  - **Password:** your Resend API key
  - **Sender Email:** `no-reply@thesyncexchange.com`
  - **Sender Name:** `The Sync Exchange`

Required external checks:

- the Resend sending domain must be verified
- SPF and DKIM must be green before launch
- the sender email must live on the verified domain
- test password reset and signup confirmation after these templates are saved

## Requirements

Before using these templates:

1. Set **Site URL** in Supabase Auth to your app origin.
2. Ensure your hosted app serves:
   - `/auth/email-action`
   - `/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png`
3. Keep your existing auth callback route live:
   - `/auth/confirm`

These templates use Go template variables supported by Supabase Auth, including:

- `{{ .ConfirmationURL }}`
- `{{ .Email }}`
- `{{ .NewEmail }}`
- `{{ .SiteURL }}`

They also use the Go template helper `urlquery` so the full confirmation URL can be safely embedded inside the interstitial-page link.

## Shared HTML shell

Each template below uses the same visual structure:

- light-surface primary logo
- white card
- dark primary CTA
- institutional copy tone

## Confirm Sign Up

### Subject

```text
Confirm Your Email for The Sync Exchange
```

### HTML

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f7f9fb;font-family:Inter,Arial,sans-serif;color:#16202a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7f9fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 0;text-align:center;">
                <img src="{{ .SiteURL }}/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png" alt="The Sync Exchange" width="196" style="display:inline-block;width:196px;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #d8dee6;border-radius:18px;padding:40px 32px;">
                <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6b7684;font-weight:700;margin-bottom:16px;">Account Verification</div>
                <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.15;font-weight:700;color:#16202a;">Confirm Your Email</h1>
                <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#4d5968;">Confirm your email address to activate your account and continue into The Sync Exchange.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#16202a" style="border-radius:999px;">
                      <a href="{{ .SiteURL }}/auth/email-action?flow=signup&confirmation_url={{ urlquery .ConfirmationURL }}&email={{ urlquery .Email }}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#f8fafc;text-decoration:none;">
                        Continue Securely
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="padding-top:20px;border-top:1px solid #e6ebf0;font-size:13px;line-height:1.7;color:#6b7684;">
                  This link is for <strong>{{ .Email }}</strong>. If you did not create this account, you can safely ignore this email.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Invite User

### Subject

```text
You’re Invited to The Sync Exchange
```

### HTML

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f7f9fb;font-family:Inter,Arial,sans-serif;color:#16202a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7f9fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 0;text-align:center;">
                <img src="{{ .SiteURL }}/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png" alt="The Sync Exchange" width="196" style="display:inline-block;width:196px;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #d8dee6;border-radius:18px;padding:40px 32px;">
                <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6b7684;font-weight:700;margin-bottom:16px;">Invitation</div>
                <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.15;font-weight:700;color:#16202a;">You’re Invited</h1>
                <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#4d5968;">Accept your invitation to activate access to The Sync Exchange.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#16202a" style="border-radius:999px;">
                      <a href="{{ .SiteURL }}/auth/email-action?flow=invite&confirmation_url={{ urlquery .ConfirmationURL }}&email={{ urlquery .Email }}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#f8fafc;text-decoration:none;">
                        Continue Securely
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="padding-top:20px;border-top:1px solid #e6ebf0;font-size:13px;line-height:1.7;color:#6b7684;">
                  This invitation is for <strong>{{ .Email }}</strong>. If you were not expecting it, you can ignore this message.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Magic Link

### Subject

```text
Your Secure Sign-In Link
```

### HTML

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f7f9fb;font-family:Inter,Arial,sans-serif;color:#16202a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7f9fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 0;text-align:center;">
                <img src="{{ .SiteURL }}/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png" alt="The Sync Exchange" width="196" style="display:inline-block;width:196px;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #d8dee6;border-radius:18px;padding:40px 32px;">
                <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6b7684;font-weight:700;margin-bottom:16px;">Secure Access</div>
                <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.15;font-weight:700;color:#16202a;">Your Sign-In Link</h1>
                <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#4d5968;">Use the secure link below to sign in to The Sync Exchange.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#16202a" style="border-radius:999px;">
                      <a href="{{ .SiteURL }}/auth/email-action?flow=magiclink&confirmation_url={{ urlquery .ConfirmationURL }}&email={{ urlquery .Email }}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#f8fafc;text-decoration:none;">
                        Continue Securely
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="padding-top:20px;border-top:1px solid #e6ebf0;font-size:13px;line-height:1.7;color:#6b7684;">
                  This sign-in link is for <strong>{{ .Email }}</strong>. If you did not request it, no action is required.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Change Email Address

### Subject

```text
Confirm Your New Email Address
```

### HTML

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f7f9fb;font-family:Inter,Arial,sans-serif;color:#16202a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7f9fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 0;text-align:center;">
                <img src="{{ .SiteURL }}/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png" alt="The Sync Exchange" width="196" style="display:inline-block;width:196px;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #d8dee6;border-radius:18px;padding:40px 32px;">
                <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6b7684;font-weight:700;margin-bottom:16px;">Email Security</div>
                <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.15;font-weight:700;color:#16202a;">Confirm Your New Email Address</h1>
                <p style="margin:0 0 18px 0;font-size:16px;line-height:1.7;color:#4d5968;">Review and confirm your updated email address below.</p>
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.7;color:#16202a;"><strong>Current:</strong> {{ .Email }}<br /><strong>New:</strong> {{ .NewEmail }}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#16202a" style="border-radius:999px;">
                      <a href="{{ .SiteURL }}/auth/email-action?flow=email_change&confirmation_url={{ urlquery .ConfirmationURL }}&email={{ urlquery .Email }}&new_email={{ urlquery .NewEmail }}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#f8fafc;text-decoration:none;">
                        Continue Securely
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="padding-top:20px;border-top:1px solid #e6ebf0;font-size:13px;line-height:1.7;color:#6b7684;">
                  If you did not request this change, do not continue.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Reset Password

### Subject

```text
Reset Your The Sync Exchange Password
```

### HTML

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f7f9fb;font-family:Inter,Arial,sans-serif;color:#16202a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7f9fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 0;text-align:center;">
                <img src="{{ .SiteURL }}/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png" alt="The Sync Exchange" width="196" style="display:inline-block;width:196px;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #d8dee6;border-radius:18px;padding:40px 32px;">
                <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6b7684;font-weight:700;margin-bottom:16px;">Account Recovery</div>
                <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.15;font-weight:700;color:#16202a;">Reset Your Password</h1>
                <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#4d5968;">Use the secure link below to continue your password reset.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#16202a" style="border-radius:999px;">
                      <a href="{{ .SiteURL }}/auth/email-action?flow=recovery&confirmation_url={{ urlquery .ConfirmationURL }}&email={{ urlquery .Email }}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#f8fafc;text-decoration:none;">
                        Continue Securely
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="padding-top:20px;border-top:1px solid #e6ebf0;font-size:13px;line-height:1.7;color:#6b7684;">
                  If you did not request a password reset, you can ignore this message.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Reauthentication

### Subject

```text
Confirm This Secure Action
```

### HTML

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f7f9fb;font-family:Inter,Arial,sans-serif;color:#16202a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7f9fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 18px 0;text-align:center;">
                <img src="{{ .SiteURL }}/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png" alt="The Sync Exchange" width="196" style="display:inline-block;width:196px;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #d8dee6;border-radius:18px;padding:40px 32px;">
                <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6b7684;font-weight:700;margin-bottom:16px;">Security Check</div>
                <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.15;font-weight:700;color:#16202a;">Confirm This Secure Action</h1>
                <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#4d5968;">Your verification link stays inactive until you continue from the secure page below.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#16202a" style="border-radius:999px;">
                      <a href="{{ .SiteURL }}/auth/email-action?flow=reauthentication&confirmation_url={{ urlquery .ConfirmationURL }}&email={{ urlquery .Email }}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#f8fafc;text-decoration:none;">
                        Continue Securely
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="padding-top:20px;border-top:1px solid #e6ebf0;font-size:13px;line-height:1.7;color:#6b7684;">
                  Verification code: <strong>{{ .Token }}</strong>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```
