const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 9898;

app.use(express.static('public'));
app.use(express.json());

app.post('/api/scrape', async (req, res) => {
    const { category, location } = req.body;
    if (!category || !location) return res.status(400).json({ error: 'Missing fields' });

    const searchQuery = `${category} in ${location}`;
    console.log(`\n--- STARTING MASS SCRAPE: ${searchQuery} ---`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false, // Keep visible so you can see progress
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
            defaultViewport: null
        });

        const page = await browser.newPage();
        
        // 1. Search
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

        // 2. LONG SCROLL (To get more results)
        console.log("Scrolling deeper to find more businesses...");
        await autoScroll(page);

        // 3. Extract All Links
        const links = await page.evaluate(() => {
            const feed = document.querySelector('div[role="feed"]');
            if (!feed) return [];
            const anchors = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));
            return anchors.map(a => a.href);
        });

        // REMOVED THE .slice(0, 10) LIMIT HERE
        const uniqueLinks = [...new Set(links)]; 
        console.log(`Found ${uniqueLinks.length} total places. Starting scraping...`);

        const results = [];

        // 4. Scrape Loop
        for (const [index, link] of uniqueLinks.entries()) {
            try {
                // Log progress
                console.log(`Scraping ${index + 1}/${uniqueLinks.length}...`);
                
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });

                try {
                    await page.waitForSelector('h1', { timeout: 3000 });
                } catch (e) { continue; }

                const data = await page.evaluate(() => {
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
                    
                    // Phone Regex Fallback
                    if (!phone || phone === "N/A") {
                        const indianPhoneRegex = /((\+91|0)[\s-]?)?(\d{2,5}[\s-]?\d{6,8})|(\d{5}[\s-]?\d{5})/;
                        const match = bodyText.match(indianPhoneRegex);
                        if (match) phone = match[0];
                    }

                    return { name, phone, address };
                });

                if (data.phone.length > 20) data.phone = "N/A";
                results.push(data);

            } catch (err) {
                console.log(`Skipped item due to error.`);
            }
        }

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

                // Stop if we haven't found new items in a while (end of list)
                if (scrollHeight === lastHeight) {
                    noChangeCount++;
                } else {
                    noChangeCount = 0;
                }
                lastHeight = scrollHeight;

                // Stop if:
                // 1. We have scrolled A LOT (approx 100 items worth)
                // 2. Or the list hasn't grown in 5 scrolls (End of results)
                if (totalHeight > 40000 || noChangeCount > 5) { 
                    clearInterval(timer);
                    resolve();
                }
            }, 800);
        });
    });
}

app.listen(PORT, () => {
    console.log(`Seraphin UNLIMITED Mode running at http://localhost:${PORT}`);
});