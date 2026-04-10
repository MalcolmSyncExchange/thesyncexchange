import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/services/auth/actions";

export default function ForgotPasswordPage({
  searchParams
}: {
  searchParams?: { error?: string; success?: string };
}) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={forgotPasswordAction} className="space-y-5">
          {searchParams?.error ? <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{searchParams.error}</div> : null}
          {searchParams?.success ? <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{searchParams.success}</div> : null}
          <div className="space-y-2">
            <Label>Email</Label>
            <Input name="email" type="email" placeholder="name@company.com" required />
          </div>
          <Button className="w-full" type="submit">
            Send reset instructions
          </Button>
        </form>
        <Link href="/login" className="block text-sm text-muted-foreground hover:text-foreground">
          Back to login
        </Link>
      </CardContent>
    </Card>
  );
}
