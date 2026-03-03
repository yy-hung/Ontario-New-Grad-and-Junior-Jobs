import { chromium } from 'playwright';

async function testLinkedInRedirects() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    const query = "junior developer";
    const url = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}&location=Ontario`;

    console.log(`Searching for: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const jobs = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("ul.jobs-search__results-list li"));
        return cards.map(c => {
            const titleEl = c.querySelector("h3.base-search-card__title");
            const linkEl = c.querySelector("a.base-card__full-link");
            return {
                title: titleEl ? (titleEl as HTMLElement).innerText.trim() : "",
                link: linkEl ? (linkEl as HTMLAnchorElement).href : ""
            };
        }).filter(j => j.title && j.link).slice(0, 10);
    });

    console.log(`Found ${jobs.length} jobs to check.`);

    for (const job of jobs) {
        let cleanLink = job.link.split('?')[0];
        console.log(`\nChecking: ${job.title}`);
        console.log(`Source Link: ${cleanLink}`);

        try {
            const res = await context.request.get(cleanLink, { timeout: 10000 });
            if (res.ok()) {
                const html = await res.text();

                // Try regex
                const applyUrlMatch = html.match(/<code[^>]*id="applyUrl"[^>]*><!--"([^"]+)"--><\/code>/);
                if (applyUrlMatch) {
                    const redirectUrl = applyUrlMatch[1];
                    const urlSearchParams = new URLSearchParams(redirectUrl.split('?')[1]);
                    const externalUrl = urlSearchParams.get('url');
                    if (externalUrl) {
                        const finalUrl = decodeURIComponent(externalUrl).split('?')[0];
                        console.log(`SUCCESS: Found external URL -> ${finalUrl}`);
                    } else {
                        console.log(`FAILED: Found code block but NO url param. RedirectUrl: ${redirectUrl.substring(0, 100)}...`);
                    }
                } else {
                    // Check if it's Easy Apply
                    const isEasyApply = html.includes('Easy Apply') || html.includes('easy-apply');
                    if (isEasyApply) {
                        console.log(`INFO: This is likely an Easy Apply job (No redirect expected).`);
                    } else {
                        console.log(`FAILED: No applyUrl code block found and not Easy Apply.`);
                        // Search for any other indicators
                        if (html.includes('externalApply')) console.log('  - Found "externalApply" in HTML but regex missed it.');
                        if (html.includes('sign-up-modal__company-site-link')) console.log('  - Found "sign-up-modal__company-site-link" in HTML.');
                    }
                }
            } else {
                console.log(`ERROR: Response not OK (${res.status()})`);
            }
        } catch (e: any) {
            console.log(`ERROR: Request failed: ${e.message}`);
        }
    }

    await browser.close();
}

testLinkedInRedirects();
