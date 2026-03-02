import { chromium } from "playwright";

async function inspectJobCard() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    await page.goto("https://www.simplyhired.ca/search?q=junior+developer&l=ontario");
    await page.waitForTimeout(3000);

    const pageData = await page.evaluate(() => {
        const jobCards = Array.from(document.querySelectorAll("div[class*='jobCard'], div[data-testid='searchSerpJob'], li.css-0"));
        if (jobCards.length > 0) {
            const firstCard = jobCards[0] as HTMLElement;
            return {
                html: firstCard.innerHTML,
                text: firstCard.innerText
            };
        }
        return null;
    });

    console.log(JSON.stringify(pageData, null, 2));

    await browser.close();
}

inspectJobCard().catch(console.error);
