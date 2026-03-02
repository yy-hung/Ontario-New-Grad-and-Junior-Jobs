import cron from "node-cron";
import { runScraper } from "./index";

console.log("Cron scheduler started. Scraper will run every hour.");

// Run immediately on start
console.log("Running initial scrape directly...");
runScraper().catch(console.error);

// 0 * * * * stands for: map min, hour, day of month, month, day of week
// In this case, "0 * * * *" means "at minute 0 past every hour".
// Effectively running once an hour.
cron.schedule("0 * * * *", () => {
    console.log(`[${new Date().toISOString()}] Hourly cron job triggered.`);
    runScraper().catch(error => {
        console.error(`[${new Date().toISOString()}] Error running cron job:`, error);
    });
});
