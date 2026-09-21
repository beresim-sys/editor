/**
 * app.js
 * לוח עריכה וסידור סצנות לספר - לוגיקה מרכזית
 * טעינה ישירה ומלאה מקובץ האקסל שבתיקיית הפרויקט: 'סצנות לספר.xlsx'
 */

(function () {
  'use strict';

  // --- Storage Key (bumped to v7 to guarantee formatted Hebrew dates for timeline) ---
  const STORAGE_KEY = 'book_scenes_editor_v7';

  /**
   * Formats timeline value, converting numeric Excel serial dates (e.g. 16681 -> "ספט' 45")
   * or SheetJS English representations (e.g. "Sep-45" -> "ספט' 45") into Hebrew month-year format.
   * Leaves plain years (1921, 1926) and existing textual dates untouched.
   */
  function formatTimelineValue(val) {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (!str) return '';

    // Plain 4-digit year like "1921", "1942" - leave as is
    if (/^\d{4}$/.test(str)) {
      return str;
    }

    const monthNames = [
      "ינו'", "פבר'", "מרץ", "אפר'", "מאי", "יוני",
      "יולי", "אוג'", "ספט'", "אוק'", "נוב'", "דצמ'"
    ];

    // Excel 1900 date system serial numbers (e.g. 13271 to 60000)
    const num = Number(str);
    if (!isNaN(num) && num >= 10000 && num <= 60000 && /^\d+$/.test(str)) {
      const jsDate = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(jsDate.getTime())) {
        const monthHeb = monthNames[jsDate.getUTCMonth()];
        const yearShort = String(jsDate.getUTCFullYear()).slice(-2);
        return `${monthHeb} ${yearShort}`;
      }
    }

    // English month-year patterns (e.g. "Sep-45", "Jul-42", "May-36", "Oct-49")
    const engDateMatch = str.match(/^([A-Za-z]{3})[-/ ](\d{2,4})$/);
    if (engDateMatch) {
      const engMonths = {
        'jan': "ינו'", 'feb': "פבר'", 'mar': "מרץ", 'apr': "אפר'",
        'may': "מאי", 'jun': "יוני", 'jul': "יולי", 'aug': "אוג'",
        'sep': "ספט'", 'oct': "אוק'", 'nov': "נוב'", 'dec': "דצמ'"
      };
      const m = engMonths[engDateMatch[1].toLowerCase()];
      if (m) {
        const yr = engDateMatch[2].length === 4 ? engDateMatch[2].slice(-2) : engDateMatch[2];
        return `${m} ${yr}`;
      }
    }

    return str;
  }

  /**
   * Guarantees every scene has a strictly unique, valid ID and cleaned fields
   */
  function sanitizeScenes(scenes) {
    if (!Array.isArray(scenes)) return [];
    const seenIds = new Set();
    return scenes.map((scene, idx) => {
      let id = (scene.id !== undefined && scene.id !== null) ? String(scene.id).trim() : '';
      // If ID is missing, contains Hebrew, spaces, slashes, or is duplicate:
      if (!id || /[\u0590-\u05FF\s\/]/.test(id) || seenIds.has(id)) {
        id = `scene_${idx + 1}`;
        let counter = 1;
        while (seenIds.has(id)) {
          id = `scene_${idx + 1}_${counter++}`;
        }
      }
      seenIds.add(id);

      return {
        id,
        title: (scene.title && typeof scene.title === 'string') ? scene.title.trim() : `סצנה ${idx + 1}`,
        pov: (scene.pov && typeof scene.pov === 'string') ? scene.pov.trim() : '',
        location: (scene.location && typeof scene.location === 'string') ? scene.location.trim() : '',
        time: formatTimelineValue(scene.time),
        summary: (scene.summary && typeof scene.summary === 'string') ? scene.summary.trim() : '',
        revealedInfo: (scene.revealedInfo && typeof scene.revealedInfo === 'string') ? scene.revealedInfo.trim() : '',
        source: (scene.source && typeof scene.source === 'string') ? scene.source.trim() : ''
      };
    });
  }

  // Top characters for quick POV filter pills
  const PRIMARY_CHARACTERS = [
    'שרה',
    'רפאל שאול',
    'רפאל אלטרס',
    'מאיר דסה',
    'סלווטור',
    'סולטנה',
    'ניסים',
    'מלכה',
    'לואיזה',
    'סוזט'
  ];

  // --- Application State ---
  let state = {
    scenes: [],
    originalScenes: [],
    viewMode: 'grid', // 'grid' | 'timeline' | 'compact'
    filters: {
      search: '',
      povChar: 'all',
      exactPov: 'all',
      location: 'all',
      time: 'all',
      source: 'all',     // For backward compatibility
      sources: []        // Array of selected sources (empty = all)
    },
    draggedId: null,
    editingSceneId: null
  };

  /**
   * Helper to update source filter state consistently
   */
  function setSourceFilter(sourcesArray) {
    state.filters.sources = sourcesArray || [];
    if (state.filters.sources.length === 0) {
      state.filters.source = 'all';
    } else if (state.filters.sources.length === 1) {
      state.filters.source = state.filters.sources[0];
    } else {
      state.filters.source = 'multiple';
    }
  }

  // --- DOM Elements ---
  const elements = {
    scenesContainer: document.getElementById('scenesContainer'),
    totalScenesCount: document.getElementById('totalScenesCount'),
    filteredCountDisplay: document.getElementById('filteredCountDisplay'),
    searchInput: document.getElementById('searchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    povChipsContainer: document.getElementById('povChipsContainer'),
    povFilterSelect: document.getElementById('povFilterSelect'),
    sourceChipsContainer: document.getElementById('sourceChipsContainer'),
    sourceFilterSelect: document.getElementById('sourceFilterSelect'),
    locationFilterSelect: document.getElementById('locationFilterSelect'),
    timeFilterSelect: document.getElementById('timeFilterSelect'),
    activeFilterBadge: document.getElementById('activeFilterBadge'),
    activeFilterText: document.getElementById('activeFilterText'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
    emptyState: document.getElementById('emptyState'),
    dataSourceBadge: document.getElementById('dataSourceBadge'),
    
    // View Switchers
    viewGridBtn: document.getElementById('viewGridBtn'),
    viewTimelineBtn: document.getElementById('viewTimelineBtn'),
    viewCompactBtn: document.getElementById('viewCompactBtn'),

    // Top action buttons
    btnSaveChanges: document.getElementById('btnSaveChanges'),
    saveBtnText: document.getElementById('saveBtnText'),
    saveStatusIndicator: document.getElementById('saveStatusIndicator'),
    btnReloadFromExcel: document.getElementById('btnReloadFromExcel'),
    xlsxFileInput: document.getElementById('xlsxFileInput'),
    btnAddScene: document.getElementById('btnAddScene'),
    btnExport: document.getElementById('btnExport'),

    // Scene Edit Modal
    sceneModal: document.getElementById('sceneModal'),
    sceneModalTitle: document.getElementById('sceneModalTitle'),
    sceneForm: document.getElementById('sceneForm'),
    inputSceneId: document.getElementById('inputSceneId'),
    inputSceneTitle: document.getElementById('inputSceneTitle'),
    inputScenePov: document.getElementById('inputScenePov'),
    inputSceneLocation: document.getElementById('inputSceneLocation'),
    inputSceneTime: document.getElementById('inputSceneTime'),
    inputSceneSummary: document.getElementById('inputSceneSummary'),
    inputSceneRevealed: document.getElementById('inputSceneRevealed'),
    inputSceneSource: document.getElementById('inputSceneSource'),
    inputScenePosition: document.getElementById('inputScenePosition'),
    modalCurrentSeqTag: document.getElementById('modalCurrentSeqTag'),
    repositionFeedback: document.getElementById('repositionFeedback'),

    // Export Modal
    exportModal: document.getElementById('exportModal'),
    exportPreviewText: document.getElementById('exportPreviewText'),
    btnCopyFormatted: document.getElementById('btnCopyFormatted'),
    btnCopyCsv: document.getElementById('btnCopyCsv'),
    btnDownloadCsv: document.getElementById('btnDownloadCsv'),
    btnDownloadJson: document.getElementById('btnDownloadJson'),

    toastContainer: document.getElementById('toastContainer')
  };

  // ==========================================================================
  // Initialization & Excel Loading
  // ==========================================================================
  async function init() {
    setupEventListeners();
    await loadInitialData();
  }

  async function loadInitialData() {
    // 1. Try to load from active storage if present
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.scenes = sanitizeScenes(parsed);
          state.originalScenes = JSON.parse(JSON.stringify(state.scenes));
          renderApp();
          if (elements.dataSourceBadge) {
            elements.dataSourceBadge.textContent = "סדר שמור פעיל (נשמר בדפדפן)";
            elements.dataSourceBadge.style.background = "#ecfdf5";
            elements.dataSourceBadge.style.color = "#047857";
            elements.dataSourceBadge.style.borderColor = "#a7f3d0";
          }
          if (elements.saveStatusIndicator) {
            elements.saveStatusIndicator.textContent = `✓ נטען מהסדר השמור שלך (${state.scenes.length} סצנות)`;
          }
          return;
        }
      } catch (e) {
        console.error('Error reading localStorage:', e);
      }
    }

    // Fallback: check legacy v6 storage
    const savedV6 = localStorage.getItem('book_scenes_editor_v6');
    if (savedV6) {
      try {
        const parsed = JSON.parse(savedV6);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.scenes = sanitizeScenes(parsed);
          state.originalScenes = JSON.parse(JSON.stringify(state.scenes));
          saveData();
          renderApp();
          return;
        }
      } catch (e) {}
    }

    // 2. Load directly from the project's Excel file ('סצנות לספר.xlsx')
    await loadScenesFromProjectExcelFile(false);
  }

  async function loadScenesFromProjectExcelFile(isUserAction = false) {
    if (isUserAction) {
      showToast("בודק וטוען את קובץ האקסל 'סצנות לספר.xlsx'...", 'info');
    }

    // Strategy A: Direct fetch of the Excel file from project folder (works on server/localhost/GitHub Pages)
    const fileUrls = ['סצנות לספר.xlsx', encodeURIComponent('סצנות לספר.xlsx'), 'scenes.xlsx'];
    let fetched = false;

    for (const url of fileUrls) {
      try {
        const response = await fetch(url + '?t=' + Date.now());
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          if (parseAndApplyExcelArrayBuffer(buffer)) {
            fetched = true;
            if (elements.dataSourceBadge) {
              elements.dataSourceBadge.textContent = "נטען מקובץ: סצנות לספר.xlsx";
            }
            showToast(`נטענו בהצלחה ${state.scenes.length} סצנות מקובץ האקסל שבתיקייה!`, 'success');
            return true;
          }
        }
      } catch (err) {
        // Fetch might be blocked by file:// CORS
      }
    }

    // Strategy B: If running under file:// and fetch is blocked, load from embedded Excel binary (EMBEDDED_EXCEL_B64)
    if (!fetched && typeof EMBEDDED_EXCEL_B64 !== 'undefined' && typeof XLSX !== 'undefined') {
      try {
        const workbook = XLSX.read(EMBEDDED_EXCEL_B64, { type: 'base64' });
        if (parseWorkbook(workbook)) {
          if (elements.dataSourceBadge) {
            elements.dataSourceBadge.textContent = "נטען מקובץ: סצנות לספר.xlsx";
          }
          if (isUserAction) {
            showToast(`נטענו מחדש ${state.scenes.length} סצנות מקובץ המקור!`, 'success');
          }
          return true;
        }
      } catch (e) {
        console.error('Error parsing embedded Excel:', e);
      }
    }

    // Strategy C: Fallback to DEFAULT_SCENES
    if (typeof DEFAULT_SCENES !== 'undefined' && Array.isArray(DEFAULT_SCENES)) {
      state.scenes = sanitizeScenes(JSON.parse(JSON.stringify(DEFAULT_SCENES)));
      state.originalScenes = JSON.parse(JSON.stringify(state.scenes));
      saveData();
      renderApp();
      if (elements.dataSourceBadge) {
        elements.dataSourceBadge.textContent = "נטען מקובץ: סצנות לספר.xlsx";
      }
      return true;
    }

    if (isUserAction) {
      // If user clicked but file protocol blocked relative fetch, prompt file picker
      if (window.location.protocol === 'file:') {
        elements.xlsxFileInput.click();
      } else {
        showToast("לא ניתן לגשת לקובץ האקסל ישירות", 'warning');
      }
    }
    return false;
  }

  function parseAndApplyExcelArrayBuffer(arrayBuffer) {
    if (typeof XLSX === 'undefined') return false;
    try {
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      return parseWorkbook(workbook);
    } catch (e) {
      console.error('Error parsing excel array buffer:', e);
      return false;
    }
  }

  function parseWorkbook(workbook) {
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) return false;

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!jsonRows || jsonRows.length < 2) return false;

    const headers = jsonRows[0].map(h => (h ? h.toString().trim().toLowerCase() : ''));

    const mapKey = (headerName) => {
      const h = headerName.toLowerCase();
      if (h.includes('מזהה') || h.includes('קוד') || h.includes('מספר') || h === 'id' || h.includes('scene_id')) return 'id';
      if (h.includes('כותרת') || h.includes('שם סצנה') || h === 'title') return 'title';
      if (h.includes('מבט') || h.includes('דמות') || h === 'pov') return 'pov';
      if (h.includes('מקום') || h.includes('מיקום') || h.includes('אתר') || h === 'location') return 'location';
      if (h.includes('זמן') || h.includes('תאריך') || h === 'time') return 'time';
      if (h.includes('תקציר') || h.includes('עלילה') || h === 'summary') return 'summary';
      if (h.includes('נחשף') || h.includes('מידע') || h === 'revealed') return 'revealedInfo';
      if (h.includes('מקור') || h.includes('הערה') || h === 'source') return 'source';
      return null;
    };

    const headerMap = {};
    headers.forEach((h, idx) => {
      const field = mapKey(h);
      if (field) headerMap[field] = idx;
    });

    const parsedScenes = [];
    for (let i = 1; i < jsonRows.length; i++) {
      const row = jsonRows[i];
      if (!row || row.length === 0) continue;

      const rawId = headerMap.id !== undefined && row[headerMap.id] ? String(row[headerMap.id]).trim() : '';
      const title = headerMap.title !== undefined && row[headerMap.title] ? String(row[headerMap.title]).trim() : '';
      const pov = headerMap.pov !== undefined && row[headerMap.pov] ? String(row[headerMap.pov]).trim() : '';
      const location = headerMap.location !== undefined && row[headerMap.location] ? String(row[headerMap.location]).trim() : '';
      const time = headerMap.time !== undefined && row[headerMap.time] !== undefined && row[headerMap.time] !== null ? formatTimelineValue(row[headerMap.time]) : '';
      const summary = headerMap.summary !== undefined && row[headerMap.summary] ? String(row[headerMap.summary]).trim() : '';
      const revealedInfo = headerMap.revealedInfo !== undefined && row[headerMap.revealedInfo] ? String(row[headerMap.revealedInfo]).trim() : '';
      const source = headerMap.source !== undefined && row[headerMap.source] ? String(row[headerMap.source]).trim() : '';

      // Skip row if it has no content at all (prevents trailing empty rows from Excel)
      if (!title && !summary && !pov && !location && !rawId) continue;

      const id = rawId || `scene_${parsedScenes.length + 1}`;
      parsedScenes.push({
        id,
        title: title || `סצנה ${parsedScenes.length + 1}`,
        pov,
        location,
        time,
        summary,
        revealedInfo,
        source
      });
    }

    if (parsedScenes.length > 0) {
      state.scenes = sanitizeScenes(parsedScenes);
      state.originalScenes = JSON.parse(JSON.stringify(state.scenes));
      saveData();
      renderApp();
      return true;
    }
    return false;
  }

  function saveData(isManual = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scenes));
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      if (elements.saveStatusIndicator) {
        elements.saveStatusIndicator.textContent = `✓ נשמר לאחרונה ב-${timeStr} (${state.scenes.length} סצנות)`;
      }
      if (elements.dataSourceBadge) {
        elements.dataSourceBadge.textContent = "סדר שמור פעיל בדפדפן";
        elements.dataSourceBadge.style.background = "#ecfdf5";
        elements.dataSourceBadge.style.color = "#047857";
        elements.dataSourceBadge.style.borderColor = "#a7f3d0";
      }
      if (isManual) {
        if (elements.saveBtnText) elements.saveBtnText.textContent = 'נשמר בהצלחה! ✓';
        if (elements.btnSaveChanges) elements.btnSaveChanges.classList.add('saved-pulse');
        setTimeout(() => {
          if (elements.saveBtnText) elements.saveBtnText.textContent = 'שמור שינויים';
          if (elements.btnSaveChanges) elements.btnSaveChanges.classList.remove('saved-pulse');
        }, 2000);
        showToast('כל השינויים וסדר הסצנות נשמרו בהצלחה בדפדפן!', 'success');
      }
    } catch (e) {
      console.error('Failed to save to localStorage', e);
      if (isManual) {
        showToast('שגיאה בשמירה לזיכרון הדפדפן', 'warning');
      }
    }
  }

  // ==========================================================================
  // Filtering & Rendering
  // ==========================================================================
  function getFilteredScenes() {
    const query = state.filters.search.trim().toLowerCase();
    const povChar = state.filters.povChar;
    const exactPov = state.filters.exactPov;
    const locationFilter = state.filters.location;
    const timeFilter = state.filters.time;
    const sourceFilter = state.filters.source;

    return state.scenes.filter((scene) => {
      // Free text search
      if (query) {
        const textToSearch = [
          scene.id,
          scene.title,
          scene.pov,
          scene.location,
          scene.time,
          scene.summary,
          scene.revealedInfo,
          scene.source
        ].join(' ').toLowerCase();

        if (!textToSearch.includes(query)) return false;
      }

      // POV Character pill filter
      if (povChar !== 'all') {
        if (!scene.pov || !scene.pov.includes(povChar)) return false;
      }

      // Exact POV dropdown filter
      if (exactPov !== 'all' && scene.pov !== exactPov) return false;

      // Source filter (supports multi-selection with Ctrl or single source)
      if (state.filters.sources && state.filters.sources.length > 0) {
        const sceneSrc = scene.source ? scene.source.trim() : 'ללא מקור';
        if (!state.filters.sources.includes(sceneSrc)) return false;
      } else if (sourceFilter !== 'all' && scene.source !== sourceFilter) {
        return false;
      }

      // Location filter
      if (locationFilter !== 'all' && scene.location !== locationFilter) return false;

      // Time filter
      if (timeFilter !== 'all' && scene.time !== timeFilter) return false;

      return true;
    });
  }

  function renderApp() {
    updateFilterOptions();
    renderScenes();
    updateStats();
  }

  function renderScenes() {
    const filteredScenes = getFilteredScenes();
    const container = elements.scenesContainer;
    container.innerHTML = '';

    container.className = `scenes-container ${state.viewMode}-view`;

    if (filteredScenes.length === 0) {
      elements.emptyState.style.display = 'block';
      container.style.display = 'none';
      return;
    }

    elements.emptyState.style.display = 'none';
    container.style.display = (state.viewMode === 'grid') ? 'grid' : 'flex';

    const fragment = document.createDocumentFragment();

    filteredScenes.forEach((scene) => {
      const globalIndex = state.scenes.indexOf(scene) + 1;
      const card = createSceneCardElement(scene, globalIndex);
      fragment.appendChild(card);
    });

    container.appendChild(fragment);
    attachDragAndDropHandlers();
  }

  function getPovStyleClass(povText) {
    if (!povText) return 'pov-generic';
    if (povText.includes('שרה')) return 'pov-shara';
    if (povText.includes('רפאל שאול')) return 'pov-raphael-shaul';
    if (povText.includes('רפאל אלטרס')) return 'pov-raphael-altras';
    if (povText.includes('מאיר')) return 'pov-meir';
    if (povText.includes('סלווטור')) return 'pov-salvatore';
    if (povText.includes('סולטנה')) return 'pov-sultana';
    if (povText.includes('ניסים')) return 'pov-nissim';
    if (povText.includes('מלכה')) return 'pov-malka';
    if (povText.includes('לואיזה')) return 'pov-louisa';
    if (povText.includes('סוזט')) return 'pov-souzette';
    return 'pov-generic';
  }

  function getSourceThemeClass(sourceText) {
    if (!sourceText) return 'source-theme-generic';
    const s = sourceText.trim();
    if (s.includes('שרה')) return 'source-theme-shara';
    if (s.includes('רפאל')) return 'source-theme-raphael';
    if (s.includes('סלווטור')) return 'source-theme-salvatore';
    if (s.includes('סוזט')) return 'source-theme-souzette';
    if (s.includes('מלכה')) return 'source-theme-malka';
    if (s.includes('מאיר')) return 'source-theme-meir';
    if (s.includes('ניסים')) return 'source-theme-nissim';
    return 'source-theme-generic';
  }

  function createSceneCardElement(scene, sequenceNum) {
    const card = document.createElement('article');
    const sourceThemeClass = getSourceThemeClass(scene.source);
    card.className = `scene-card ${sourceThemeClass}`;
    card.setAttribute('draggable', 'true');
    card.dataset.id = scene.id;

    const timelineNodeHtml = state.viewMode === 'timeline' 
      ? `<div class="timeline-node" title="סצנה #${sequenceNum}">${sequenceNum}</div>` 
      : '';

    const povClass = getPovStyleClass(scene.pov);

    card.innerHTML = `
      ${timelineNodeHtml}
      <div class="card-top-row">
        <div class="card-identity">
          <span class="drag-handle" title="גרור כדי לסדר מחדש" aria-label="גרירה">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
          </span>
          <span class="scene-seq-badge" title="מיקום סידורי ברצף הספר"><span class="seq-hash">#</span>${sequenceNum}</span>
          <span class="scene-id-badge">${escapeHtml(scene.id || 'ללא מזהה')}</span>
        </div>
        <div class="card-actions-menu">
          <button class="card-btn move-up-btn" data-id="${scene.id}" title="הזז קדימה (למעלה)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
          </button>
          <button class="card-btn move-down-btn" data-id="${scene.id}" title="הזז אחורה (למטה)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <button class="card-btn edit-scene-btn" data-id="${scene.id}" title="ערוך סצנה">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="card-btn delete-btn delete-scene-btn" data-id="${scene.id}" title="מחק סצנה">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>

      <h2 class="scene-title">${escapeHtml(scene.title || 'סצנה ללא כותרת')}</h2>

      <div class="scene-meta-row">
        ${scene.pov ? `
          <span class="meta-pill pov-pill ${povClass}" title="נקודת מבט (POV)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${escapeHtml(scene.pov)}
          </span>` : ''}

        ${scene.location ? `
          <span class="meta-pill location-pill" title="מיקום">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escapeHtml(scene.location)}
          </span>` : ''}

        ${scene.time ? `
          <span class="meta-pill time-pill" title="זמן עלילתי">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${escapeHtml(scene.time)}
          </span>` : ''}
      </div>

      ${scene.summary ? `
        <div class="scene-summary">${escapeHtml(scene.summary)}</div>
      ` : ''}

      ${scene.revealedInfo ? `
        <div class="revealed-info-box">
          <div class="revealed-info-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            <span>מידע שנחשף</span>
          </div>
          <div class="revealed-info-body">${escapeHtml(scene.revealedInfo)}</div>
        </div>
      ` : ''}

      ${scene.source ? `
        <div class="scene-source-footer clickable-source-tag" title="לחץ לסינון מקור זה (החזק Ctrl לבחירה מרובה)" style="cursor: pointer;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          <span>מקור: <strong>${escapeHtml(scene.source)}</strong></span>
        </div>
      ` : ''}
    `;

    const sourceTag = card.querySelector('.clickable-source-tag');
    if (sourceTag && scene.source) {
      sourceTag.addEventListener('click', (e) => {
        e.stopPropagation();
        const src = scene.source.trim();
        const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;
        if (isMulti) {
          const current = state.filters.sources || [];
          if (current.includes(src)) {
            setSourceFilter(current.filter(s => s !== src));
          } else {
            setSourceFilter([...current, src]);
          }
        } else {
          setSourceFilter([src]);
        }
        renderApp();
      });
    }

    card.querySelector('.edit-scene-btn').addEventListener('click', (e) => { e.stopPropagation(); openEditModal(scene.id); });
    card.querySelector('.delete-scene-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteScene(scene.id); });
    card.querySelector('.move-up-btn').addEventListener('click', (e) => { e.stopPropagation(); moveSceneRelative(scene.id, -1); });
    card.querySelector('.move-down-btn').addEventListener('click', (e) => { e.stopPropagation(); moveSceneRelative(scene.id, 1); });

    return card;
  }

  // ==========================================================================
  // Drag and Drop Logic
  // ==========================================================================
  function attachDragAndDropHandlers() {
    const cards = elements.scenesContainer.querySelectorAll('.scene-card');

    cards.forEach(card => {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragenter', handleDragEnter);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('dragleave', handleDragLeave);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);
    });
  }

  function handleDragStart(e) {
    state.draggedId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);

    const hasSourceFilter = (state.filters.sources && state.filters.sources.length > 0) || state.filters.source !== 'all';
    const isFiltered = state.filters.search || state.filters.povChar !== 'all' || 
                       state.filters.exactPov !== 'all' || hasSourceFilter ||
                       state.filters.location !== 'all' || state.filters.time !== 'all';
    if (isFiltered) {
      showToast('שים לב: הסידור מחדש משפיע על הרצף המלא של הספר', 'info');
    }
  }

  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  function handleDragEnter() {
    if (this.dataset.id !== state.draggedId) {
      this.classList.add('drag-over');
    }
  }

  function handleDragLeave() {
    this.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.classList.remove('drag-over');

    const sourceId = state.draggedId;
    const targetId = this.dataset.id;

    if (!sourceId || !targetId || sourceId === targetId) return;

    const fromIndex = state.scenes.findIndex(s => s.id === sourceId);
    const toIndex = state.scenes.findIndex(s => s.id === targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const [movedItem] = state.scenes.splice(fromIndex, 1);
      state.scenes.splice(toIndex, 0, movedItem);

      saveData();
      renderApp();
      showToast(`סצנה "${movedItem.title}" הועברה למיקום #${toIndex + 1}`, 'success');
    }
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
    const cards = elements.scenesContainer.querySelectorAll('.scene-card');
    cards.forEach(card => card.classList.remove('drag-over'));
    state.draggedId = null;
  }

  function moveSceneRelative(sceneId, offset) {
    const currentIndex = state.scenes.findIndex(s => s.id === sceneId);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + offset;
    if (newIndex < 0 || newIndex >= state.scenes.length) return;

    const [item] = state.scenes.splice(currentIndex, 1);
    state.scenes.splice(newIndex, 0, item);

    saveData();
    renderApp();
  }

  // ==========================================================================
  // Filter Options & Stats
  // ==========================================================================
  function updateFilterOptions() {
    // 1. POV Character Pills
    const povChipsHtml = [`
      <button class="pov-chip ${state.filters.povChar === 'all' ? 'active' : ''}" data-char="all">
        הכל <span class="chip-count">${state.scenes.length}</span>
      </button>
    `];

    PRIMARY_CHARACTERS.forEach(char => {
      const count = state.scenes.filter(s => s.pov && s.pov.includes(char)).length;
      if (count > 0) {
        povChipsHtml.push(`
          <button class="pov-chip ${state.filters.povChar === char ? 'active' : ''}" data-char="${escapeHtml(char)}">
            ${escapeHtml(char)} <span class="chip-count">${count}</span>
          </button>
        `);
      }
    });

    elements.povChipsContainer.innerHTML = povChipsHtml.join('');
    elements.povChipsContainer.querySelectorAll('.pov-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state.filters.povChar = btn.dataset.char;
        renderApp();
      });
    });

    // 2. Exact POV Dropdown
    if (elements.povFilterSelect) {
      const currentExact = state.filters.exactPov;
      const allPovs = Array.from(new Set(state.scenes.map(s => s.pov).filter(Boolean))).sort();
      elements.povFilterSelect.innerHTML = '<option value="all">כל הרכבי ה-POV</option>' +
        allPovs.map(p => `<option value="${escapeHtml(p)}" ${p === currentExact ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');
    }

    // 3. Source Filter Buttons & Dropdown
    const sourceCounts = {};
    state.scenes.forEach(s => {
      const src = s.source ? s.source.trim() : 'ללא מקור';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });

    const uniqueSources = Object.keys(sourceCounts).sort();
    const activeSources = state.filters.sources || [];
    const isAllActive = activeSources.length === 0;

    if (elements.sourceChipsContainer) {
      const sourceChipsHtml = [`
        <button class="source-chip ${isAllActive ? 'active' : ''}" data-source="all" title="הצג את כל המקורות">
          כל המקורות <span class="chip-count">${state.scenes.length}</span>
        </button>
      `];

      uniqueSources.forEach(src => {
        const themeClass = getSourceThemeClass(src);
        const isActive = activeSources.includes(src);
        sourceChipsHtml.push(`
          <button class="source-chip ${themeClass} ${isActive ? 'active' : ''}" 
                  data-source="${escapeHtml(src)}" 
                  title="${escapeHtml(src)} (לחץ לבחירה, החזק Ctrl לבחירה מרובה)">
            ${escapeHtml(src)} <span class="chip-count">${sourceCounts[src]}</span>
          </button>
        `);
      });

      elements.sourceChipsContainer.innerHTML = sourceChipsHtml.join('');
      elements.sourceChipsContainer.querySelectorAll('.source-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const clickedSrc = btn.dataset.source;
          const isMulti = e.ctrlKey || e.metaKey || e.shiftKey;

          if (clickedSrc === 'all') {
            setSourceFilter([]);
          } else if (isMulti) {
            // Multi-selection with Ctrl / Cmd / Shift
            const current = state.filters.sources || [];
            if (current.includes(clickedSrc)) {
              setSourceFilter(current.filter(s => s !== clickedSrc));
            } else {
              setSourceFilter([...current, clickedSrc]);
            }
          } else {
            // Single selection without Ctrl: toggle off if already the sole selection, else select only it
            const current = state.filters.sources || [];
            if (current.length === 1 && current[0] === clickedSrc) {
              setSourceFilter([]);
            } else {
              setSourceFilter([clickedSrc]);
            }
          }

          renderApp();

          if (isMulti && state.filters.sources.length > 1) {
            const count = getFilteredScenes().length;
            showToast(`סינון מרובה פעיל: ${state.filters.sources.join(' + ')} (${count} סצנות)`, 'info');
          }
        });
      });
    }

    if (elements.sourceFilterSelect) {
      let optionsHtml = '<option value="all">כל המקורות</option>';
      if (activeSources.length > 1) {
        optionsHtml = `<option value="multiple" selected>מקורות נבחרים (${activeSources.length})</option>` + optionsHtml;
      }
      optionsHtml += uniqueSources.map(src => {
        const isSelected = activeSources.length === 1 && activeSources[0] === src;
        return `<option value="${escapeHtml(src)}" ${isSelected ? 'selected' : ''}>${escapeHtml(src)} (${sourceCounts[src]})</option>`;
      }).join('');
      elements.sourceFilterSelect.innerHTML = optionsHtml;
      if (activeSources.length === 0) {
        elements.sourceFilterSelect.value = 'all';
      }
    }

    // 4. Location Dropdown
    const currentLoc = state.filters.location;
    const locations = Array.from(new Set(state.scenes.map(s => s.location).filter(Boolean))).sort();
    elements.locationFilterSelect.innerHTML = '<option value="all">כל המיקומים</option>' +
      locations.map(loc => `<option value="${escapeHtml(loc)}" ${loc === currentLoc ? 'selected' : ''}>${escapeHtml(loc)}</option>`).join('');

    // 5. Time Dropdown
    const currentTime = state.filters.time;
    const times = Array.from(new Set(state.scenes.map(s => s.time).filter(Boolean))).sort();
    elements.timeFilterSelect.innerHTML = '<option value="all">כל הזמנים העלילתיים</option>' +
      times.map(t => `<option value="${escapeHtml(t)}" ${t === currentTime ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
  }

  function updateStats() {
    const total = state.scenes.length;
    const filtered = getFilteredScenes().length;

    elements.totalScenesCount.textContent = total;
    
    const hasSourceFilter = state.filters.sources && state.filters.sources.length > 0;
    const isFiltered = state.filters.search || state.filters.povChar !== 'all' || 
                       state.filters.exactPov !== 'all' || hasSourceFilter ||
                       state.filters.location !== 'all' || state.filters.time !== 'all';

    if (isFiltered) {
      elements.filteredCountDisplay.textContent = `(מוצגות ${filtered})`;
      elements.activeFilterBadge.style.display = 'inline-flex';
      
      let filterDesc = [];
      if (state.filters.search) filterDesc.push(`חיפוש: "${state.filters.search}"`);
      if (hasSourceFilter) {
        if (state.filters.sources.length === 1) {
          filterDesc.push(`מקור: ${state.filters.sources[0]}`);
        } else {
          filterDesc.push(`מקורות: ${state.filters.sources.join(' + ')}`);
        }
      }
      if (state.filters.povChar !== 'all') filterDesc.push(`דמות: ${state.filters.povChar}`);
      if (state.filters.exactPov !== 'all') filterDesc.push(`POV: ${state.filters.exactPov}`);
      if (state.filters.location !== 'all') filterDesc.push(`מיקום: ${state.filters.location}`);
      if (state.filters.time !== 'all') filterDesc.push(`זמן: ${state.filters.time}`);

      elements.activeFilterText.textContent = filterDesc.join(', ');
    } else {
      elements.filteredCountDisplay.textContent = '';
      elements.activeFilterBadge.style.display = 'none';
    }

    elements.searchClearBtn.style.display = state.filters.search ? 'block' : 'none';
  }

  function clearAllFilters() {
    state.filters.search = '';
    state.filters.povChar = 'all';
    state.filters.exactPov = 'all';
    setSourceFilter([]);
    state.filters.location = 'all';
    state.filters.time = 'all';
    elements.searchInput.value = '';
    if (elements.povFilterSelect) elements.povFilterSelect.value = 'all';
    if (elements.sourceFilterSelect) elements.sourceFilterSelect.value = 'all';
    renderApp();
  }

  // ==========================================================================
  // Scene Editing & Managing
  // ==========================================================================
  function openAddModal() {
    state.editingSceneId = null;
    elements.sceneModalTitle.textContent = 'הוספת סצנה חדשה';
    elements.sceneForm.reset();
    
    const nextNum = state.scenes.length + 1;
    elements.inputSceneId.value = `scene_${nextNum}`;
    
    if (elements.modalCurrentSeqTag) {
      elements.modalCurrentSeqTag.textContent = `מיקום ברירת מחדל: בסוף הספר (#${nextNum})`;
    }
    if (elements.inputScenePosition) elements.inputScenePosition.value = '';
    if (elements.repositionFeedback) {
      elements.repositionFeedback.textContent = '';
      elements.repositionFeedback.className = 'reposition-feedback';
    }
    
    openModal(elements.sceneModal);
  }

  function updateRepositionFeedback() {
    if (!elements.repositionFeedback || !elements.inputScenePosition) return;
    const rawVal = elements.inputScenePosition.value.trim();
    if (!rawVal) {
      elements.repositionFeedback.textContent = '';
      elements.repositionFeedback.className = 'reposition-feedback';
      return;
    }

    const targetNum = parseInt(rawVal, 10);
    if (isNaN(targetNum) || targetNum < 0) {
      elements.repositionFeedback.textContent = 'מספר כרטיסיה לא תקין';
      elements.repositionFeedback.className = 'reposition-feedback target-invalid';
      return;
    }

    if (targetNum === 0) {
      elements.repositionFeedback.textContent = '← תועבר לתחילת הספר (כרטיסיה ראשונה #1)';
      elements.repositionFeedback.className = 'reposition-feedback target-top';
      return;
    }

    const currentIdx = state.editingSceneId 
      ? state.scenes.findIndex(s => s.id === state.editingSceneId) 
      : -1;
    const currentSeq = currentIdx !== -1 ? currentIdx + 1 : -1;

    if (currentSeq !== -1 && targetNum === currentSeq) {
      elements.repositionFeedback.textContent = '← מיקום זהה למיקום הנוכחי (ללא שינוי)';
      elements.repositionFeedback.className = 'reposition-feedback target-same';
      return;
    }

    if (targetNum > state.scenes.length) {
      const lastScene = state.scenes[state.scenes.length - 1];
      const lastTitle = lastScene ? ` "${lastScene.title}"` : '';
      elements.repositionFeedback.textContent = `← תועבר לסוף הספר (אחרי #${state.scenes.length}${lastTitle})`;
      elements.repositionFeedback.className = 'reposition-feedback target-found';
      return;
    }

    const targetScene = state.scenes[targetNum - 1];
    if (targetScene) {
      elements.repositionFeedback.textContent = `← תמוקם מיד אחרי כרטיסיה #${targetNum}: "${targetScene.title}"`;
      elements.repositionFeedback.className = 'reposition-feedback target-found';
    }
  }

  function openEditModal(sceneId) {
    const scene = state.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    state.editingSceneId = sceneId;
    elements.sceneModalTitle.textContent = `עריכת סצנה: ${scene.title}`;
    
    elements.inputSceneId.value = scene.id || '';
    elements.inputSceneTitle.value = scene.title || '';
    elements.inputScenePov.value = scene.pov || '';
    elements.inputSceneLocation.value = scene.location || '';
    elements.inputSceneTime.value = scene.time || '';
    elements.inputSceneSummary.value = scene.summary || '';
    elements.inputSceneRevealed.value = scene.revealedInfo || '';
    elements.inputSceneSource.value = scene.source || '';

    const currentIndex = state.scenes.findIndex(s => s.id === sceneId);
    const currentSeqNum = currentIndex !== -1 ? currentIndex + 1 : 1;
    if (elements.modalCurrentSeqTag) {
      elements.modalCurrentSeqTag.textContent = `מיקום נוכחי: #${currentSeqNum} מתוך ${state.scenes.length}`;
    }
    if (elements.inputScenePosition) elements.inputScenePosition.value = '';
    if (elements.repositionFeedback) {
      elements.repositionFeedback.textContent = '';
      elements.repositionFeedback.className = 'reposition-feedback';
    }

    openModal(elements.sceneModal);
  }

  function handleSceneFormSubmit(e) {
    e.preventDefault();

    let assignedId = elements.inputSceneId.value.trim();
    if (!assignedId) {
      assignedId = `scene_${state.scenes.length + 1}`;
    }
    if (!state.editingSceneId && state.scenes.some(s => s.id === assignedId)) {
      assignedId = `scene_${state.scenes.length + 1}_${Date.now().toString().slice(-4)}`;
    }

    const sceneData = {
      id: assignedId,
      title: elements.inputSceneTitle.value.trim() || 'ללא כותרת',
      pov: elements.inputScenePov.value.trim(),
      location: elements.inputSceneLocation.value.trim(),
      time: formatTimelineValue(elements.inputSceneTime.value),
      summary: elements.inputSceneSummary.value.trim(),
      revealedInfo: elements.inputSceneRevealed.value.trim(),
      source: elements.inputSceneSource.value.trim()
    };

    const posVal = elements.inputScenePosition ? elements.inputScenePosition.value.trim() : '';

    if (state.editingSceneId) {
      const oldIndex = state.scenes.findIndex(s => s.id === state.editingSceneId);
      if (oldIndex !== -1) {
        const updatedScene = { ...state.scenes[oldIndex], ...sceneData };
        state.scenes[oldIndex] = updatedScene;

        if (posVal !== '') {
          const targetNum = parseInt(posVal, 10);
          const currentSeq = oldIndex + 1;
          if (!isNaN(targetNum) && targetNum >= 0 && targetNum !== currentSeq) {
            if (targetNum === 0) {
              const [removed] = state.scenes.splice(oldIndex, 1);
              state.scenes.unshift(removed);
              showToast(`הסצנה עודכנה והועברה לתחילת הספר (#1)`, 'success');
            } else {
              const boundedTargetNum = Math.min(targetNum, state.scenes.length);
              const targetScene = state.scenes[boundedTargetNum - 1];
              if (targetScene && targetScene.id !== updatedScene.id) {
                const [removed] = state.scenes.splice(oldIndex, 1);
                const newTargetIndex = state.scenes.findIndex(s => s.id === targetScene.id);
                const insertIndex = newTargetIndex + 1;
                state.scenes.splice(insertIndex, 0, removed);
                showToast(`הסצנה עודכנה והועברה למיקום #${insertIndex + 1} (מיד אחרי כרטיסיה #${boundedTargetNum})`, 'success');
              } else {
                showToast('הסצנה עודכנה בהצלחה', 'success');
              }
            }
          } else {
            showToast('הסצנה עודכנה בהצלחה', 'success');
          }
        } else {
          showToast('הסצנה עודכנה בהצלחה', 'success');
        }
      }
    } else {
      if (posVal !== '') {
        const targetNum = parseInt(posVal, 10);
        if (!isNaN(targetNum) && targetNum === 0) {
          state.scenes.unshift(sceneData);
          showToast(`סצנה חדשה נוספה בראש הספר (#1)`, 'success');
        } else if (!isNaN(targetNum) && targetNum > 0) {
          const insertIdx = Math.min(targetNum, state.scenes.length);
          state.scenes.splice(insertIdx, 0, sceneData);
          showToast(`סצנה חדשה נוספה במיקום #${insertIdx + 1} (אחרי כרטיסיה #${insertIdx})`, 'success');
        } else {
          state.scenes.push(sceneData);
          showToast('סצנה חדשה נוספה לספר', 'success');
        }
      } else {
        state.scenes.push(sceneData);
        showToast('סצנה חדשה נוספה לספר', 'success');
      }
    }

    saveData();
    closeAllModals();
    renderApp();
  }

  function deleteScene(sceneId) {
    const scene = state.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    if (confirm(`האם אתה בטוח שברצונך למחוק את הסצנה "${scene.title}"?`)) {
      state.scenes = state.scenes.filter(s => s.id !== sceneId);
      saveData();
      renderApp();
      showToast('הסצנה נמחקה', 'info');
    }
  }

  // ==========================================================================
  // Export Functions
  // ==========================================================================
  function openExportModal() {
    const formatted = generateFormattedOutline();
    elements.exportPreviewText.value = formatted;
    openModal(elements.exportModal);
  }

  function generateFormattedOutline() {
    return state.scenes.map((scene, idx) => {
      const parts = [
        `סצנה ${idx + 1}: [${scene.id}] ${scene.title}`,
        `----------------------------------------`
      ];

      const meta = [];
      if (scene.pov) meta.push(`נקודת מבט (POV): ${scene.pov}`);
      if (scene.location) meta.push(`מיקום: ${scene.location}`);
      if (scene.time) meta.push(`זמן עלילתי: ${scene.time}`);
      if (meta.length) parts.push(meta.join(' | '));

      if (scene.summary) parts.push(`\nתקציר:\n${scene.summary}`);
      if (scene.revealedInfo) parts.push(`\nמידע שנחשף:\n${scene.revealedInfo}`);
      if (scene.source) parts.push(`\nמקור: ${scene.source}`);

      return parts.join('\n');
    }).join('\n\n========================================\n\n');
  }

  function generateCsvContent() {
    const headers = ['סדר חדש', 'מזהה סצנה', 'כותרת הסצנה', 'זמן עלילתי', 'מיקום', 'נקודת מבט (POV)', 'תקציר העלילה', 'מידע שנחשף', 'מקור'];
    
    const escapeCsv = (str) => {
      if (!str) return '""';
      return `"${str.toString().replace(/"/g, '""')}"`;
    };

    const rows = state.scenes.map((s, idx) => [
      idx + 1,
      escapeCsv(s.id),
      escapeCsv(s.title),
      escapeCsv(s.time),
      escapeCsv(s.location),
      escapeCsv(s.pov),
      escapeCsv(s.summary),
      escapeCsv(s.revealedInfo),
      escapeCsv(s.source)
    ].join(','));

    return [headers.join(','), ...rows].join('\r\n');
  }

  function copyToClipboard(text, successMessage) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage, 'success');
      }).catch(() => {
        fallbackCopyTextToClipboard(text, successMessage);
      });
    } else {
      fallbackCopyTextToClipboard(text, successMessage);
    }
  }

  function fallbackCopyTextToClipboard(text, successMessage) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(successMessage, 'success');
    } catch (err) {
      showToast('נכשל בהעתקה אוטומטית ללוח', 'warning');
    }
    document.body.removeChild(textArea);
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([mimeType.includes('csv') ? '\uFEFF' + content : content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`הקובץ "${fileName}" הורד בהצלחה`, 'success');
  }

  // ==========================================================================
  // Modal Utilities
  // ==========================================================================
  function openModal(modal) {
    modal.classList.add('active');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  }

  // ==========================================================================
  // Toast Notifications
  // ==========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
      icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
    } else if (type === 'warning') {
      icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
    } else {
      icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  function setupEventListeners() {
    // Search
    elements.searchInput.addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      renderApp();
    });

    elements.searchClearBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.filters.search = '';
      renderApp();
    });

    // Dropdown Filters
    if (elements.povFilterSelect) {
      elements.povFilterSelect.addEventListener('change', (e) => {
        state.filters.exactPov = e.target.value;
        renderApp();
      });
    }

    if (elements.sourceFilterSelect) {
      elements.sourceFilterSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'all' || val === 'multiple') {
          setSourceFilter([]);
        } else {
          setSourceFilter([val]);
        }
        renderApp();
      });
    }

    elements.locationFilterSelect.addEventListener('change', (e) => {
      state.filters.location = e.target.value;
      renderApp();
    });

    elements.timeFilterSelect.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      renderApp();
    });

    elements.clearFiltersBtn.addEventListener('click', clearAllFilters);

    // View Switcher
    elements.viewGridBtn.addEventListener('click', () => {
      state.viewMode = 'grid';
      updateViewButtons();
      renderScenes();
    });

    elements.viewTimelineBtn.addEventListener('click', () => {
      state.viewMode = 'timeline';
      updateViewButtons();
      renderScenes();
    });

    elements.viewCompactBtn.addEventListener('click', () => {
      state.viewMode = 'compact';
      updateViewButtons();
      renderScenes();
    });

    function updateViewButtons() {
      elements.viewGridBtn.classList.toggle('active', state.viewMode === 'grid');
      elements.viewTimelineBtn.classList.toggle('active', state.viewMode === 'timeline');
      elements.viewCompactBtn.classList.toggle('active', state.viewMode === 'compact');
    }

    // Top action triggers
    if (elements.btnSaveChanges) {
      elements.btnSaveChanges.addEventListener('click', () => {
        saveData(true);
      });
    }

    // Reload directly from Excel file in project folder (with confirmation safety)
    elements.btnReloadFromExcel.addEventListener('click', () => {
      if (!confirm('האם אתה בטוח שברצונך לאפס את סדר הסצנות ולטעון מחדש מקובץ האקסל המקורי? כל שינויי המיקום שביצעת יאופסו.')) {
        return;
      }
      try {
        [
          STORAGE_KEY,
          'book_scenes_editor_v6',
          'book_scenes_editor_v5',
          'book_scenes_editor_excel_v4',
          'book_scenes_editor_excel_v3',
          'book_scenes_editor_file_v2',
          'book_scenes_editor_data_v1'
        ].forEach(k => {
          localStorage.removeItem(k);
        });
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }
      loadScenesFromProjectExcelFile(true);
    });

    // Manual fallback file picker (if needed under file://)
    elements.xlsxFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (parseAndApplyExcelArrayBuffer(event.target.result)) {
            showToast(`נטענו בהצלחה ${state.scenes.length} סצנות מקובץ האקסל שנבחר!`, 'success');
          }
        };
        reader.readAsArrayBuffer(file);
      }
    });

    // Drag-and-drop any .xlsx file directly onto the browser window
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
      }
    });

    window.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = (event) => {
            if (parseAndApplyExcelArrayBuffer(event.target.result)) {
              showToast(`קובץ האקסל "${file.name}" נטען בהצלחה! (${state.scenes.length} סצנות)`, 'success');
            }
          };
          reader.readAsArrayBuffer(file);
        }
      }
    });

    elements.btnAddScene.addEventListener('click', openAddModal);
    elements.btnExport.addEventListener('click', openExportModal);

    // Modal Close
    document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAllModals();
      });
    });

    // Scene Form Submit & Reposition input feedback
    elements.sceneForm.addEventListener('submit', handleSceneFormSubmit);
    if (elements.inputScenePosition) {
      elements.inputScenePosition.addEventListener('input', updateRepositionFeedback);
    }

    // Export Actions
    elements.btnCopyFormatted.addEventListener('click', () => {
      copyToClipboard(elements.exportPreviewText.value, 'התקציר המסודר הועתק ללוח!');
    });

    elements.btnCopyCsv.addEventListener('click', () => {
      const csv = generateCsvContent();
      copyToClipboard(csv, 'טבלת ה-CSV הועתקה ללוח!');
    });

    elements.btnDownloadCsv.addEventListener('click', () => {
      const csv = generateCsvContent();
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(csv, `scenes-sequence-${date}.csv`, 'text/csv;charset=utf-8;');
    });

    elements.btnDownloadJson.addEventListener('click', () => {
      const json = JSON.stringify(state.scenes, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(json, `scenes-backup-${date}.json`, 'application/json;charset=utf-8;');
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
      if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift') {
        document.body.classList.add('multi-select-mode');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift') {
        document.body.classList.remove('multi-select-mode');
      }
    });

    window.addEventListener('blur', () => {
      document.body.classList.remove('multi-select-mode');
    });

    window.addEventListener('beforeunload', () => {
      saveData(false);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
