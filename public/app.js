// ===== SPIDER - SEO Tools - Frontend JS =====
// Multi-tool application with Link Auditor and Status Validator

const socket = io();

// State
let indexedSites = [];
let selectedSite = null;
let lastSearchResults = [];
let isIndexing = false;
let indexStartTime = null;
let lastLinksCount = 0;
let lastSpeedCheck = null;
let missingUrls = [];
let healthReports = [];
let lastHealthReport = null;
let statusResults = [];
let currentTool = 'auditor';

// DOM Elements
const elements = {
    // Tool navigation
    toolNavBtns: document.querySelectorAll('.tool-nav-btn'),
    auditorView: document.getElementById('auditorView'),
    statusView: document.getElementById('statusView'),
    
    // Sites panel
    sitesList: document.getElementById('sitesList'),
    noSitesMessage: document.getElementById('noSitesMessage'),
    
    // Search panel
    noSiteSelected: document.getElementById('noSiteSelected'),
    searchContainer: document.getElementById('searchContainer'),
    selectedSiteName: document.getElementById('selectedSiteName'),
    selectedSiteMeta: document.getElementById('selectedSiteMeta'),
    searchForm: document.getElementById('searchForm'),
    searchMode: document.getElementById('searchMode'),
    patternGroup: document.getElementById('patternGroup'),
    searchPattern: document.getElementById('searchPattern'),
    localeOptions: document.getElementById('localeOptions'),
    sourceLocale: document.getElementById('sourceLocale'),
    otherLocales: document.getElementById('otherLocales'),
    excludeLocaleSwitcher: document.getElementById('excludeLocaleSwitcher'),
    resultsCount: document.getElementById('resultsCount'),
    resultsPagesCount: document.getElementById('resultsPagesCount'),
    searchTime: document.getElementById('searchTime'),
    resultsFilterInput: document.getElementById('resultsFilterInput'),
    findingsList: document.getElementById('findingsList'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    
    // Add site modal
    addSiteBtn: document.getElementById('addSiteBtn'),
    addSiteModal: document.getElementById('addSiteModal'),
    closeAddSiteBtn: document.getElementById('closeAddSiteBtn'),
    cancelAddSiteBtn: document.getElementById('cancelAddSiteBtn'),
    addSiteForm: document.getElementById('addSiteForm'),
    newSiteUrl: document.getElementById('newSiteUrl'),
    maxPagesToIndex: document.getElementById('maxPagesToIndex'),
    localeFilter: document.getElementById('localeFilter'),
    customLocaleGroup: document.getElementById('customLocaleGroup'),
    customLocale: document.getElementById('customLocale'),
    excludeSwitcherOnIndex: document.getElementById('excludeSwitcherOnIndex'),
    
    // Progress overlay
    progressOverlay: document.getElementById('progressOverlay'),
    stopIndexBtn: document.getElementById('stopIndexBtn'),
    progressUrl: document.getElementById('progressUrl'),
    pagesIndexed: document.getElementById('pagesIndexed'),
    linksFound: document.getElementById('linksFound'),
    queueRemaining: document.getElementById('queueRemaining'),
    indexSpeed: document.getElementById('indexSpeed'),
    progressBar: document.getElementById('progressBar'),
    progressLog: document.getElementById('progressLog'),
    
    // Toast
    toastContainer: document.getElementById('toastContainer'),
    
    // Health report
    healthReportModal: document.getElementById('healthReportModal'),
    closeHealthReportBtn: document.getElementById('closeHealthReportBtn'),
    healthProgress: document.getElementById('healthProgress'),
    healthProgressCount: document.getElementById('healthProgressCount'),
    healthProgressTotal: document.getElementById('healthProgressTotal'),
    healthProgressBar: document.getElementById('healthProgressBar'),
    healthResults: document.getElementById('healthResults'),
    healthyCount: document.getElementById('healthyCount'),
    redirectCount: document.getElementById('redirectCount'),
    brokenCount: document.getElementById('brokenCount'),
    crossLocaleCount: document.getElementById('crossLocaleCount'),
    brokenSection: document.getElementById('brokenSection'),
    brokenList: document.getElementById('brokenList'),
    redirectSection: document.getElementById('redirectSection'),
    redirectList: document.getElementById('redirectList'),
    crossLocaleSection: document.getElementById('crossLocaleSection'),
    crossLocaleList: document.getElementById('crossLocaleList'),
    viewFullReportBtn: document.getElementById('viewFullReportBtn'),
    closeHealthReportBtn2: document.getElementById('closeHealthReportBtn2'),
    
    // Health check button
    runHealthCheckBtn: document.getElementById('runHealthCheckBtn'),
    
    // Sitemap comparison
    compareSitemapBtn: document.getElementById('compareSitemapBtn'),
    sitemapModal: document.getElementById('sitemapModal'),
    closeSitemapBtn: document.getElementById('closeSitemapBtn'),
    sitemapLoading: document.getElementById('sitemapLoading'),
    sitemapResults: document.getElementById('sitemapResults'),
    sitemapError: document.getElementById('sitemapError'),
    sitemapErrorMsg: document.getElementById('sitemapErrorMsg'),
    sitemapTotal: document.getElementById('sitemapTotal'),
    sitemapInIndex: document.getElementById('sitemapInIndex'),
    sitemapMissing: document.getElementById('sitemapMissing'),
    sitemapExtra: document.getElementById('sitemapExtra'),
    sitemapMissingSection: document.getElementById('sitemapMissingSection'),
    sitemapMissingList: document.getElementById('sitemapMissingList'),
    sitemapExtraSection: document.getElementById('sitemapExtraSection'),
    sitemapExtraList: document.getElementById('sitemapExtraList'),
    indexMissingBtn: document.getElementById('indexMissingBtn'),
    
    // Reports list
    reportsList: document.getElementById('reportsList'),
    noReportsMessage: document.getElementById('noReportsMessage'),

    // Status code validator (new layout)
    statusUrls: document.getElementById('statusUrls'),
    urlCountBadge: document.getElementById('urlCountBadge'),
    runStatusCheckBtn: document.getElementById('runStatusCheckBtn'),
    clearStatusUrlsBtn: document.getElementById('clearStatusUrlsBtn'),
    status2xxCount: document.getElementById('status2xxCount'),
    status3xxCount: document.getElementById('status3xxCount'),
    status4xxCount: document.getElementById('status4xxCount'),
    status5xxCount: document.getElementById('status5xxCount'),
    statusErrorCount: document.getElementById('statusErrorCount'),
    statusProgress: document.getElementById('statusProgress'),
    statusProgressCount: document.getElementById('statusProgressCount'),
    statusProgressTotal: document.getElementById('statusProgressTotal'),
    statusProgressBar: document.getElementById('statusProgressBar'),
    statusFilterInput: document.getElementById('statusFilterInput'),
    statusFilterSelect: document.getElementById('statusFilterSelect'),
    saveStatusReportBtn: document.getElementById('saveStatusReportBtn'),
    exportStatusCsvBtn: document.getElementById('exportStatusCsvBtn'),
    statusResultsList: document.getElementById('statusResultsList'),
    statusReportsList: document.getElementById('statusReportsList'),
    noStatusReportsMessage: document.getElementById('noStatusReportsMessage')
};

let statusReports = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadIndexedSites();
    loadReports();
    loadStatusReports();
    setupEventListeners();
    setupSocketListeners();
});

