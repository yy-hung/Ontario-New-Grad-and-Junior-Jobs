import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const db = await getDb();
        const result = await db.execute("SELECT MAX(date_posted) as last_date FROM jobs");
        const row = result.rows[0];

        return NextResponse.json({
            last_updated: row ? row.last_date : null
        });
    } catch (error) {
        console.error("Stats API Error:", error);
        return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }
}
