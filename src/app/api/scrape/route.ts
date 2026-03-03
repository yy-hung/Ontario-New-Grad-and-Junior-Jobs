import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST(request: NextRequest) {
    // Only allow requests with the correct secret token
    const auth = request.headers.get("authorization") ?? "";
    const secret = process.env.SCRAPE_SECRET;

    if (!secret || auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Trigger the scraper in a detached background process
        const scraperPath = path.resolve(process.cwd(), "scraper", "index.ts");

        console.log("Triggering manual scrape via API...");

        // Use npx tsx to run the scraper script
        const child = spawn("npx", ["tsx", scraperPath], {
            detached: true,
            stdio: "ignore"
        });

        child.unref();

        return NextResponse.json({ message: "Scraper started" });
    } catch (error) {
        console.error("Scrape API Error:", error);
        return NextResponse.json({ error: "Failed to start scraper" }, { status: 500 });
    }
}
