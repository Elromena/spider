const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const SiteIndexer = require('./indexer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '20mb' }));

// Handle JSON payload errors (e.g., too large)
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, error: 'Report too large. Increase limit or reduce report size.' });
    }
    next(err);
});

// Store active indexers by socket ID
const activeIndexers = new Map();

// Indexes directory
const indexesDir = path.join(__dirname, 'indexes');
if (!fs.existsSync(indexesDir)) {
    fs.mkdirSync(indexesDir, { recursive: true });
}

// Reports directory
const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

function normalizeSiteName(urlOrHost) {
    try {
        const u = new URL(urlOrHost);
        return u.hostname.replace(/^www\./, '').replace(/\./g, '_');
    } catch {
        return (urlOrHost || '').replace(/^www\./, '').replace(/\./g, '_');
    }
}

function saveReportData({ site, locale, report }) {
    const timestamp = Date.now();
    const reportId = `${site}_${timestamp}`;
    const initIssueStatus = (issues) => {
        return issues.map((issue, idx) => ({
            ...issue,
            id: `${timestamp}_${idx}`,
            status: 'pending',
            notes: ''
        }));
    };
    const reportData = {
        id: reportId,
        site,
        locale: locale || 'full',
        createdAt: new Date().toISOString(),
        report: {
            broken: initIssueStatus(report.broken || []),
            redirects: initIssueStatus(report.redirects || []),
            crossLocale: initIssueStatus(report.crossLocale || []),
            healthy: report.healthy || 0,
            checkedCount: report.checkedCount || 0,
            totalUniqueLinks: report.totalUniqueLinks || 0
        },
        issueStats: {
            pending: (report.broken?.length || 0) + (report.redirects?.length || 0) + (report.crossLocale?.length || 0),
            inProgress: 0,
            fixed: 0
        }
    };
    const reportPath = path.join(reportsDir, `${reportId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    return { reportId, reportData, reportPath };
}

// ============================================
// INDEX API - For instant searching
// ============================================

// List all saved indexes
app.get('/api/indexes', (req, res) => {
    try {
        const files = fs.readdirSync(indexesDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                try {
                    const filepath = path.join(indexesDir, f);
                    const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                    const localeFilter = content.metadata?.localeFilter;
                    
                    // Build display name
                    let displayName = f.replace('.json', '');
                    let localeBadge = localeFilter 
                        ? (localeFilter === 'default' ? '(default)' : `(${localeFilter})`)
                        : '(full)';
                    
                    return {
                        name: f.replace('.json', ''),
                        displayName: displayName,
                        domain: content.metadata?.domain || displayName.split('_')[0],
                        locale: localeFilter || 'full',
                        localeBadge: localeBadge,
                        pageCount: content.metadata?.totalPages || Object.keys(content.pages || {}).length,
                        linkCount: content.metadata?.totalLinks || 0,
                        createdAt: content.metadata?.createdAt || null
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
        
        res.json({ success: true, indexes: files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Common locale switcher link texts to filter out
const LOCALE_SWITCHER_TEXTS = [
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
];

// Search an existing index
app.get('/api/search', (req, res) => {
    try {
        const { site, mode, pattern, sourceLocale, otherLocales, excludeLocaleSwitcher } = req.query;
        
        
        if (!site) {
            return res.status(400).json({ success: false, error: 'Missing site parameter' });
        }
        
        // Load the index
        const indexPath = path.join(indexesDir, `${site}.json`);
        if (!fs.existsSync(indexPath)) {
            return res.status(404).json({ success: false, error: 'Index not found' });
        }
        
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const results = [];
        
        // Parse patterns (comma-separated)
        const patterns = pattern ? pattern.split(',').map(p => p.trim().toLowerCase()).filter(Boolean) : [];
        
        
        // Parse other locales
        const localePatterns = otherLocales ? otherLocales.split(',').map(l => l.trim().toLowerCase()).filter(Boolean) : [];
        
        // Search through all pages
        for (const [pageUrl, pageData] of Object.entries(index.pages || {})) {
            const links = pageData.links || [];
            
            // Determine source page locale
            let pageLocale = detectLocale(pageUrl, localePatterns);
            
            // If filtering by source locale
            if (mode === 'crosslocale' || mode === 'both') {
                if (sourceLocale && sourceLocale !== '') {
                    if (sourceLocale === 'default') {
                        // Only include pages with no locale prefix
                        if (pageLocale !== 'default') continue;
                    } else {
                        // Only include pages matching the specified locale
                        if (pageLocale !== sourceLocale) continue;
                    }
                }
            }
            
            for (const link of links) {
                const targetUrl = (link.href || link.url || '').toLowerCase();
                const linkText = link.text || link.anchorText || '';
                let shouldInclude = false;
                let isCrossLocale = false;
                let patternMatched = false;
                
                // Pattern matching - ALWAYS apply if pattern is provided
                if (patterns.length > 0) {
                    for (const p of patterns) {
                        if (targetUrl.includes(p) || linkText.toLowerCase().includes(p)) {
                            patternMatched = true;
                            break;
                        }
                    }
                }
                
                // Cross-locale detection
                if (mode === 'crosslocale' || mode === 'both') {
                    const targetLocale = detectLocale(targetUrl, localePatterns);
                    
                    // Check if source and target have different locales
                    if (pageLocale !== targetLocale && targetLocale !== 'external') {
                        // Only flag if target is a different known locale
                        if (localePatterns.includes(targetLocale) || 
                            (pageLocale !== 'default' && targetLocale === 'default')) {
                            isCrossLocale = true;
                        }
                    }
                }
                
                // Determine if link should be included based on mode
                if (mode === 'pattern') {
                    shouldInclude = patternMatched;
                } else if (mode === 'crosslocale') {
                    // If pattern provided, must match pattern AND be cross-locale
                    // If no pattern, just cross-locale
                    shouldInclude = patterns.length > 0 ? (patternMatched && isCrossLocale) : isCrossLocale;
                } else if (mode === 'both') {
                    // Include if matches pattern OR is cross-locale
                    shouldInclude = patternMatched || isCrossLocale;
                }
                
                // Filter out locale switcher links if enabled (works in all modes)
                if (shouldInclude && excludeLocaleSwitcher === 'true') {
                    const linkTextLower = linkText.toLowerCase().trim();
                    // Check if link text is a locale switcher (exact match or very short)
                    if (LOCALE_SWITCHER_TEXTS.includes(linkTextLower) || 
                        (linkTextLower.length <= 5 && /^[a-z]{2}(-[a-z]{2})?$/i.test(linkTextLower))) {
                        shouldInclude = false;
                    }
                }
                
                if (shouldInclude) {
                    results.push({
                        sourceUrl: pageUrl,
                        sourceLocale: pageLocale,
                        targetUrl: link.href || link.url,
                        targetLocale: detectLocale(targetUrl, localePatterns),
                        linkText: linkText,
                        crossLocale: isCrossLocale
                    });
                }
            }
        }
        
        
        res.json({ success: true, results });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Detect locale from URL
function detectLocale(url, localePatterns) {
    if (!url) return 'unknown';
    
    // Check if external
    try {
        const urlObj = new URL(url);
        // Will check domain later if needed
    } catch {
        // Relative URL, continue
    }
    
    const urlLower = url.toLowerCase();
    
    // Check for known locale prefixes
    for (const locale of localePatterns) {
        if (urlLower.includes(`/${locale}/`) || 
            urlLower.match(new RegExp(`/${locale}$`)) ||
            urlLower.match(new RegExp(`/${locale}\\?`))) {
            return locale;
        }
    }
    
    // No locale prefix found = default locale
    return 'default';
}

// Run health check on existing index
app.get('/api/health-check', async (req, res) => {
    try {
        const { site } = req.query;
        
        if (!site) {
            return res.status(400).json({ success: false, error: 'Missing site parameter' });
        }
        
        // Load the index
        const indexPath = path.join(indexesDir, `${site}.json`);
        if (!fs.existsSync(indexPath)) {
            return res.status(404).json({ success: false, error: 'Index not found' });
        }
        
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const localeFilter = index.metadata?.localeFilter;
        
        // Collect all unique internal links
        const allLinks = new Map(); // href -> { sourceUrls, text }
        
        for (const [pageUrl, pageData] of Object.entries(index.pages || {})) {
            for (const link of (pageData.links || [])) {
                if (!link.isExternal && link.href) {
                    if (!allLinks.has(link.href)) {
                        allLinks.set(link.href, { 
                            sourceUrls: [], 
                            text: link.text,
                            sourceLocale: pageData.locale,
                            targetLocale: link.locale
                        });
                    }
                    allLinks.get(link.href).sourceUrls.push(pageUrl);
                }
            }
        }
        
        // Check status of links (sample for performance - max 200 unique links)
        const linksToCheck = Array.from(allLinks.entries()).slice(0, 200);
        
        const healthReport = {
            broken: [],
            redirects: [],
            crossLocale: [],
            healthy: 0,
            checkedCount: linksToCheck.length,
            totalUniqueLinks: allLinks.size
        };
        
        // Check links in batches
        const batchSize = 10;
        for (let i = 0; i < linksToCheck.length; i += batchSize) {
            const batch = linksToCheck.slice(i, i + batchSize);
            
            const checks = batch.map(async ([href, data]) => {
                try {
                    // Use a common browser User-Agent to avoid blocks
                    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                    
                    let status;
                    try {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 8000);
                        
                        const response = await fetch(href, {
                            method: 'HEAD',
                            redirect: 'follow',
                            signal: controller.signal,
                            headers: { 'User-Agent': userAgent }
                        });
                        
                        clearTimeout(timeout);
                        status = response.status;
                        
                        if (status === 405 || status === 403 || status === 400) {
                            throw new Error('HEAD not supported');
                        }
                    } catch (headError) {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 10000);
                        
                        const response = await fetch(href, {
                            method: 'GET',
                            redirect: 'follow',
                            signal: controller.signal,
                            headers: { 'User-Agent': userAgent }
                        });
                        
                        clearTimeout(timeout);
                        status = response.status;
                    }
                    
                    if (status === 404 || status === 410 || status >= 500) {
                        healthReport.broken.push({
                            sourceUrl: data.sourceUrls[0],
                            targetUrl: href,
                            status,
                            linkText: data.text,
                            occurrences: data.sourceUrls.length
                        });
                    } else if (status >= 200 && status < 400) {
                        healthReport.healthy++;
                    }
                    
                    // Check cross-locale
                    if (data.sourceLocale !== data.targetLocale && data.targetLocale) {
                        healthReport.crossLocale.push({
                            sourceUrl: data.sourceUrls[0],
                            sourceLocale: data.sourceLocale || 'default',
                            targetUrl: href,
                            targetLocale: data.targetLocale,
                            linkText: data.text,
                            occurrences: data.sourceUrls.length
                        });
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        healthReport.broken.push({
                            sourceUrl: data.sourceUrls[0],
                            targetUrl: href,
                            status: 0,
                            linkText: data.text,
                            error: error.message
                        });
                    } else {
                        healthReport.healthy++; // Timeout - give benefit of doubt
                    }
                }
            });
            
            await Promise.all(checks);
            
            // Small delay between batches
            if (i + batchSize < linksToCheck.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        res.json({ success: true, healthReport });
        
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// REPORTS API - Health report management
// ============================================

// List all reports
app.get('/api/reports', (req, res) => {
    try {
        const files = fs.readdirSync(reportsDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const filePath = path.join(reportsDir, f);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                return {
                    id: f.replace('.json', ''),
                    site: data.site,
                    locale: data.locale || 'full',
                    createdAt: data.createdAt,
                    summary: {
                        broken: data.report?.broken?.length || 0,
                        redirects: data.report?.redirects?.length || 0,
                        crossLocale: data.report?.crossLocale?.length || 0,
                        healthy: data.report?.healthy || 0
                    },
                    issueStats: data.issueStats || { pending: 0, inProgress: 0, fixed: 0 }
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        
        res.json({ success: true, reports: files });
    } catch (error) {
        console.error('Error listing reports:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single report
app.get('/api/reports/:id', (req, res) => {
    try {
        const reportPath = path.join(reportsDir, `${req.params.id}.json`);
        if (!fs.existsSync(reportPath)) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }
        
        const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        res.json({ success: true, report: data });
    } catch (error) {
        console.error('Error loading report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save a new report
app.post('/api/reports', (req, res) => {
    try {
        const { site, locale, report } = req.body;
        
        if (!site || !report) {
            return res.status(400).json({ success: false, error: 'Missing site or report data' });
        }
        
        const { reportId, reportData, reportPath } = saveReportData({ site, locale, report });
        
        
        res.json({ success: true, reportId, report: reportData });
    } catch (error) {
        console.error('Error saving report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update issue status in a report
app.patch('/api/reports/:id/issues/:issueId', (req, res) => {
    try {
        const { id, issueId } = req.params;
        const { status, notes } = req.body;
        
        const reportPath = path.join(reportsDir, `${id}.json`);
        if (!fs.existsSync(reportPath)) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }
        
        const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        
        // Find and update the issue in broken, redirects, or crossLocale
        let found = false;
        for (const category of ['broken', 'redirects', 'crossLocale']) {
            const issue = data.report[category]?.find(i => i.id === issueId);
            if (issue) {
                const oldStatus = issue.status;
                issue.status = status || issue.status;
                issue.notes = notes !== undefined ? notes : issue.notes;
                
                // Update stats
                if (oldStatus !== issue.status) {
                    if (oldStatus === 'pending') data.issueStats.pending--;
                    else if (oldStatus === 'inProgress') data.issueStats.inProgress--;
                    else if (oldStatus === 'fixed') data.issueStats.fixed--;
                    
                    if (issue.status === 'pending') data.issueStats.pending++;
                    else if (issue.status === 'inProgress') data.issueStats.inProgress++;
                    else if (issue.status === 'fixed') data.issueStats.fixed++;
                }
                
                found = true;
                break;
            }
        }
        
        if (!found) {
            return res.status(404).json({ success: false, error: 'Issue not found' });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
        res.json({ success: true, issueStats: data.issueStats });
    } catch (error) {
        console.error('Error updating issue:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete a report
app.delete('/api/reports/:id', (req, res) => {
    try {
        const reportPath = path.join(reportsDir, `${req.params.id}.json`);
        if (fs.existsSync(reportPath)) {
            fs.unlinkSync(reportPath);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export report as CSV
app.get('/api/reports/:id/export', (req, res) => {
    try {
        const { format } = req.query;
        const reportPath = path.join(reportsDir, `${req.params.id}.json`);
        
        if (!fs.existsSync(reportPath)) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }
        
        const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        
        if (format === 'csv') {
            // Generate CSV
            const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
            let csv = 'Source Page,Type,Status,Anchor Text,Target URL,Occurrences,Notes\n';

            const appendIssues = (issues, typeLabel) => {
                const sorted = [...issues].sort((a, b) => {
                    const aSource = (a.sourceUrl || '');
                    const bSource = (b.sourceUrl || '');
                    if (aSource !== bSource) return aSource.localeCompare(bSource);
                    return (a.targetUrl || '').localeCompare(b.targetUrl || '');
                });
                for (const issue of sorted) {
                    const anchorText = issue.anchorText || issue.linkText || issue.text || '';
                    csv += [
                        escapeCsv(issue.sourceUrl || ''),
                        escapeCsv(typeLabel),
                        escapeCsv(issue.status || ''),
                        escapeCsv(anchorText),
                        escapeCsv(issue.targetUrl || ''),
                        escapeCsv(issue.occurrences || 1),
                        escapeCsv(issue.notes || '')
                    ].join(',') + '\n';
                }
            };

            appendIssues(data.report.broken || [], 'Broken');
            appendIssues(data.report.redirects || [], 'Redirect');
            appendIssues(
                data.report.crossLocale || [],
                'Cross-Locale'
            );
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${data.site}_health_report.csv"`);
            res.send(csv);
        } else {
            // JSON export
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${data.site}_health_report.json"`);
            res.send(JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('Error exporting report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Compare index with sitemap
app.get('/api/sitemap/compare', async (req, res) => {
    try {
        const { site } = req.query;
        
        if (!site) {
            return res.status(400).json({ success: false, error: 'Missing site parameter' });
        }
        
        // Load the index
        const indexPath = path.join(indexesDir, `${site}.json`);
        if (!fs.existsSync(indexPath)) {
            return res.status(404).json({ success: false, error: 'Index not found' });
        }
        
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const domain = index.metadata?.domain || site.replace(/_/g, '.');
        
        // Try to fetch sitemap.xml
        const sitemapUrls = [];
        const sitemapUrl = `https://${domain}/sitemap.xml`;
        
        try {
            const response = await fetch(sitemapUrl, { 
                timeout: 10000,
                headers: { 'User-Agent': 'Spider-LinkAuditor/1.0' }
            });
            
            if (!response.ok) {
                throw new Error(`Sitemap returned ${response.status}`);
            }
            
            const xml = await response.text();
            
            // Parse sitemap XML (simple regex extraction)
            const locMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
            for (const match of locMatches) {
                sitemapUrls.push(match[1].trim());
            }
            
            // Also check for sitemap index (multiple sitemaps)
            const sitemapIndexMatches = xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi);
            const subSitemaps = [];
            for (const match of sitemapIndexMatches) {
                subSitemaps.push(match[1].trim());
            }
            
            // Fetch sub-sitemaps if this is a sitemap index
            for (const subUrl of subSitemaps.slice(0, 10)) { // Limit to 10 sub-sitemaps
                try {
                    const subResponse = await fetch(subUrl, {
                        timeout: 10000,
                        headers: { 'User-Agent': 'Spider-LinkAuditor/1.0' }
                    });
                    if (subResponse.ok) {
                        const subXml = await subResponse.text();
                        const subLocMatches = subXml.matchAll(/<loc>([^<]+)<\/loc>/gi);
                        for (const match of subLocMatches) {
                            sitemapUrls.push(match[1].trim());
                        }
                    }
                } catch {
                    // Skip failed sub-sitemaps
                }
            }
            
        } catch (fetchError) {
            return res.json({ 
                success: false, 
                error: `Could not fetch sitemap from ${sitemapUrl}: ${fetchError.message}` 
            });
        }
        
        if (sitemapUrls.length === 0) {
            return res.json({ 
                success: false, 
                error: 'Sitemap is empty or could not be parsed' 
            });
        }
        
        // Get locale filter from index
        const localeFilter = index.metadata?.localeFilter || null;
        
        // Known locale prefixes to detect
        const knownLocales = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh', 
            'ar', 'hi', 'tr', 'sv', 'da', 'no', 'fi', 'cs', 'hu', 'ro', 'bg', 'hr', 'sr', 'sl', 'sk'];
        
        // Function to detect URL locale
        const getUrlLocale = (url) => {
            try {
                const u = new URL(url);
                const match = u.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2,4})?)\//i);
                if (match) {
                    const locale = match[1].toLowerCase();
                    if (knownLocales.includes(locale.split('-')[0])) {
                        return locale;
                    }
                }
                return 'default'; // No locale prefix = default
            } catch {
                return 'default';
            }
        };
        
        // Filter sitemap URLs by locale if a filter was used during indexing
        let filteredSitemapUrls = sitemapUrls;
        if (localeFilter) {
            filteredSitemapUrls = sitemapUrls.filter(url => {
                const urlLocale = getUrlLocale(url);
                if (localeFilter === 'default') {
                    return urlLocale === 'default';
                } else {
                    return urlLocale === localeFilter;
                }
            });
        }
        
        // Get indexed URLs
        const indexedUrls = new Set(Object.keys(index.pages || {}));
        
        // Normalize URLs for comparison
        const normalizeUrl = (url) => {
            try {
                const u = new URL(url);
                // Remove trailing slash, lowercase
                return u.origin + u.pathname.replace(/\/$/, '').toLowerCase() + u.search;
            } catch {
                return url.toLowerCase().replace(/\/$/, '');
            }
        };
        
        const sitemapNormalized = new Map();
        for (const url of filteredSitemapUrls) {
            sitemapNormalized.set(normalizeUrl(url), url);
        }
        
        const indexedNormalized = new Map();
        for (const url of indexedUrls) {
            indexedNormalized.set(normalizeUrl(url), url);
        }
        
        // Compare
        const missingFromIndex = [];
        const inBoth = [];
        
        for (const [normalized, original] of sitemapNormalized) {
            if (indexedNormalized.has(normalized)) {
                inBoth.push(original);
            } else {
                missingFromIndex.push(original);
            }
        }
        
        const extraInIndex = [];
        for (const [normalized, original] of indexedNormalized) {
            if (!sitemapNormalized.has(normalized)) {
                extraInIndex.push(original);
            }
        }
        
        res.json({
            success: true,
            sitemapUrl,
            sitemapCount: filteredSitemapUrls.length,
            sitemapTotalCount: sitemapUrls.length,
            localeFilter: localeFilter || 'all',
            indexedCount: indexedUrls.size,
            inBoth: inBoth.length,
            missingFromIndex,
            extraInIndex
        });
        
    } catch (error) {
        console.error('Sitemap comparison error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete an index
app.delete('/api/indexes/:name', (req, res) => {
    try {
        const indexPath = path.join(indexesDir, `${req.params.name}.json`);
        if (fs.existsSync(indexPath)) {
            fs.unlinkSync(indexPath);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'Index not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// Socket.IO - Real-time indexing
// ============================================

io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    // Build index for a site
    socket.on('buildIndex', async (config) => {
        const localeInfo = config.localeFilter ? ` (locale: ${config.localeFilter})` : ' (full site)';
        console.log(`📚 Building index for ${config.url}${localeInfo}`);

        
        // Stop any existing indexer
        if (activeIndexers.has(socket.id)) {
            const existing = activeIndexers.get(socket.id);
            await existing.stop();
        }
        
        const indexer = new SiteIndexer({
            startUrl: config.url,
            maxPages: config.maxPages !== undefined ? config.maxPages : 500,  // 0 = unlimited
            concurrency: config.concurrency || 5,
            localeFilter: config.localeFilter || null,
            excludeLocaleSwitcher: config.excludeLocaleSwitcher !== false,  // default true
            
            onProgress: (data) => {
                socket.emit('indexProgress', {
                    currentUrl: data.currentUrl,
                    pagesIndexed: data.pagesIndexed,
                    linksFound: data.linksFound,
                    queueSize: data.queueSize,
                    maxPages: config.maxPages
                });
            },
            
            onLog: (log) => {
                socket.emit('indexLog', log);
            },
            
            onComplete: (data) => {
                let reportId = null;
                if (data.healthReport) {
                    const siteName = normalizeSiteName(config.url);
                    const locale = config.localeFilter || 'full';
                    try {
                        const saved = saveReportData({ site: siteName, locale, report: data.healthReport });
                        reportId = saved.reportId;
                    } catch (error) {
                    }
                }
                socket.emit('indexComplete', {
                    success: true,
                    url: config.url,
                    totalPages: data.totalPages,
                    totalLinks: data.totalLinks,
                    healthReport: data.healthReport || null,
                    reportId
                });
                activeIndexers.delete(socket.id);
            },
            
            onError: (error) => {
                socket.emit('indexError', { error: error.message || error });
                activeIndexers.delete(socket.id);
            }
        });
        
        activeIndexers.set(socket.id, indexer);
        
        try {
            await indexer.buildIndex();
        } catch (err) {
            socket.emit('indexError', { error: err.message });
            activeIndexers.delete(socket.id);
        }
    });
    
    // Stop indexing
    socket.on('stopIndexing', async () => {
        const indexer = activeIndexers.get(socket.id);
        if (indexer) {
            await indexer.stop();
            activeIndexers.delete(socket.id);
            socket.emit('indexComplete', { success: false, stopped: true });
        }
    });
    
    // Index missing URLs only (incremental)
    socket.on('indexMissing', async (config) => {
        console.log(`📚 Indexing ${config.urls?.length || 0} missing URLs for ${config.site}`);
        
        // Stop any existing indexer
        if (activeIndexers.has(socket.id)) {
            const existing = activeIndexers.get(socket.id);
            await existing.stop();
        }
        
        // Load existing index
        const indexPath = path.join(indexesDir, `${config.site}.json`);
        if (!fs.existsSync(indexPath)) {
            socket.emit('indexError', { error: 'Index not found' });
            return;
        }
        
        const existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const domain = existingIndex.metadata?.domain;
        
        if (!domain || !config.urls?.length) {
            socket.emit('indexError', { error: 'No URLs to index' });
            return;
        }
        
        const indexer = new SiteIndexer({
            startUrl: `https://${domain}`,
            maxPages: config.urls.length,
            concurrency: 5,
            excludeLocaleSwitcher: config.excludeLocaleSwitcher !== false,
            urlsToIndex: config.urls, // Special mode: only index these URLs
            existingIndex: existingIndex, // Merge into existing index
            
            onProgress: (data) => {
                socket.emit('indexProgress', {
                    currentUrl: data.currentUrl,
                    pagesIndexed: data.pagesIndexed,
                    linksFound: data.linksFound,
                    queueSize: data.queueSize,
                    maxPages: config.urls.length
                });
            },
            
            onLog: (log) => {
                socket.emit('indexLog', log);
            },
            
            onComplete: (data) => {
                socket.emit('indexComplete', {
                    success: true,
                    url: `https://${domain}`,
                    totalPages: data.totalPages,
                    totalLinks: data.totalLinks,
                    incremental: true
                });
                activeIndexers.delete(socket.id);
            },
            
            onError: (error) => {
                socket.emit('indexError', { error: error.message || error });
                activeIndexers.delete(socket.id);
            }
        });
        
        activeIndexers.set(socket.id, indexer);
        
        try {
            await indexer.buildIndex();
        } catch (err) {
            socket.emit('indexError', { error: err.message });
            activeIndexers.delete(socket.id);
        }
    });
    
    // Run health check on existing index (with progress)
    socket.on('runHealthCheck', async (config) => {
        console.log(`🏥 Running health check for ${config.indexName}`);
        
        try {
            const indexPath = path.join(indexesDir, `${config.indexName}.json`);
            if (!fs.existsSync(indexPath)) {
                socket.emit('healthCheckComplete', { success: false, error: 'Index not found' });
                return;
            }
            
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            const indexLocale = index.metadata?.localeFilter || null; // The locale this index is for (null = full site)
            
            // Simple locale detection from URL path
            const commonLocales = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'ar', 'nl', 'pl', 'sv', 'no', 'da', 'fi', 'tr', 'el', 'he', 'th', 'vi', 'id', 'ms', 'hi', 'cs', 'hu', 'ro', 'uk', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'en-us', 'en-gb', 'pt-br', 'zh-cn', 'zh-tw'];
            
            function detectLocaleFromUrl(url) {
                if (!url) return 'default';
                try {
                    const urlObj = new URL(url);
                    const pathParts = urlObj.pathname.toLowerCase().split('/').filter(p => p);
                    if (pathParts.length > 0) {
                        const firstPart = pathParts[0];
                        if (commonLocales.includes(firstPart)) {
                            return firstPart;
                        }
                    }
                } catch {
                    // Relative URL - check path directly
                    const pathParts = url.toLowerCase().split('/').filter(p => p);
                    if (pathParts.length > 0) {
                        const firstPart = pathParts[0];
                        if (commonLocales.includes(firstPart)) {
                            return firstPart;
                        }
                    }
                }
                return 'default';
            }
            
            // Language switcher detection - comprehensive patterns
            function isLocaleSwitcherLink(text) {
                if (!text) return false;
                const t = text.trim().toLowerCase();
                
                // Exact language names (in their native form)
                const languageNames = [
                    'english', 'french', 'german', 'spanish', 'italian', 'portuguese', 'russian', 
                    'chinese', 'japanese', 'korean', 'arabic', 'dutch', 'polish', 'swedish',
                    'français', 'deutsch', 'español', 'italiano', 'português', 'русский',
                    '中文', '日本語', '한국어', 'العربية', 'nederlands', 'polski', 'svenska',
                    'english (us)', 'english (uk)', 'português (brasil)'
                ];
                
                // Check if text is primarily a language name (with optional extras in parens)
                // e.g., "中文 (Zhōngwén)" or "Français (French)"
                const baseText = t.replace(/\s*\([^)]*\)\s*/g, '').trim();
                if (languageNames.includes(baseText)) return true;
                
                // Check if contains Chinese/Japanese/Korean characters as main content (language switcher)
                if (/^[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\s\(\)a-z]*$/i.test(t) && 
                    /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(t) &&
                    t.length < 30) {
                    return true;
                }
                
                // ISO codes
                if (/^[a-z]{2}(-[a-z]{2})?$/i.test(t)) return true;
                
                // Flag emojis
                if (/[\u{1F1E0}-\u{1F1FF}][\u{1F1E0}-\u{1F1FF}]/u.test(text)) return true;
                
                return false;
            }
            
            // Determine which pages to scan based on index locale
            // If index is for a specific locale, ONLY check pages of that locale
            const targetLocaleFilter = indexLocale; // null = all, 'default' = no prefix, 'fr' = /fr/, etc.
            
            console.log(`🏥 Health check locale filter: ${targetLocaleFilter || 'all locales'}`);
            
            // Collect unique internal links from pages matching our locale
            const crossLocaleIssues = [];
            const linksToCheck = new Map(); // href -> { sourceUrls, text }
            let pagesScanned = 0;
            let pagesSkipped = 0;
            
            for (const [pageUrl, pageData] of Object.entries(index.pages || {})) {
                // Determine source page locale from URL
                const sourceLocale = detectLocaleFromUrl(pageUrl);
                
                // FILTER: Only process pages matching the index's locale
                if (targetLocaleFilter) {
                    if (targetLocaleFilter === 'default' && sourceLocale !== 'default') {
                        pagesSkipped++;
                        continue; // Skip non-default pages when index is for default/English
                    }
                    if (targetLocaleFilter !== 'default' && sourceLocale !== targetLocaleFilter) {
                        pagesSkipped++;
                        continue; // Skip pages not matching the target locale
                    }
                }
                
                pagesScanned++;
                
                for (const link of (pageData.links || [])) {
                    if (!link.isExternal && link.href) {
                        const targetLocale = detectLocaleFromUrl(link.href);
                        const linkText = link.text || '(no text)';
                        
                        // Check for cross-locale: source and target locales must ACTUALLY differ
                        // AND it shouldn't be a language switcher link
                        if (sourceLocale !== targetLocale && !isLocaleSwitcherLink(linkText)) {
                            crossLocaleIssues.push({
                                sourceUrl: pageUrl,
                                sourceLocale: sourceLocale || 'default',
                                targetUrl: link.href,
                                targetLocale: targetLocale || 'default',
                                anchorText: linkText
                            });
                        }
                        
                        // Collect for HTTP status check (only from relevant pages)
                        if (!linksToCheck.has(link.href)) {
                            linksToCheck.set(link.href, { 
                                sourceUrls: [], 
                                text: linkText
                            });
                        }
                        linksToCheck.get(link.href).sourceUrls.push(pageUrl);
                        if (linkText !== '(no text)' && linksToCheck.get(link.href).text === '(no text)') {
                            linksToCheck.get(link.href).text = linkText;
                        }
                    }
                }
            }
            
            console.log(`🏥 Scanned ${pagesScanned} pages, skipped ${pagesSkipped} (different locale)`);
            console.log(`🏥 Found ${crossLocaleIssues.length} potential cross-locale issues before dedup`);
            
            // Dedupe cross-locale by target URL (keep first occurrence, count others)
            const crossLocaleMap = new Map();
            for (const issue of crossLocaleIssues) {
                const key = `${issue.sourceLocale}→${issue.targetLocale}:${issue.targetUrl}`;
                if (!crossLocaleMap.has(key)) {
                    crossLocaleMap.set(key, { ...issue, occurrences: 1 });
                } else {
                    crossLocaleMap.get(key).occurrences++;
                }
            }
            
            // Check ALL links for HTTP status
            const linksArray = Array.from(linksToCheck.entries());
            const total = linksArray.length;
            
            const healthReport = {
                broken: [],
                redirects: [],
                crossLocale: Array.from(crossLocaleMap.values()),
                healthy: 0,
                checkedCount: total,
                totalUniqueLinks: total
            };
            
            let checked = 0;
            
            // Check links in batches with progress
            const batchSize = 10;
            for (let i = 0; i < linksArray.length; i += batchSize) {
                const batch = linksArray.slice(i, i + batchSize);
                
                const checks = batch.map(async ([href, data]) => {
                    try {
                        // Use a common browser User-Agent to avoid blocks
                        const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                        
                        // Try HEAD first, fall back to GET if it fails
                        let status;
                        try {
                            const controller = new AbortController();
                            const timeout = setTimeout(() => controller.abort(), 8000);
                            
                            const response = await fetch(href, {
                                method: 'HEAD',
                                redirect: 'follow',  // Follow redirects to get final status
                                signal: controller.signal,
                                headers: { 'User-Agent': userAgent }
                            });
                            
                            clearTimeout(timeout);
                            status = response.status;
                            
                            // If HEAD returns 405 (Method Not Allowed) or other client errors, try GET
                            if (status === 405 || status === 403 || status === 400) {
                                throw new Error('HEAD not supported, trying GET');
                            }
                        } catch (headError) {
                            // Fallback to GET request
                            const controller = new AbortController();
                            const timeout = setTimeout(() => controller.abort(), 10000);
                            
                            const response = await fetch(href, {
                                method: 'GET',
                                redirect: 'follow',
                                signal: controller.signal,
                                headers: { 
                                    'User-Agent': userAgent,
                                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                                }
                            });
                            
                            clearTimeout(timeout);
                            status = response.status;
                        }
                        
                        // Only mark as broken for definite errors
                        if (status === 404 || status === 410 || status >= 500) {
                            healthReport.broken.push({
                                sourceUrl: data.sourceUrls[0],
                                targetUrl: href,
                                status,
                                anchorText: data.text,
                                occurrences: data.sourceUrls.length
                            });
                        } else if (status >= 200 && status < 400) {
                            // 2xx and 3xx are healthy (redirects that resolve are fine)
                            healthReport.healthy++;
                        }
                    } catch (error) {
                        // Network error, timeout, etc. - only mark as broken if it's a clear failure
                        if (error.name === 'AbortError') {
                            // Timeout - might just be slow, don't mark as broken
                            healthReport.healthy++; // Give benefit of doubt
                        } else {
                            healthReport.broken.push({
                                sourceUrl: data.sourceUrls[0],
                                targetUrl: href,
                                status: 0,
                                anchorText: data.text,
                                error: error.message
                            });
                        }
                    }
                });
                
                await Promise.all(checks);
                checked += batch.length;
                
                // Emit progress
                socket.emit('healthCheckProgress', { checked, total });
                
                // Small delay between batches
                if (i + batchSize < linksArray.length) {
                    await new Promise(r => setTimeout(r, 50));
                }
            }
            
            socket.emit('healthCheckComplete', { success: true, healthReport });
            
        } catch (error) {
            console.error('Health check error:', error);
            socket.emit('healthCheckComplete', { success: false, error: error.message });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        const indexer = activeIndexers.get(socket.id);
        if (indexer) {
            await indexer.stop();
            activeIndexers.delete(socket.id);
        }
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🕷️  SPIDER - Link Auditor (Index-First)                 ║
║                                                           ║
║   Server running at: http://localhost:${PORT}               ║
║                                                           ║
║   1. Index a website first                                ║
║   2. Then search instantly!                               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    // Stop all active indexers
    for (const [socketId, indexer] of activeIndexers) {
        await indexer.stop();
    }
    
    server.close(() => {
        console.log('👋 Goodbye!');
        process.exit(0);
    });
});
