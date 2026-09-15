import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // React 19's hooks preset newly flags existing menu/theme state-reset effects.
      // Keep this migration scoped to framework security compatibility; refactor separately.
      "react-hooks/set-state-in-effect": "off"
    }
  },
  globalIgnores([
    ".next/**",
    ".next-dev/**",
    "output/**",
    "out/**",
    "build/**",
    "next-env.d.ts"
  ])
]);
