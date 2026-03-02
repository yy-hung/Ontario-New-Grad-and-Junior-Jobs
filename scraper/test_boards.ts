import { chromium } from "playwright";

async function testScraping() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });

    const urls = [
        { name: "LinkedIn", url: "https://www.linkedin.com/jobs/search?keywords=junior%20developer&location=Ontario" },
        { name: "Indeed", url: "https://ca.indeed.com/jobs?q=junior+developer&l=Ontario" },
        { name: "Workopolis", url: "https://www.workopolis.com/jobsearch/find-jobs?q=junior+developer&l=ontario" },
        { name: "Simplify", url: "https://simplify.jobs/jobs?q=junior+developer" }
    ];

    for (const site of urls) {
        console.log(`\nTesting ${site.name}...`);
        const page = await context.newPage();
        try {
            const response = await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 15000 });
            await page.waitForTimeout(3000);
            const title = await page.title();
            console.log(`  -> Page Title: ${title}`);
            console.log(`  -> Status: ${response?.status()}`);

            if (site.name === "LinkedIn") {
                const jobs = await page.locator(".job-search-card").count();
                console.log(`  -> Jobs found: ${jobs}`);
            } else if (site.name === "Indeed") {
                const cf = await page.locator("div#challenge-running").count();
                console.log(`  -> Cloudflare blocked: ${cf > 0}`);
            }
        } catch (e: any) {
            console.log(`  -> Failed: ${e.message}`);
        }
        await page.close();
    }

    await browser.close();
}

testScraping().catch(console.error);
