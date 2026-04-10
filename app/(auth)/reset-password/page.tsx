import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordAction } from "@/services/auth/actions";

export default function ResetPasswordPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Create a new password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={updatePasswordAction} className="space-y-5">
          {searchParams?.error ? <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{searchParams.error}</div> : null}
          <div className="space-y-2">
            <Label>New password</Label>
            <Input name="password" type="password" required />
          </div>
          <div className="space-y-2">
            <Label>Confirm password</Label>
            <Input name="confirmPassword" type="password" required />
          </div>
          <Button className="w-full" type="submit">
            Update password
          </Button>
        </form>
        <Link href="/login" className="block text-sm text-muted-foreground hover:text-foreground">
          Back to login
        </Link>
      </CardContent>
    </Card>
  );
}
