import { chromium } from "playwright";

async function testPagination() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    await page.goto("https://www.simplyhired.ca/search?q=junior+developer&l=ontario");
    await page.waitForTimeout(3000);

    // Find the next button href
    const nextHref = await page.evaluate(() => {
        // SimplyHired usually uses <a> with specific classes for pagination. Let's list all pagination links.
        const paginationLinks = Array.from(document.querySelectorAll("nav[aria-label='pagination'] a, a[data-testid='paginationNext']"));
        const nextBtn = paginationLinks.find(a => a.innerHTML.toLowerCase().includes('next') || a.getAttribute('aria-label')?.toLowerCase().includes('next'));

        if (nextBtn) return (nextBtn as HTMLAnchorElement).href;

        // Fallback: Just return the 2nd page link if it exists
        const page2Btn = Array.from(document.querySelectorAll("a")).find(a => a.innerText === "2" || a.getAttribute("aria-label")?.includes("Page 2"));
        return page2Btn ? (page2Btn as HTMLAnchorElement).href : "Not Found";
    });

    console.log("Next page URL is:", nextHref);

    await browser.close();
}

testPagination().catch(console.error);
