/**
 * SINTA & Scopus Author Finder - Core Unified Application Logic
 * Chrome Extension & Web Dashboard
 */

// Global State
const state = {
    currentSource: 'sinta', // 'sinta' | 'scopus'
    isExtensionMode: typeof chrome !== 'undefined' && !!chrome.runtime?.id,
    items: [],              // List of items to search
    currentIndex: 0,        // Current processing index
    isRunning: false,       // Search loop active
    isPaused: false,        // Search paused
    delayMs: 1000,          // Delay between requests (ms)
    stripTitles: true,      // Auto-strip academic titles
    removeDuplicates: true, // Auto-remove duplicate names
    duplicateCount: 0,      // Number of duplicates removed
    campusFilter: '',       // Optional campus filter
    activeReviewItem: null  // Currently opened item in modal
};

// ============================================================================
// 1. Academic Title Cleaner & Name Parser
// ============================================================================
const TITLE_PATTERNS_FRONT = [
    /\b(prof(?:esor)?|dr|doktor|dra|drs|ir|drg|apt|ns|h|hj|k\.?h|ust|tgk|bpk|ibu)\.?\s+/gi
];

const KNOWN_BACK_DEGREES = [
    's.kom', 'm.kom', 's.t', 'm.t', 's.pd', 'm.pd', 's.si', 'm.si', 's.e', 'm.m',
    'm.sc', 'b.sc', 'ph.d', 'phd', 'm.phil', 'm.eng', 'b.eng', 'm.cs', 's.sos',
    's.h', 'm.h', 's.ked', 'm.biomed', 'm.kes', 's.farm', 'm.farm', 's.pt', 'm.pt',
    's.p', 'm.p', 's.sn', 'm.sn', 'm.ag', 's.ag', 'sp.a', 'sp.pd', 'sp.b', 'sp.og',
    'ak', 'ca', 'cpa', 'cma', 'cta', 'cfa', 'ipm', 'ipu', 'asean eng', 'cpm'
];

