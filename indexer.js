const puppeteer = require('puppeteer');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

/**
 * Site Indexer - Crawls a site once and saves all links for instant searching later
 */
class SiteIndexer {
    constructor(options = {}) {
        this.startUrl = options.startUrl;
        // 0 = unlimited, otherwise use the provided value or default to 1000
        this.maxPages = options.maxPages === 0 ? Infinity : (options.maxPages || 1000);
        this.concurrency = options.concurrency || 3;
        this.localeFilter = options.localeFilter || null; // null = all, 'default' = no prefix, 'en'/'de'/etc = specific locale
        this.excludeLocaleSwitcher = options.excludeLocaleSwitcher !== false; // default true
        this.urlsToIndex = options.urlsToIndex || null; // If set, only index these specific URLs
        this.existingIndex = options.existingIndex || null; // If set, merge into this existing index
        this.onProgress = options.onProgress || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onError = options.onError || (() => {});
        this.onLog = options.onLog || (() => {});
        
        // Known locale prefixes for detecting "default" locale
        this.knownLocales = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'tr', 'sv', 'da', 'no', 'fi', 'en-us', 'en-gb', 'pt-br', 'zh-cn', 'zh-tw'];
        if (this.localeFilter && !this.knownLocales.includes(this.localeFilter)) {
            this.knownLocales.push(this.localeFilter);
        }
        
        // Locale switcher link texts to exclude
        this.localeSwitcherTexts = new Set([
            // English names
            'english', 'german', 'french', 'spanish', 'italian', 'portuguese', 'dutch', 'polish',
            'russian', 'japanese', 'korean', 'chinese', 'arabic', 'hindi', 'turkish', 'swedish',
            'danish', 'norwegian', 'finnish', 'czech', 'hungarian', 'romanian', 'bulgarian',
            'croatian', 'serbian', 'slovenian', 'slovak', 'ukrainian', 'greek', 'hebrew',
            'thai', 'vietnamese', 'indonesian', 'malay', 'filipino', 'bengali', 'catalan',
            'latvian', 'lithuanian', 'estonian', 'icelandic', 'persian', 'farsi', 'urdu',
            'swahili', 'afrikaans', 'welsh', 'irish', 'scottish', 'basque', 'galician',
            // Native names
            'deutsch', 'français', 'español', 'italiano', 'português', 'nederlands', 'polski',
            'русский', '日本語', '한국어', '中文', '简体中文', '繁體中文', 'العربية', 'हिन्दी',
            'türkçe', 'svenska', 'dansk', 'norsk', 'suomi', 'čeština', 'magyar', 'română',
            'български', 'hrvatski', 'српски', 'slovenščina', 'slovenčina', 'українська',
            'ελληνικά', 'עברית', 'ไทย', 'tiếng việt', 'bahasa indonesia', 'melayu', 'filipino',
            'বাংলা', 'català', 'latviešu', 'lietuvių', 'eesti', 'íslenska', 'فارسی', 'اردو',
            'kiswahili', 'cymraeg', 'gaeilge', 'euskara', 'galego',
            // Short codes (2-3 letter ISO codes)
            'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi',
            'tr', 'sv', 'da', 'no', 'fi', 'cs', 'hu', 'ro', 'bg', 'hr', 'sr', 'sl', 'sk', 'uk',
            'el', 'he', 'th', 'vi', 'id', 'ms', 'tl', 'bn', 'ca', 'lv', 'lt', 'et', 'is', 'fa',
            'ur', 'sw', 'af', 'cy', 'ga', 'eu', 'gl', 'mt', 'lb', 'mk', 'sq', 'bs', 'hy', 'ka',
            'az', 'kk', 'uz', 'tg', 'mn', 'ne', 'si', 'km', 'lo', 'my',
            // With country codes
            'en-us', 'en-gb', 'en-au', 'en-ca', 'en-nz', 'en-ie', 'en-za', 'en-in', 'en-sg',
            'pt-br', 'pt-pt', 'zh-cn', 'zh-tw', 'zh-hk', 'zh-sg',
            'es-es', 'es-mx', 'es-ar', 'es-co', 'es-cl', 'es-pe',
            'fr-fr', 'fr-ca', 'fr-be', 'fr-ch',
            'de-de', 'de-at', 'de-ch',
            'nl-nl', 'nl-be',
            'it-it', 'it-ch',
            // Abbreviations
            'eng', 'ger', 'deu', 'fra', 'fre', 'spa', 'ita', 'por', 'dut', 'nld', 'pol', 'rus',
            'jpn', 'kor', 'chn', 'chi', 'ara', 'hin', 'tur', 'swe', 'dan', 'nor', 'fin',
            // Flag emojis (common ones)
            '🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇵🇹', '🇧🇷', '🇳🇱', '🇵🇱', '🇷🇺',
            '🇯🇵', '🇰🇷', '🇨🇳', '🇹🇼', '🇭🇰', '🇸🇦', '🇮🇳', '🇹🇷', '🇸🇪', '🇩🇰', '🇳🇴',
            '🇫🇮', '🇨🇿', '🇭🇺', '🇷🇴', '🇧🇬', '🇭🇷', '🇷🇸', '🇸🇮', '🇸🇰', '🇺🇦', '🇬🇷',
            '🇮🇱', '🇹🇭', '🇻🇳', '🇮🇩', '🇲🇾', '🇵🇭', '🇧🇩', '🇦🇹', '🇨🇭', '🇧🇪', '🇨🇦',
            '🇦🇺', '🇳🇿', '🇮🇪', '🇿🇦', '🇸🇬', '🇲🇽', '🇦🇷', '🇨🇴', '🇨🇱', '🇵🇪'
        ]);
        
