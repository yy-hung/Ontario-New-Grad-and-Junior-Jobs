import { chromium } from "playwright";

async function inspect() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    await page.goto("https://www.simplyhired.ca/search?q=junior+developer&l=ontario");
    await page.waitForTimeout(3000);

    // Dump the classes of the main job container elements
    const info = await page.evaluate(() => {
        // Look for all anchors with job titles
        const titles = Array.from(document.querySelectorAll("h2 a, h3 a, a[class*='jobTitle']"));
        if (titles.length === 0) return "No titles found.";

        // Get the parent of the first title to see its class
        const firstTitle = titles[0];
        let parent = firstTitle.parentElement;
        const parentChain = [];
        while (parent && parent.tagName !== "BODY") {
            parentChain.push(parent.tagName + "." + Array.from(parent.classList).join("."));
            parent = parent.parentElement;
        }

        return {
            titleCount: titles.length,
            firstTitleText: (firstTitle as HTMLElement).innerText,
            parentChain: parentChain.slice(0, 5) // top 5 ancestors
        };
    });

    console.log(JSON.stringify(info, null, 2));
    await browser.close();
}

inspect().catch(console.error);
