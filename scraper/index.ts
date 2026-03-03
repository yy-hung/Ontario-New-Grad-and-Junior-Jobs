import { getDb } from "../src/lib/db";
import { chromium, Browser, BrowserContext, Page } from "playwright";

// Helper to parse job type and check experience from raw HTML
function analyzeJobDetails(html: string, title: string, location: string = ""): { isSenior: boolean, jobType: string, isUnavailable: boolean, isNonCanadian: boolean } {
    const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
    const lowerTitle = title.toLowerCase();
    const lowerLocation = location.toLowerCase();

    // Check for unavailability messages
    const unavailableTerms = [
        "temporarily unavailable",
        "no longer accepting applications",
        "job has expired",
        "position has been filled",
        "no longer available",
        "not accepting applications",
        "job is closed",
        "job you are trying to view has expired"
    ];
    const isUnavailable = unavailableTerms.some(term => text.includes(term));

    // Stricter Geography Check (Exclude US/International)
    const nonCanadianMarkers = ["usa", "united states", "u.s.", "us-based", "us based", "san francisco", "new york", "austin", "seattle", "europe", "uk ", "london, uk", "india", "germany"];
    const canadianMarkers = ["canada", "ontario", "toronto", "ottawa", "vancouver", "montreal", "calgary", "edmonton", "quebec", "alberta", "bc ", "manitoba", "saskatchewan", "nova scotia"];

    let isNonCanadian = false;
    // If location explicitly mentions a non-Canadian city/country, or if text mentions US-only requirements
    if (nonCanadianMarkers.some(m => lowerLocation.includes(m)) && !canadianMarkers.some(m => lowerLocation.includes(m))) {
        isNonCanadian = true;
    }
    if (!isNonCanadian && (text.includes("must be located in the us") || text.includes("us citizenship required") || text.includes("authorized to work in the us"))) {
        isNonCanadian = true;
    }

    // Determine Job Type
    let jobType = "Full-Time";
    // Broad terms used only for title matching (single words are safe there)
    const coopTitleTerms = ["co-op", "coop", "intern", "internship", "student", "placement", "work-study", "undergraduate", "scholar"];
    // Explicit multi-word phrases for body text — avoids false positives like
    // "student loan benefit", "academic placement", "scholarship program", etc.
    const coopBodyPhrases = [
        "co-op", "coop", "internship", "intern position", "intern role",
        "student position", "student role", "student opportunity", "student placement",
        "currently enrolled", "currently attending", "must be enrolled", "must be a student",
        "work-study", "work study program", "cooperative education",
        "returning to school", "returning to full-time"
    ];
    const gradTerms = ["recent grad", "new grad", "graduating", "entry level", "junior", "associate", "trainee", "entry-level", "new graduate", "graduate", "graduation"];

    // Title match takes priority — broad single-word check is fine here
    if (coopTitleTerms.some(t => lowerTitle.includes(t))) {
        jobType = "Co-op";
    } else if (gradTerms.some(t => lowerTitle.includes(t))) {
        jobType = "Graduating";
    } else if (coopBodyPhrases.some(t => text.includes(t))) {
        // Body text: only explicit phrases that unambiguously describe a co-op/intern role
        jobType = "Co-op";
    } else if (gradTerms.some(t => text.includes(t))) {
        jobType = "Graduating";
    }

    // Comprehensive Senior/Lead/Intermediate Filter
    const seniorKeywords = ["senior", "sr", "lead", "principal", "staff", "manager", "director", "head", "vp", "chief", "architect", "expert", "specialist ii", "ii ", "iii", "iv", "v ", "intermediate", "mid-level", "mid level", "level 2", "level 3", "level ii", "level iii", "mid-market"];
    let isSenior = seniorKeywords.some(kw => lowerTitle.includes(kw) || lowerTitle.match(new RegExp(`\\b${kw}\\b`)));

    // Also check for "intermediate" or "senior" explicitly in text if title is vague
    if (!isSenior && (
        text.includes("intermediate level") ||
        text.includes("intermediate position") ||
        text.includes("intermediate role") ||
        text.includes("senior position") ||
        text.includes("senior role") ||
        text.includes("years of experience is required") ||
        text.includes("middle level") ||
        text.includes("mid-level")
    )) {
        isSenior = true;
    }

    if (!isSenior) {
        // Aggressive catch-all for "X years" or "X+ years" where X >= 2 (handles digits and written numbers)
        const expRegex = /(\d+|two|three|four|five|six|seven|eight|nine|ten)\+?\s*(?:or\s+more|or\s+greater|years?\s+or\s+more)?\s*(?:year|yr|yr\.|ann\u00e9e)s?/gi;
        const numberMap: { [key: string]: number } = {
            "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10
        };

        let match;
        while ((match = expRegex.exec(text)) !== null) {
            let numStr = match[1].toLowerCase();
            let num = isNaN(parseInt(numStr)) ? (numberMap[numStr] || 0) : parseInt(numStr);

            if (num >= 2) {
                const matchIndex = match.index;
                const contextStr = text.substring(Math.max(0, matchIndex - 30), matchIndex + 30).toLowerCase();

                // Safe ranges for true entry-level 
                const isEntryRange = contextStr.includes("0-") || contextStr.includes("0 -") ||
                    contextStr.includes("under 2") || contextStr.includes("less than 2") ||
                    contextStr.includes("under two") || contextStr.includes("less than two") ||
                    contextStr.includes("up to 2") || contextStr.includes("up to two") ||
                    contextStr.includes("max 1") || contextStr.includes("max one") ||
                    contextStr.includes("0 to 2") ||
                    contextStr.includes("1 to 2");

                if (!isEntryRange) {
                    isSenior = true;
                    break;
                }
            }
        }
    }

    return { isSenior, jobType, isUnavailable, isNonCanadian };
}

