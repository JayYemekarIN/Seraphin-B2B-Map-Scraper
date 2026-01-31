const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 9898;


const MAX_RESULTS = 10; // Change this to Configure the limit.

app.use(express.static('public'));
app.use(express.json());

app.post('/api/scrape', async (req, res) => {
    const { category, location } = req.body;
    if (!category || !location) return res.status(400).json({ error: 'Missing fields' });

    const searchQuery = `${category} in ${location}`;
    console.log(`\n--- STARTING SMART SCRAPE: ${searchQuery} ---`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false,
            slowMo: 50, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
            defaultViewport: null
        });

        const page = await browser.newPage();
        
        // --- STEP 1: GOOGLE MAPS ---
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        try {
            await page.waitForSelector('div[role="feed"]', { timeout: 20000 });
        } catch (e) {
            console.log("Error: Feed not found.");
            await browser.close();
            return res.json({ success: true, data: [] });
        }

        console.log("Scrolling to find businesses...");
        await autoScroll(page);

        // Extract Links
        const links = await page.evaluate(() => {
            const feed = document.querySelector('div[role="feed"]');
            if (!feed) return [];
            const anchors = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));
            return anchors.map(a => a.href);
        });

        const uniqueLinks = [...new Set(links)].slice(0, MAX_RESULTS); 
        console.log(`Found ${uniqueLinks.length} potential places. Starting deep scrape...`);

        const results = [];

        // --- STEP 2: DETAILS SCRAPE LOOP ---
        for (const [index, link] of uniqueLinks.entries()) {
            try {
                // A. Go to Maps Listing
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });
                try { await page.waitForSelector('h1', { timeout: 3000 }); } catch (e) { continue; }

                let data = await page.evaluate(() => {
                    const name = document.querySelector('h1')?.innerText || "N/A";
                    const bodyText = document.body.innerText;

                    // Address
                    let address = "N/A";
                    const addressBtn = document.querySelector('button[data-item-id="address"]');
                    if (addressBtn) {
                        address = addressBtn.getAttribute('aria-label') || addressBtn.innerText;
                        address = address.replace('Address: ', '').trim();
                    }

                    // Phone
                    let phone = "N/A";
                    const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]');
                    if (phoneBtn) {
                        phone = phoneBtn.getAttribute('aria-label') || phoneBtn.innerText;
                        phone = phone.replace('Phone: ', '').trim();
                    }
                    
                    if (!phone || phone === "N/A") {
                        const indianPhoneRegex = /((\+91|0)[\s-]?)?(\d{2,5}[\s-]?\d{6,8})|(\d{5}[\s-]?\d{5})/;
                        const match = bodyText.match(indianPhoneRegex);
                        if (match) phone = match[0];
                    }

                    return { name, phone, address };
                });

                if (data.phone.length > 20) data.phone = "N/A";

                // --- STEP 3: EMAIL SCRAPE ---
                if (data.name !== "N/A") {
                    console.log(`(${index + 1}/${uniqueLinks.length}) Checking: ${data.name}...`);
                    
                    const emailQuery = `${data.name} ${location} email contact`;
                    
                    await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(emailQuery)}`, {
                        waitUntil: 'domcontentloaded',
                        timeout: 10000
                    });

                    const email = await page.evaluate(() => {
                        const body = document.body.innerText;
                        const emailMatch = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
                        return emailMatch ? emailMatch[0] : "N/A";
                    });

                    data.email = email;
                    console.log(`   -> Email Found: ${data.email}`);
                } else {
                    data.email = "N/A";
                }

                // --- FILTER LOGIC FIXED HERE ---
                // Save if Phone is NOT N/A **OR** Email is NOT N/A
                if (data.phone !== "N/A" || data.email !== "N/A") {
                    results.push(data);
                    console.log(`   [+] LEAD SAVED (Has Contact Info)`);
                } else {
                    console.log(`   [-] SKIPPED (No Phone AND No Email)`);
                }

                // --- RANDOM DELAY ---
                const pauseTime = Math.floor(Math.random() * 3000) + 2000;
                await new Promise(r => setTimeout(r, pauseTime));

            } catch (err) {
                console.log(`Skipped item due to error: ${err.message}`);
            }
        }

        console.log(`\n--- SCRAPE COMPLETE. Saved ${results.length} valid leads. ---`);
        res.json({ success: true, data: results });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

async function autoScroll(page) {
    await page.evaluate(async () => {
        const wrapper = document.querySelector('div[role="feed"]');
        if (!wrapper) return;
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 1000;
            let noChangeCount = 0;
            let lastHeight = 0;
            let timer = setInterval(() => {
                let scrollHeight = wrapper.scrollHeight;
                wrapper.scrollBy(0, distance);
                totalHeight += distance;
                if (scrollHeight === lastHeight) noChangeCount++;
                else noChangeCount = 0;
                lastHeight = scrollHeight;
                if (totalHeight > 25000 || noChangeCount > 5) { 
                    clearInterval(timer);
                    resolve();
                }
            }, 800);
        });
    });
}

app.listen(PORT, () => {
    console.log(`Seraphin (Smart Filter) running at http://localhost:${PORT}`);
});