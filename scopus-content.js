/**
 * Scopus Content Script
 * 1. Supports Author Search Results List (Classic & React layout)
 * 2. Supports Author Profile Detail Page (/authid/detail.uri) for Reverse Lookup
 */

// ============================================================================
// 1. Author Search Results List Parser
// ============================================================================
function parseScopusTable() {
    const candidates = [];

    // Classic Scopus Table Layout (#srchResultsList)
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
                    hIndex: '-'
                });
            } catch (err) {
                console.error('[Scopus Scraper] Error parsing classic row:', err);
            }
        });

        if (candidates.length > 0) return candidates;
    }

    // New React Scopus Table Layout (Table_body__rEaa6)
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

// ============================================================================
// 2. Author Profile Detail Page Parser (Reverse Lookup)
// ============================================================================
function parseScopusAuthorName(rawName) {
    if (!rawName) return { rawName: '', fullName: '', lastName: '', firstName: '' };
    if (rawName.includes(',')) {
        const parts = rawName.split(',');
        const lastName = parts[0].trim();
        const firstName = parts.slice(1).join(' ').trim();
        return {
            rawName,
            fullName: `${firstName} ${lastName}`.trim(),
            lastName,
            firstName
        };
    }
    const words = rawName.trim().split(/\s+/);
    if (words.length > 1) {
        return {
            rawName,
            fullName: rawName.trim(),
            lastName: words[words.length - 1],
            firstName: words.slice(0, -1).join(' ')
        };
    }
    return {
        rawName,
        fullName: rawName.trim(),
        lastName: rawName.trim(),
        firstName: ''
    };
}

function parseScopusAuthorProfile() {
    try {
        // 1. Author Name
        let rawName = '';
        const nameEl = document.querySelector('[data-testid="author-profile-name"]') ||
                       document.querySelector('#authDetailsName') ||
                       document.querySelector('h1.authName') ||
                       document.querySelector('h1[class*="Heading"]');
        if (nameEl) {
            rawName = nameEl.textContent.trim();
        }

        const nameParsed = parseScopusAuthorName(rawName);

        // 2. Affiliation & Location
        let affiliation = '';
        let city = '';
        let country = '';
        const instEl = document.querySelector('[data-testid="authorInstitution"]');
        if (instEl) {
            const instLink = instEl.querySelector('a');
            affiliation = instLink ? instLink.textContent.trim() : '';
            const fullInstText = instEl.textContent.trim();
            const parts = fullInstText.split(',').map(s => s.trim());
            if (parts.length >= 2) {
                if (!affiliation) affiliation = parts[0];
                city = parts[1] || '';
                country = parts[2] || '';
            }
        } else {
            const classicAffil = document.querySelector('#authDetailsInst, .authorInstitution, .affiliationText');
            if (classicAffil) affiliation = classicAffil.textContent.trim();
        }

        // 3. Scopus ID
        let scopusId = '';
        const idEl = document.querySelector('[data-testid="authorId"]');
        if (idEl) {
            const match = idEl.textContent.match(/(\d+)/);
            if (match) scopusId = match[1];
        }
        if (!scopusId) {
            const urlMatch = window.location.href.match(/authorId=(\d+)/i);
            if (urlMatch) scopusId = urlMatch[1];
        }

        // 4. Documents Count
        let documents = '0';
        const docEl = document.querySelector('[data-testid="metrics-section-document-count"] [data-testid="unclickable-count"]') ||
                      document.querySelector('[data-testid="metrics-section-document-count"] span') ||
                      document.querySelector('[data-testid="metrics-section-document-count"]');
        if (docEl) {
            const num = docEl.textContent.replace(/[^0-9]/g, '');
            if (num) documents = num;
        }

        // 5. Citations Count
        let citations = '0';
        const citEl = document.querySelector('[data-testid="metrics-section-citations-count"] [data-testid="unclickable-count"]') ||
                      document.querySelector('[data-testid="metrics-section-citations-count"] span') ||
                      document.querySelector('[data-testid="metrics-section-citations-count"]');
        if (citEl) {
            const num = citEl.textContent.replace(/[^0-9]/g, '');
            if (num) citations = num;
        }

        // 6. h-index
        let hIndex = '0';
        const hEl = document.querySelector('[data-testid="metrics-section-h-index"] [data-testid="unclickable-count"]') ||
                    document.querySelector('[data-testid="metrics-section-h-index"] span') ||
                    document.querySelector('[data-testid="metrics-section-h-index"]');
        if (hEl) {
            const num = hEl.textContent.replace(/[^0-9]/g, '');
            if (num) hIndex = num;
        }

        const profileUrl = scopusId 
            ? `https://www.scopus.com/authid/detail.uri?authorId=${scopusId}` 
            : window.location.href;

        return {
            scopusId,
            rawName: nameParsed.rawName,
            fullName: nameParsed.fullName,
            lastName: nameParsed.lastName,
            firstName: nameParsed.firstName,
            name: nameParsed.rawName, // Default display format
            affiliation,
            city,
            country,
            documents,
            citations,
            hIndex,
            profileUrl
        };
    } catch (e) {
        console.error('[Scopus Scraper] Error parsing author profile:', e);
        return null;
    }
}

