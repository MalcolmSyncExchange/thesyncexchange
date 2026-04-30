import { Button } from "@/components/ui/button";
import { retryAgreementGenerationAction } from "@/services/admin/actions";

export function RetryAgreementGenerationForm({ orderId }: { orderId: string }) {
  return (
    <form action={retryAgreementGenerationAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" size="sm" variant="outline">
        Retry Agreement Generation
      </Button>
    </form>
  );
}
