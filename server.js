const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

// Valid test API keys
const VALID_API_KEYS = new Set(['secret_test_key_123', 'client_key_456']);

app.post('/v1/scrape', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const { url, render_js = false } = req.body;

    // 1. Authentication Check
    if (!apiKey || !VALID_API_KEYS.has(apiKey)) {
        return res.status(401).json({ error: 'Invalid or missing X-API-Key header.' });
    }

    if (!url) {
        return res.status(400).json({ error: 'Please provide a valid "url" parameter.' });
    }

    // -------------------------------------------------------------
    // MODE A: Fast Static Engine (Axios + Cheerio) - ~200ms execution
    // -------------------------------------------------------------
    if (!render_js) {
        try {
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            });

            const $ = cheerio.load(html);
            const title = $('title').text().trim();

            const headings = [];
            $('h1, h2').each((_, el) => {
                const text = $(el).text().trim();
                if (text) headings.push(text);
            });

            const links = [];
            $('a').each((_, el) => {
                const href = $(el).attr('href');
                if (href && href.startsWith('http')) links.push(href);
            });

            return res.json({
                success: true,
                engine: 'fast_http',
                url: url,
                data: {
                    title: title,
                    headings: headings.slice(0, 10),
                    link_count: links.length,
                    sample_links: links.slice(0, 5)
                }
            });
        } catch (error) {
            return res.status(500).json({ error: `Fast HTTP scraping failed: ${error.message}` });
        }
    }

    // -------------------------------------------------------------
    // MODE B: Headless Browser Engine (Playwright) - For JS heavy pages
    // -------------------------------------------------------------
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const title = await page.title();

        const headings = await page.locator('h1, h2').evaluateAll(
            elements => elements.map(el => el.innerText.trim()).filter(Boolean)
        );

        const links = await page.locator('a').evaluateAll(
            elements => elements.map(el => el.href).filter(href => href.startsWith('http'))
        );

        await browser.close();

        return res.json({
            success: true,
            engine: 'playwright_browser',
            url: url,
            data: {
                title: title,
                headings: headings.slice(0, 10),
                link_count: links.length,
                sample_links: links.slice(0, 5)
            }
        });

    } catch (error) {
        if (browser) await browser.close();
        return res.status(500).json({ error: `Browser scraping failed: ${error.message}` });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Node.js Scraping API listening on http://localhost:${PORT}`);
});