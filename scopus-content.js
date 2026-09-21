/**
 * Scopus Content Script
 * Supports both Classic Scopus layout (#srchResultsList)
 * and New React Scopus layout (Table_body__rEaa6 / List_authorItem)
 */

function parseScopusTable() {
    const candidates = [];

    // ========================================================================
    // 1. Classic Scopus Table Layout (#srchResultsList)
    // ========================================================================
    const classicRows = document.querySelectorAll('#srchResultsList tr.searchArea, tr[id^="resultDataRow"]');
    if (classicRows.length > 0) {
        console.log(`[Scopus Scraper] Detecting Classic Layout (${classicRows.length} rows)`);

        classicRows.forEach(row => {
            try {
                const auInput = row.querySelector('input[name="authorIds"]');
                const scopusId = auInput ? auInput.value.trim() : '';

                // Extract Name
                let name = auInput ? auInput.getAttribute('data-name') : '';
                if (!name) {
                    const nameTd = row.querySelector('.authorResultsNamesCol');
                    name = nameTd ? nameTd.textContent.trim() : '';
                }

                // Profile URL
                const profileUrl = scopusId ? `https://www.scopus.com/authid/detail.uri?authorId=${scopusId}` : '';

                // Extract Documents
                let documents = auInput ? auInput.getAttribute('data-doccount') : '';
                if (!documents) {
                    const docAnchor = row.querySelector('td.dataCol3 a, td.dataCol3');
                    documents = docAnchor ? docAnchor.textContent.trim() : '0';
                }

                // Extract Affiliation
                const affilEl = row.querySelector('.dataCol5 .anchorText') || 
                                row.querySelector('.dataCol5 a') || 
                                row.querySelector('.dataCol5');
                const affiliation = affilEl ? affilEl.textContent.trim() : '';

                // Extract City
                const cityEl = row.querySelector('.dataCol6');
                const city = cityEl ? cityEl.textContent.trim() : '';

                // Extract Country
                const countryEl = row.querySelector('.dataCol7');
                const country = countryEl ? countryEl.textContent.trim() : '';

                candidates.push({
                    scopusId,
                    name,
                    profileUrl,
                    affiliation,
                    city,
                    country,
                    documents: documents || '0',
                    hIndex: '-' // Classic layout does not display h-index column in result list
                });
            } catch (err) {
                console.error('[Scopus Scraper] Error parsing classic row:', err);
            }
        });

        if (candidates.length > 0) return candidates;
    }

    // ========================================================================
    // 2. New React Scopus Table Layout (Table_body__rEaa6)
    // ========================================================================
    const reactRows = document.querySelectorAll('tr[class*="List_authorItem"], tbody[class*="Table_body"] tr');
    if (reactRows.length > 0) {
        console.log(`[Scopus Scraper] Detecting React Layout (${reactRows.length} rows)`);

        reactRows.forEach(row => {
            try {
                const nameAnchor = row.querySelector('a[href*="/authid/detail.uri"]');
                if (!nameAnchor) return;

                const name = nameAnchor.textContent.trim();
                const href = nameAnchor.getAttribute('href') || '';
                const idMatch = href.match(/authorId=(\d+)/);
                const scopusId = idMatch ? idMatch[1] : '';

                const affilAnchor = row.querySelector('a[href*="/pages/organization"]');
                const cells = row.querySelectorAll('td');

                let affiliation = affilAnchor ? affilAnchor.textContent.trim() : '';
                let city = '';
                let country = '';
                let documents = '0';
                let hIndex = '0';

                if (cells.length >= 7) {
                    if (!affiliation && cells[2]) affiliation = cells[2].textContent.trim();
                    city = cells[3] ? cells[3].textContent.trim() : '';
                    country = cells[4] ? cells[4].textContent.trim() : '';
                    documents = cells[5] ? cells[5].textContent.trim() : '0';
                    hIndex = cells[6] ? cells[6].textContent.trim() : '0';
                }

                candidates.push({
                    scopusId,
                    name,
                    profileUrl: href.startsWith('http') ? href : `https://www.scopus.com${href}`,
                    affiliation,
                    city,
                    country,
                    documents,
                    hIndex
                });
            } catch (e) {
                console.error('[Scopus Scraper] Error parsing react row:', e);
            }
        });
    }

    return candidates;
}

function checkAndExtract() {
    let attempts = 0;
    const maxAttempts = 35; // 35 * 400ms = 14 seconds max wait

    const interval = setInterval(() => {
        attempts++;

        // 1. Check for Classic table rows
        const hasClassic = document.querySelector('#srchResultsList tr.searchArea, #srchResultsList tr[id^="resultDataRow"]');
        // 2. Check for React table rows
        const hasReact = document.querySelector('tr[class*="List_authorItem"], tbody[class*="Table_body"] a[href*="/authid/detail.uri"]');

        if (hasClassic || hasReact) {
            clearInterval(interval);
            const candidates = parseScopusTable();
            console.log(`[Scopus Scraper] Extraction complete. Found ${candidates.length} authors.`);
            chrome.runtime.sendMessage({
                action: 'SCOPUS_RESULTS_EXTRACTED',
                candidates,
                url: window.location.href
            });
            return;
        }

        // 3. Check for 0 results indicator
        const noAuthMessage = document.querySelector('#noAuthorsFoundMessage:not(.hidden)');
        const pageText = document.body.innerText || '';
        const isZeroResult = noAuthMessage ||
                             /0\s+author\s+results/i.test(pageText) || 
                             /no\s+authors?\s+found/i.test(pageText) ||
                             /no\s+results?\s+found/i.test(pageText);

        if (isZeroResult) {
            clearInterval(interval);
            console.log('[Scopus Scraper] 0 author results detected.');
            chrome.runtime.sendMessage({
                action: 'SCOPUS_RESULTS_EXTRACTED',
                candidates: [],
                url: window.location.href
            });
            return;
        }

        if (attempts >= maxAttempts) {
            clearInterval(interval);
            console.warn('[Scopus Scraper] Maximum wait attempts reached.');
            const fallbackCandidates = parseScopusTable();
            chrome.runtime.sendMessage({
                action: 'SCOPUS_RESULTS_EXTRACTED',
                candidates: fallbackCandidates,
                url: window.location.href
            });
        }
    }, 400);
}

// Run when page loads
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    checkAndExtract();
} else {
    document.addEventListener('DOMContentLoaded', checkAndExtract);
}

// Manual extraction listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_NOW') {
        const candidates = parseScopusTable();
        sendResponse({ candidates });
    }
});