// Returns the current date string (YYYY-MM-DD) in Eastern Time
function todayET(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date()); // en-CA locale formats as YYYY-MM-DD
}

// Returns a Date object whose local fields (getFullYear, getMonth, getDate, etc.)
// reflect the current moment in Eastern Time, so arithmetic on days/weeks/months
// stays in ET rather than UTC.
function nowET(): Date {
    const etStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(new Date());
    // en-CA gives "YYYY-MM-DD, HH:mm:ss" – parse it into a plain Date
    return new Date(etStr.replace(", ", "T"));
}

// Utility to parse relative dates (e.g., "3 weeks ago") into YYYY-MM-DD (ET)
function parseRelativeDate(relativeStr: string): string {
    if (!relativeStr) return todayET();

    const lower = relativeStr.toLowerCase().trim();

    // If it's already YYYY-MM-DD or similar, return it
    if (/^\d{4}-\d{2}-\d{2}/.test(lower)) return lower.split('T')[0];

    // Start from the current ET date so arithmetic stays in Eastern Time
    const now = nowET();

    // Handle "ago" strings
    const numMatch = lower.match(/(\d+)/);
    const num = numMatch ? parseInt(numMatch[1]) : 1;

    if (lower.includes("hour")) {
        now.setHours(now.getHours() - num);
    } else if (lower.includes("day") || lower.includes(" jour")) {
        now.setDate(now.getDate() - num);
    } else if (lower.includes("week") || lower.includes(" sem")) {
        now.setDate(now.getDate() - (num * 7));
    } else if (lower.includes("month") || lower.includes(" mois")) {
        now.setMonth(now.getMonth() - num);
    } else if (lower.includes("yesterday") || lower.includes("hier")) {
        now.setDate(now.getDate() - 1);
    } else if (lower.includes("just now") || lower.includes("today") || lower.includes("minute")) {
        // stay same day
    }

    // Format as YYYY-MM-DD using local (ET) date fields
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

async function scrapeSimplyHired(page: Page, context: BrowserContext, queryTerm: string) {
    const jobs = [];
    let currentUrl: string | null = `https://www.simplyhired.ca/search?q=${encodeURIComponent(queryTerm)}&l=ontario`;
    let pageNum = 1;
    const maxPages = 5;
    let tooOld = false;

    console.log(`Starting scrape for query: "${queryTerm}"`);

    // Keywords that disqualify a job as "junior"
    const negativeKeywords = ["senior", "sr", "sr.", "lead", "manager", "principal", "director", "head", "vp", "president", "chief", "staff"];

    while (currentUrl && pageNum <= maxPages && !tooOld) {
        console.log(`  -> Navigating to page ${pageNum} for "${queryTerm}"...`);
        await page.goto(currentUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // 1. Extract base job info from the search page
        const pageData = await page.evaluate((negKeywords) => {
            const jobCards = Array.from(document.querySelectorAll("div[class*='jobCard'], div[data-testid='searchSerpJob'], li.css-0"));
            const results: any[] = [];

            jobCards.forEach((card) => {
                const titleEl = card.querySelector("h2 a, h3 a, a[class*='jobTitle']");
                const companyEl = card.querySelector("span[data-testid='companyName'], span[class*='company']");
                const locationEl = card.querySelector("span[data-testid='searchSerpJobLocation'], span[class*='location']");
                const dateEl = card.querySelector("span[data-testid='searchSerpJobDate'], span[class*='date']");

                const title = titleEl ? (titleEl as HTMLElement).innerText.trim() : "";
                const link = titleEl ? (titleEl as HTMLAnchorElement).href : "";
                const company = companyEl ? (companyEl as HTMLElement).innerText.trim() : "Unknown Company";
                const location = locationEl ? (locationEl as HTMLElement).innerText.trim() : "Ontario, CA";
                const postedText = dateEl ? (dateEl as HTMLElement).innerText.trim() : "";

                if (title && link) {
                    const lowerTitle = title.toLowerCase();
                    // Expanded inline senior check (mirrors analyzeJobDetails for consistency)
                    const seniorKeywords = ["senior", "sr", "lead", "principal", "staff", "manager", "director", "head", "vp", "chief", "architect", "expert", "specialist ii", "ii ", "iii", "iv", "v "];
                    const isSenior = seniorKeywords.some(kw => lowerTitle.includes(kw) || lowerTitle.match(new RegExp(`\\b${kw}\\b`)));

                    if (!isSenior) {
                        results.push({ title, company, location, link, postedText, source: "SimplyHired" });
                    }
                }
            });

            const paginationLinks = Array.from(document.querySelectorAll("nav[aria-label='pagination'] a, a[data-testid='paginationNext'], a.next-pagination"));
            const nextBtn = paginationLinks.find(a => a.innerHTML.toLowerCase().includes('next') || a.getAttribute('aria-label')?.toLowerCase().includes('next'));
            const nextHref = nextBtn ? (nextBtn as HTMLAnchorElement).href : null;
            const isLoop = nextHref && (!nextHref.includes('cursor=') && !nextHref.includes('pn='));

            return { jobs: results, nextHref: isLoop ? null : nextHref };
        }, negativeKeywords);

        if (pageData.jobs.length === 0) {
            break;
        }

        // 2. Fetch the detailed job description to check for specific experience requirements
        console.log(`    -> Deep filtering ${pageData.jobs.length} candidate jobs for experience...`);
        const validJobs = [];

        // Process in smaller batches
        const batchSize = 5;
        for (let i = 0; i < pageData.jobs.length; i += batchSize) {
            const batch = pageData.jobs.slice(i, i + batchSize);
            const batchPromises = batch.map(async (job) => {
                let jobType = "Full-Time"; // Default
                try {
                    const response = await context.request.get(job.link, { timeout: 8000 });
                    if (response.ok()) {
                        const html = await response.text();
                        const analysis = analyzeJobDetails(html, job.title, job.location);
                        if (analysis.isSenior || analysis.isUnavailable || analysis.isNonCanadian) {
                            return null; // Reject this job
                        }
                        jobType = analysis.jobType;
                    }
                } catch (err) {
                    // Fallback to title analysis if fetch fails
                    const analysis = analyzeJobDetails("", job.title, job.location);
                    if (analysis.isSenior || analysis.isNonCanadian) return null;
                    jobType = analysis.jobType;
                }

                return { ...job, job_type: jobType, date_posted: todayET() };
            });
            const results = await Promise.all(batchPromises);
            for (const res of results) {
                if (res) validJobs.push(res);
            }
        }

        // 3. Process the fully validated jobs
        for (const job of validJobs) {
            const isOld = job.postedText.toLowerCase().includes("30+") || job.postedText.toLowerCase().includes("month");
            if (isOld) {
                tooOld = true;
                break;
            }
            jobs.push(job);
        }

        currentUrl = tooOld ? null : pageData.nextHref;
        pageNum++;
    }

    console.log(`Found ${jobs.length} highly qualified junior jobs for "${queryTerm}".`);
    return jobs;
}

// LinkedIn public scraper
async function scrapeLinkedIn(page: Page, context: BrowserContext, queryTerm: string) {
    const jobs = [];
    const url = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(queryTerm)}&location=Ontario`;
    let tooOld = false;

    console.log(`Starting LinkedIn scrape for query: "${queryTerm}"...`);

    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(3000);

        // Scroll down to trigger lazy load
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(2000);

        const negativeKeywords = ["senior", "sr", "sr.", "lead", "manager", "principal", "director", "head", "vp", "president", "chief", "staff"];

        const pageData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll("ul.jobs-search__results-list li"));
            const results = [];

            // Expanded inline senior check (mirrors analyzeJobDetails)
            const seniorKeywords = ["senior", "sr", "lead", "principal", "staff", "manager", "director", "head", "vp", "chief", "architect", "expert", "specialist ii", "ii ", "iii", "iv", "v "];

            for (const c of cards) {
                const titleEl = c.querySelector("h3.base-search-card__title");
                const companyEl = c.querySelector("h4.base-search-card__subtitle");
                const locEl = c.querySelector("span.job-search-card__location");
                const linkEl = c.querySelector("a.base-card__full-link");
                const timeEl = c.querySelector("time");

                const title = titleEl ? (titleEl as HTMLElement).innerText.trim() : "";
                const company = companyEl ? (companyEl as HTMLElement).innerText.trim() : "";
                const location = locEl ? (locEl as HTMLElement).innerText.trim() : "Ontario, CA";
                let link = linkEl ? (linkEl as HTMLAnchorElement).href : "";
                const postedDate = timeEl ? (timeEl.getAttribute("datetime") || timeEl.innerText.trim()) : "";

                if (link && link.includes('?')) {
                    link = link.split('?')[0]; // Clean tracking params
                }

                if (title && link) {
                    const lowerTitle = title.toLowerCase();
                    const lowerLoc = location.toLowerCase();

                    const isSenior = seniorKeywords.some(kw => lowerTitle.includes(kw) || lowerTitle.match(new RegExp(`\\b${kw}\\b`)));

                    // Simple geography pre-filter
                    const nonCanadianMarkers = ["usa", "united states", "u.s.", "europe", "uk ", "india", "germany"];
                    const isNonCanadian = nonCanadianMarkers.some(m => lowerLoc.includes(m));

                    if (!isSenior && !isNonCanadian) {
                        results.push({ title, company, location, link, postedText: postedDate || "", source: "LinkedIn" });
                    }
                }
            }
            return results;
        });

        // Enhance LinkedIn jobs with Job Type and Deep Filtering
        // We limit deep filtering on LinkedIn to avoid IP bans
        const validJobs = [];
        const batchSize = 2; // Smaller batch for stability
        const maxDeepCheck = 20; // Increased limit

        for (let i = 0; i < Math.min(pageData.length, 30); i += batchSize) {
            const batch = pageData.slice(i, i + batchSize);
            const batchPromises = batch.map(async (job, index) => {
                let currentJobType = "Full-Time";
                const absoluteIndex = i + index;

                if (absoluteIndex < maxDeepCheck) {
                    try {
                        // Longer randomized delay for LinkedIn to avoid 429s
                        await new Promise(r => setTimeout(r, 4000 + Math.random() * 5000));

                        const response = await context.request.get(job.link, { timeout: 10000 });
                        if (response.status() === 429) {
                            console.log(`[LinkedIn] Rate limited (429) for ${job.title}. Skipping deep check.`);
                        } else if (response.ok()) {
                            const html = await response.text();

                            // Broader redirect check for LinkedIn
                            // 1. Check applyUrl code block
                            let externalUrl: string | null = null;
                            const applyUrlMatch = html.match(/<code[^>]*id="applyUrl"[^>]*><!--"([^"]+)"--><\/code>/);
                            if (applyUrlMatch) {
                                const redirectUrl = applyUrlMatch[1];
                                const urlSearchParams = new URLSearchParams(redirectUrl.split('?')[1]);
                                externalUrl = urlSearchParams.get('url');
                            }

                            // 2. Fallback to sign-up-modal__company-site-link
                            if (!externalUrl) {
                                const modalLinkMatch = html.match(/class="sign-up-modal__company-site-link"[^>]*href="([^"]+)"/);
                                if (modalLinkMatch) {
                                    const redirectUrl = modalLinkMatch[1];
                                    if (redirectUrl.includes('url=')) {
                                        const urlSearchParams = new URLSearchParams(redirectUrl.split('?')[1]);
                                        externalUrl = urlSearchParams.get('url');
                                    } else {
                                        externalUrl = redirectUrl;
                                    }
                                }
                            }

                            if (externalUrl) {
                                try {
                                    job.link = decodeURIComponent(externalUrl).split('?')[0];
                                } catch (e) { }
                            }

                            const analysis = analyzeJobDetails(html, job.title, job.location);
                            if (analysis.isSenior || analysis.isUnavailable || analysis.isNonCanadian) return null;
                            currentJobType = analysis.jobType;
                        }
                    } catch (e) {
                        const analysis = analyzeJobDetails("", job.title, job.location);
                        if (analysis.isSenior || analysis.isNonCanadian) return null;
                        currentJobType = analysis.jobType;
                    }
                } else {
                    // Fallback to title only for later results
                    const analysis = analyzeJobDetails("", job.title, job.location);
                    if (analysis.isSenior || analysis.isNonCanadian) return null;
                    currentJobType = analysis.jobType;
                }

                return { ...job, job_type: currentJobType };
            });

            const results = await Promise.all(batchPromises);
            for (const res of results) {
                if (res) validJobs.push(res);
            }
        }

        const thirtyDaysAgo = nowET();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        for (const job of validJobs) {
            if (job.postedText) {
                const jobDateStr = parseRelativeDate(job.postedText);
                const jobDate = new Date(jobDateStr);
                if (jobDate < thirtyDaysAgo) {
                    continue;
                }
                job.date_posted = jobDateStr;
            } else {
                job.date_posted = todayET();
            }
            jobs.push(job);
        }
    } catch (e: any) {
        console.log(`  -> LinkedIn scrape failed for "${queryTerm}": ${e.message}`);
    }

    console.log(`Found ${jobs.length} valid jobs from LinkedIn for "${queryTerm}".`);
    return jobs;
}

// Fallback scraper
async function fetchRemoteJobs() {
    console.log("Fetching remote jobs from API as fallback...");
    const response = await fetch("https://remoteok.com/api");
    const data = await response.json();
    const jobs = [];

    const thirtyDaysAgo = nowET();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const negativeKeywords = ["senior", "sr", "lead", "manager", "principal", "director", "head", "vp"];

    for (let i = 1; i < data.length; i++) {
        const job = data[i];
        const jobDate = new Date(job.date);

        if (jobDate < thirtyDaysAgo) {
            continue;
        }

        if (job.position && typeof job.position === 'string') {
            const lowerPos = job.position.toLowerCase();
            const isJuniorMode = lowerPos.includes("junior") || lowerPos.includes("entry") || lowerPos.includes("new grad");
            const isSenior = negativeKeywords.some(kw => lowerPos.includes(kw) || lowerPos.match(new RegExp(`\\b${kw}\\b`)));

            if (isJuniorMode && !isSenior) {
                let jobType = "Full-Time";
                if (job.description) {
                    const analysis = analyzeJobDetails(job.description, job.position, job.location);
                    if (analysis.isSenior || analysis.isUnavailable || analysis.isNonCanadian) continue;
                    jobType = analysis.jobType;
                } else {
                    const analysis = analyzeJobDetails("", job.position, job.location);
                    if (analysis.isSenior || analysis.isNonCanadian) continue;
                    jobType = analysis.jobType;
                }

                jobs.push({
                    title: job.position,
                    company: job.company,
                    location: job.location || "Remote",
                    link: job.url,
                    source: "RemoteOK",
                    job_type: jobType
                });
            }
        }
    }
    return jobs;
}
async function scrapeWorkopolis(page: Page, context: BrowserContext, queryTerm: string) {
    const jobs: any[] = [];
    const url = `https://www.workopolis.com/jobsearch/find-jobs?ak=${encodeURIComponent(queryTerm)}&l=Ontario`;
    console.log(`Starting Workopolis scrape for: "${queryTerm}"`);

    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        const pageData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll(".JobCard"));
            return cards.map(c => {
                const titleEl = c.querySelector(".JobCard-title");
                const companyEl = c.querySelector(".JobCard-company");
                const locEl = c.querySelector(".JobCard-location");
                const linkEl = c.querySelector("a.JobCard-titleLink");

                return {
                    title: titleEl?.textContent?.trim() || "",
                    company: companyEl?.textContent?.trim() || "Unknown",
                    location: locEl?.textContent?.trim() || "Ontario, CA",
                    link: (linkEl as HTMLAnchorElement)?.href || ""
                };
            }).filter(j => j.title && j.link);
        });

        for (const job of pageData) {
            const analysis = analyzeJobDetails("", job.title, job.location);
            if (!analysis.isSenior && !analysis.isNonCanadian) {
                jobs.push({
                    ...job,
                    source: "Workopolis",
                    job_type: analysis.jobType,
                    date_posted: todayET()
                });
            }
        }
    } catch (err) {
        console.error("Workopolis scrape error:", err);
    }
    return jobs;
}

