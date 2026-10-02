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
        src="/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png"
        alt={alt}
        width={1200}
        height={400}
        priority={priority}
        className={cn("block h-auto w-[176px] dark:hidden sm:w-[192px] lg:w-[208px]", className)}
      />
      <Image
        src="/brand/the-sync-exchange/logos/website-header-horizontal-dark-transparent.png"
        alt={alt}
        width={1200}
        height={400}
        priority={priority}
        className={cn("hidden h-auto w-[176px] dark:block sm:w-[192px] lg:w-[208px]", className)}
      />
    </>
  );
}

export function BrandHeaderLogo({ className, priority = false, alt = "The Sync Exchange" }: BrandAssetProps) {
  return (
    <>
      <picture className="block dark:hidden">
        <source
          media="(max-width: 1000px)"
          srcSet="/brand/the-sync-exchange/logos/website-mobile-header-horizontal-light-transparent.png"
        />
        <Image
          src="/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png"
          alt={alt}
          width={1200}
          height={400}
          priority={priority}
          className={cn("block h-auto w-[216px]", className)}
        />
      </picture>
      <picture className="hidden dark:block">
        <source
          media="(max-width: 1000px)"
          srcSet="/brand/the-sync-exchange/logos/website-mobile-header-horizontal-dark-transparent.png"
        />
        <Image
          src="/brand/the-sync-exchange/logos/website-header-horizontal-dark-transparent.png"
          alt={alt}
          width={1200}
          height={400}
          priority={priority}
          className={cn("block h-auto w-[216px]", className)}
        />
      </picture>
    </>
  );
}

export function BrandFooterLogo({ className, priority = false, alt = "The Sync Exchange" }: BrandAssetProps) {
  return (
    <>
      <Image
        src="/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png"
        alt={alt}
        width={1200}
        height={400}
        priority={priority}
        className={cn("block h-auto w-[216px] dark:hidden", className)}
      />
      <Image
        src="/brand/the-sync-exchange/logos/website-header-horizontal-dark-transparent.png"
        alt={alt}
        width={1200}
        height={400}
        priority={priority}
        className={cn("hidden h-auto w-[216px] dark:block", className)}
      />
    </>
  );
}

export function BrandIcon({ className, priority = false, alt = "The Sync Exchange" }: BrandAssetProps) {
  return (
    <Image
      src="/brand/the-sync-exchange/logos/website-symbol-transparent.png"
      alt={alt}
      width={1024}
      height={1024}
      priority={priority}
      className={cn("h-auto w-8", className)}
    />
  );
}
