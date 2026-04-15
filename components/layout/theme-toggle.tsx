"use client";

import { Moon, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className, size = "sm" }: { className?: string; size?: "sm" | "default" | "lg" }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme === "system" ? resolvedTheme : theme) : undefined;
  const isDark = currentTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={() => {
        if (!mounted) return;
        setTheme(isDark ? "light" : "dark");
      }}
      aria-disabled={!mounted}
      aria-label="Toggle color theme"
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Loading theme controls"}
      className={cn(className)}
    >
      {isDark ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