// ============================================================================
// 3. Extraction Runners
// ============================================================================
function checkAndExtractSearchResults() {
    let attempts = 0;
    const maxAttempts = 35; // 35 * 400ms = 14s

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
            console.warn('[Scopus Scraper] Maximum wait attempts reached for search results.');
            const fallbackCandidates = parseScopusTable();
            chrome.runtime.sendMessage({
                action: 'SCOPUS_RESULTS_EXTRACTED',
                candidates: fallbackCandidates,
                url: window.location.href
            });
        }
    }, 400);
}

function checkAndExtractAuthorProfile() {
    let attempts = 0;
    const maxAttempts = 35; // 14 seconds

    const interval = setInterval(() => {
        attempts++;

        // Check if author profile name element exists
        const nameEl = document.querySelector('[data-testid="author-profile-name"]') ||
                       document.querySelector('#authDetailsName') ||
                       document.querySelector('h1.authName');

        if (nameEl && nameEl.textContent.trim().length > 0) {
            clearInterval(interval);
            const profile = parseScopusAuthorProfile();
            console.log('[Scopus Scraper] Author profile extracted:', profile);
            chrome.runtime.sendMessage({
                action: 'SCOPUS_PROFILE_EXTRACTED',
                profile,
                url: window.location.href
            });
            return;
        }

        // Check for error / 404 / author not found
        const bodyText = document.body.innerText || '';
        if (/author\s+(?:profile\s+)?not\s+found/i.test(bodyText) || /page\s+not\s+found/i.test(bodyText)) {
            clearInterval(interval);
            console.warn('[Scopus Scraper] Author profile not found on page.');
            chrome.runtime.sendMessage({
                action: 'SCOPUS_PROFILE_EXTRACTED',
                profile: null,
                error: 'Profil author Scopus tidak ditemukan.',
                url: window.location.href
            });
            return;
        }

        if (attempts >= maxAttempts) {
            clearInterval(interval);
            console.warn('[Scopus Scraper] Maximum wait attempts reached for author profile.');
            const profile = parseScopusAuthorProfile();
            chrome.runtime.sendMessage({
                action: 'SCOPUS_PROFILE_EXTRACTED',
                profile: (profile && profile.fullName) ? profile : null,
                error: (!profile || !profile.fullName) ? 'Batas waktu memuat profil Scopus terlampaui.' : null,
                url: window.location.href
            });
        }
    }, 400);
}

// ============================================================================
// 4. Initializer & Listeners
// ============================================================================
function initScopusContentScript() {
    const isProfilePage = window.location.href.includes('/authid/detail.uri');
    if (isProfilePage) {
        checkAndExtractAuthorProfile();
    } else {
        checkAndExtractSearchResults();
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initScopusContentScript();
} else {
    document.addEventListener('DOMContentLoaded', initScopusContentScript);
}

// Manual extraction listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_NOW') {
        const isProfilePage = window.location.href.includes('/authid/detail.uri');
        if (isProfilePage) {
            sendResponse({ profile: parseScopusAuthorProfile() });
        } else {
            sendResponse({ candidates: parseScopusTable() });
        }
    }
});