async function scrapeWellfound(page: Page, context: BrowserContext, queryTerm: string) {
    const jobs: any[] = [];
    // Wellfound often requires login for deep search, but we can try the public listings
    const url = `https://wellfound.com/role/l/${encodeURIComponent(queryTerm.replace(/\s+/g, '-'))}/canada`;
    console.log(`Starting Wellfound scrape for: "${queryTerm}"`);

    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4000);

        const pageData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('[data-test="JobResult"]'));
            return cards.map(c => {
                const titleEl = c.querySelector('[class*="styles_title"]');
                const companyEl = c.querySelector('[class*="styles_name"]');
                const linkEl = c.querySelector('a[class*="styles_title"]');

                const dateEl = c.querySelector('[class*="styles_posted"]');

                return {
                    title: titleEl?.textContent?.trim() || "",
                    company: companyEl?.textContent?.trim() || "Unknown",
                    location: "Canada (Remote/Hybrid)",
                    link: (linkEl as HTMLAnchorElement)?.href || "",
                    postedText: dateEl?.textContent?.trim() || ""
                };
            }).filter(j => j.title && j.link);
        });

        for (const job of pageData) {
            const analysis = analyzeJobDetails("", job.title, job.location);
            if (!analysis.isSenior && !analysis.isNonCanadian) {
                jobs.push({
                    ...job,
                    source: "Wellfound",
                    job_type: analysis.jobType,
                    date_posted: parseRelativeDate(job.postedText || "")
                });
            }
        }
    } catch (err) {
        console.error("Wellfound scrape error:", err);
    }
    return jobs;
}