        this.browser = null;
        this.visited = new Set();
        this.queued = new Set();
        this.queue = [];
        this.isRunning = false;
        this.isPaused = false;
        this.pagesCrawled = 0;
        this.rootDomain = null;
        this.activeWorkers = 0;
        this.errors = [];
        this.totalLinksFound = 0;
        
        // The index: stores all links found on each page
        this.index = {
            metadata: {
                domain: null,
                startUrl: null,
                crawledAt: null,
                createdAt: null,
                localeFilter: null,
                totalPages: 0,
                totalLinks: 0
            },
            pages: {}, // { pageUrl: { title, links: [{href, text, isExternal, status}] } }
            healthReport: {
                broken: [],      // 404, 500, etc.
                redirects: [],   // 301, 302
                crossLocale: [], // locale mismatches
                healthy: 0       // 200 OK count
            }
        };
        
        // Index storage directory
        this.indexDir = path.join(__dirname, 'indexes');
        if (!fs.existsSync(this.indexDir)) {
            fs.mkdirSync(this.indexDir, { recursive: true });
        }
    }

    log(message, type = 'info') {
        console.log(`[Indexer] ${message}`);
        this.onLog({ message, type, timestamp: new Date().toISOString() });
    }

    /**
     * Build index for the site
     */
    async buildIndex() {
        if (this.isRunning) return;
        
        try {
            this.isRunning = true;
            this.isPaused = false;
            
            const urlObj = new URL(this.startUrl);
            this.rootDomain = urlObj.hostname;
            
            this.index.metadata.domain = this.rootDomain;
            this.index.metadata.startUrl = this.startUrl;
            this.index.metadata.crawledAt = new Date().toISOString();
            this.index.metadata.createdAt = new Date().toISOString();
            this.index.metadata.localeFilter = this.localeFilter;
            
            const localeInfo = this.localeFilter 
                ? (this.localeFilter === 'default' ? '(default locale only)' : `(/${this.localeFilter}/ only)`)
                : '(full site)';
            
            // Check if this is incremental mode (indexing specific URLs only)
            if (this.urlsToIndex && this.urlsToIndex.length > 0) {
                this.log(`Incremental indexing: ${this.urlsToIndex.length} specific URLs`);
                this.queue = [...this.urlsToIndex];
                for (const url of this.urlsToIndex) {
                    this.queued.add(url);
                }
                // If we have an existing index, start with its data
                if (this.existingIndex) {
                    this.index = this.existingIndex;
                    this.totalLinksFound = this.existingIndex.metadata?.totalLinks || 0;
                }
            } else {
                this.log(`Building index for ${this.rootDomain} ${localeInfo}`);
                this.queue = [this.startUrl];
                this.queued.add(this.startUrl);
            }
            
            // Launch browser with robust settings
            this.log('Launching browser...');
            try {
                const launchOptions = {
                    headless: true,
                    ignoreHTTPSErrors: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--ignore-certificate-errors',
                        '--window-size=1920,1080'
                        // Removed --single-process and --no-zygote as they cause frame detachment errors
                    ],
                    timeout: 120000,
                    protocolTimeout: 120000
                };
                if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                }
                this.browser = await puppeteer.launch(launchOptions);
            } catch (launchError) {
                throw launchError;
            }
            
            this.log('Browser launched successfully');
            
            // Start concurrent indexing
            await this.indexConcurrently();
            
            // Update metadata
            this.index.metadata.totalPages = Object.keys(this.index.pages).length;
            this.index.metadata.totalLinks = Object.values(this.index.pages)
                .reduce((sum, page) => sum + page.links.length, 0);
            
            // Save index
            const indexPath = this.saveIndex();
            
            this.onComplete({
                domain: this.rootDomain,
                totalPages: this.index.metadata.totalPages,
                totalLinks: this.index.metadata.totalLinks,
                indexPath,
                healthReport: this.index.healthReport
            });
            
        } catch (error) {
            this.log(`Fatal error: ${error.message}`, 'error');
            this.onError({ message: error.message, type: 'fatal' });
        } finally {
            await this.cleanup();
        }
    }

    async indexConcurrently() {
        const workers = [];
        for (let i = 0; i < this.concurrency; i++) {
            // Stagger worker creation to prevent race conditions
            await this.sleep(200 * i);
            workers.push(this.createWorker(i));
        }
        await Promise.all(workers);
    }

    async createWorker(workerId) {
        let page = null;
        
        try {
            page = await this.browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
            page.setDefaultNavigationTimeout(45000);
            page.setDefaultTimeout(45000);
            
            // Block images/styles for speed
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });
            
            // Handle page errors gracefully
            page.on('error', (err) => {
                this.log(`Page error in worker ${workerId}: ${err.message}`, 'error');
            });
            
            page.on('pageerror', () => {
                // Ignore page JavaScript errors
            });
            
            this.log(`Worker ${workerId} started`);
            
            while (this.isRunning && (this.queue.length > 0 || this.activeWorkers > 0) && this.pagesCrawled < this.maxPages) {
                while (this.isPaused && this.isRunning) {
                    await this.sleep(100);
                }
                
                if (!this.isRunning) break;
                
                const currentUrl = this.queue.shift();
                if (!currentUrl || this.visited.has(currentUrl)) {
                    if (!currentUrl) await this.sleep(200);
                    continue;
                }
                
                this.visited.add(currentUrl);
                this.pagesCrawled++;
                this.activeWorkers++;
                
                this.onProgress({
                    currentUrl,
                    pagesIndexed: this.pagesCrawled,
                    linksFound: this.totalLinksFound,
                    maxPages: this.maxPages,
                    queueSize: this.queue.length,
                    status: 'indexing'
                });
                
                try {
                    await this.indexPage(page, currentUrl);
                } catch (error) {
                    this.log(`Error indexing ${currentUrl}: ${error.message}`, 'error');
                    this.errors.push({ url: currentUrl, error: error.message });
                }
                
                this.activeWorkers--;
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

    async indexPage(page, url) {
        let retries = 2;
        let lastError = null;
        
        while (retries > 0) {
            try {
                // Ensure page is ready before navigation
                if (page.isClosed()) {
                    throw new Error('Page was closed');
                }
                
                // Small delay to ensure page frame is stable
                await this.sleep(100);
                
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await this.sleep(800);
                
                const pageData = await page.evaluate((knownLocales) => {
                    const title = document.title || '';
                    
                    // Helper to extract locale from URL path
                    const extractLocale = (href, isExternal) => {
                        if (isExternal) return null;
                        try {
                            const url = new URL(href);
                            const parts = url.pathname.toLowerCase().split('/').filter(Boolean);
                            if (parts.length === 0) return 'default';
                            const candidate = parts[0];
                            if (knownLocales.includes(candidate)) {
                                return candidate;
                            }
                            return 'default';
                        } catch {
                            return 'default';
                        }
                    };
                    
                    const currentPageLocale = extractLocale(window.location.href, false);
                    
                    const getLinkText = (a) => {
                        const rawText = (a.innerText || a.textContent || '').trim();
                        if (rawText) return rawText;
                        const aria = (a.getAttribute('aria-label') || a.getAttribute('title') || '').trim();
                        if (aria) return aria;
                        const img = a.querySelector('img[alt]');
                        if (img && img.alt) return img.alt.trim();
                        const svgTitle = a.querySelector('svg title');
                        if (svgTitle && svgTitle.textContent) return svgTitle.textContent.trim();
                        return '';
                    };
                    
                    const links = Array.from(document.querySelectorAll('a[href]')).map(a => {
                        try {
                            const isExternal = a.hostname !== window.location.hostname;
                            const linkLocale = extractLocale(a.href, isExternal);
                            return {
                                href: a.href,
                                text: getLinkText(a).substring(0, 150),
                                isExternal,
                                locale: linkLocale,
                                sourceLocale: currentPageLocale
                            };
                        } catch {
                            return null;
                        }
                    }).filter(Boolean);
                    
                    return { title, links, pageLocale: currentPageLocale };
                }, this.knownLocales);

                
                // Filter out locale switcher links if enabled
                let linksToStore = pageData.links;
                if (this.excludeLocaleSwitcher) {
                    linksToStore = pageData.links.filter(link => {
                        const textLower = (link.text || '').toLowerCase().trim();
                        const textRaw = (link.text || '').trim();
                        const textBase = textLower.replace(/\s*\([^)]*\)\s*/g, '').trim();
                        
                        // Exclude if text matches locale switcher pattern (exact match)
                        if (this.localeSwitcherTexts.has(textLower) || this.localeSwitcherTexts.has(textBase)) return false;
                        
                        // Exclude very short text that looks like locale code (en, de, fr, en-US)
                        if (textLower.length <= 5 && /^[a-z]{2}(-[a-z]{2})?$/i.test(textLower)) return false;
                        
                        // Exclude if just a flag emoji (1-2 chars that are emoji flags)
                        if (textRaw.length <= 4 && /^[\u{1F1E0}-\u{1F1FF}]{2,4}$/u.test(textRaw)) return false;
                        
                        // Exclude if contains flag emoji + short text (like "🇩🇪 DE" or "🇫🇷 French")
                        if (/^[\u{1F1E0}-\u{1F1FF}]{2}\s*.{0,15}$/u.test(textRaw) && textRaw.length <= 20) {
                            const withoutFlags = textRaw.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '').trim().toLowerCase();
                            if (this.localeSwitcherTexts.has(withoutFlags) || withoutFlags.length <= 3) return false;
                        }
                        
                        // Exclude if text is primarily CJK language label like "中文 (Zhōngwén)"
                        if (/^[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\s\(\)a-z-]+$/i.test(textRaw) &&
                            /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(textRaw) &&
                            textRaw.length <= 30) {
                            return false;
                        }
                        
                        return true;
                    });
                }
                
                // Check link health for internal links (sample for performance)
                const internalLinks = linksToStore.filter(l => !l.isExternal);
                const linksToCheck = internalLinks.slice(0, 20); // Check up to 20 links per page

                
                if (linksToCheck.length > 0) {
                    const statusMap = await this.checkLinksStatus(linksToCheck);
                    
                    // Update links with status and collect issues
                    for (const link of linksToStore) {
                        if (statusMap.has(link.href)) {
                            link.status = statusMap.get(link.href);
                            
                            // Categorize for health report
                            if (link.status === 404 || link.status === 410 || link.status >= 500) {
                                this.index.healthReport.broken.push({
                                    sourceUrl: url,
                                    targetUrl: link.href,
                                    status: link.status,
                                    linkText: link.text
                                });
                            } else if (link.status === 301 || link.status === 302 || link.status === 307 || link.status === 308) {
                                this.index.healthReport.redirects.push({
                                    sourceUrl: url,
                                    targetUrl: link.href,
                                    status: link.status,
                                    linkText: link.text
                                });
                            } else if (link.status >= 200 && link.status < 300) {
                                this.index.healthReport.healthy++;
                            }
                        }
                        
                        // Check for cross-locale (if we have page locale info)
                        if (!link.isExternal && pageData.pageLocale !== link.locale && link.locale) {
                            this.index.healthReport.crossLocale.push({
                                sourceUrl: url,
                                sourceLocale: pageData.pageLocale || 'default',
                                targetUrl: link.href,
                                targetLocale: link.locale,
                                linkText: link.text
                            });
                        }
                    }
                }
                
                // Store in index
                this.index.pages[url] = {
                    title: pageData.title,
                    locale: pageData.pageLocale,
                    indexedAt: new Date().toISOString(),
                    links: linksToStore
                };
                
                // Track total links found (filtered count)
                this.totalLinksFound += linksToStore.length;
                
                // Add internal links to queue (skip in incremental mode - only index specific URLs)
                if (!this.urlsToIndex) {
                    for (const link of pageData.links) {
                        if (!link.isExternal) {
                            this.addToQueue(link.href);
                        }
                    }
                }
                
                return; // Success
                
            } catch (error) {
                lastError = error;
                retries--;
                if (retries > 0) {
                    this.log(`Retrying ${url}...`, 'warning');
                    await this.sleep(2000);  // Longer wait before retry
                }
            }
        }
        
        if (lastError) {
            throw lastError;
        }
    }

    addToQueue(href) {
        try {
            const urlObj = new URL(href);
            if (urlObj.hostname !== this.rootDomain) return;
            if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|exe|mp4|mp3)$/i.test(urlObj.pathname)) return;
            
            // Apply locale filter
            if (this.localeFilter) {
                const urlLocale = this.detectUrlLocale(urlObj.pathname);
                
                if (this.localeFilter === 'default') {
                    // Only accept URLs without any known locale prefix
                    if (urlLocale !== null) return;
                } else {
                    // Only accept URLs with the specific locale prefix
                    if (urlLocale !== this.localeFilter) return;
                }
            }
            
            urlObj.hash = '';
            const cleanUrl = urlObj.toString().replace(/\/$/, '') || urlObj.toString();
            
            if (!this.visited.has(cleanUrl) && !this.queued.has(cleanUrl)) {
                this.queue.push(cleanUrl);
                this.queued.add(cleanUrl);
            }
        } catch {}
    }
    
    /**
     * Detect locale prefix from URL path
     * @returns locale string (e.g., 'en', 'de') or null if no locale prefix
     */
    detectUrlLocale(pathname) {
        const parts = pathname.toLowerCase().split('/').filter(Boolean);
        if (parts.length === 0) return null;
        const locale = parts[0];
        if (this.knownLocales.includes(locale)) {
            return locale;
        }
        return null;
    }

    saveIndex() {
        // Include locale in filename if filtering by locale
        let filename = this.rootDomain.replace(/\./g, '_');
        if (this.localeFilter) {
            filename += `_${this.localeFilter}`;
        }
        filename += '.json';
        
        const filepath = path.join(this.indexDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(this.index, null, 2));
        this.log(`Index saved to ${filepath}`);
        return filepath;
    }

    pause() { this.isPaused = true; }
    resume() { this.isPaused = false; }
    async stop() { this.isRunning = false; }
    
    async cleanup() {
        if (this.browser) {
            await this.browser.close().catch(() => {});
            this.browser = null;
        }
        this.isRunning = false;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check HTTP status of a URL (HEAD request for speed)
     */
    async checkLinkStatus(url) {
        try {
            const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            const normalize = (inputUrl) => {
                try {
                    const u = new URL(inputUrl);
                    u.hash = '';
                    const params = new URLSearchParams(u.search);
                    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','r'].forEach(p => params.delete(p));
                    u.search = params.toString() ? `?${params.toString()}` : '';
                    return u.toString().replace(/\/$/, '');
                } catch {
                    return inputUrl;
                }
            };
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            
            const response = await fetch(url, {
                method: 'HEAD',
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': userAgent
                }
            });
            
            clearTimeout(timeout);
            const status = response.status;
            
            // If redirect, compare normalized target to avoid false positives (e.g. ?r=0)
            if ([301, 302, 307, 308].includes(status)) {
                const location = response.headers.get('location');
                if (location) {
                    const resolved = new URL(location, url).toString();
                    if (normalize(resolved) === normalize(url)) {
                        return 200;
                    }
                }
                return status;
            }
            
            // If HEAD is blocked, fallback to GET
            if ([400, 403, 405].includes(status)) {
                throw new Error('HEAD blocked');
            }
            
            return status;
        } catch (error) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch(url, {
                    method: 'GET',
                    redirect: 'follow',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                
                clearTimeout(timeout);
                const status = response.status;
                
                return status;
            } catch (fallbackError) {
                if (fallbackError.name === 'AbortError') {
                    return 408; // Timeout
                }
                return 0; // Network error
            }
        }
    }

    /**
     * Check multiple links in parallel (batched for efficiency)
     */
    async checkLinksStatus(links, batchSize = 10) {
        const results = new Map();
        
        for (let i = 0; i < links.length; i += batchSize) {
            const batch = links.slice(i, i + batchSize);
            const checks = batch.map(async (link) => {
                const status = await this.checkLinkStatus(link.href);
                results.set(link.href, status);
            });
            await Promise.all(checks);
            
            // Small delay between batches to be nice to servers
            if (i + batchSize < links.length) {
                await this.sleep(100);
            }
        }
        
        return results;
    }

    /**
     * STATIC METHODS - For searching existing indexes
     */
    
    static getIndexDir() {
        return path.join(__dirname, 'indexes');
    }

    static listIndexes() {
        const indexDir = SiteIndexer.getIndexDir();
        if (!fs.existsSync(indexDir)) return [];
        
        return fs.readdirSync(indexDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const filepath = path.join(indexDir, f);
                const stats = fs.statSync(filepath);
                try {
                    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                    return {
                        filename: f,
                        domain: data.metadata?.domain || f.replace('.json', '').replace(/_/g, '.'),
                        totalPages: data.metadata?.totalPages || 0,
                        totalLinks: data.metadata?.totalLinks || 0,
                        crawledAt: data.metadata?.crawledAt,
                        fileSize: stats.size,
                        lastModified: stats.mtime
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    }

    static loadIndex(domain) {
        const indexDir = SiteIndexer.getIndexDir();
        const filename = `${domain.replace(/\./g, '_')}.json`;
        const filepath = path.join(indexDir, filename);
        
        if (!fs.existsSync(filepath)) {
            return null;
        }
        
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }

    static deleteIndex(domain) {
        const indexDir = SiteIndexer.getIndexDir();
        const filename = `${domain.replace(/\./g, '_')}.json`;
        const filepath = path.join(indexDir, filename);
        
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            return true;
        }
        return false;
    }

    /**
     * INSTANT SEARCH - Search an existing index (milliseconds!)
     * @param {string} domain - Domain to search
     * @param {string} searchPattern - Pattern to find (or empty for cross-locale mode)
     * @param {object} options - Search options
     * @param {boolean} options.crossLocaleMode - Find cross-locale links
     * @param {string} options.sourceLocale - Filter by source page locale (e.g., 'en', 'de', or 'default' for no prefix)
     * @param {string} options.otherLocales - Comma-separated list of other locale prefixes
     */
    static searchIndex(domain, searchPattern, options = {}) {
        const index = SiteIndexer.loadIndex(domain);
        if (!index) {
            return { error: 'Index not found', findings: [] };
        }
        
        const { crossLocaleMode, sourceLocale, otherLocales } = options;
        const patterns = searchPattern ? searchPattern.split(',').map(p => p.trim().toLowerCase()).filter(Boolean) : [];
        const otherLocaleList = otherLocales ? otherLocales.split(',').map(l => l.trim().toLowerCase().replace(/\//g, '')).filter(Boolean) : [];
        const findings = [];
        
        for (const [pageUrl, pageData] of Object.entries(index.pages)) {
            // Filter by source locale if specified
            if (sourceLocale) {
                const pageLocale = pageData.locale || 'default';
                if (sourceLocale === 'default') {
                    // Only pages without locale prefix
                    if (pageLocale !== null && pageLocale !== 'default') continue;
                } else {
                    // Only pages with specific locale
                    if (pageLocale !== sourceLocale) continue;
                }
            }
            
            for (const link of pageData.links) {
                let isMatch = false;
                let findingType = 'pattern_match';
                
                // Pattern matching mode
                if (patterns.length > 0) {
                    isMatch = patterns.some(pattern => {
                        if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
                            try {
                                const regex = new RegExp(pattern.slice(1, -1), 'i');
                                return regex.test(link.href);
                            } catch {
                                return link.href.toLowerCase().includes(pattern);
                            }
                        }
                        return link.href.toLowerCase().includes(pattern);
                    });
                }
                
                // Cross-locale detection mode
                if (crossLocaleMode && !link.isExternal) {
                    const linkLocale = link.locale;
                    const pageLocale = pageData.locale || 'default';
                    
                    // Check if link goes to a different locale
                    if (pageLocale === 'default' || pageLocale === null) {
                        // Source is default locale - check if link has any locale prefix
                        if (linkLocale && otherLocaleList.includes(linkLocale)) {
                            isMatch = true;
                            findingType = 'cross_locale';
                        }
                    } else {
                        // Source has locale - check if link goes to different locale or default
                        if (linkLocale !== pageLocale) {
                            isMatch = true;
                            findingType = 'cross_locale';
                        }
                    }
                }
                
                if (isMatch) {
                    findings.push({
                        sourcePage: pageUrl,
                        sourceTitle: pageData.title,
                        sourceLocale: pageData.locale || 'default',
                        anchorText: link.text || '[No Text]',
                        linkedTo: link.href,
                        targetLocale: link.locale || 'default',
                        isExternal: link.isExternal,
                        findingType
                    });
                }
            }
        }
        
        return {
            domain: index.metadata.domain,
            searchPattern,
            crossLocaleMode,
            totalPagesSearched: Object.keys(index.pages).length,
            indexedAt: index.metadata.crawledAt,
            findings
        };
    }
}

module.exports = SiteIndexer;
