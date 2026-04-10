import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function FeatureGrid({
  items,
  columns = "three"
}: {
  items: Array<{
    title: string;
    description: string;
    icon?: LucideIcon;
  }>;
  columns?: "two" | "three";
}) {
  return (
    <div className={columns === "two" ? "grid gap-6 md:grid-cols-2" : "grid gap-6 lg:grid-cols-3"}>
      {items.map((item) => (
        <Card key={item.title}>
          <CardContent className="p-6">
            {item.icon ? <item.icon className="h-8 w-8 text-primary" /> : null}
            <h3 className="mt-5 text-xl font-semibold">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