// ===== Tool Navigation =====
function switchTool(toolName) {
    currentTool = toolName;
    
    // Update nav buttons
    elements.toolNavBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    
    // Update views
    elements.auditorView.classList.toggle('active', toolName === 'auditor');
    elements.statusView.classList.toggle('active', toolName === 'status');
    
    // Show/hide "Index New Site" button based on tool
    elements.addSiteBtn.style.display = toolName === 'auditor' ? '' : 'none';
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Tool navigation
    elements.toolNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTool(btn.dataset.tool);
        });
    });
    
    // Add site modal
    elements.addSiteBtn.addEventListener('click', () => {
        elements.addSiteModal.classList.remove('hidden');
        elements.newSiteUrl.focus();
    });
    
    elements.closeAddSiteBtn.addEventListener('click', closeAddSiteModal);
    elements.cancelAddSiteBtn.addEventListener('click', closeAddSiteModal);
    
    elements.addSiteModal.addEventListener('click', (e) => {
        if (e.target === elements.addSiteModal) closeAddSiteModal();
    });
    
    // Add site form
    elements.addSiteForm.addEventListener('submit', handleAddSite);
    
    // Locale filter change
    elements.localeFilter.addEventListener('change', () => {
        if (elements.localeFilter.value === 'custom') {
            elements.customLocaleGroup.classList.remove('hidden');
            elements.customLocale.focus();
        } else {
            elements.customLocaleGroup.classList.add('hidden');
        }
    });
    
    // Stop indexing
    elements.stopIndexBtn.addEventListener('click', () => {
        socket.emit('stopIndexing');
        showToast('Stopping indexer...', 'info');
    });
    
    // Search mode toggle
    elements.searchMode.addEventListener('change', () => {
        const mode = elements.searchMode.value;
        // Pattern input is always visible (optional filter in crosslocale mode)
        elements.patternGroup.classList.remove('hidden');
        
        if (mode === 'pattern') {
            elements.localeOptions.classList.add('hidden');
        } else {
            // crosslocale or both - show locale options
            elements.localeOptions.classList.remove('hidden');
        }
        
        // Update pattern hint based on mode
        const hint = elements.patternGroup.querySelector('.input-hint');
        if (hint) {
            if (mode === 'crosslocale') {
                hint.textContent = 'Optional: Filter cross-locale results to only links containing this text';
            } else {
                hint.textContent = 'Find links containing this text. Separate multiple with commas.';
            }
        }
    });
    
    // Search form
    elements.searchForm.addEventListener('submit', handleSearch);
    
    // Export buttons
    elements.exportJsonBtn.addEventListener('click', () => exportResults('json'));
    elements.exportCsvBtn.addEventListener('click', () => exportResults('csv'));
    
    // Results filter
    elements.resultsFilterInput.addEventListener('input', (e) => {
        filterResults(e.target.value);
    });
    
    // Health report
    elements.closeHealthReportBtn.addEventListener('click', () => {
        elements.healthReportModal.classList.add('hidden');
    });
    elements.closeHealthReportBtn2?.addEventListener('click', () => {
        elements.healthReportModal.classList.add('hidden');
    });
    elements.runHealthCheckBtn.addEventListener('click', runHealthCheck);
    
    // Sitemap comparison
    elements.compareSitemapBtn.addEventListener('click', compareSitemap);
    elements.closeSitemapBtn.addEventListener('click', () => {
        elements.sitemapModal.classList.add('hidden');
    });
    elements.indexMissingBtn.addEventListener('click', indexMissingUrls);

    // Status code validator
    elements.runStatusCheckBtn.addEventListener('click', handleStatusCheck);
    elements.clearStatusUrlsBtn?.addEventListener('click', clearStatusCheck);
    
    // URL count badge - update on input
    elements.statusUrls?.addEventListener('input', () => {
        const urls = parseStatusUrls(elements.statusUrls.value);
        elements.urlCountBadge.textContent = `${urls.length} URL${urls.length !== 1 ? 's' : ''}`;
    });
    
    // Status filter
    elements.statusFilterInput?.addEventListener('input', () => filterStatusResults());
    elements.statusFilterSelect?.addEventListener('change', () => filterStatusResults());
    
    // Save status report
    if (elements.saveStatusReportBtn) {
        console.log('Save button found, attaching listener');
        elements.saveStatusReportBtn.addEventListener('click', () => {
            console.log('Save button clicked');
            saveStatusReport();
        });
    } else {
        console.error('Save button not found!');
    }
    
    // Export status CSV
    elements.exportStatusCsvBtn?.addEventListener('click', exportStatusCsv);
}

