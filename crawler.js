const puppeteer = require('puppeteer');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');

class SpiderCrawler {
    constructor(options = {}) {
        this.startUrl = options.startUrl;
        this.searchPattern = options.searchPattern;
        // 0 = unlimited, otherwise use the provided value or default to 100
        this.maxPages = options.maxPages === 0 ? Infinity : (options.maxPages || 100);
        this.concurrency = options.concurrency || 3; // Parallel pages
        
        // Locale options
        this.localeFilter = options.localeFilter || null; // e.g., "/en/" - only crawl URLs containing this
        this.detectCrossLocale = options.detectCrossLocale || false; // Find links to other locales
        this.defaultLocaleHasPrefix = options.defaultLocaleHasPrefix || false; // true = /en/, false = no prefix
        this.otherLocales = this.parseLocales(options.otherLocales || '/de/, /fr/, /es/'); // Array of other locale prefixes
        
        this.onProgress = options.onProgress || (() => {});
        this.onFinding = options.onFinding || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onError = options.onError || (() => {});
        this.onLog = options.onLog || (() => {});
        
        this.browser = null;
        this.visited = new Set();
        this.queued = new Set();
        this.queue = [];
        this.findings = [];
        this.isRunning = false;
        this.isPaused = false;
        this.pagesCrawled = 0;
        this.rootDomain = null;
        this.activeWorkers = 0;
        this.errors = [];
    }

    log(message, type = 'info') {
        console.log(`[Spider] ${message}`);
        this.onLog({ message, type, timestamp: new Date().toISOString() });
    }

