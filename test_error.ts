import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    page.on('pageerror', err => console.log('Page error: ', err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('Console error: ', msg.text());
        }
    });

    try {
        await page.goto('http://localhost:3001');
        await page.waitForTimeout(2000);
    } catch(e) {}
    
    await browser.close();
})();
