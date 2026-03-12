import type { Env } from "hono";

/**
 * Hono environment type with custom context variables.
 */
export interface AppEnv extends Env {
  Variables: {
    userId: string;
    handle: string;
  };
}
