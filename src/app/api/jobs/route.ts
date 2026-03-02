import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const db = await getDb();

        let jobs = [];
        if (query) {
            const result = await db.execute({
                sql: `SELECT * FROM jobs WHERE title LIKE ? OR company LIKE ? OR location LIKE ? ORDER BY created_at DESC LIMIT 500`,
                args: [`%${query}%`, `%${query}%`, `%${query}%`]
            });
            jobs = result.rows;
        } else {
            // Sort by most recent by default
            const result = await db.execute(`SELECT * FROM jobs ORDER BY date_posted DESC, created_at DESC LIMIT 2000`);
            jobs = result.rows;
        }

        return NextResponse.json(jobs);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
    }
}
