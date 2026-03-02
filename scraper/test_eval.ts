import { chromium } from "playwright";

async function inspectEvaluation() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    await page.goto("https://www.simplyhired.ca/search?q=junior+developer&l=ontario");
    await page.waitForTimeout(3000);

    const pageData = await page.evaluate(() => {
        const jobCards = Array.from(document.querySelectorAll("div[class*='jobCard'], div[data-testid='searchSerpJob'], li.css-0"));
        const results: any[] = [];

        // Also save debug info
        const debug = {
            jobCardsLen: jobCards.length,
            firstCardHTML: jobCards.length > 0 ? jobCards[0].innerHTML : "no cards"
        };

        jobCards.forEach((card) => {
            const titleEl = card.querySelector("h2 a, h3 a, a[class*='jobTitle']");
            const companyEl = card.querySelector("span[data-testid='companyName'], span[class*='company']");
            const locationEl = card.querySelector("span[data-testid='searchSerpJobLocation'], span[class*='location']");
            const dateEl = card.querySelector("span[data-testid='searchSerpJobDate'], span[class*='date']");

            const title = titleEl ? (titleEl as HTMLElement).innerText.trim() : "";
            const link = titleEl ? (titleEl as HTMLAnchorElement).href : "";
            const company = companyEl ? (companyEl as HTMLElement).innerText.trim() : "Unknown Company";
            const location = locationEl ? (locationEl as HTMLElement).innerText.trim() : "Ontario";
            const postedText = dateEl ? (dateEl as HTMLElement).innerText.trim() : "";

            if (title && link) {
                results.push({ title, company, location, link, postedText, source: "SimplyHired" });
            } else {
                results.push({ error: "Missing title or link", title, link });
            }
        });

        const paginationLinks = Array.from(document.querySelectorAll("nav[aria-label='pagination'] a, a[data-testid='paginationNext'], a.next-pagination"));
        const nextBtn = paginationLinks.find(a => a.innerHTML.toLowerCase().includes('next') || a.getAttribute('aria-label')?.toLowerCase().includes('next'));
        const nextHref = nextBtn ? (nextBtn as HTMLAnchorElement).href : null;

        return { debug, jobs: results, nextHref };
    });

    console.log(JSON.stringify(pageData, null, 2));

    await browser.close();
}

inspectEvaluation().catch(console.error);