async function scrapeWorkInTech(page: Page, context: BrowserContext, queryTerm: string) {
    const jobs: any[] = [];
    const url = `https://www.workintech.ca/jobs?q=${encodeURIComponent(queryTerm)}`;
    console.log(`Starting WorkInTech scrape for: "${queryTerm}"`);

    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        const pageData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll(".job-card"));
            return cards.map(c => {
                const titleEl = c.querySelector(".title");
                const companyEl = c.querySelector(".company");
                const locEl = c.querySelector(".location");
                const linkEl = c.querySelector("a");

                return {
                    title: titleEl?.textContent?.trim() || "",
                    company: companyEl?.textContent?.trim() || "Unknown",
                    location: locEl?.textContent?.trim() || "Ontario, CA",
                    link: (linkEl as HTMLAnchorElement)?.href || ""
                };
            }).filter(j => j.title && j.link);
        });

        for (const job of pageData) {
            const analysis = analyzeJobDetails("", job.title, job.location);
            if (!analysis.isSenior && !analysis.isNonCanadian) {
                jobs.push({
                    ...job,
                    source: "WorkInTech",
                    job_type: analysis.jobType,
                    date_posted: parseRelativeDate(job.postedText || "")
                });
            }
        }
    } catch (err) {
        console.error("WorkInTech scrape error:", err);
    }
    return jobs;
}

