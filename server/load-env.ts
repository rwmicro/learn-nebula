// Load a local .env into process.env before any config is read, so `pnpm server`
// behaves like `docker run --env-file .env`. Imported first by env.ts. Node's
// built-in loader (no dependency); silently ignored when there is no .env
// (real environment variables, e.g. from docker/systemd, are used as-is).
try {
  process.loadEnvFile();
} catch {
  /* no .env file — rely on the ambient environment */
}
