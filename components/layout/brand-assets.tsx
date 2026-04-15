import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandAssetProps = {
  className?: string;
  priority?: boolean;
  alt?: string;
};

export function BrandLogo({ className, priority = false, alt = "The Sync Exchange" }: BrandAssetProps) {
  return (
    <>
      <Image
        src="/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png"
        alt={alt}
        width={2400}
        height={1200}
        priority={priority}
        className={cn("h-auto w-[148px] dark:hidden sm:w-[172px] lg:w-[196px]", className)}
      />
      <Image
        src="/brand/the-sync-exchange/logos/Primary_Logo_Dark_Mode.png"
        alt={alt}
        width={2400}
        height={1200}
        priority={priority}
        className={cn("hidden h-auto w-[148px] dark:block sm:w-[172px] lg:w-[196px]", className)}
      />
    </>
  );
}

export function BrandIcon({ className, priority = false, alt = "The Sync Exchange" }: BrandAssetProps) {
  return (
    <Image
      src="/brand/the-sync-exchange/logos/Icon_Gold.png"
      alt={alt}
      width={1024}
      height={1024}
      priority={priority}
      className={cn("h-auto w-8", className)}
    />
  );
}