async function scrapeIndeed(page: Page, context: BrowserContext, queryTerm: string) {
    const jobs: any[] = [];
    const url = `https://ca.indeed.com/jobs?q=${encodeURIComponent(queryTerm)}&l=Ontario`;
    console.log(`Starting Indeed scrape for: "${queryTerm}"`);

    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(5000);

        const pageData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll(".job_seen_beacon"));
            return cards.map(c => {
                const titleEl = c.querySelector("h2.jobTitle span[id^='jobTitle-']");
                const companyEl = c.querySelector("[data-testid='company-name']");
                const locEl = c.querySelector("[data-testid='text-location']");
                const linkEl = c.querySelector("a.jcs-JobTitle");

                return {
                    title: titleEl?.textContent?.trim() || "",
                    company: companyEl?.textContent?.trim() || "Unknown",
                    location: locEl?.textContent?.trim() || "Ontario, CA",
                    link: (linkEl as HTMLAnchorElement)?.href || ""
                };
            }).filter(j => j.title && j.link);
        });

        for (const job of pageData) {
            const analysis = analyzeJobDetails("", job.title, job.location);
            if (!analysis.isSenior && !analysis.isNonCanadian) {
                jobs.push({
                    ...job,
                    source: "Indeed",
                    job_type: analysis.jobType,
                    date_posted: parseRelativeDate(job.postedText || "")
                });
            }
        }
    } catch (err) {
        console.error("Indeed scrape error:", err);
    }
    return jobs;
}