function parseStatusUrls(input) {
    return (input || '')
        .split(/[\n,\s]+/)
        .map((entry) => entry.trim())
        .filter(entry => entry && entry.includes('.'))
        .map((entry) => (/^https?:\/\//i.test(entry) ? entry : `https://${entry}`));
}

async function handleStatusCheck() {
    const urls = parseStatusUrls(elements.statusUrls.value);
    if (urls.length === 0) {
        showToast('Paste at least one URL to validate.', 'warning');
        return;
    }
    if (urls.length > 500) {
        showToast('Please limit to 500 URLs per batch.', 'warning');
        return;
    }

    // Disable button and show progress
    elements.runStatusCheckBtn.disabled = true;
    elements.runStatusCheckBtn.innerHTML = '<span class="pulse-dot"></span> Checking...';
    elements.statusProgress.classList.remove('hidden');
    elements.statusProgressCount.textContent = '0';
    elements.statusProgressTotal.textContent = urls.length;
    elements.statusProgressBar.style.width = '0%';
    
    // Clear previous results
    elements.statusResultsList.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><h3>Checking URLs...</h3><p>This may take a moment</p></div>';

    try {
        const response = await fetch('/api/status-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'Status check failed');
        }
        statusResults = payload.results || [];
        renderStatusResults(statusResults);
        updateStatusSummary(statusResults);
        elements.exportStatusCsvBtn.disabled = statusResults.length === 0;
        elements.saveStatusReportBtn.disabled = statusResults.length === 0;
        showToast(`Checked ${statusResults.length} URLs`, 'success');
    } catch (error) {
        statusResults = [];
        elements.statusResultsList.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><h3>Check Failed</h3><p>' + escapeHtml(error.message || 'Unknown error') + '</p></div>';
        showToast(error.message || 'Status check failed.', 'error');
    } finally {
        elements.runStatusCheckBtn.disabled = false;
        elements.runStatusCheckBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22,4 12,14.01 9,11.01"/>
            </svg>
            Validate Status Codes
        `;
        elements.statusProgress.classList.add('hidden');
    }
}

function clearStatusCheck() {
    elements.statusUrls.value = '';
    elements.urlCountBadge.textContent = '0 URLs';
    elements.statusFilterInput.value = '';
    elements.statusFilterSelect.value = '';
    statusResults = [];
    updateStatusSummary([]);
    elements.exportStatusCsvBtn.disabled = true;
    elements.saveStatusReportBtn.disabled = true;
    elements.statusResultsList.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>No results yet</h3>
            <p>Paste URLs on the left and click "Validate Status Codes"</p>
        </div>
    `;
}

function filterStatusResults() {
    const textQuery = (elements.statusFilterInput?.value || '').toLowerCase();
    const statusFilter = elements.statusFilterSelect?.value || '';
    
    const filtered = statusResults.filter((result) => {
        // Text filter
        const matchesText = !textQuery || 
            result.url.toLowerCase().includes(textQuery) || 
            (result.status && String(result.status).includes(textQuery));
        
        // Status filter
        let matchesStatus = true;
        if (statusFilter) {
            if (statusFilter === 'error') {
                matchesStatus = result.error || result.status == null;
            } else if (statusFilter === '2xx') {
                matchesStatus = result.status >= 200 && result.status < 300;
            } else if (statusFilter === '3xx') {
                matchesStatus = result.status >= 300 && result.status < 400;
            } else if (statusFilter === '4xx') {
                matchesStatus = result.status >= 400 && result.status < 500;
            } else if (statusFilter === '5xx') {
                matchesStatus = result.status >= 500;
            }
        }
        
        return matchesText && matchesStatus;
    });
    
    renderStatusResults(filtered);
}

function summarizeStatusResults(results) {
    return results.reduce((acc, result) => {
        if (result.error || result.status == null) {
            acc.error += 1;
        } else if (result.status >= 200 && result.status < 300) {
            acc.s2xx += 1;
        } else if (result.status >= 300 && result.status < 400) {
            acc.s3xx += 1;
        } else if (result.status >= 400 && result.status < 500) {
            acc.s4xx += 1;
        } else if (result.status >= 500) {
            acc.s5xx += 1;
        }
        return acc;
    }, { s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, error: 0 });
}

function updateStatusSummary(results) {
    const summary = summarizeStatusResults(results);
    elements.status2xxCount.textContent = summary.s2xx;
    elements.status3xxCount.textContent = summary.s3xx;
    elements.status4xxCount.textContent = summary.s4xx;
    elements.status5xxCount.textContent = summary.s5xx;
    elements.statusErrorCount.textContent = summary.error;
}

function renderStatusResults(results) {
    if (!results.length) {
        elements.statusResultsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No matches</h3>
                <p>No URLs match your current filter</p>
            </div>
        `;
        return;
    }
    
    elements.statusResultsList.innerHTML = results.map((result) => {
        const status = result.status;
        const isError = result.error || status == null;
        
        let badgeClass = 'error';
        if (!isError) {
            if (status >= 200 && status < 300) badgeClass = 's2xx';
            else if (status >= 300 && status < 400) badgeClass = 's3xx';
            else if (status >= 400 && status < 500) badgeClass = 's4xx';
            else if (status >= 500) badgeClass = 's5xx';
        }
        
        const badgeLabel = isError ? 'ERR' : status;
        
        let meta = '';
        if (result.error) {
            meta = escapeHtml(result.error);
        } else if (result.finalUrl && result.finalUrl !== result.url) {
            meta = `→ ${escapeHtml(result.finalUrl)}`;
        } else if (result.time) {
            meta = `${result.time}ms`;
        }

        return `
            <div class="status-result-item" data-status="${status || 'error'}" data-url="${escapeHtml(result.url)}">
                <span class="status-code-badge ${badgeClass}">${badgeLabel}</span>
                <span class="status-result-url">${escapeHtml(result.url)}</span>
                ${meta ? `<span class="status-result-meta">${meta}</span>` : ''}
            </div>
        `;
    }).join('');
}

function exportStatusCsv() {
    if (statusResults.length === 0) return;
    
    const headers = ['URL', 'Status', 'Final URL', 'Error', 'Time (ms)'];
    const rows = statusResults.map(r => [
        r.url,
        r.status || '',
        r.finalUrl || '',
        r.error || '',
        r.time || ''
    ]);
    
    const content = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `status-check-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${statusResults.length} results to CSV`, 'success');
}

// ===== Status Reports =====
async function saveStatusReport() {
    console.log('saveStatusReport called, statusResults:', statusResults.length);
    
    if (statusResults.length === 0) {
        showToast('No results to save', 'warning');
        return;
    }
    
    // Use a simple default name if prompt is blocked
    let name = `Status Check ${new Date().toLocaleString()}`;
    try {
        const promptResult = prompt('Enter a name for this report:', name);
        if (promptResult === null) return; // Cancelled
        if (promptResult) name = promptResult;
    } catch (e) {
        console.log('Prompt blocked, using default name');
    }
    
    console.log('Saving report with name:', name);
    elements.saveStatusReportBtn.disabled = true;
    elements.saveStatusReportBtn.innerHTML = '<span class="pulse-dot"></span> Saving...';
    
    try {
        const response = await fetch('/api/status-reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, results: statusResults })
        });
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            showToast('Report saved! You can share the link.', 'success');
            loadStatusReports();
            
            // Open the report in a new tab
            window.open(`/status-report.html?id=${data.reportId}`, '_blank');
        } else {
            showToast(data.error || 'Failed to save report', 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save report: ' + error.message, 'error');
    } finally {
        elements.saveStatusReportBtn.disabled = false;
        elements.saveStatusReportBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17,21 17,13 7,13 7,21"/>
                <polyline points="7,3 7,8 15,8"/>
            </svg>
            Save Report
        `;
    }
}

async function loadStatusReports() {
    try {
        const response = await fetch('/api/status-reports');
        const data = await response.json();
        statusReports = data.reports || [];
        renderStatusReportsList();
    } catch (error) {
        console.error('Failed to load status reports:', error);
    }
}

function renderStatusReportsList() {
    if (!elements.statusReportsList) return;
    
    if (statusReports.length === 0) {
        elements.noStatusReportsMessage?.classList.remove('hidden');
        elements.statusReportsList.innerHTML = '';
        if (elements.noStatusReportsMessage) {
            elements.statusReportsList.appendChild(elements.noStatusReportsMessage);
        }
        return;
    }
    
    elements.noStatusReportsMessage?.classList.add('hidden');
    elements.statusReportsList.innerHTML = '';
    
    // Show recent 5 reports
    statusReports.slice(0, 5).forEach(report => {
        const card = document.createElement('a');
        card.href = `/status-report.html?id=${encodeURIComponent(report.id)}`;
        card.className = 'site-card';
        card.style.textDecoration = 'none';
        
        const date = new Date(report.createdAt);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        
        const stats = report.itemStats || { done: 0, total: 0 };
        const sum = report.summary || {};
        const totalUrls = stats.total || 0;
        const doneCount = stats.done || 0;
        
        let statusBadge = '';
        if (doneCount === totalUrls && totalUrls > 0) {
            statusBadge = '<span style="color: var(--success);">✓ All Done</span>';
        } else if (doneCount > 0) {
            statusBadge = `<span style="color: var(--warning);">${doneCount}/${totalUrls} done</span>`;
        } else {
            statusBadge = `<span style="color: var(--text-muted);">${totalUrls} URLs</span>`;
        }
        
        card.innerHTML = `
            <div class="site-card-name">${escapeHtml(report.name || 'Untitled Report')}</div>
            <div class="site-card-meta">
                <span>${dateStr}</span>
                ${statusBadge}
            </div>
        `;
        
        elements.statusReportsList.appendChild(card);
    });
    
    // Add "View All" link if more than 5
    if (statusReports.length > 5) {
        const viewAll = document.createElement('div');
        viewAll.className = 'site-card';
        viewAll.style.textAlign = 'center';
        viewAll.style.cursor = 'pointer';
        viewAll.innerHTML = `<span style="color: var(--accent-primary);">View all ${statusReports.length} reports →</span>`;
        elements.statusReportsList.appendChild(viewAll);
    }
}

// ===== Socket Listeners =====
function setupSocketListeners() {
    // Indexing progress
    socket.on('indexProgress', (data) => {
        elements.progressUrl.textContent = data.currentUrl || 'Processing...';
        elements.pagesIndexed.textContent = data.pagesIndexed || 0;
        elements.linksFound.textContent = data.linksFound || 0;
        elements.queueRemaining.textContent = data.queueSize || 0;
        
        // Calculate speed (links per second)
        const now = Date.now();
        const linksNow = data.linksFound || 0;
        
        if (!indexStartTime) {
            indexStartTime = now;
            lastLinksCount = 0;
            lastSpeedCheck = now;
        }
        
        // Update speed every 2 seconds for smoother display
        if (now - lastSpeedCheck >= 2000) {
            const linksDelta = linksNow - lastLinksCount;
            const timeDelta = (now - lastSpeedCheck) / 1000;
            const speed = Math.round(linksDelta / timeDelta);
            elements.indexSpeed.textContent = speed > 0 ? speed : '-';
            lastLinksCount = linksNow;
            lastSpeedCheck = now;
        }
        
        // Calculate progress
        if (data.maxPages && data.maxPages > 0) {
            const pct = Math.min(100, (data.pagesIndexed / data.maxPages) * 100);
            elements.progressBar.style.width = pct + '%';
        } else {
            // Unlimited - use indeterminate style
            elements.progressBar.style.width = '100%';
            elements.progressBar.style.animation = 'pulse 2s infinite';
        }
    });
    
    socket.on('indexLog', (data) => {
        const entry = document.createElement('div');
        entry.className = 'log-entry' + (data.type === 'error' ? ' error' : '');
        entry.textContent = data.message;
        elements.progressLog.appendChild(entry);
        elements.progressLog.scrollTop = elements.progressLog.scrollHeight;
    });
    
    socket.on('indexComplete', (data) => {
        isIndexing = false;
        indexStartTime = null;
        lastLinksCount = 0;
        lastSpeedCheck = null;
        elements.progressOverlay.classList.add('hidden');
        elements.progressLog.innerHTML = '';
        
        if (data.success) {
            showToast(`Index complete! ${data.totalPages} pages, ${data.totalLinks} links found.`, 'success');
            loadIndexedSites();
            loadReports();
            
            // Auto-select the newly indexed site
            setTimeout(() => {
                const siteName = extractDomain(data.url);
                selectSite(siteName);
            }, 300);
            
            // Show health report if there are issues
            if (data.healthReport) {
                const siteName = extractDomain(data.url);
                showHealthReport(data.healthReport, siteName, data.reportId || null);
            }
        } else {
            showToast(`Indexing failed: ${data.error}`, 'error');
        }
    });
    
    socket.on('indexError', (data) => {
        isIndexing = false;
        elements.progressOverlay.classList.add('hidden');
        showToast(`Indexing error: ${data.error}`, 'error');
    });
    
    // Health check progress
    socket.on('healthCheckProgress', (data) => {
        elements.healthProgressCount.textContent = data.checked;
        elements.healthProgressTotal.textContent = data.total;
        const pct = Math.round((data.checked / data.total) * 100);
        elements.healthProgressBar.style.width = pct + '%';
    });
    
    // Health check complete
    socket.on('healthCheckComplete', (data) => {
        if (data.success) {
            showHealthReport(data.healthReport);
        } else {
            elements.healthReportModal.classList.add('hidden');
            showToast(`Health check failed: ${data.error}`, 'error');
            elements.runHealthCheckBtn.disabled = false;
            elements.runHealthCheckBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                Run Health Check
            `;
        }
    });
}

// ===== Load Indexed Sites =====
function loadIndexedSites() {
    fetch('/api/indexes')
        .then(res => res.json())
        .then(data => {
            indexedSites = data.indexes || [];
            renderSitesList();
        })
        .catch(err => {
            console.error('Failed to load indexes:', err);
            showToast('Failed to load indexed sites', 'error');
        });
}

// ===== Load Health Reports =====
function loadReports() {
    fetch('/api/reports')
        .then(res => res.json())
        .then(data => {
            healthReports = data.reports || [];
            renderReportsList();
        })
        .catch(err => {
            console.error('Failed to load reports:', err);
        });
}

function renderReportsList() {
    if (healthReports.length === 0) {
        elements.noReportsMessage.classList.remove('hidden');
        elements.reportsList.innerHTML = '';
        elements.reportsList.appendChild(elements.noReportsMessage);
        return;
    }
    
    elements.noReportsMessage.classList.add('hidden');
    elements.reportsList.innerHTML = '';
    
    // Show only recent 5 reports
    healthReports.slice(0, 5).forEach(report => {
        const card = document.createElement('a');
        card.href = `/report.html?id=${encodeURIComponent(report.id)}`;
        card.className = 'site-card';
        card.style.textDecoration = 'none';
        
        const date = new Date(report.createdAt);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        
        const totalIssues = report.summary.broken + report.summary.redirects + report.summary.crossLocale;
        const fixedCount = report.issueStats?.fixed || 0;
        
        let statusBadge = '';
        if (totalIssues === 0) {
            statusBadge = '<span style="color: var(--success);">✓ Healthy</span>';
        } else if (fixedCount === totalIssues) {
            statusBadge = '<span style="color: var(--success);">✓ All Fixed</span>';
        } else {
            statusBadge = `<span style="color: var(--warning);">${totalIssues - fixedCount} pending</span>`;
        }
        
        card.innerHTML = `
            <div class="site-card-name">${report.site.replace(/_/g, '.')}</div>
            <div class="site-card-meta">
                <span>${dateStr}</span>
                ${statusBadge}
            </div>
        `;
        
        elements.reportsList.appendChild(card);
    });
    
    // Add "View All" link if more than 5
    if (healthReports.length > 5) {
        const viewAll = document.createElement('div');
        viewAll.className = 'site-card';
        viewAll.style.textAlign = 'center';
        viewAll.style.cursor = 'pointer';
        viewAll.innerHTML = `<span style="color: var(--accent-primary);">View all ${healthReports.length} reports →</span>`;
        elements.reportsList.appendChild(viewAll);
    }
}

async function saveHealthReport(healthReport, siteOverride = null) {
    try {
        const siteName = siteOverride || selectedSite;
        const response = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                site: siteName,
                locale: indexedSites.find(s => s.name === siteName)?.locale || 'full',
                report: healthReport
            })
        });
        const data = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
        
        if (data.success) {
            lastHealthReport = data.report;
            loadReports(); // Refresh the list
            return data.reportId;
        }
    } catch (error) {
        console.error('Failed to save report:', error);
    }
    return null;
}

function renderSitesList() {
    if (indexedSites.length === 0) {
        elements.noSitesMessage.classList.remove('hidden');
        elements.sitesList.innerHTML = '';
        elements.sitesList.appendChild(elements.noSitesMessage);
        return;
    }
    
    elements.noSitesMessage.classList.add('hidden');
    elements.sitesList.innerHTML = '';
    
    indexedSites.forEach(site => {
        const card = document.createElement('div');
        card.className = 'site-card' + (selectedSite === site.name ? ' active' : '');
        const localeBadge = site.localeBadge || (site.locale === 'full' ? '🌐 full' : site.locale);
        card.innerHTML = `
            <div class="site-card-name">${site.domain || site.name.replace(/_/g, '.')}</div>
            <div class="site-card-locale">${localeBadge}</div>
            <div class="site-card-meta">
                <span>${site.pageCount} pages</span>
                <span>${site.linkCount} links</span>
            </div>
            <button class="btn btn-ghost btn-sm site-card-delete" data-site="${site.name}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"/>
                    <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
                </svg>
            </button>
        `;
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.site-card-delete')) {
                selectSite(site.name);
            }
        });
        
        const deleteBtn = card.querySelector('.site-card-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSite(site.name);
        });
        
        elements.sitesList.appendChild(card);
    });
}

function selectSite(siteName) {
    selectedSite = siteName;
    
    // Update UI
    document.querySelectorAll('.site-card').forEach(card => {
        card.classList.toggle('active', card.querySelector('.site-card-name').textContent === siteName);
    });
    
    // Show search panel
    elements.noSiteSelected.classList.add('hidden');
    elements.searchContainer.classList.remove('hidden');
    
    // Find site info
    const site = indexedSites.find(s => s.name === siteName);
    if (site) {
        elements.selectedSiteName.textContent = siteName;
        elements.selectedSiteMeta.textContent = `${site.pageCount} pages indexed • ${site.linkCount} links discovered`;
    }
    
    // Clear previous results
    clearResults();
}

function deleteSite(siteName) {
    if (!confirm(`Delete index for "${siteName}"? This cannot be undone.`)) return;
    
    fetch(`/api/indexes/${encodeURIComponent(siteName)}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`Deleted index for ${siteName}`, 'success');
                if (selectedSite === siteName) {
                    selectedSite = null;
                    elements.noSiteSelected.classList.remove('hidden');
                    elements.searchContainer.classList.add('hidden');
                }
                loadIndexedSites();
            } else {
                showToast(`Failed to delete: ${data.error}`, 'error');
            }
        })
        .catch(err => {
            showToast('Failed to delete index', 'error');
        });
}

// ===== Add Site (Index) =====
function handleAddSite(e) {
    e.preventDefault();
    
    const url = elements.newSiteUrl.value.trim();
    const maxPages = parseInt(elements.maxPagesToIndex.value) || 0;
    
    // Get locale filter
    let localeFilter = elements.localeFilter.value;
    if (localeFilter === 'custom') {
        localeFilter = elements.customLocale.value.trim().toLowerCase();
    }
    
    if (!url) {
        showToast('Please enter a URL', 'error');
        return;
    }
    
    // Close modal and show progress
    closeAddSiteModal();
    elements.progressOverlay.classList.remove('hidden');
    elements.progressBar.style.width = '0%';
    elements.progressBar.style.animation = 'none';
    elements.progressLog.innerHTML = '';
    elements.indexSpeed.textContent = '-';
    isIndexing = true;
    indexStartTime = null;
    lastLinksCount = 0;
    lastSpeedCheck = null;
    
    // Start indexing with locale filter
    const excludeSwitcherLinks = elements.excludeSwitcherOnIndex?.checked ?? true;

    socket.emit('buildIndex', { 
        url, 
        maxPages, 
        concurrency: 5,
        localeFilter: localeFilter || null,
        excludeLocaleSwitcher: excludeSwitcherLinks
    });
}

function closeAddSiteModal() {
    elements.addSiteModal.classList.add('hidden');
    elements.newSiteUrl.value = '';
    elements.localeFilter.value = '';
    elements.customLocale.value = '';
    elements.customLocaleGroup.classList.add('hidden');
}

// ===== Search =====
function handleSearch(e) {
    e.preventDefault();
    
    if (!selectedSite) {
        showToast('Please select a site first', 'error');
        return;
    }
    
    const mode = elements.searchMode.value;
    const pattern = elements.searchPattern.value.trim();
    const sourceLocale = elements.sourceLocale.value;
    const otherLocales = elements.otherLocales.value;
    const excludeLocaleSwitcher = elements.excludeLocaleSwitcher?.checked ?? true;
    
    // Validate
    if ((mode === 'pattern') && !pattern) {
        showToast('Please enter a search pattern', 'error');
        return;
    }
    
    const startTime = Date.now();
    
    // Build search params
    const params = new URLSearchParams({
        site: selectedSite,
        mode: mode
    });
    
    if (pattern) params.append('pattern', pattern);
    params.append('excludeLocaleSwitcher', excludeLocaleSwitcher);
    if (mode === 'crosslocale' || mode === 'both') {
        params.append('sourceLocale', sourceLocale);
        params.append('otherLocales', otherLocales);
    }
    
    // Run search
    fetch(`/api/search?${params}`)
        .then(res => res.json())
        .then(data => {
            const elapsed = Date.now() - startTime;
            
            if (data.success) {
                lastSearchResults = data.results || [];
                displayResults(lastSearchResults, elapsed);
            } else {
                showToast(`Search failed: ${data.error}`, 'error');
            }
        })
        .catch(err => {
            showToast('Search failed', 'error');
        });
}

function displayResults(results, elapsed) {
    elements.resultsCount.textContent = results.length;
    elements.searchTime.textContent = `(${elapsed}ms)`;
    elements.resultsFilterInput.value = '';
    
    // Enable export buttons
    elements.exportJsonBtn.disabled = results.length === 0;
    elements.exportCsvBtn.disabled = results.length === 0;
    
    if (results.length === 0) {
        elements.resultsPagesCount.textContent = '';
        elements.findingsList.innerHTML = `
            <div class="empty-state-small">
                <p>No matches found ✓</p>
            </div>
        `;
        return;
    }
    
    // Group results by source page
    const grouped = new Map();
    for (const r of results) {
        const key = r.sourceUrl;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(r);
    }
    
    elements.resultsPagesCount.textContent = `(${grouped.size} pages)`;
    
    // Render grouped results
    elements.findingsList.innerHTML = Array.from(grouped.entries()).map(([pageUrl, links]) => `
        <div class="page-group" data-page="${escapeHtml(pageUrl)}">
            <div class="page-group-header" onclick="togglePageGroup(this)">
                <span class="page-group-toggle">▼</span>
                <span class="page-group-url">${escapeHtml(pageUrl)}</span>
                <span class="page-group-count">${links.length}</span>
            </div>
            <div class="page-group-links">
                ${links.map(r => `
                    <div class="finding-item" data-target="${escapeHtml(r.targetUrl)}" data-text="${escapeHtml(r.linkText || '')}">
                        <div class="finding-target">
                            ${r.crossLocale ? '<span class="finding-label locale-mismatch">Cross-Locale</span>' : '<span class="finding-label">Match</span>'}
                            <span class="finding-target-url">${escapeHtml(r.targetUrl)}</span>
                            ${r.targetLocale && r.targetLocale !== 'default' ? `<span class="finding-source-locale">${r.targetLocale}</span>` : ''}
                        </div>
                        ${r.linkText ? `<div class="finding-link-text">"${escapeHtml(r.linkText)}"</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Toggle page group collapse
function togglePageGroup(header) {
    const group = header.closest('.page-group');
    group.classList.toggle('collapsed');
}

// Filter results
function filterResults(query) {
    const q = query.toLowerCase().trim();
    const groups = elements.findingsList.querySelectorAll('.page-group');
    
    groups.forEach(group => {
        const pageUrl = group.dataset.page.toLowerCase();
        const items = group.querySelectorAll('.finding-item');
        let visibleCount = 0;
        
        items.forEach(item => {
            const targetUrl = (item.dataset.target || '').toLowerCase();
            const linkText = (item.dataset.text || '').toLowerCase();
            const matches = !q || pageUrl.includes(q) || targetUrl.includes(q) || linkText.includes(q);
            item.style.display = matches ? '' : 'none';
            if (matches) visibleCount++;
        });
        
        // Hide entire group if no items match
        group.style.display = visibleCount > 0 ? '' : 'none';
        
        // Update count badge
        const countBadge = group.querySelector('.page-group-count');
        if (countBadge && q) {
            countBadge.textContent = visibleCount;
        }
    });
}

function clearResults() {
    lastSearchResults = [];
    elements.resultsCount.textContent = '0';
    elements.resultsPagesCount.textContent = '';
    elements.searchTime.textContent = '';
    elements.resultsFilterInput.value = '';
    elements.exportJsonBtn.disabled = true;
    elements.exportCsvBtn.disabled = true;
    elements.findingsList.innerHTML = `
        <div class="empty-state-small">
            <p>Run a search to see results</p>
        </div>
    `;
}

// ===== Export =====
function exportResults(format) {
    if (lastSearchResults.length === 0) return;
    
    let content, filename, type;
    
    if (format === 'json') {
        content = JSON.stringify(lastSearchResults, null, 2);
        filename = `spider-results-${selectedSite}-${Date.now()}.json`;
        type = 'application/json';
    } else {
        // CSV
        const headers = ['Source URL', 'Source Locale', 'Target URL', 'Target Locale', 'Link Text', 'Cross-Locale'];
        const rows = lastSearchResults.map(r => [
            r.sourceUrl,
            r.sourceLocale || '',
            r.targetUrl,
            r.targetLocale || '',
            r.linkText || '',
            r.crossLocale ? 'Yes' : 'No'
        ]);
        content = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        filename = `spider-results-${selectedSite}-${Date.now()}.csv`;
        type = 'text/csv';
    }
    
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${lastSearchResults.length} results to ${format.toUpperCase()}`, 'success');
}

// ===== Utilities =====
function extractDomain(url) {
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '').replace(/\./g, '_');
    } catch {
        return url.replace(/[^a-z0-9]/gi, '_');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${type === 'success' 
                ? '<polyline points="20,6 9,17 4,12"/>' 
                : type === 'error' 
                    ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
                    : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
            }
        </svg>
        <span>${escapeHtml(message)}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== Health Report =====
async function showHealthReport(report, siteName = null, reportIdOverride = null) {
    const broken = report.broken || [];
    const redirects = report.redirects || [];
    const crossLocale = report.crossLocale || [];
    const healthy = report.healthy || 0;
    
    // Hide progress, show results
    elements.healthProgress.classList.add('hidden');
    elements.healthResults.style.display = 'block';
    
    // Update button state
    elements.runHealthCheckBtn.disabled = false;
    elements.runHealthCheckBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        Run Health Check
    `;
    
    // Save the report (if not already saved by server)
    const reportId = reportIdOverride || await saveHealthReport(report, siteName);
    
    // Update "View Full Report" button href
    if (reportId && elements.viewFullReportBtn) {
        elements.viewFullReportBtn.href = `/report.html?id=${encodeURIComponent(reportId)}`;
        elements.viewFullReportBtn.style.display = 'inline-flex';
    }
    
    // Show success message and link to full report
    if (broken.length === 0 && redirects.length === 0 && crossLocale.length === 0) {
        elements.healthReportModal.classList.add('hidden');
        showToast('✓ All links are healthy!', 'success');
        return;
    }
    
    // Update counts
    elements.healthyCount.textContent = healthy;
    elements.redirectCount.textContent = redirects.length;
    elements.brokenCount.textContent = broken.length;
    elements.crossLocaleCount.textContent = crossLocale.length;
    
    // Broken links - show anchor text + target URL + source page
    if (broken.length > 0) {
        elements.brokenSection.classList.remove('hidden');
        elements.brokenList.innerHTML = broken.slice(0, 100).map(item => `
            <div class="health-item">
                <div class="health-item-header">
                    <span class="health-item-status broken">${item.status}</span>
                    <span class="health-item-anchor">"${escapeHtml(item.anchorText || item.linkText || item.text || '(no text)')}"</span>
                    ${item.occurrences > 1 ? `<span class="health-item-occurrences">×${item.occurrences} pages</span>` : ''}
                </div>
                <div class="health-item-target">→ ${escapeHtml(item.targetUrl)}</div>
                <div class="health-item-source"><strong>Found on:</strong> ${escapeHtml(item.sourceUrl || item.foundOn || '')}</div>
            </div>
        `).join('');
        if (broken.length > 100) {
            elements.brokenList.innerHTML += `<div class="health-empty">...and ${broken.length - 100} more</div>`;
        }
    } else {
        elements.brokenSection.classList.add('hidden');
    }
    
    // Redirects - show what needs updating
    if (redirects.length > 0) {
        elements.redirectSection.classList.remove('hidden');
        elements.redirectList.innerHTML = redirects.slice(0, 100).map(item => `
            <div class="health-item">
                <div class="health-item-header">
                    <span class="health-item-status redirect">${item.status}</span>
                    <span class="health-item-anchor">"${escapeHtml(item.anchorText || item.linkText || item.text || '(no text)')}"</span>
                    ${item.occurrences > 1 ? `<span class="health-item-occurrences">×${item.occurrences} pages</span>` : ''}
                </div>
                <div class="health-item-target">→ ${escapeHtml(item.targetUrl)}</div>
                <div class="health-item-source"><strong>Found on:</strong> ${escapeHtml(item.sourceUrl || item.foundOn || '')}</div>
            </div>
        `).join('');
        if (redirects.length > 100) {
            elements.redirectList.innerHTML += `<div class="health-empty">...and ${redirects.length - 100} more</div>`;
        }
    } else {
        elements.redirectSection.classList.add('hidden');
    }
    
    // Cross-locale - show locale mismatch with anchor text
    if (crossLocale.length > 0) {
        elements.crossLocaleSection.classList.remove('hidden');
        elements.crossLocaleList.innerHTML = crossLocale.slice(0, 100).map(item => `
            <div class="health-item">
                <div class="health-item-header">
                    <span class="health-item-status locale">${item.sourceLocale || 'default'} → ${item.targetLocale}</span>
                    <span class="health-item-anchor">"${escapeHtml(item.anchorText || item.linkText || item.text || '(no text)')}"</span>
                    ${item.occurrences > 1 ? `<span class="health-item-occurrences">×${item.occurrences} pages</span>` : ''}
                </div>
                <div class="health-item-target" style="color: var(--warning);">→ ${escapeHtml(item.targetUrl)}</div>
                <div class="health-item-source"><strong>Found on:</strong> ${escapeHtml(item.sourceUrl || item.foundOn || '')}</div>
            </div>
        `).join('');
        if (crossLocale.length > 50) {
            elements.crossLocaleList.innerHTML += `<div class="health-empty">...and ${crossLocale.length - 50} more</div>`;
        }
    } else {
        elements.crossLocaleSection.classList.add('hidden');
    }
    
    // Show modal
    elements.healthReportModal.classList.remove('hidden');
}

// ===== Run Health Check on Existing Index =====
async function runHealthCheck() {
    if (!selectedSite) {
        showToast('Please select a site first', 'error');
        return;
    }
    
    elements.runHealthCheckBtn.disabled = true;
    elements.runHealthCheckBtn.innerHTML = `<span class="spinner"></span> Checking...`;
    
    // Show modal with progress
    elements.healthReportModal.classList.remove('hidden');
    elements.healthProgress.classList.remove('hidden');
    elements.healthResults.style.display = 'none';
    elements.healthProgressCount.textContent = '0';
    elements.healthProgressTotal.textContent = '...';
    elements.healthProgressBar.style.width = '0%';
    
    // Use WebSocket for real-time progress (check ALL links)
    socket.emit('runHealthCheck', {
        indexName: selectedSite,
        checkAll: true  // Check all links, no limit
    });
}

// ===== Sitemap Comparison =====
async function compareSitemap() {
    if (!selectedSite) {
        showToast('Please select a site first', 'error');
        return;
    }
    
    // Show modal with loading state
    elements.sitemapModal.classList.remove('hidden');
    elements.sitemapLoading.classList.remove('hidden');
    elements.sitemapResults.classList.add('hidden');
    elements.sitemapError.classList.add('hidden');
    
    try {
        const response = await fetch(`/api/sitemap/compare?site=${encodeURIComponent(selectedSite)}`);
        const data = await response.json();
        
        elements.sitemapLoading.classList.add('hidden');
        
        if (!data.success) {
            elements.sitemapError.classList.remove('hidden');
            elements.sitemapErrorMsg.textContent = data.error || 'Failed to fetch sitemap';
            return;
        }
        
        // Show results
        elements.sitemapResults.classList.remove('hidden');
        elements.sitemapTotal.textContent = data.sitemapCount || 0;
        elements.sitemapInIndex.textContent = data.inBoth || 0;
        elements.sitemapMissing.textContent = data.missingFromIndex?.length || 0;
        elements.sitemapExtra.textContent = data.extraInIndex?.length || 0;
        
        // Store missing URLs for later indexing
        missingUrls = data.missingFromIndex || [];
        
        // Show missing URLs
        if (missingUrls.length > 0) {
            elements.sitemapMissingSection.classList.remove('hidden');
            elements.sitemapMissingList.innerHTML = missingUrls.slice(0, 100).map(url => 
                `<div class="sitemap-url-item">${escapeHtml(url)}</div>`
            ).join('');
            if (missingUrls.length > 100) {
                elements.sitemapMissingList.innerHTML += `<div class="sitemap-url-item">...and ${missingUrls.length - 100} more</div>`;
            }
        } else {
            elements.sitemapMissingSection.classList.add('hidden');
        }
        
        // Show extra URLs (found by crawl but not in sitemap)
        if (data.extraInIndex?.length > 0) {
            elements.sitemapExtraSection.classList.remove('hidden');
            elements.sitemapExtraList.innerHTML = data.extraInIndex.slice(0, 50).map(url => 
                `<div class="sitemap-url-item">${escapeHtml(url)}</div>`
            ).join('');
            if (data.extraInIndex.length > 50) {
                elements.sitemapExtraList.innerHTML += `<div class="sitemap-url-item">...and ${data.extraInIndex.length - 50} more</div>`;
            }
        } else {
            elements.sitemapExtraSection.classList.add('hidden');
        }
        
    } catch (error) {
        elements.sitemapLoading.classList.add('hidden');
        elements.sitemapError.classList.remove('hidden');
        elements.sitemapErrorMsg.textContent = error.message || 'Failed to compare sitemap';
    }
}

function indexMissingUrls() {
    if (missingUrls.length === 0) {
        showToast('No missing URLs to index', 'info');
        return;
    }
    
    // Close sitemap modal
    elements.sitemapModal.classList.add('hidden');
    
    // Show progress overlay
    elements.progressOverlay.classList.remove('hidden');
    elements.progressBar.style.width = '0%';
    elements.progressBar.style.animation = 'none';
    elements.progressLog.innerHTML = '';
    elements.indexSpeed.textContent = '-';
    isIndexing = true;
    indexStartTime = null;
    lastLinksCount = 0;
    lastSpeedCheck = null;
    
    // Start indexing missing URLs
    socket.emit('indexMissing', { 
        site: selectedSite, 
        urls: missingUrls,
        excludeLocaleSwitcher: true
    });
    
    showToast(`Indexing ${missingUrls.length} missing URLs...`, 'info');
}
