import { chromium } from "playwright";

async function testFetchDescription() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    await page.goto("https://www.simplyhired.ca/search?q=junior+developer&l=ontario");
    await page.waitForTimeout(2000);

    const jobs = await page.evaluate(async () => {
        const jobCards = Array.from(document.querySelectorAll("h2 a, h3 a, a[class*='jobTitle']"));
        if (jobCards.length > 0) {
            const link = (jobCards[0] as HTMLAnchorElement).href;

            try {
                const res = await fetch(link);
                const html = await res.text();

                // Create a dummy element to parse the HTML and get text
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const content = doc.body.innerText;

                // Look for experience lines
                const expRegex = /.{0,30}\d+\+?\s*year[s]?.{0,30}/gi;
                const matches = content.match(expRegex);

                return { link, success: true, matches: matches?.slice(0, 5) };
            } catch (e: any) {
                return { link, success: false, error: e.message };
            }
        }
        return null;
    });

    console.log(JSON.stringify(jobs, null, 2));

    await browser.close();
}

testFetchDescription().catch(console.error);