async function scrapeSimplify(page: Page, context: BrowserContext, queryTerm: string) {
    const jobs: any[] = [];
    const url = `https://simplify.jobs/jobs?q=${encodeURIComponent(queryTerm)}`;
    console.log(`Starting Simplify scrape for: "${queryTerm}"`);

    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4000);

        const pageData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('div[class*="JobCard"]'));
            return cards.map(c => {
                const titleEl = c.querySelector("h3");
                const companyEl = c.querySelector("p");
                const linkEl = c.querySelector("a");

                const dateEl = c.querySelector('[class*="postedAt"], [class*="date"]');

                return {
                    title: titleEl?.textContent?.trim() || "",
                    company: companyEl?.textContent?.trim() || "Unknown",
                    location: "Canada",
                    link: (linkEl as HTMLAnchorElement)?.href || "",
                    postedText: dateEl?.textContent?.trim() || ""
                };
            }).filter(j => j.title && j.link);
        });

        for (const job of pageData) {
            const analysis = analyzeJobDetails("", job.title, job.location);
            if (!analysis.isSenior && !analysis.isNonCanadian) {
                jobs.push({
                    ...job,
                    source: "Simplify",
                    job_type: analysis.jobType,
                    date_posted: parseRelativeDate(job.postedText || "")
                });
            }
        }
    } catch (err) {
        console.error("Simplify scrape error:", err);
    }
    return jobs;
}

