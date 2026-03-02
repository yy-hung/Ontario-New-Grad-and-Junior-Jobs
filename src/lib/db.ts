import { createClient, Client } from "@libsql/client";
import path from "path";

// Define the path to the local database file
const localDbPath = path.resolve(process.cwd(), "jobs.sqlite");

let dbInstance: Client | null = null;

export async function getDb(): Promise<Client> {
  if (dbInstance) {
    return dbInstance;
  }

  const url = process.env.TURSO_DATABASE_URL || `file:${localDbPath}`;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // Open the database connection
  dbInstance = createClient({
    url,
    authToken,
  });

  // Create table if it doesn't exist
  await dbInstance.execute(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      link TEXT NOT NULL UNIQUE,
      date_posted TEXT NOT NULL,
      source TEXT,
      job_type TEXT DEFAULT 'Full-Time',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create unique index to prevent future duplicates if it doesn't exist
  try {
    await dbInstance.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedup 
      ON jobs (title, company, location)
    `);
    console.log("Created/Verified unique index idx_jobs_dedup.");
  } catch (err: any) {
    console.error("Error creating unique index:", err.message);
  }

  // Safely add column for existing databases
  try {
    await dbInstance.execute("ALTER TABLE jobs ADD COLUMN job_type TEXT DEFAULT 'Full-Time'");
    console.log("Added job_type column to jobs table.");
  } catch (err: any) {
    // Ignore error if column already exists
    if (!err.message.includes("duplicate column name")) {
      console.error("Error altering jobs table:", err.message);
    }
  }

  return dbInstance;
}