    async start() {
        if (this.isRunning) return;
        
        try {
            this.isRunning = true;
            this.isPaused = false;
            
            // Parse root domain
            const urlObj = new URL(this.startUrl);
            this.rootDomain = urlObj.hostname;
            
            this.log(`Starting crawl on ${this.startUrl}`);
            this.log(`Searching for pattern: ${this.searchPattern}`);
            this.log(`Max pages: ${this.maxPages}, Concurrency: ${this.concurrency}`);
            
            // Initialize queue
            this.queue = [this.startUrl];
            this.queued.add(this.startUrl);
            
            // Launch browser with more robust settings
            this.log('Launching browser...');
            this.browser = await puppeteer.launch({
                headless: true,
                ignoreHTTPSErrors: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                    '--disable-web-security',
                    '--ignore-certificate-errors'
                    // Removed --single-process and --no-zygote as they cause frame detachment errors
                ],
                timeout: 120000,
                protocolTimeout: 120000
            });
            
            this.log('Browser launched successfully');
            
            // Start concurrent crawling
            await this.crawlConcurrently();
            
        } catch (error) {
            this.log(`Fatal error: ${error.message}`, 'error');
            this.onError({ message: error.message, type: 'fatal', stack: error.stack });
        } finally {
            await this.cleanup();
            
            // Send completion
            this.onComplete({
                pagesCrawled: this.pagesCrawled,
                findings: this.findings,
                totalFindings: this.findings.length,
                errors: this.errors.length
            });
        }
    }

    async crawlConcurrently() {
        const workers = [];
        
        // Create worker pool
        for (let i = 0; i < this.concurrency; i++) {
            workers.push(this.createWorker(i));
        }
        
        // Wait for all workers to complete
        await Promise.all(workers);
    }

    async createWorker(workerId) {
        let page = null;
        
        try {
            page = await this.browser.newPage();
            
            // Set viewport and user agent
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
            
            // Set longer timeout
            page.setDefaultNavigationTimeout(45000);
            page.setDefaultTimeout(45000);
            
            // Disable unnecessary resources for speed
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            // Handle page errors gracefully
            page.on('error', (err) => {
                this.log(`Page error: ${err.message}`, 'error');
            });
            
            page.on('pageerror', (err) => {
                // Ignore page JavaScript errors
            });
            
            this.log(`Worker ${workerId} started`);
            
            // Process queue
            while (this.isRunning && (this.queue.length > 0 || this.activeWorkers > 0) && this.pagesCrawled < this.maxPages) {
                // Check if paused
                while (this.isPaused && this.isRunning) {
                    await this.sleep(100);
                }
                
                if (!this.isRunning) break;
                
                // Get next URL from queue
                const currentUrl = this.queue.shift();
                
                if (!currentUrl) {
                    // Queue empty, wait a bit for other workers to add URLs
                    await this.sleep(200);
                    continue;
                }
                
                if (this.visited.has(currentUrl)) continue;
                
                this.visited.add(currentUrl);
                this.pagesCrawled++;
                this.activeWorkers++;
                
                // Send progress update
                this.onProgress({
                    currentUrl,
                    pagesCrawled: this.pagesCrawled,
                    maxPages: this.maxPages,
                    queueSize: this.queue.length,
                    findingsCount: this.findings.length,
                    status: 'scanning',
                    workerId
                });
                
                try {
                    await this.crawlPage(page, currentUrl);
                } catch (error) {
                    this.log(`Error on ${currentUrl}: ${error.message}`, 'error');
                    this.errors.push({ url: currentUrl, error: error.message });
                    this.onError({
                        message: `Failed: ${currentUrl} - ${error.message}`,
                        type: 'page',
                        url: currentUrl
                    });
                }
                
                this.activeWorkers--;
                
                // Rate limiting - be nice to servers
                await this.sleep(200);
            }
            
            this.log(`Worker ${workerId} finished`);
            
        } catch (error) {
            this.log(`Worker ${workerId} crashed: ${error.message}`, 'error');
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch {
                    // Page already closed
                }
            }
        }
    }

    async crawlPage(page, url) {
        // Navigate with retry
        let retries = 2;
        let lastError = null;
        
        while (retries > 0) {
            try {
                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                
                // Wait a bit for dynamic content
                await this.sleep(1000);
                
                break; // Success
            } catch (error) {
                lastError = error;
                retries--;
                if (retries > 0) {
                    this.log(`Retrying ${url}...`, 'warning');
                    await this.sleep(1000);
                }
            }
        }
        
        if (retries === 0 && lastError) {
            throw lastError;
        }
        
        // Extract all links
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]')).map(a => {
                try {
                    return {
                        href: a.href,
                        text: (a.innerText || a.textContent || '').trim().substring(0, 100),
                        isVisible: a.offsetParent !== null || window.getComputedStyle(a).display !== 'none'
                    };
                } catch {
                    return null;
                }
            }).filter(Boolean);
        });
        
        // Process links
        for (const link of links) {
            if (!link.href) continue;
            
            // Check if link matches search pattern (normal mode)
            if (this.matchesPattern(link.href)) {
                const finding = {
                    id: uuidv4(),
                    sourcePage: url,
                    anchorText: link.text || '[No Text / Image]',
                    linkedTo: link.href,
                    isVisible: link.isVisible,
                    findingType: 'pattern_match',
                    timestamp: new Date().toISOString()
                };
                
                this.findings.push(finding);
                this.onFinding(finding);
                this.log(`FOUND: ${link.href} on ${url}`, 'warning');
            }
            
            // Cross-locale detection mode
            if (this.detectCrossLocale) {
                const isCrossLocaleLink = this.isCrossLocaleLink(url, link.href);
                if (isCrossLocaleLink) {
                    const sourceLocale = this.extractLocale(url);
                    const targetLocale = this.extractLocale(link.href);
                    
                    const finding = {
                        id: uuidv4(),
                        sourcePage: url,
                        anchorText: link.text || '[No Text / Image]',
                        linkedTo: link.href,
                        isVisible: link.isVisible,
                        findingType: 'cross_locale',
                        sourceLocale: sourceLocale || 'default',
                        targetLocale: targetLocale || 'default',
                        timestamp: new Date().toISOString()
                    };
                    
                    this.findings.push(finding);
                    this.onFinding(finding);
                    this.log(`CROSS-LOCALE: ${sourceLocale || 'default'} → ${targetLocale || 'default'} on ${url}`, 'warning');
                }
            }
            
            // Add internal links to queue
            this.addToQueue(link.href);
        }
    }
    
    /**
     * Parse locale string into array
     */
    parseLocales(localeString) {
        if (!localeString) return [];
        return localeString
            .split(',')
            .map(l => l.trim().toLowerCase())
            .filter(l => l.length > 0)
            .map(l => l.startsWith('/') ? l : `/${l}`)
            .map(l => l.endsWith('/') ? l : `${l}/`);
    }
    
    /**
     * Check if a link goes to a different locale than the source page
     */
    isCrossLocaleLink(sourceUrl, targetUrl) {
        try {
            const targetUrlObj = new URL(targetUrl);
            
            // Only check internal links
            if (targetUrlObj.hostname !== this.rootDomain) return false;
            
            // Skip asset URLs
            if (this.isAssetUrl(targetUrl)) return false;
            
            const sourceLocale = this.extractLocale(sourceUrl);
            const targetLocale = this.extractLocale(targetUrl);
            
            // CASE 1: Default locale has NO prefix (e.g., English = /about)
            if (!this.defaultLocaleHasPrefix) {
                // Source is default locale (no prefix)
                if (!sourceLocale) {
                    // Target has a locale prefix = CROSS-LOCALE!
                    // e.g., /about → /de/contact
                    if (targetLocale) {
                        return true;
                    }
                }
                // Source has a locale prefix (e.g., /de/about)
                else {
                    // Target goes to a DIFFERENT locale prefix
                    if (targetLocale && targetLocale !== sourceLocale) {
                        return true;
                    }
                    // Target goes to default (no prefix) when it shouldn't
                    // e.g., /de/about → /contact (should be /de/contact)
                    if (!targetLocale) {
                        return true;
                    }
                }
            }
            // CASE 2: Default locale HAS prefix (e.g., English = /en/about)
            else {
                // Both have locales but they're different
                if (sourceLocale && targetLocale && sourceLocale !== targetLocale) {
                    return true;
                }
                // Source has locale but target doesn't
                if (sourceLocale && !targetLocale) {
                    return true;
                }
            }
            
            return false;
        } catch {
            return false;
        }
    }
    
    /**
     * Extract locale from URL path (e.g., /de/, /fr-ca/)
     * Only extracts known locale prefixes from otherLocales list
     */
    extractLocale(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname.toLowerCase();
            
            // Check against known other locales
            for (const locale of this.otherLocales) {
                if (pathname.startsWith(locale)) {
                    // Return just the locale code without slashes
                    return locale.replace(/\//g, '');
                }
            }
            
            // Also check for standard patterns as fallback
            const localeMatch = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2,4})?)\//i);
            if (localeMatch) {
                return localeMatch[1].toLowerCase();
            }
            
            return null; // No locale prefix = default locale
        } catch {
            return null;
        }
    }
    
    /**
     * Check if URL is an asset (not a page)
     */
    isAssetUrl(url) {
        try {
            const urlObj = new URL(url);
            return /\.(css|js|jpg|jpeg|png|gif|svg|webp|ico|woff|woff2|ttf|eot|pdf|zip|mp4|mp3)$/i.test(urlObj.pathname);
        } catch {
            return false;
        }
    }

    matchesPattern(url) {
        if (!url || !this.searchPattern) return false;
        
        // Support multiple search patterns separated by comma
        const patterns = this.searchPattern.split(',').map(p => p.trim()).filter(Boolean);
        
        return patterns.some(pattern => {
            // Check if pattern is a regex (starts and ends with /)
            if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
                try {
                    const regex = new RegExp(pattern.slice(1, -1), 'i');
                    return regex.test(url);
                } catch {
                    return url.toLowerCase().includes(pattern.toLowerCase());
                }
            }
            
            // Simple string match (case insensitive)
            return url.toLowerCase().includes(pattern.toLowerCase());
        });
    }

    addToQueue(href) {
        try {
            const urlObj = new URL(href);
            
            // Only crawl same domain
            if (urlObj.hostname !== this.rootDomain) return;
            
            // Skip certain file types
            if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|exe|dmg|mp4|mp3|wav|avi|mov|ico|woff|woff2|ttf|eot)$/i.test(urlObj.pathname)) {
                return;
            }
            
            // Skip certain paths
            if (/\/(wp-admin|wp-login|admin|login|logout|feed|rss|cart|checkout|account)/i.test(urlObj.pathname)) {
                return;
            }
            
            // LOCALE FILTER: Control which URLs to crawl
            if (this.detectCrossLocale && !this.defaultLocaleHasPrefix && !this.localeFilter) {
                // Default locale has no prefix - only crawl URLs WITHOUT locale prefix
                const hasLocalePrefix = this.otherLocales.some(locale => 
                    urlObj.pathname.toLowerCase().startsWith(locale)
                );
                if (hasLocalePrefix) {
                    // Skip - this is a non-default locale page
                    return;
                }
            } else if (this.localeFilter) {
                // Explicit locale filter set
                const filters = this.localeFilter.split(',').map(f => f.trim().toLowerCase());
                const pathLower = urlObj.pathname.toLowerCase();
                const matchesLocale = filters.some(filter => pathLower.includes(filter));
                
                if (!matchesLocale) {
                    // Don't add this URL to queue - it's outside our locale scope
                    return;
                }
            }
            
            // Skip query strings that look like tracking/sessions
            if (urlObj.search && /(\?|&)(utm_|fbclid|gclid|session|token)/i.test(urlObj.search)) {
                urlObj.search = '';
            }
            
            // Clean URL (remove hash)
            urlObj.hash = '';
            let cleanUrl = urlObj.toString();
            
            // Remove trailing slash for consistency (except for root)
            if (cleanUrl !== `${urlObj.protocol}//${urlObj.hostname}/`) {
                cleanUrl = cleanUrl.replace(/\/$/, '');
            }
            
            // Add to queue if not already visited or queued
            if (!this.visited.has(cleanUrl) && !this.queued.has(cleanUrl)) {
                this.queue.push(cleanUrl);
                this.queued.add(cleanUrl);
            }
            
        } catch {
            // Invalid URL, skip
        }
    }

    pause() {
        this.isPaused = true;
        this.log('Crawl paused');
        this.onProgress({
            pagesCrawled: this.pagesCrawled,
            maxPages: this.maxPages,
            queueSize: this.queue.length,
            findingsCount: this.findings.length,
            status: 'paused'
        });
    }

    resume() {
        this.isPaused = false;
        this.log('Crawl resumed');
        this.onProgress({
            pagesCrawled: this.pagesCrawled,
            maxPages: this.maxPages,
            queueSize: this.queue.length,
            findingsCount: this.findings.length,
            status: 'scanning'
        });
    }

    async stop() {
        this.log('Stopping crawl...');
        this.isRunning = false;
        this.isPaused = false;
    }

    async cleanup() {
        if (this.browser) {
            try {
                this.log('Closing browser...');
                await this.browser.close();
            } catch {
                // Browser already closed
            }
            this.browser = null;
        }
        this.isRunning = false;
        this.log('Cleanup complete');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getFindings() {
        return this.findings;
    }

    getStats() {
        return {
            pagesCrawled: this.pagesCrawled,
            queueSize: this.queue.length,
            findingsCount: this.findings.length,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            errors: this.errors.length
        };
    }
}

module.exports = SpiderCrawler;
