/**
 * Background Service Worker for SINTA & Scopus Author Matcher
 * Chrome Extension Manifest V3
 */

let scopusWorkerTabId = null;
let currentPendingRequest = null;

// 1. Click extension action icon -> Open full Dashboard tab
chrome.action.onClicked.addListener(() => {
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
    chrome.tabs.query({}, (tabs) => {
        const existingTab = tabs.find(t => t.url && t.url.startsWith(dashboardUrl));
        if (existingTab) {
            chrome.tabs.update(existingTab.id, { active: true });
        } else {
            chrome.tabs.create({ url: dashboardUrl });
        }
    });
});

// 2. Clean up worker tab if closed by user
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === scopusWorkerTabId) {
        scopusWorkerTabId = null;
        if (currentPendingRequest) {
            currentPendingRequest.reject(new Error('Tab Scopus ditutup oleh pengguna.'));
            currentPendingRequest = null;
        }
    }
});

// 3. Message listener between Dashboard and Scopus Tab
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SEARCH_SCOPUS') {
        handleScopusSearch(request.lastName, request.firstName)
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep message channel open for async response
    }

    if (request.action === 'CLOSE_SCOPUS_WORKER') {
        if (scopusWorkerTabId) {
            chrome.tabs.remove(scopusWorkerTabId, () => {
                scopusWorkerTabId = null;
            });
        }
        sendResponse({ success: true });
        return false;
    }

    if (request.action === 'SCOPUS_RESULTS_EXTRACTED') {
        if (currentPendingRequest) {
            currentPendingRequest.resolve(request.candidates || []);
            currentPendingRequest = null;
        }
        sendResponse({ success: true });
        return false;
    }
});

/**
 * Navigate or open worker tab to Scopus author search URL and wait for extraction
 */
function handleScopusSearch(lastName, firstName) {
    return new Promise(async (resolve, reject) => {
        currentPendingRequest = { resolve, reject };

        const targetUrl = `https://www.scopus.com/results/authorNamesList.uri?name=name&st1=${encodeURIComponent(lastName)}&st2=${encodeURIComponent(firstName)}&origin=searchauthorlookup`;

        const timeout = setTimeout(() => {
            if (currentPendingRequest) {
                currentPendingRequest.reject(new Error('Batas waktu pencarian Scopus (18s) terlampaui.'));
                currentPendingRequest = null;
            }
        }, 18000);

        // Wrap resolve/reject to clear timeout
        const origResolve = resolve;
        const origReject = reject;
        currentPendingRequest.resolve = (val) => {
            clearTimeout(timeout);
            origResolve(val);
        };
        currentPendingRequest.reject = (err) => {
            clearTimeout(timeout);
            origReject(err);
        };

        try {
            if (scopusWorkerTabId) {
                // Verify tab still exists
                chrome.tabs.get(scopusWorkerTabId, (tab) => {
                    if (chrome.runtime.lastError || !tab) {
                        openNewScopusTab(targetUrl);
                    } else {
                        chrome.tabs.update(scopusWorkerTabId, { url: targetUrl });
                    }
                });
            } else {
                openNewScopusTab(targetUrl);
            }
        } catch (e) {
            currentPendingRequest.reject(e);
        }
    });
}

function openNewScopusTab(url) {
    chrome.tabs.create({ url, active: false }, (tab) => {
        scopusWorkerTabId = tab.id;
    });
}
