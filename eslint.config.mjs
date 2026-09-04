import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".wrangler/**", ".pawarna/**", "outputs/**", "dist-cloud/**", "out/**", "build/**", "public/vendor/**", "next-env.d.ts"]),
]);
