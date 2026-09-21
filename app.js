/**
 * SINTA Author Finder - Core Application Logic
 * Pure Vanilla JavaScript (Zero external libraries)
 */

// Global State
const state = {
    items: [],            // List of items to search
    currentIndex: 0,      // Current processing index
    isRunning: false,     // Search loop active
    isPaused: false,      // Search paused
    delayMs: 1000,        // Delay between requests (ms)
    stripTitles: true,    // Auto-strip academic titles
    removeDuplicates: true, // Auto-remove duplicate names
    duplicateCount: 0,    // Number of duplicates removed
    campusFilter: '',     // Optional campus filter
    activeReviewItem: null // Currently opened item in modal
};

// ============================================================================
// 1. Academic Title Cleaner (Regex Indonesia & Internasional)
// ============================================================================
const TITLE_PATTERNS_FRONT = [
    /\b(prof(?:esor)?|dr|doktor|dra|drs|ir|drg|apt|ns|h|hj|k\.?h|ust|tgk|bpk|ibu)\.?\s+/gi
];

const TITLE_PATTERNS_BACK = [
    /,\s*([A-Za-z\.\s\(\)]+)$/i // Everything after first comma if it looks like degrees
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

    // 1. Remove commas and everything after if the trailing chunk contains known degree
    if (cleaned.includes(',')) {
        const parts = cleaned.split(',');
        const mainPart = parts[0].trim();
        const suffixPart = parts.slice(1).join(' ').toLowerCase();

        // Check if suffix matches degree keywords
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

    // 3. Remove trailing single letters or title leftovers (e.g., "Nama S.T.")
    KNOWN_BACK_DEGREES.forEach(deg => {
        const regex = new RegExp(`\\b${deg.replace('.', '\\.')}\\b`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });

    // 4. Clean extra spaces, punctuation, quotes
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();

    return cleaned || name.trim();
}

// ============================================================================
// 2. String Similarity (Levenshtein + Token Overlap)
// ============================================================================
function computeSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 100;

    // Token set overlap
    const words1 = s1.split(/\s+/).filter(Boolean);
    const words2 = s2.split(/\s+/).filter(Boolean);

    let matchCount = 0;
    words1.forEach(w1 => {
        if (words2.some(w2 => w2 === w1 || (w1.length > 3 && w2.includes(w1)) || (w2.length > 3 && w1.includes(w2)))) {
            matchCount++;
        }
    });

    const tokenScore = (matchCount / Math.max(words1.length, words2.length)) * 100;

    // Levenshtein distance
    const track = Array(s2.length + 1).fill(null).map(() =>
        Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

    for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    const levDist = track[s2.length][s1.length];
    const maxLen = Math.max(s1.length, s2.length);
    const levScore = ((maxLen - levDist) / maxLen) * 100;

    // Weighted combination: 60% token score + 40% character score
    return Math.round((tokenScore * 0.6) + (levScore * 0.4));
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
            // Profile Name & URL
            const nameAnchor = el.querySelector('.profile-name a');
            const name = nameAnchor ? nameAnchor.textContent.trim() : '';
            const profileUrl = nameAnchor ? nameAnchor.getAttribute('href') || '' : '';

            // SINTA ID
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

            // Avatar
            const imgEl = el.querySelector('img.avatar');
            let avatar = '';
            if (imgEl) {
                avatar = imgEl.getAttribute('src') || '';
                if (avatar.startsWith('//')) avatar = 'https:' + avatar;
            }

            // Affiliation (Kampus)
            const affilEl = el.querySelector('.profile-affil a');
            const affiliation = affilEl ? affilEl.textContent.trim() : '';
            const affilUrl = affilEl ? affilEl.getAttribute('href') || '' : '';

            // Department (Prodi)
            const deptEl = el.querySelector('.profile-dept a');
            const department = deptEl ? deptEl.textContent.trim() : '';

            // SINTA Scores
            const scoreNums = el.querySelectorAll('.pr-bottom .pr-num');
            const score3Yr = scoreNums[0] ? scoreNums[0].textContent.trim() : '0';
            const scoreOverall = scoreNums[1] ? scoreNums[1].textContent.trim() : '0';

            // Metrics (Scopus, Scholar, WOS)
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

            // Subjects
            const subjectEls = el.querySelectorAll('.subject-list li a');
            const subjects = Array.from(subjectEls).map(s => s.textContent.trim()).filter(Boolean);

            // Campus Filter check (if specified)
            if (campusFilter && affiliation) {
                if (!affiliation.toLowerCase().includes(campusFilter.toLowerCase())) {
                    return; // Skip candidates that don't match campus filter
                }
            }

            // Similarity score
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

    // Sort candidates descending by similarity
    candidates.sort((a, b) => b.similarity - a.similarity);

    return candidates;
}

// ============================================================================
// 4. Network Fetcher via Local Proxy
// ============================================================================
async function fetchSintaSearch(query) {
    const url = `/api/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
    }
    return await response.text();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// 5. Workflow & Queue Execution
// ============================================================================
async function startProcess() {
    if (state.isRunning) return;

    const rawInput = document.getElementById('namesInput').value.trim();
    if (!rawInput) {
        alert('Silakan masukkan setidaknya satu nama terlebih dahulu!');
        return;
    }

    // Parse names line-by-line
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

    // Deduplikasi jika opsi aktif
    let processedLines = lines;
    state.duplicateCount = 0;
    if (state.removeDuplicates) {
        const seen = new Set();
        processedLines = [];
        for (const name of lines) {
            // Jika pembersih gelar aktif, perbandingkan nama yang sudah bersih
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

    // Prepare item list
    state.items = processedLines.map((originalName, idx) => ({
        id: idx + 1,
        originalName,
        cleanedName: state.stripTitles ? cleanAcademicTitles(originalName) : originalName,
        status: 'pending', // 'pending' | 'searching' | 'matched' | 'need_review' | 'not_found' | 'skipped'
        candidates: [],
        selectedCandidate: null,
        error: null
    }));

    state.currentIndex = 0;
    state.isRunning = true;
    state.isPaused = false;

    updateUIControls();
    renderStats();
    renderTable();

    // Run Queue
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
            const query = item.cleanedName || item.originalName;
            const html = await fetchSintaSearch(query);
            const candidates = parseSintaHTML(html, item.cleanedName, state.campusFilter);
            item.candidates = candidates;

            if (candidates.length === 0) {
                item.status = 'not_found';
                item.selectedCandidate = null;
            } else if (candidates.length === 1 && candidates[0].similarity >= 75) {
                // Single high-confidence match -> auto select
                item.status = 'matched';
                item.selectedCandidate = candidates[0];
            } else if (candidates.length > 0 && candidates[0].similarity === 100 && (candidates.length === 1 || candidates[1].similarity < 85)) {
                // Top candidate has 100% exact match and next candidate is significantly lower
                item.status = 'matched';
                item.selectedCandidate = candidates[0];
            } else {
                // Multiple candidates or ambiguous similarity -> Needs user review
                item.status = 'need_review';
                item.selectedCandidate = candidates[0]; // Pre-select highest candidate as recommendation
            }
        } catch (err) {
            console.error(`Error searching for ${item.originalName}:`, err);
            item.status = 'not_found';
            item.error = err.message;
        }

        state.currentIndex++;
        renderStats();
        renderTable();

        // Check if there are still items to search and apply delay
        if (state.currentIndex < total && state.isRunning) {
            await sleep(state.delayMs);
        }
    }

    state.isRunning = false;
    updateUIControls();
    renderStats();
    renderTable();
    checkNeedReviewAlert();
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
// 6. UI Rendering & Interactions
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
    if (state.duplicateCount > 0) {
        progressLabel += ` • [${state.duplicateCount} duplikat diabaikan]`;
    }
    if (state.isPaused) {
        progressLabel += ` • [Dijeda]`;
    }
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

function renderTable() {
    const tbody = document.getElementById('resultsTableBody');
    const filterText = (document.getElementById('tableSearchInput')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('statusFilter')?.value || 'all';

    if (state.items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    Belum ada data. Masukkan daftar nama di atas lalu klik "Mulai Pencarian SINTA".
                </td>
            </tr>
        `;
        return;
    }

    const filtered = state.items.filter(item => {
        // Status filter
        if (filterStatus !== 'all' && item.status !== filterStatus) return false;
        // Text filter
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
                <td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);">
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

        const sintaId = c ? c.sintaId : '-';
        const affil = c ? `<span class="truncate" title="${c.affiliation}">${c.affiliation}</span>` : '-';
        const dept = c ? `<span class="truncate text-muted text-sm" title="${c.department}">${c.department}</span>` : '-';
        const score3Yr = c ? c.score3Yr : '-';
        const scoreOv = c ? c.scoreOverall : '-';
        const scopusH = c ? c.scopusH : '-';
        const scholarH = c ? c.scholarH : '-';

        const hasCandidates = item.candidates && item.candidates.length > 0;
        const reviewBtn = hasCandidates
            ? `<button class="btn btn-secondary btn-sm" onclick="openReviewModal(${item.id})">
                ${item.status === 'need_review' ? '<b>Pilih Kandidat</b>' : 'Ubah Pilihan'}
               </button>`
            : `<button class="btn btn-secondary btn-sm" disabled style="opacity: 0.4;">Tidak Ada</button>`;

        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-muted);">${item.id}</td>
                <td>
                    <div style="font-weight: 600;">${item.originalName}</div>
                    ${state.stripTitles && item.cleanedName !== item.originalName 
                        ? `<div class="text-muted text-sm">Query: "${item.cleanedName}"</div>` 
                        : ''}
                </td>
                <td>${statusBadge}</td>
                <td>${candidateName}</td>
                <td><code style="background: #f1f5f9; padding: 2px 5px; border-radius: 4px;">${sintaId}</code></td>
                <td>${affil}</td>
                <td>${dept}</td>
                <td style="font-weight: 600; color: var(--primary);">${score3Yr}</td>
                <td style="font-weight: 600;">${scoreOv}</td>
                <td>${scopusH} / ${scholarH}</td>
                <td>${reviewBtn}</td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// 7. Interactive Candidate Review Modal
// ============================================================================
function openReviewModal(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;

    state.activeReviewItem = item;
    const modal = document.getElementById('reviewModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');
    const candidateContainer = document.getElementById('candidateCardsContainer');

    modalTitle.textContent = `Pilih Kandidat untuk: "${item.originalName}"`;
    modalSubtitle.textContent = `Query pencarian: "${item.cleanedName}" | Ditemukan ${item.candidates.length} kandidat di SINTA`;

    candidateContainer.innerHTML = item.candidates.map((c, idx) => {
        const isSelected = item.selectedCandidate && item.selectedCandidate.sintaId === c.sintaId;
        const isTopRecommended = idx === 0;

        return `
            <div class="candidate-card ${isSelected ? 'selected' : ''}" onclick="selectCandidateInModal('${c.sintaId}')">
                <div class="candidate-header">
                    <img src="${c.avatar || 'https://sinta.kemdiktisaintek.go.id/public/assets/img/author-small.png'}" 
                         class="candidate-avatar" 
                         onerror="this.src='https://sinta.kemdiktisaintek.go.id/public/assets/img/author-small.png';" 
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
    }).join('');

    modal.classList.remove('hidden');
}

function selectCandidateInModal(sintaId) {
    if (!state.activeReviewItem) return;
    const candidate = state.activeReviewItem.candidates.find(c => c.sintaId === sintaId);
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

// Batch Review: Accept all top recommendations
function acceptAllTopCandidates() {
    let count = 0;
    state.items.forEach(item => {
        if (item.status === 'need_review' && item.candidates.length > 0) {
            item.selectedCandidate = item.candidates[0]; // Pick highest similarity
            item.status = 'matched';
            count++;
        }
    });

    renderStats();
    renderTable();
    checkNeedReviewAlert();
    alert(`Berhasil memilih kandidat rekomendasi teratas untuk ${count} nama.`);
}

// Review First Ambiguous Item
function reviewNextAmbiguous() {
    const nextItem = state.items.find(i => i.status === 'need_review');
    if (nextItem) {
        openReviewModal(nextItem.id);
    } else {
        alert('Semua nama sudah direview!');
    }
}

// ============================================================================
// 8. CSV Exporter (With UTF-8 BOM for Microsoft Excel)
// ============================================================================
function exportToCSV() {
    if (state.items.length === 0) {
        alert('Belum ada data untuk diekspor!');
        return;
    }

    const headers = [
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
    ];

    const escapeCSV = (val) => {
        if (val === null || val === undefined) return '""';
        let str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    const rows = state.items.map((item, index) => {
        const c = item.selectedCandidate;
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
        ].map(escapeCSV).join(';'); // Use ';' as separator (Indonesian Excel standard) or ','
    });

    // Add UTF-8 BOM (\uFEFF) so Excel on Windows recognizes character encodings immediately
    const csvContent = '\uFEFF' + headers.map(escapeCSV).join(';') + '\r\n' + rows.join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const now = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `sinta_authors_${now}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Salin Data Tabel ke Clipboard (Format TSV yang langsung rapi di Excel / Google Sheets)
async function copyTableToClipboard() {
    if (state.items.length === 0) {
        alert('Belum ada data di tabel untuk disalin!');
        return;
    }

    const headers = [
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
    ];

    const cleanField = (val) => {
        if (val === null || val === undefined) return '';
        return String(val).replace(/[\t\r\n]+/g, ' ').trim();
    };

    const rows = state.items.map((item, index) => {
        const c = item.selectedCandidate;
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
    });

    const tsvContent = headers.join('\t') + '\r\n' + rows.join('\r\n');

    try {
        await navigator.clipboard.writeText(tsvContent);
        showCopySuccessFeedback();
    } catch (err) {
        // Fallback untuk browser yang membatasi API Clipboard modern
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
// 9. Sample Data & File Upload Handlers
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
        // Simple line parser (handles plain text or single column CSV)
        const lines = text.split(/\r?\n/)
            .map(l => l.replace(/^"|"$/g, '').trim())
            .filter(l => l.length > 0);

        document.getElementById('namesInput').value = lines.join('\n');
        alert(`Berhasil memuat ${lines.length} nama dari file.`);
    };
    reader.readAsText(file);
}

// ============================================================================
// 10. Initialization & Server Health Check
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if proxy server is running
    fetch('/api/health')
        .then(res => res.json())
        .then(data => {
            const badge = document.getElementById('serverStatusBadge');
            if (data.status === 'ok') {
                badge.innerHTML = '<span class="dot"></span> Server Lokal Terhubung';
                badge.classList.add('badge-success');
            }
        })
        .catch(() => {
            const badge = document.getElementById('serverStatusBadge');
            badge.innerHTML = '<span class="dot"></span> Server Belum Jalan (Jalankan run.bat)';
            badge.classList.remove('badge-success');
            badge.classList.add('badge-danger');
        });

    // Real-time table search listener
    document.getElementById('tableSearchInput')?.addEventListener('input', () => {
        renderTable();
    });

    document.getElementById('statusFilter')?.addEventListener('change', () => {
        renderTable();
    });
});