async function scrapeFindYourJob(page: Page, context: BrowserContext, queryTerm: string) {
    const jobs: any[] = [];
    const url = `https://www.findyourjob.ca/search?q=${encodeURIComponent(queryTerm)}&l=Ontario`;
    console.log(`Starting FindYourJob scrape for: "${queryTerm}"`);

    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        const pageData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll(".job-listing"));
            return cards.map(c => {
                const titleEl = c.querySelector(".job-title");
                const companyEl = c.querySelector(".job-company");
                const locEl = c.querySelector(".job-location");
                const linkEl = c.querySelector("a");

                return {
                    title: titleEl?.textContent?.trim() || "",
                    company: companyEl?.textContent?.trim() || "Unknown",
                    location: locEl?.textContent?.trim() || "Ontario, CA",
                    link: (linkEl as HTMLAnchorElement)?.href || ""
                };
            }).filter(j => j.title && j.link);
        });

        for (const job of pageData) {
            const analysis = analyzeJobDetails("", job.title, job.location);
            if (!analysis.isSenior && !analysis.isNonCanadian) {
                jobs.push({
                    ...job,
                    source: "FindYourJob",
                    job_type: analysis.jobType,
                    date_posted: parseRelativeDate(job.postedText || "")
                });
            }
        }
    } catch (err) {
        console.error("FindYourJob scrape error:", err);
    }
    return jobs;
}

