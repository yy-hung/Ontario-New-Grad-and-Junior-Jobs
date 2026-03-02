import { chromium } from "playwright";

async function testLinkedIn() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    const queryTerm = "junior developer";
    const url = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(queryTerm)}&location=Ontario`;
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // Scroll down a bit to trigger lazy loading
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    const jobs = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("ul.jobs-search__results-list li"));
        return cards.map(c => {
            const titleEl = c.querySelector("h3.base-search-card__title");
            const companyEl = c.querySelector("h4.base-search-card__subtitle");
            const locEl = c.querySelector("span.job-search-card__location");
            const linkEl = c.querySelector("a.base-card__full-link");
            const timeEl = c.querySelector("time");

            return {
                title: titleEl ? (titleEl as HTMLElement).innerText.trim() : "",
                company: companyEl ? (companyEl as HTMLElement).innerText.trim() : "",
                location: locEl ? (locEl as HTMLElement).innerText.trim() : "",
                link: linkEl ? (linkEl as HTMLAnchorElement).href : "",
                postedDate: timeEl ? timeEl.getAttribute("datetime") : ""
            };
        }).filter(j => j.title && j.link);
    });

    console.log(`Found ${jobs.length} jobs.`);
    if (jobs.length > 0) {
        console.log(JSON.stringify(jobs.slice(0, 3), null, 2));
    }

    await browser.close();
}

testLinkedIn().catch(console.error);
