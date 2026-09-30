/**
 * Runs before every integration test file: point the Prisma client at the database
 * prepared by the global setup before any application module is imported.
 */
import path from "node:path";
import dotenv from "dotenv";
import { inject } from "vitest";

dotenv.config({ quiet: true });
process.env.DATABASE_URL = inject("databaseUrl");
process.env.STORAGE_DIR = path.resolve(".data/test-storage");