export async function runScraper() {
    console.log(`[${new Date().toISOString()}] Starting crawler...`);
    const db = await getDb();

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();

    const searchQueries = [
        "junior developer",
        "entry level software",
        "new grad software",
        "junior software engineer",
        "junior web developer",
        "junior data analyst",
        "junior IT",
        "associate developer",
        "junior finance",
        "entry level finance",
        "junior operations",
        "entry level operations",
        "junior marketing",
        "junior HR"
    ];

    let allJobs: any[] = [];
    try {
        for (const query of searchQueries) {
            const shJobs = await scrapeSimplyHired(page, context, query);
            const liJobs = await scrapeLinkedIn(page, context, query);
            const woJobs = await scrapeWorkopolis(page, context, query);
            const inJobs = await scrapeIndeed(page, context, query);
            const siJobs = await scrapeSimplify(page, context, query);
            const fyjJobs = await scrapeFindYourJob(page, context, query);
            const wfJobs = await scrapeWellfound(page, context, query);
            const witJobs = await scrapeWorkInTech(page, context, query);

            const queryJobs = [...shJobs, ...liJobs, ...woJobs, ...inJobs, ...siJobs, ...fyjJobs, ...wfJobs, ...witJobs];
            allJobs = allJobs.concat(queryJobs);

            // Create unique index to prevent future duplicates if it doesn't exist
            try {
                await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedup 
      ON jobs (title, company, location)
    `);
                console.log("Created/Verified unique index idx_jobs_dedup.");
            } catch (err: any) {
                console.error("Error creating unique index:", err.message);
            }

            // Cleanup and Label Updates (One-time or periodic)
            try {
                // Deduplicate
                await db.execute(`
      DELETE FROM jobs
      WHERE id NOT IN (
          SELECT MAX(id)
          FROM jobs
          GROUP BY title, company, location
      )
    `);

                // Purge intermediate
                await db.execute(`
      DELETE FROM jobs
      WHERE title LIKE '%intermediate%' 
         OR title LIKE '%mid-level%' 
         OR title LIKE '%mid level%'
         OR title LIKE '%level 2%'
         OR title LIKE '%level ii%'
    `);

                // Fix incorrectly-tagged Co-op jobs: reset to Full-Time if the title
                // doesn't actually contain a co-op/intern/student term (false positives
                // from the old broad body-text scan).
                await db.execute(`
      UPDATE jobs
      SET job_type = 'Full-Time'
      WHERE job_type = 'Co-op'
        AND title NOT LIKE '%co-op%'
        AND title NOT LIKE '%coop%'
        AND title NOT LIKE '%intern%'
        AND title NOT LIKE '%internship%'
        AND title NOT LIKE '%student%'
        AND title NOT LIKE '%work-study%'
        AND title NOT LIKE '%undergraduate%'
        AND title NOT LIKE '%scholar%'
        AND title NOT LIKE '%placement%'
    `);

                // Update labels
                await db.execute(`
      UPDATE jobs 
      SET job_type = 'Graduating' 
      WHERE (title LIKE '%new grad%' 
         OR title LIKE '%graduating%' 
         OR title LIKE '%new graduate%'
         OR title LIKE '%graduate%'
         OR title LIKE '%graduation%')
        AND job_type != 'Graduating'
    `);

                await db.execute(`
      UPDATE jobs 
      SET job_type = 'Co-op' 
      WHERE (title LIKE '%student%' 
         OR title LIKE '%intern%' 
         OR title LIKE '%internship%' 
         OR title LIKE '%co-op%' 
         OR title LIKE '%coop%'
         OR title LIKE '%work-study%'
         OR title LIKE '%undergraduate%'
         OR title LIKE '%scholar%'
         OR title LIKE '%placement%')
        AND job_type != 'Co-op'
    `);
            } catch (err: any) {
                console.error("Error during DB cleanup/updates:", err.message);
            }
            let queryInserted = 0;
            for (const job of queryJobs) {
                try {
                    await db.execute({
                        sql: `INSERT INTO jobs (title, company, location, link, date_posted, source, job_type) 
                              VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        args: [job.title, job.company, job.location, job.link, job.date_posted || todayET(), job.source, job.job_type || 'Full-Time']
                    });
                    queryInserted++;
                } catch (dbErr: any) {
                    if (!dbErr.message.includes('UNIQUE constraint failed')) {
                        console.error("DB Insert Error:", dbErr.message);
                    }
                }
            }
            if (queryInserted > 0) {
                console.log(`Saved ${queryInserted} new jobs for query: "${query}"`);
            }

            // Random delay between queries to avoid rate limiting
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        }
    } catch (error) {
        console.error("Scraping error:", error);
    } finally {
        await browser.close();
    }

    if (allJobs.length === 0) {
        console.log("No jobs scraped. Using fallback API.");
        const fallbackJobs = await fetchRemoteJobs();
        for (const job of fallbackJobs) {
            try {
                await db.execute({
                    sql: `INSERT INTO jobs (title, company, location, link, date_posted, source, job_type) 
                          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [job.title, job.company, job.location, job.link, job.date_posted || job.date || todayET(), job.source, job.job_type || 'Full-Time']
                });
            } catch (e) { }
        }
    }

    // Prune expired jobs
    await pruneExpiredJobs(db, context);

    console.log(`[${new Date().toISOString()}] Crawler finished.`);
}

async function pruneExpiredJobs(db: any, context: BrowserContext) {
    console.log(`[${new Date().toISOString()}] Starting availability check for existing jobs...`);
    // Increase limit to 200 to check more old jobs during regular scraper runs
    const result = await db.execute(`SELECT id, link FROM jobs ORDER BY id DESC LIMIT 200`);
    const existingJobs = result.rows;

    let deleted = 0;
    const batchSize = 10;

    for (let i = 0; i < existingJobs.length; i += batchSize) {
        const batch = existingJobs.slice(i, i + batchSize);
        await Promise.all(batch.map(async (row: any) => {
            try {
                if (row.link.includes('simplyhired') || row.link.includes('linkedin')) {
                    const res = await context.request.get(row.link, { timeout: 10000, maxRedirects: 2 });
                    const finalUrl = res.url();
                    const html = await res.text();
                    const analysis = analyzeJobDetails(html, "", ""); // Title and Location not provided for broad unavailability check

                    // SimplyHired redirects to search results if job is gone
                    if (row.link.includes('simplyhired') && (res.status() === 404 || finalUrl.includes('search?q=') || analysis.isUnavailable || analysis.isNonCanadian)) {
                        await db.execute({ sql: `DELETE FROM jobs WHERE id = ?`, args: [row.id] });
                        deleted++;
                    }
                    // LinkedIn redirected to login or a generic jobs page
                    else if (row.link.includes('linkedin') && (res.status() === 404 || finalUrl.includes('/login') || finalUrl.includes('/jobs/search') || analysis.isUnavailable || analysis.isNonCanadian)) {
                        await db.execute({ sql: `DELETE FROM jobs WHERE id = ?`, args: [row.id] });
                        deleted++;
                    }
                }
            } catch (e) {
                // Ignore timeout failures
            }
        }));
    }

    console.log(`[${new Date().toISOString()}] Pruned ${deleted} expired or unavailable jobs from the database.`);
}

if (require.main === module) {
    runScraper().catch(console.error);
}