function cleanAcademicTitles(name) {
    if (!name) return '';
    let cleaned = name.trim();

    // 1. Remove commas and everything after if trailing chunk matches academic degree
    if (cleaned.includes(',')) {
        const parts = cleaned.split(',');
        const mainPart = parts[0].trim();
        const suffixPart = parts.slice(1).join(' ').toLowerCase();

        const hasDegree = KNOWN_BACK_DEGREES.some(deg => suffixPart.includes(deg.toLowerCase())) ||
                          /\b(s|m|dr|sp)\.[a-z]+/i.test(suffixPart) ||
                          /\b(ph\.?d|sc|eng|master|bachelor)\b/i.test(suffixPart);

        if (hasDegree || parts.length >= 2) {
            cleaned = mainPart;
        }
    }

    // 2. Remove front titles
    TITLE_PATTERNS_FRONT.forEach(regex => {
        cleaned = cleaned.replace(regex, '');
    });

    // 3. Remove trailing title leftovers
    KNOWN_BACK_DEGREES.forEach(deg => {
        const regex = new RegExp(`\\b${deg.replace('.', '\\.')}\\b`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });

    // 4. Clean extra spaces & punctuation
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();

    return cleaned || name.trim();
}

/**
 * Split Indonesian / International name into Last Name and First Name for Scopus
 */
function splitFirstLastName(cleanedName) {
    const words = cleanedName.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return { firstName: '', lastName: '' };
    if (words.length === 1) return { firstName: '', lastName: words[0] };

    const lastName = words[words.length - 1];
    const firstName = words.slice(0, -1).join(' ');
    return { firstName, lastName };
}

// ============================================================================
// 2. String Similarity (Inversion-Aware Levenshtein + Token Set Overlap)
// ============================================================================
function normalizeNameForCompare(s) {
    return (s || '')
        .toLowerCase()
        .replace(/[,.\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function calcLevenshteinDist(a, b) {
    if (a === b) return 100;
    if (!a.length || !b.length) return 0;
    const track = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) track[0][i] = i;
    for (let j = 0; j <= b.length; j++) track[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const ind = a[i - 1] === b[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1,
                track[j - 1][i] + 1,
                track[j - 1][i - 1] + ind
            );
        }
    }
    const dist = track[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return ((maxLen - dist) / maxLen) * 100;
}

function calcTokenOverlapScore(words1, words2) {
    if (!words1.length || !words2.length) return 0;
    let matches = 0;
    const used = new Set();

    words1.forEach(w1 => {
        // 1. Exact token match
        const exactIdx = words2.findIndex((w2, i) => !used.has(i) && w2 === w1);
        if (exactIdx !== -1) {
            matches += 1.0;
            used.add(exactIdx);
            return;
        }

        // 2. Initial match (e.g. 'h' matches 'haidar' or vice-versa)
        const initialIdx = words2.findIndex((w2, i) => {
            if (used.has(i)) return false;
            if (w1.length === 1 && w2.startsWith(w1)) return true;
            if (w2.length === 1 && w1.startsWith(w2)) return true;
            return false;
        });
        if (initialIdx !== -1) {
            matches += 0.85;
            used.add(initialIdx);
            return;
        }

        // 3. Substring match for longer tokens
        const subIdx = words2.findIndex((w2, i) => {
            if (used.has(i)) return false;
            return (w1.length > 3 && w2.includes(w1)) || (w2.length > 3 && w1.includes(w2));
        });
        if (subIdx !== -1) {
            matches += 0.75;
            used.add(subIdx);
        }
    });

    return (matches / Math.max(words1.length, words2.length)) * 100;
}

function computeSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const n1 = normalizeNameForCompare(str1);
    const n2 = normalizeNameForCompare(str2);

    // Exact direct match
    if (n1 === n2) return 100;

    // Check Scopus flipped format ('Hanif, Tio Haidar' -> 'Tio Haidar Hanif')
    let n2Flipped = '';
    if (str2.includes(',')) {
        const parts = str2.split(',');
        const last = parts[0].trim();
        const first = parts.slice(1).join(' ').trim();
        n2Flipped = normalizeNameForCompare(`${first} ${last}`);
        if (n1 === n2Flipped) return 100;
    }

    const w1 = n1.split(' ').filter(Boolean);
    const w2 = n2.split(' ').filter(Boolean);

    // Exact word token set match (identical words in any order)
    const s1Sorted = [...w1].sort().join(' ');
    const s2Sorted = [...w2].sort().join(' ');
    if (s1Sorted === s2Sorted) return 100;

    // Direct similarity
    const tokenDirect = calcTokenOverlapScore(w1, w2);
    const simDirect = (tokenDirect * 0.6) + (calcLevenshteinDist(n1, n2) * 0.4);

    // Flipped similarity (for Scopus Last, First)
    let simFlipped = 0;
    if (n2Flipped) {
        const w2Flipped = n2Flipped.split(' ').filter(Boolean);
        const tokenFlipped = calcTokenOverlapScore(w1, w2Flipped);
        simFlipped = (tokenFlipped * 0.6) + (calcLevenshteinDist(n1, n2Flipped) * 0.4);
    }

    // Sorted tokens similarity
    const tokenSorted = calcTokenOverlapScore(w1, w2);
    const simSorted = (tokenSorted * 0.6) + (calcLevenshteinDist(s1Sorted, s2Sorted) * 0.4);

    return Math.round(Math.max(simDirect, simFlipped, simSorted));
}

// ============================================================================
// 3. SINTA HTML Parser
// ============================================================================
function parseSintaHTML(htmlString, queryCleaned, campusFilter = '') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const items = doc.querySelectorAll('.list-item');
    const candidates = [];

    items.forEach(el => {
        try {
            const nameAnchor = el.querySelector('.profile-name a');
            const name = nameAnchor ? nameAnchor.textContent.trim() : '';
            const profileUrl = nameAnchor ? nameAnchor.getAttribute('href') || '' : '';

            let sintaId = '';
            const idEl = el.querySelector('.profile-id');
            if (idEl) {
                const match = idEl.textContent.match(/SINTA\s*ID\s*:\s*(\d+)/i);
                if (match) sintaId = match[1];
            }
            if (!sintaId && profileUrl) {
                const matchUrl = profileUrl.match(/\/profile\/(\d+)/);
                if (matchUrl) sintaId = matchUrl[1];
            }

            const imgEl = el.querySelector('img.avatar');
            let avatar = '';
            if (imgEl) {
                avatar = imgEl.getAttribute('src') || '';
                if (avatar.startsWith('//')) avatar = 'https:' + avatar;
            }

            const affilEl = el.querySelector('.profile-affil a');
            const affiliation = affilEl ? affilEl.textContent.trim() : '';
            const affilUrl = affilEl ? affilEl.getAttribute('href') || '' : '';

            const deptEl = el.querySelector('.profile-dept a');
            const department = deptEl ? deptEl.textContent.trim() : '';

            const scoreNums = el.querySelectorAll('.pr-bottom .pr-num');
            const score3Yr = scoreNums[0] ? scoreNums[0].textContent.trim() : '0';
            const scoreOverall = scoreNums[1] ? scoreNums[1].textContent.trim() : '0';

            let scopusH = '0';
            let scholarH = '0';
            let wosH = '0';

            const metricRows = el.querySelectorAll('.meta-side table tr');
            metricRows.forEach(tr => {
                const text = tr.textContent.toLowerCase();
                const tds = tr.querySelectorAll('td');
                const val = tds[2] ? tds[2].textContent.trim() : '0';

                if (text.includes('scopus')) scopusH = val;
                else if (text.includes('google scholar') || text.includes('scholar')) scholarH = val;
                else if (text.includes('wos')) wosH = val;
            });

            const subjectEls = el.querySelectorAll('.subject-list li a');
            const subjects = Array.from(subjectEls).map(s => s.textContent.trim()).filter(Boolean);

            if (campusFilter && affiliation) {
                if (!affiliation.toLowerCase().includes(campusFilter.toLowerCase())) {
                    return;
                }
            }

            const similarity = computeSimilarity(queryCleaned, name);

            candidates.push({
                sintaId,
                name,
                avatar,
                profileUrl: profileUrl.startsWith('http') ? profileUrl : `https://sinta.kemdiktisaintek.go.id${profileUrl}`,
                affiliation,
                affilUrl: affilUrl.startsWith('http') ? affilUrl : `https://sinta.kemdiktisaintek.go.id${affilUrl}`,
                department,
                score3Yr,
                scoreOverall,
                scopusH,
                scholarH,
                wosH,
                subjects: subjects.join(', '),
                similarity
            });
        } catch (e) {
            console.error('Error parsing card:', e);
        }
    });

    candidates.sort((a, b) => b.similarity - a.similarity);
    return candidates;
}

// ============================================================================
// 4. Data Fetchers (SINTA & SCOPUS)
// ============================================================================
async function fetchSintaSearch(query) {
    if (!state.isExtensionMode) {
        throw new Error('Pencarian SINTA membutuhkan Mode Ekstensi Chrome. Silakan muat ekstensi ini di chrome://extensions lalu buka lewat icon ekstensi.');
    }
    // Direct fetch in Chrome Extension (allowed by host_permissions, no server needed)
    const targetUrl = `https://sinta.kemdiktisaintek.go.id/authors/?q=${encodeURIComponent(query)}`;
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error(`SINTA returned HTTP ${response.status}`);
    return await response.text();
}

async function fetchScopusSearch(item) {
    if (!state.isExtensionMode) {
        throw new Error('Pencarian Scopus membutuhkan mode Ekstensi Chrome. Silakan muat ekstensi ini di chrome://extensions.');
    }

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'SEARCH_SCOPUS',
            lastName: item.scopusLastName,
            firstName: item.scopusFirstName
        }, (response) => {
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (!response || !response.success) {
                return reject(new Error(response?.error || 'Gagal berkomunikasi dengan Scopus'));
            }

            const rawCandidates = response.data || [];
            // Compute similarity for Scopus candidates
            const candidates = rawCandidates.map(c => {
                const similarity = computeSimilarity(item.cleanedName, c.name);
                return { ...c, similarity };
            });

            // Filter campus if applied
            let filteredCandidates = candidates;
            if (state.campusFilter) {
                filteredCandidates = candidates.filter(c => 
                    (c.affiliation || '').toLowerCase().includes(state.campusFilter.toLowerCase())
                );
            }

            filteredCandidates.sort((a, b) => b.similarity - a.similarity);
            resolve(filteredCandidates);
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// 5. Source Switcher (SINTA vs SCOPUS)
// ============================================================================
function switchSource(source) {
    if (state.isRunning) {
        if (!confirm('Pencarian sedang berjalan. Ganti sumber akan mereset proses saat ini. Lanjutkan?')) {
            return;
        }
        state.isRunning = false;
        state.isPaused = false;
    }

    state.currentSource = source;
    state.items = [];
    state.currentIndex = 0;

    // Update UI tabs
    const tabSinta = document.getElementById('tabSinta');
    const tabScopus = document.getElementById('tabScopus');
    const secTitle = document.getElementById('section1Title');
    const btnStart = document.getElementById('btnStart');
    const delaySelect = document.getElementById('delaySelect');

    if (source === 'sinta') {
        tabSinta.classList.add('active');
        tabScopus.classList.remove('active');
        secTitle.textContent = '1. Masukkan Daftar Nama (Pencarian SINTA)';
        btnStart.textContent = '▶ Mulai Pencarian SINTA';
        delaySelect.value = '1000';
    } else {
        tabScopus.classList.add('active');
        tabSinta.classList.remove('active');
        secTitle.textContent = '1. Masukkan Daftar Nama (Pencarian SCOPUS)';
        btnStart.textContent = '▶ Mulai Pencarian Scopus';
        delaySelect.value = '1500'; // Recommended 1.5s for Scopus tab navigation
    }

    renderTableHeader();
    updateUIControls();
    renderStats();
    renderTable();
    document.getElementById('reviewBanner').classList.add('hidden');
}

// ============================================================================
// 6. Workflow & Execution Queue
// ============================================================================
async function startProcess() {
    if (state.isRunning) return;

    const rawInput = document.getElementById('namesInput').value.trim();
    if (!rawInput) {
        alert('Silakan masukkan setidaknya satu nama terlebih dahulu!');
        return;
    }

    const lines = rawInput.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (lines.length === 0) {
        alert('Daftar nama kosong.');
        return;
    }

    state.delayMs = parseInt(document.getElementById('delaySelect').value) || 1000;
    state.stripTitles = document.getElementById('stripTitlesCheck').checked;
    state.removeDuplicates = document.getElementById('removeDuplicatesCheck')?.checked ?? true;
    state.campusFilter = document.getElementById('campusFilter').value.trim();

    // Deduplication
    let processedLines = lines;
    state.duplicateCount = 0;
    if (state.removeDuplicates) {
        const seen = new Set();
        processedLines = [];
        for (const name of lines) {
            const key = state.stripTitles 
                ? cleanAcademicTitles(name).toLowerCase() 
                : name.trim().toLowerCase();
            
            if (!seen.has(key)) {
                seen.add(key);
                processedLines.push(name);
            } else {
                state.duplicateCount++;
            }
        }
    }

    // Build Item List
    state.items = processedLines.map((originalName, idx) => {
        const cleanedName = state.stripTitles ? cleanAcademicTitles(originalName) : originalName;
        const { firstName, lastName } = splitFirstLastName(cleanedName);

        return {
            id: idx + 1,
            originalName,
            cleanedName,
            scopusFirstName: firstName,
            scopusLastName: lastName,
            status: 'pending',
            candidates: [],
            selectedCandidate: null,
            error: null
        };
    });

    state.currentIndex = 0;
    state.isRunning = true;
    state.isPaused = false;

    renderTableHeader();
    updateUIControls();
    renderStats();
    renderTable();

    await runQueue();
}

async function runQueue() {
    const total = state.items.length;

    while (state.currentIndex < total && state.isRunning) {
        if (state.isPaused) {
            await sleep(300);
            continue;
        }

        const item = state.items[state.currentIndex];
        item.status = 'searching';
        renderStats();
        renderTable();

        try {
            let candidates = [];

            if (state.currentSource === 'sinta') {
                const query = item.cleanedName || item.originalName;
                const html = await fetchSintaSearch(query);
                candidates = parseSintaHTML(html, item.cleanedName, state.campusFilter);
            } else {
                candidates = await fetchScopusSearch(item);
            }

            item.candidates = candidates;

            if (candidates.length === 0) {
                item.status = 'not_found';
                item.selectedCandidate = null;
            } else if (candidates.length === 1 && candidates[0].similarity >= 75) {
                item.status = 'matched';
                item.selectedCandidate = candidates[0];
            } else if (candidates.length > 0 && candidates[0].similarity === 100 && (candidates.length === 1 || candidates[1].similarity < 85)) {
                item.status = 'matched';
                item.selectedCandidate = candidates[0];
            } else {
                item.status = 'need_review';
                item.selectedCandidate = candidates[0]; // Recommend top
            }
        } catch (err) {
            console.error(`Error searching for ${item.originalName}:`, err);
            item.status = 'not_found';
            item.error = err.message;
        }

        state.currentIndex++;
        renderStats();
        renderTable();

        if (state.currentIndex < total && state.isRunning) {
            await sleep(state.delayMs);
        }
    }

    state.isRunning = false;
    updateUIControls();
    renderStats();
    renderTable();
    checkNeedReviewAlert();

    // Close Scopus worker tab when finished
    if (state.currentSource === 'scopus' && state.isExtensionMode) {
        chrome.runtime.sendMessage({ action: 'CLOSE_SCOPUS_WORKER' });
    }
}

function togglePause() {
    state.isPaused = !state.isPaused;
    const btn = document.getElementById('btnPause');
    if (state.isPaused) {
        btn.textContent = '▶ Lanjutkan';
        btn.classList.replace('btn-warning', 'btn-primary');
    } else {
        btn.textContent = '⏸ Jeda';
        btn.classList.replace('btn-primary', 'btn-warning');
    }
}

function resetAll() {
    if (state.isRunning && !confirm('Pencarian sedang berjalan. Anda yakin ingin membatalkan dan mereset?')) {
        return;
    }
    state.isRunning = false;
    state.isPaused = false;
    state.items = [];
    state.currentIndex = 0;

    updateUIControls();
    renderStats();
    renderTable();
    document.getElementById('reviewBanner').classList.add('hidden');
}

// ============================================================================
// 7. UI Rendering & Table Setup
// ============================================================================
function updateUIControls() {
    const btnStart = document.getElementById('btnStart');
    const btnPause = document.getElementById('btnPause');
    const btnReset = document.getElementById('btnReset');
    const namesInput = document.getElementById('namesInput');
    const delaySelect = document.getElementById('delaySelect');
    const stripTitlesCheck = document.getElementById('stripTitlesCheck');
    const removeDuplicatesCheck = document.getElementById('removeDuplicatesCheck');
    const campusFilter = document.getElementById('campusFilter');

    if (state.isRunning) {
        btnStart.disabled = true;
        btnPause.disabled = false;
        btnReset.disabled = false;
        namesInput.disabled = true;
        delaySelect.disabled = true;
        stripTitlesCheck.disabled = true;
        if (removeDuplicatesCheck) removeDuplicatesCheck.disabled = true;
        campusFilter.disabled = true;
    } else {
        btnStart.disabled = false;
        btnPause.disabled = true;
        btnPause.textContent = '⏸ Jeda';
        btnPause.classList.replace('btn-primary', 'btn-warning');
        btnReset.disabled = state.items.length === 0;
        namesInput.disabled = false;
        delaySelect.disabled = false;
        stripTitlesCheck.disabled = false;
        if (removeDuplicatesCheck) removeDuplicatesCheck.disabled = false;
        campusFilter.disabled = false;
    }
}

function renderStats() {
    const total = state.items.length;
    const completed = state.items.filter(i => i.status !== 'pending' && i.status !== 'searching').length;
    const matched = state.items.filter(i => i.status === 'matched').length;
    const needReview = state.items.filter(i => i.status === 'need_review').length;
    const notFound = state.items.filter(i => i.status === 'not_found' || i.status === 'skipped').length;

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statDone').textContent = completed;
    document.getElementById('statMatched').textContent = matched;
    document.getElementById('statReview').textContent = needReview;
    document.getElementById('statNotFound').textContent = notFound;

    document.getElementById('progressBar').style.width = `${percent}%`;

    let progressLabel = `${percent}% (${completed} dari ${total} nama)`;
    if (state.duplicateCount > 0) progressLabel += ` • [${state.duplicateCount} duplikat diabaikan]`;
    if (state.isPaused) progressLabel += ` • [Dijeda]`;
    document.getElementById('progressText').textContent = total > 0 ? progressLabel : '0%';
}

function checkNeedReviewAlert() {
    const needReviewCount = state.items.filter(i => i.status === 'need_review').length;
    const banner = document.getElementById('reviewBanner');
    const countEl = document.getElementById('reviewCount');

    if (needReviewCount > 0) {
        countEl.textContent = needReviewCount;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

function renderTableHeader() {
    const thead = document.getElementById('resultsTableHead');
    if (!thead) return;

    if (state.currentSource === 'sinta') {
        thead.innerHTML = `
            <tr>
                <th style="width: 40px;">No</th>
                <th>Nama Asli (Input)</th>
                <th>Status</th>
                <th>Nama di SINTA</th>
                <th>SINTA ID</th>
                <th>Afiliasi / Kampus</th>
                <th>Program Studi</th>
                <th>Skor 3Yr</th>
                <th>Skor Total</th>
                <th>Scopus / Scholar</th>
                <th>Aksi</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th style="width: 40px;">No</th>
                <th>Nama Asli (Input)</th>
                <th>Status</th>
                <th>Nama di Scopus</th>
                <th>Scopus Author ID</th>
                <th>Afiliasi / Institusi</th>
                <th>Kota & Negara</th>
                <th>Dokumen</th>
                <th>h-index</th>
                <th>Aksi</th>
            </tr>
        `;
    }
}

function renderTable() {
    const tbody = document.getElementById('resultsTableBody');
    const filterText = (document.getElementById('tableSearchInput')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('statusFilter')?.value || 'all';

    if (state.items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    Belum ada data. Masukkan daftar nama di atas lalu klik "${state.currentSource === 'sinta' ? 'Mulai Pencarian SINTA' : 'Mulai Pencarian Scopus'}".
                </td>
            </tr>
        `;
        return;
    }

    const filtered = state.items.filter(item => {
        if (filterStatus !== 'all' && item.status !== filterStatus) return false;
        if (filterText) {
            const orig = (item.originalName || '').toLowerCase();
            const cand = item.selectedCandidate ? (item.selectedCandidate.name || '').toLowerCase() : '';
            const camp = item.selectedCandidate ? (item.selectedCandidate.affiliation || '').toLowerCase() : '';
            return orig.includes(filterText) || cand.includes(filterText) || camp.includes(filterText);
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 30px; color: var(--text-muted);">
                    Tidak ada data yang sesuai filter pencarian.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        const c = item.selectedCandidate;
        let statusBadge = '';

        switch (item.status) {
            case 'pending':
                statusBadge = '<span class="badge badge-neutral">Menunggu</span>';
                break;
            case 'searching':
                statusBadge = '<span class="badge badge-warning"><span class="dot"></span> Mencari...</span>';
                break;
            case 'matched':
                statusBadge = `<span class="badge badge-success">✓ Cocok (${c?.similarity || 0}%)</span>`;
                break;
            case 'need_review':
                statusBadge = `<span class="badge badge-warning">⚠ ${item.candidates.length} Kandidat</span>`;
                break;
            case 'not_found':
                statusBadge = '<span class="badge badge-danger">✕ Tidak Ditemukan</span>';
                break;
            case 'skipped':
                statusBadge = '<span class="badge badge-neutral">Dilewati / Kosong</span>';
                break;
        }

        const candidateName = c 
            ? `<a href="${c.profileUrl}" target="_blank" style="color: var(--primary); font-weight: 600; text-decoration: none;">${c.name}</a>` 
            : '<span class="text-muted">-</span>';

        const authorId = c ? (c.sintaId || c.scopusId) : '-';
        const affil = c ? `<span class="truncate" title="${c.affiliation}">${c.affiliation}</span>` : '-';
        
        const hasCandidates = item.candidates && item.candidates.length > 0;
        const reviewBtn = hasCandidates
            ? `<button type="button" class="btn btn-secondary btn-sm" data-action="open-review" data-item-id="${item.id}">
                ${item.status === 'need_review' ? '<b>Pilih Kandidat</b>' : 'Ubah Pilihan'}
               </button>`
            : `<button type="button" class="btn btn-secondary btn-sm" disabled style="opacity: 0.4;">Tidak Ada</button>`;

        let querySubtitle = '';
        if (state.currentSource === 'sinta') {
            if (state.stripTitles && item.cleanedName !== item.originalName) {
                querySubtitle = `<div class="text-muted text-sm">Query: "${item.cleanedName}"</div>`;
            }
        } else {
            querySubtitle = `<div class="text-muted text-sm">Query Scopus: Last="${item.scopusLastName}", First="${item.scopusFirstName}"</div>`;
        }

        if (state.currentSource === 'sinta') {
            const dept = c ? `<span class="truncate text-muted text-sm" title="${c.department}">${c.department}</span>` : '-';
            const score3Yr = c ? c.score3Yr : '-';
            const scoreOv = c ? c.scoreOverall : '-';
            const scopusH = c ? c.scopusH : '-';
            const scholarH = c ? c.scholarH : '-';

            return `
                <tr>
                    <td style="font-weight: 600; color: var(--text-muted);">${item.id}</td>
                    <td>
                        <div style="font-weight: 600;">${item.originalName}</div>
                        ${querySubtitle}
                    </td>
                    <td>${statusBadge}</td>
                    <td>${candidateName}</td>
                    <td><code style="background: #f1f5f9; padding: 2px 5px; border-radius: 4px;">${authorId}</code></td>
                    <td>${affil}</td>
                    <td>${dept}</td>
                    <td style="font-weight: 600; color: var(--primary);">${score3Yr}</td>
                    <td style="font-weight: 600;">${scoreOv}</td>
                    <td>${scopusH} / ${scholarH}</td>
                    <td>${reviewBtn}</td>
                </tr>
            `;
        } else {
            // SCOPUS row columns
            const location = c ? `${c.city || ''}${c.city && c.country ? ', ' : ''}${c.country || ''}` : '-';
            const docs = c ? c.documents : '-';
            const hIdx = c ? c.hIndex : '-';

            return `
                <tr>
                    <td style="font-weight: 600; color: var(--text-muted);">${item.id}</td>
                    <td>
                        <div style="font-weight: 600;">${item.originalName}</div>
                        ${querySubtitle}
                    </td>
                    <td>${statusBadge}</td>
                    <td>${candidateName}</td>
                    <td><code style="background: #f1f5f9; padding: 2px 5px; border-radius: 4px;">${authorId}</code></td>
                    <td>${affil}</td>
                    <td><span class="text-muted text-sm">${location}</span></td>
                    <td style="font-weight: 600; color: var(--primary);">${docs}</td>
                    <td style="font-weight: 700;">${hIdx}</td>
                    <td>${reviewBtn}</td>
                </tr>
            `;
        }
    }).join('');
}

// ============================================================================
// 8. Candidate Review Modal
// ============================================================================
function openReviewModal(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;

    state.activeReviewItem = item;
    const modal = document.getElementById('reviewModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');
    const candidateContainer = document.getElementById('candidateCardsContainer');

    const sourceName = state.currentSource === 'sinta' ? 'SINTA' : 'SCOPUS';
    modalTitle.textContent = `Pilih Kandidat ${sourceName} untuk: "${item.originalName}"`;
    modalSubtitle.textContent = `Query: "${item.cleanedName}" | Ditemukan ${item.candidates.length} kandidat di ${sourceName}`;

    candidateContainer.innerHTML = item.candidates.map((c, idx) => {
        const candidateId = c.sintaId || c.scopusId;
        const isSelected = item.selectedCandidate && (item.selectedCandidate.sintaId === candidateId || item.selectedCandidate.scopusId === candidateId);
        const isTopRecommended = idx === 0;

        if (state.currentSource === 'sinta') {
            return `
                <div class="candidate-card ${isSelected ? 'selected' : ''}" data-action="select-candidate" data-candidate-id="${candidateId}">
                    <div class="candidate-header">
                        <img src="${c.avatar || 'https://sinta.kemdiktisaintek.go.id/public/assets/img/author-small.png'}" 
                             class="candidate-avatar" 
                             alt="avatar">
                        <div class="candidate-info">
                            <div class="candidate-name">
                                ${c.name}
                                <span class="badge ${c.similarity >= 85 ? 'badge-success' : 'badge-warning'}">
                                    ${c.similarity}% Mirip
                                </span>
                                ${isTopRecommended ? '<span class="badge badge-score">Rekomendasi</span>' : ''}
                            </div>
                            <div class="candidate-affil">${c.affiliation || '-'}</div>
                            <div class="candidate-dept">${c.department || '-'}</div>
                        </div>
                    </div>

                    <div class="candidate-metrics">
                        <div><span>SINTA ID:</span> <strong>${c.sintaId}</strong></div>
                        <div><span>Skor 3Yr:</span> <strong>${c.score3Yr}</strong></div>
                        <div><span>Skor Overall:</span> <strong>${c.scoreOverall}</strong></div>
                        <div><span>Scopus / Scholar:</span> <strong>${c.scopusH} / ${c.scholarH}</strong></div>
                    </div>

                    ${c.subjects ? `<div class="candidate-subjects" title="${c.subjects}"><b>Bidang:</b> ${c.subjects}</div>` : ''}

                    <button type="button" class="candidate-select-btn">
                        ${isSelected ? '✓ Terpilih' : 'Pilih Kandidat Ini'}
                    </button>
                </div>
            `;
        } else {
            // SCOPUS Card
            const location = `${c.city || ''}${c.city && c.country ? ', ' : ''}${c.country || ''}`;
            return `
                <div class="candidate-card ${isSelected ? 'selected' : ''}" data-action="select-candidate" data-candidate-id="${candidateId}">
                    <div class="candidate-header">
                        <div class="candidate-avatar" style="display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:bold; background:#e0f2fe; color:#0369a1;">
                            SC
                        </div>
                        <div class="candidate-info">
                            <div class="candidate-name">
                                ${c.name}
                                <span class="badge ${c.similarity >= 85 ? 'badge-success' : 'badge-warning'}">
                                    ${c.similarity}% Mirip
                                </span>
                                ${isTopRecommended ? '<span class="badge badge-score">Rekomendasi</span>' : ''}
                            </div>
                            <div class="candidate-affil">${c.affiliation || '-'}</div>
                            <div class="candidate-dept">${location || '-'}</div>
                        </div>
                    </div>

                    <div class="candidate-metrics">
                        <div><span>Scopus ID:</span> <strong>${c.scopusId}</strong></div>
                        <div><span>Dokumen:</span> <strong>${c.documents}</strong></div>
                        <div><span>h-index:</span> <strong>${c.hIndex}</strong></div>
                        <div><span>Negara:</span> <strong>${c.country || '-'}</strong></div>
                    </div>

                    <button type="button" class="candidate-select-btn">
                        ${isSelected ? '✓ Terpilih' : 'Pilih Kandidat Ini'}
                    </button>
                </div>
            `;
        }
    }).join('');

    // Handle avatar image fallbacks safely without inline onerror
    candidateContainer.querySelectorAll('img.candidate-avatar').forEach(img => {
        img.addEventListener('error', () => {
            img.src = 'https://sinta.kemdiktisaintek.go.id/public/assets/img/author-small.png';
        }, { once: true });
    });

    modal.classList.remove('hidden');
}

function selectCandidateInModal(candidateId) {
    if (!state.activeReviewItem) return;
    const candidate = state.activeReviewItem.candidates.find(c => (c.sintaId === candidateId || c.scopusId === candidateId));
    if (candidate) {
        state.activeReviewItem.selectedCandidate = candidate;
        state.activeReviewItem.status = 'matched';
    }
    closeReviewModal();
    renderStats();
    renderTable();
    checkNeedReviewAlert();
}

function chooseNoneInModal() {
    if (!state.activeReviewItem) return;
    state.activeReviewItem.selectedCandidate = null;
    state.activeReviewItem.status = 'skipped';
    closeReviewModal();
    renderStats();
    renderTable();
    checkNeedReviewAlert();
}

function closeReviewModal() {
    state.activeReviewItem = null;
    document.getElementById('reviewModal').classList.add('hidden');
}

function acceptAllTopCandidates() {
    let count = 0;
    state.items.forEach(item => {
        if (item.status === 'need_review' && item.candidates.length > 0) {
            item.selectedCandidate = item.candidates[0];
            item.status = 'matched';
            count++;
        }
    });

    renderStats();
    renderTable();
    checkNeedReviewAlert();
    alert(`Berhasil memilih kandidat rekomendasi teratas untuk ${count} nama.`);
}

function reviewNextAmbiguous() {
    const nextItem = state.items.find(i => i.status === 'need_review');
    if (nextItem) {
        openReviewModal(nextItem.id);
    } else {
        alert('Semua nama sudah direview!');
    }
}

// ============================================================================
// 9. Exporters (CSV & Clipboard Copy)
// ============================================================================
function exportToCSV() {
    if (state.items.length === 0) {
        alert('Belum ada data untuk diekspor!');
        return;
    }

    const isSinta = state.currentSource === 'sinta';
    const headers = isSinta ? [
        'No',
        'Nama Input Asli',
        'Nama Bersih (Query)',
        'Status',
        'Persentase Kemiripan',
        'Nama SINTA',
        'SINTA ID',
        'Link Profil SINTA',
        'Afiliasi / Kampus',
        'Departemen / Prodi',
        'SINTA Score 3Yr',
        'SINTA Score Overall',
        'Scopus H-Index',
        'Google Scholar H-Index',
        'WOS H-Index',
        'Bidang Keahlian (Subjects)'
    ] : [
        'No',
        'Nama Input Asli',
        'Query Last Name',
        'Query First Name',
        'Status',
        'Persentase Kemiripan',
        'Nama Scopus',
        'Scopus Author ID',
        'Link Profil Scopus',
        'Afiliasi / Institusi',
        'Kota',
        'Negara',
        'Jumlah Dokumen',
        'Scopus h-index'
    ];

    const escapeCSV = (val) => {
        if (val === null || val === undefined) return '""';
        let str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    const rows = state.items.map((item, index) => {
        const c = item.selectedCandidate;
        if (isSinta) {
            return [
                index + 1,
                item.originalName || '',
                item.cleanedName || '',
                item.status,
                c ? `${c.similarity}%` : '0%',
                c ? c.name : '',
                c ? c.sintaId : '',
                c ? c.profileUrl : '',
                c ? c.affiliation : '',
                c ? c.department : '',
                c ? c.score3Yr : '',
                c ? c.scoreOverall : '',
                c ? c.scopusH : '',
                c ? c.scholarH : '',
                c ? c.wosH : '',
                c ? c.subjects : ''
            ].map(escapeCSV).join(';');
        } else {
            return [
                index + 1,
                item.originalName || '',
                item.scopusLastName || '',
                item.scopusFirstName || '',
                item.status,
                c ? `${c.similarity}%` : '0%',
                c ? c.name : '',
                c ? c.scopusId : '',
                c ? c.profileUrl : '',
                c ? c.affiliation : '',
                c ? c.city : '',
                c ? c.country : '',
                c ? c.documents : '',
                c ? c.hIndex : ''
            ].map(escapeCSV).join(';');
        }
    });

    const csvContent = '\uFEFF' + headers.map(escapeCSV).join(';') + '\r\n' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const now = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${state.currentSource}_authors_${now}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function copyTableToClipboard() {
    if (state.items.length === 0) {
        alert('Belum ada data di tabel untuk disalin!');
        return;
    }

    const isSinta = state.currentSource === 'sinta';
    const headers = isSinta ? [
        'No',
        'Nama Input Asli',
        'Nama Bersih (Query)',
        'Status',
        'Persentase Kemiripan',
        'Nama SINTA',
        'SINTA ID',
        'Link Profil SINTA',
        'Afiliasi / Kampus',
        'Departemen / Prodi',
        'SINTA Score 3Yr',
        'SINTA Score Overall',
        'Scopus H-Index',
        'Google Scholar H-Index',
        'WOS H-Index',
        'Bidang Keahlian'
    ] : [
        'No',
        'Nama Input Asli',
        'Query Last Name',
        'Query First Name',
        'Status',
        'Persentase Kemiripan',
        'Nama Scopus',
        'Scopus Author ID',
        'Link Profil Scopus',
        'Afiliasi',
        'Kota',
        'Negara',
        'Dokumen',
        'h-index'
    ];

    const cleanField = (val) => {
        if (val === null || val === undefined) return '';
        return String(val).replace(/[\t\r\n]+/g, ' ').trim();
    };

    const rows = state.items.map((item, index) => {
        const c = item.selectedCandidate;
        if (isSinta) {
            return [
                index + 1,
                item.originalName || '',
                item.cleanedName || '',
                item.status,
                c ? `${c.similarity}%` : '0%',
                c ? c.name : '',
                c ? c.sintaId : '',
                c ? c.profileUrl : '',
                c ? c.affiliation : '',
                c ? c.department : '',
                c ? c.score3Yr : '',
                c ? c.scoreOverall : '',
                c ? c.scopusH : '',
                c ? c.scholarH : '',
                c ? c.wosH : '',
                c ? c.subjects : ''
            ].map(cleanField).join('\t');
        } else {
            return [
                index + 1,
                item.originalName || '',
                item.scopusLastName || '',
                item.scopusFirstName || '',
                item.status,
                c ? `${c.similarity}%` : '0%',
                c ? c.name : '',
                c ? c.scopusId : '',
                c ? c.profileUrl : '',
                c ? c.affiliation : '',
                c ? c.city : '',
                c ? c.country : '',
                c ? c.documents : '',
                c ? c.hIndex : ''
            ].map(cleanField).join('\t');
        }
    });

    const tsvContent = headers.join('\t') + '\r\n' + rows.join('\r\n');

    try {
        await navigator.clipboard.writeText(tsvContent);
        showCopySuccessFeedback();
    } catch (err) {
        try {
            const tempEl = document.createElement('textarea');
            tempEl.value = tsvContent;
            tempEl.style.position = 'fixed';
            tempEl.style.opacity = '0';
            document.body.appendChild(tempEl);
            tempEl.select();
            document.execCommand('copy');
            document.body.removeChild(tempEl);
            showCopySuccessFeedback();
        } catch (e) {
            alert('Gagal menyalin otomatis. Silakan gunakan tombol Unduh CSV.');
        }
    }
}

function showCopySuccessFeedback() {
    const btn = document.getElementById('btnCopyTable');
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Berhasil Disalin!';
    btn.classList.replace('btn-secondary', 'btn-warning');
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.replace('btn-warning', 'btn-secondary');
    }, 2000);
}

// ============================================================================
// 10. Sample Data & File Upload Handlers
// ============================================================================
function loadSampleNames() {
    const samples = [
        'Dr. Tio Haidar Hanif, M.Kom.',
        'Haidar Fari Aditya',
        'Prof. Ir. Budi Santoso, M.Sc., Ph.D.',
        'dr. Siti Aminah, Sp.A',
        'Achmad Ridwan, S.T., M.T.'
    ];
    document.getElementById('namesInput').value = samples.join('\n');
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/)
            .map(l => l.replace(/^"|"$/g, '').trim())
            .filter(l => l.length > 0);

        document.getElementById('namesInput').value = lines.join('\n');
        alert(`Berhasil memuat ${lines.length} nama dari file.`);
    };
    reader.readAsText(file);
}

// ============================================================================
// 11. Initialization & Environment Detection
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const badge = document.getElementById('serverStatusBadge');
    const notice = document.getElementById('standaloneNotice');

    if (state.isExtensionMode) {
        if (badge) {
            badge.innerHTML = '<span class="dot"></span>';
            badge.className = 'badge-server badge-success';
        }
        if (notice) notice.classList.add('hidden');
    } else {
        if (badge) {
            badge.innerHTML = '<span class="dot"></span> Bukan Mode Ekstensi (Buka via chrome://extensions)';
            badge.className = 'badge-server badge-warning';
        }
        if (notice) notice.classList.remove('hidden');
    }

    // Attach Event Listeners (Compliant with Chrome Extension CSP)
    document.getElementById('tabSinta')?.addEventListener('click', () => switchSource('sinta'));
    document.getElementById('tabScopus')?.addEventListener('click', () => switchSource('scopus'));
    document.getElementById('btnSampleNames')?.addEventListener('click', loadSampleNames);
    document.getElementById('fileUploadInput')?.addEventListener('change', handleFileUpload);
    document.getElementById('btnStart')?.addEventListener('click', startProcess);
    document.getElementById('btnPause')?.addEventListener('click', togglePause);
    document.getElementById('btnReset')?.addEventListener('click', resetAll);
    document.getElementById('btnReviewNext')?.addEventListener('click', reviewNextAmbiguous);
    document.getElementById('btnAcceptAllTop')?.addEventListener('click', acceptAllTopCandidates);
    document.getElementById('btnCopyTable')?.addEventListener('click', copyTableToClipboard);
    document.getElementById('btnExportCSV')?.addEventListener('click', exportToCSV);

    // Modal buttons
    document.getElementById('btnModalCloseHeader')?.addEventListener('click', closeReviewModal);
    document.getElementById('btnModalChooseNone')?.addEventListener('click', chooseNoneInModal);
    document.getElementById('btnModalCloseFooter')?.addEventListener('click', closeReviewModal);

    // Event Delegation: Results Table Review button
    document.getElementById('resultsTableBody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="open-review"]');
        if (btn && btn.dataset.itemId) {
            openReviewModal(parseInt(btn.dataset.itemId));
        }
    });

    // Event Delegation: Modal Candidate Card selection
    document.getElementById('candidateCardsContainer')?.addEventListener('click', (e) => {
        const card = e.target.closest('[data-action="select-candidate"]');
        if (card && card.dataset.candidateId) {
            selectCandidateInModal(card.dataset.candidateId);
        }
    });

    renderTableHeader();

    document.getElementById('tableSearchInput')?.addEventListener('input', () => {
        renderTable();
    });

    document.getElementById('statusFilter')?.addEventListener('change', () => {
        renderTable();
    });
});
