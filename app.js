// Roku Control App
const STORAGE_KEY = 'roku_ip';
const PIN_CODE = '1234'; // Change this to your desired PIN
const HOLD_DURATION = 2000; // 2 seconds to hold
const PROGRESS_CIRCUMFERENCE = 163;
const STATUS_VARIANTS = {
    info: { icon: 'ℹ️', classes: 'bg-white/20 text-white' },
    success: { icon: '✅', classes: 'bg-emerald-400/20 text-emerald-50 border border-emerald-200/40' },
    error: { icon: '⚠️', classes: 'bg-rose-500/20 text-rose-50 border border-rose-200/40' }
};
const INLINE_VARIANTS = {
    info: 'bg-slate-950/60 text-indigo-100',
    success: 'bg-emerald-500/20 text-emerald-50 border border-emerald-200/40',
    error: 'bg-rose-500/20 text-rose-50 border border-rose-200/40'
};
const QUICK_ACTION_COOLDOWN_MS = 1000;
const quickActionCooldowns = new Map();
const MACRO_STORAGE_KEY = 'roku_macros';
const TODDLER_CONTENT_PATH = 'toddler-content.json';
const TODDLER_CONTENT_URL_KEY = 'toddler_content_url';
const TODDLER_CONTENT_CACHE_KEY = 'toddler_content_cache';
const TODDLER_CONTENT_CACHE_TIME_KEY = 'toddler_content_cache_time';
const TODDLER_CONTENT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 54;

// Store latest media data for detailed view
let latestMediaData = null;
let macroStepsDraft = [];
let macros = [];
let toddlerSpecialButtons = [];
let toddlerQuickLaunchItems = [];
let installedApps = [];
let installedAppMap = new Map();

// Settings lock state
let holdTimer = null;
let holdProgress = 0;
let isHolding = false;
let settingsUnlocked = false;
let currentPin = '';
let toastTimer = null;
let timerAnimationFrame = null;
let timerEndTimestamp = 0;
let timerDurationMs = 0;
let timerLabelText = '';
let fireworksInterval = null;
let fireworksTimeout = null;

function getToddlerContentUrl() {
    return localStorage.getItem(TODDLER_CONTENT_URL_KEY) || '';
}

function setToddlerContentUrl(url) {
    if (url) {
        localStorage.setItem(TODDLER_CONTENT_URL_KEY, url);
        updateToddlerContentCacheMeta();
    } else {
        localStorage.removeItem(TODDLER_CONTENT_URL_KEY);
        clearToddlerContentCacheStorage();
    }
}

function getCachedToddlerContent() {
    const raw = localStorage.getItem(TODDLER_CONTENT_CACHE_KEY);
    if (!raw) return null;

    try {
        const data = JSON.parse(raw);
        const timestamp = Number(localStorage.getItem(TODDLER_CONTENT_CACHE_TIME_KEY) || '0');
        return { data, timestamp };
    } catch (error) {
        console.warn('Failed to parse cached toddler content:', error);
        clearToddlerContentCacheStorage();
        return null;
    }
}

function cacheToddlerContent(data) {
    try {
        localStorage.setItem(TODDLER_CONTENT_CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(TODDLER_CONTENT_CACHE_TIME_KEY, String(Date.now()));
    } catch (error) {
        console.warn('Failed to cache toddler content:', error);
    }
    updateToddlerContentCacheMeta();
}

function clearToddlerContentCacheStorage() {
    localStorage.removeItem(TODDLER_CONTENT_CACHE_KEY);
    localStorage.removeItem(TODDLER_CONTENT_CACHE_TIME_KEY);
    updateToddlerContentCacheMeta();
}

function updateToddlerContentCacheMeta() {
    const info = document.getElementById('toddlerContentCacheInfo');
    const urlInput = document.getElementById('toddlerContentUrl');
    const url = getToddlerContentUrl();

    if (urlInput && urlInput !== document.activeElement) {
        urlInput.value = url;
    }

    if (!info) return;

    const cached = getCachedToddlerContent();
    if (url) {
        const lastFetched = cached?.timestamp ? new Date(cached.timestamp) : null;
        const formatted = lastFetched ? lastFetched.toLocaleString() : 'never';
        info.textContent = `Source: ${url} (last fetched ${formatted})`;
    } else {
        info.textContent = 'Using bundled kid-mode buttons (no remote URL set).';
    }
}

function applyToddlerContent(data) {
    toddlerSpecialButtons = Array.isArray(data?.specialButtons) ? [...data.specialButtons] : [];
    toddlerQuickLaunchItems = Array.isArray(data?.quickLaunch) ? [...data.quickLaunch] : [];
    renderToddlerButtons(toddlerSpecialButtons, toddlerQuickLaunchItems);
    renderQuickLaunchSettings(toddlerQuickLaunchItems);
}

async function fetchToddlerContentFromUrl(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
}

async function saveToddlerContentUrl() {
    const input = document.getElementById('toddlerContentUrl');
    if (!input) return;

    const rawUrl = input.value.trim();
    if (rawUrl) {
        try {
            // Validate URL format
            new URL(rawUrl);
        } catch (error) {
            showStatus('Enter a valid URL for kid-mode buttons.', 'error');
            return;
        }
        setToddlerContentUrl(rawUrl);
        await loadToddlerContent({ forceRefresh: true });
    } else {
        setToddlerContentUrl('');
        await loadToddlerContent({ forceRefresh: true });
        showStatus('Kid-mode button URL cleared. Using bundled defaults.', 'info');
    }
}

async function refreshToddlerContent() {
    await loadToddlerContent({ forceRefresh: true });
}

function clearToddlerContentCache() {
    clearToddlerContentCacheStorage();
    showStatus('Kid-mode button cache cleared.', 'info');
}

function getQuickActionKey(source) {
    if (!source) return '__quick_action__';
    if (typeof source === 'string') return source;
    return source.id || source.appId || source.appName || source.label || '__quick_action__';
}

function registerQuickActionCooldown(source) {
    const key = getQuickActionKey(source);
    const now = Date.now();
    const last = quickActionCooldowns.get(key) || 0;
    if (now - last < QUICK_ACTION_COOLDOWN_MS) {
        return false;
    }
    quickActionCooldowns.set(key, now);
    return true;
}

// Initialize on load
window.addEventListener('DOMContentLoaded', async () => {
    updateToddlerContentCacheMeta();
    await loadToddlerContent();

    const savedIp = localStorage.getItem(STORAGE_KEY);
    if (savedIp) {
        document.getElementById('rokuIp').value = savedIp;
        showStatus('Found saved IP: ' + savedIp + '. Attempting to connect...', 'info');

        // Try to auto-connect
        try {
            await checkStatus();
        } catch (error) {
            showStatus('Could not connect to saved IP: ' + savedIp + '. Ask a grown-up to double-check it in settings.', 'error');
        }
    } else {
        showStatus('No Roku IP saved yet. Ask a grown-up to unlock settings and type it in.', 'info');
    }

    initMacroSystem();
});

async function loadToddlerContent({ forceRefresh = false } = {}) {
    const remoteUrl = getToddlerContentUrl();
    const cached = getCachedToddlerContent();
    const now = Date.now();

    if (remoteUrl) {
        const freshCache = cached && cached.timestamp && now - cached.timestamp < TODDLER_CONTENT_CACHE_MAX_AGE_MS;
        if (freshCache && !forceRefresh) {
            applyToddlerContent(cached.data);
        }

        try {
            const remoteData = await fetchToddlerContentFromUrl(remoteUrl);
            cacheToddlerContent(remoteData);
            applyToddlerContent(remoteData);
            if (!freshCache) {
                showStatus('Kid-mode buttons updated from remote JSON.', 'success');
            }
            return;
        } catch (error) {
            console.error('Failed to download toddler content:', error);
            if (cached) {
                applyToddlerContent(cached.data);
                showStatus('Using cached kid-mode buttons. Remote fetch failed.', 'error');
                return;
            }
            showStatus('Remote kid-mode buttons unavailable. Using bundled copy.', 'error');
        }
    }

    try {
        const response = await fetch(TODDLER_CONTENT_PATH, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        applyToddlerContent(data);
    } catch (error) {
        console.error('Failed to load toddler content:', error);
        showStatus('Could not load kid-mode buttons. Refresh or check your network.', 'error');
        applyToddlerContent({ specialButtons: [], quickLaunch: [] });
    }
}

function renderToddlerButtons(buttons = [], quickLaunch = []) {
    const quickColumn = document.getElementById('toddlerQuickColumn');
    const remoteColumn = document.getElementById('toddlerRemoteColumn');
    if (!quickColumn || !remoteColumn) return;

    quickColumn.innerHTML = '';
    remoteColumn.innerHTML = '';

    const baseButtons = Array.isArray(buttons) ? [...buttons] : [];
    const quickSpecial = baseButtons.filter(btn => (btn.zone || 'quick') === 'quick');
    const quickSpecialWithImages = quickSpecial.filter(btn => btn.thumbnail);
    const quickSpecialNoImages = quickSpecial.filter(btn => !btn.thumbnail);
    const remoteSpecial = baseButtons.filter(btn => btn.zone === 'remote');

    const quickItems = [
        ...(Array.isArray(quickLaunch) ? quickLaunch.map(mapQuickLaunchToToddlerButton) : []),
        ...quickSpecialWithImages,
        ...quickSpecialNoImages
    ];

    if (quickItems.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'col-span-full rounded-3xl bg-white/10 px-6 py-8 text-center text-lg font-semibold text-indigo-100';
        emptyState.textContent = 'No kid buttons configured yet.';
        quickColumn.appendChild(emptyState);
    } else {
        quickItems.forEach(config => {
            const element = createQuickButtonElement(config);
            if (element) {
                quickColumn.appendChild(element);
            }
        });
    }

    renderRemoteColumn(remoteColumn, remoteSpecial);
    updateFavoriteMacroButton();
}

function mapQuickLaunchToToddlerButton(item) {
    const buttonLabel = item.label || '';
    return {
        id: item.id ? `${item.id}-button` : undefined,
        label: buttonLabel,
        thumbnail: item.thumbnail || '',
        launchItem: item
    };
}

function createQuickButtonElement(config) {
    const isQuickLaunch = Boolean(config.launchItem);
    const hasThumbnail = Boolean(config.thumbnail);

    const buttonEl = document.createElement('button');
    buttonEl.type = 'button';
    buttonEl.className = hasThumbnail
        ? 'group relative overflow-hidden rounded-3xl shadow-xl transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-white/40 active:scale-[0.98] touch-manipulation select-none aspect-[16/9]'
        : 'flex min-h-[11rem] flex-col items-center justify-center gap-4 rounded-3xl bg-white text-indigo-600 shadow-xl transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-white/50 active:scale-95 touch-manipulation select-none';

    if (config.id) {
        buttonEl.id = config.id;
    }

    if (config.label) {
        buttonEl.setAttribute('aria-label', config.label);
    }

    const clickHandler = () => {
        if (isQuickLaunch) {
            handleQuickLaunch(config.launchItem);
        } else {
            invokeToddlerHandler(config);
        }
    };

    buttonEl.addEventListener('click', clickHandler);

    if (hasThumbnail) {
        const img = document.createElement('img');
        img.src = config.thumbnail || '';
        img.alt = config.label || 'Quick launch';
        img.loading = 'lazy';
        img.className = 'absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105';

        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-black/20 transition duration-300 group-hover:bg-black/35 pointer-events-none';

        const label = document.createElement('span');
        label.className = 'absolute bottom-4 left-1/2 w-[85%] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-sm font-semibold uppercase tracking-wide text-white shadow-lg';
        label.textContent = config.label || 'Watch';

        buttonEl.append(img, overlay, label);
    } else {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'text-5xl';
        iconSpan.textContent = config.emoji || '🔘';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'text-2xl font-extrabold tracking-tight text-indigo-700';
        if (config.favoriteLabelId) {
            labelSpan.id = config.favoriteLabelId;
        }
        labelSpan.textContent = config.label || 'Button';

        buttonEl.append(iconSpan, labelSpan);
    }

    return buttonEl;
}

function renderRemoteColumn(container, remoteButtons) {
    if (!Array.isArray(remoteButtons) || remoteButtons.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'rounded-3xl bg-white/10 px-4 py-6 text-center text-sm text-indigo-100';
        emptyState.textContent = 'Remote controls will appear here once configured.';
        container.appendChild(emptyState);
        return;
    }

    const remoteMap = new Map(remoteButtons.map(btn => [btn.id, btn]));

    const navGrid = document.createElement('div');
    navGrid.className = 'grid grid-cols-3 gap-3';

    navGrid.appendChild(createRemoteButton(remoteMap.get('homeButton')) || createRemoteSpacer());
    navGrid.appendChild(createRemoteButton(remoteMap.get('upButton')) || createRemoteSpacer());
    navGrid.appendChild(createRemoteButton(remoteMap.get('findRokuButton')) || createRemoteSpacer());

    navGrid.appendChild(createRemoteButton(remoteMap.get('leftButton')) || createRemoteSpacer());
    navGrid.appendChild(createRemoteButton(remoteMap.get('selectButton')) || createRemoteSpacer());
    navGrid.appendChild(createRemoteButton(remoteMap.get('rightButton')) || createRemoteSpacer());

    navGrid.appendChild(createRemoteButton(remoteMap.get('playPauseButton')) || createRemoteSpacer());
    navGrid.appendChild(createRemoteButton(remoteMap.get('downButton')) || createRemoteSpacer());
    navGrid.appendChild(createRemoteButton(remoteMap.get('instantReplayButton')) || createRemoteSpacer());

    container.appendChild(navGrid);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'grid gap-3';
    const powerBtn = createRemoteButton(remoteMap.get('powerButton'));
    if (powerBtn) bottomRow.appendChild(powerBtn);
    if (bottomRow.childElementCount) {
        container.appendChild(bottomRow);
    }
}

function createRemoteButton(config) {
    if (!config) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flex h-20 items-center justify-center rounded-3xl bg-white text-indigo-600 text-2xl font-bold shadow-xl transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-white/50 active:scale-95 touch-manipulation select-none';

    if (config.id) {
        button.id = `${config.id}-remote`;
    }

    button.setAttribute('aria-label', config.label || config.emoji || 'Remote button');

    button.addEventListener('click', () => invokeToddlerHandler(config));

    const iconSpan = document.createElement('span');
    iconSpan.className = 'text-3xl';
    iconSpan.textContent = config.emoji || '';

    const hideLabel = ['Up', 'Down', 'Left', 'Right'].includes(config.label || '');
    if (config.emoji) {
        button.appendChild(iconSpan);
    }
    if (config.label && (!hideLabel || !config.emoji)) {
        const labelSpan = document.createElement('span');
        labelSpan.className = config.emoji ? 'ml-2 text-lg font-semibold' : 'text-lg font-semibold';
        labelSpan.textContent = config.label;
        button.appendChild(labelSpan);
    }

    return button;
}

function createRemoteSpacer() {
    const spacer = document.createElement('div');
    spacer.className = 'h-20 select-none opacity-0';
    spacer.setAttribute('aria-hidden', 'true');
    return spacer;
}

function invokeToddlerHandler(config) {
    if (config?.launchItem) {
        handleQuickLaunch(config.launchItem);
        return;
    }

    if (config?.appId || config?.appName) {
        if (!registerQuickActionCooldown(config)) {
            showStatus('Hang on, that action is already starting...', 'info');
            return;
        }
        const announceName = (config.appName || config.label || '').trim();
        if (announceName) {
            speakTts(`Opening ${announceName}`);
        }
        launchConfiguredApp(config);
        return;
    }

    const handlerName = config?.handler;
    if (!handlerName) {
        console.warn('Toddler button missing handler:', config);
        return;
    }

    const handler = window[handlerName];
    if (typeof handler !== 'function') {
        console.warn(`Handler "${handlerName}" is not available for toddler button.`);
        showStatus('That action is not ready yet.', 'error');
        return;
    }

    const args = Array.isArray(config.args)
        ? config.args
        : config.args !== undefined
            ? [config.args]
            : [];

    try {
        handler(...args);
    } catch (error) {
        console.error(`Error running handler "${handlerName}"`, error);
        showStatus('Could not run that action. Try again.', 'error');
    }
}

function renderQuickLaunch(items) {
    renderQuickLaunchSettings(items);
}

function renderQuickLaunchSettings(items) {
    const section = document.getElementById('quickLaunchSection');
    const grid = document.getElementById('quickLaunchGrid');
    if (!section || !grid) return;

    grid.innerHTML = '';

    const launches = Array.isArray(items) ? [...items] : [];
    if (launches.length === 0) {
        section.classList.add('hidden');
        return;
    }

    launches.forEach(item => {
        const button = document.createElement('button');
        button.className = 'group relative overflow-hidden rounded-3xl shadow-lg transition hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-white/40 active:scale-[0.98] touch-manipulation select-none';
        button.type = 'button';

        if (item.id) {
            button.id = item.id;
        }

        button.addEventListener('click', () => handleQuickLaunch(item));

        const img = document.createElement('img');
        img.src = item.thumbnail || '';
        img.alt = item.label || 'Quick launch item';
        img.loading = 'lazy';
        img.className = 'h-full w-full object-cover transition duration-300 group-hover:scale-105';

        button.appendChild(img);

        const captionLabel = item.label || '';
        if (captionLabel) {
            const caption = document.createElement('span');
            caption.className = 'pointer-events-none absolute bottom-3 left-1/2 w-[85%] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-white shadow-lg';
            caption.textContent = captionLabel;
            button.appendChild(caption);
        }

        grid.appendChild(button);
    });

    if (settingsUnlocked) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
    }
}

function handleQuickLaunch(item) {
    if (!item) return;

    if (!registerQuickActionCooldown(item)) {
        showStatus('Hang on, that action is already starting...', 'info');
        return;
    }

    const announceLabel = (item.label || item.appName || '').trim();
    if (announceLabel) {
        const quickType = (item.type || '').toLowerCase();
        const verb = quickType === 'youtube' || quickType === 'video' ? 'Playing' : 'Opening';
        speakTts(`${verb} ${announceLabel}`);
    }

    if (item.type === 'youtube' && item.videoId) {
        launchSpecificYouTube(item.videoId);
        return;
    }

    const handlerName = item.handler;
    if (handlerName && typeof window[handlerName] === 'function') {
        const args = Array.isArray(item.args) ? item.args : item.args !== undefined ? [item.args] : [];
        try {
            window[handlerName](...args);
            return;
        } catch (error) {
            console.error(`Quick launch handler "${handlerName}" failed`, error);
            showStatus('Quick launch failed. Try again.', 'error');
            return;
        }
    }

    showStatus('Quick launch is missing an action.', 'error');
}

function speakTts(message = '') {
    const text = typeof message === 'string' ? message.trim() : '';

    if (!text) {
        showStatus('Nothing to say yet.', 'error');
        return;
    }

    if (!('speechSynthesis' in window)) {
        showStatus('Your browser cannot talk yet. Try another device.', 'error');
        return;
    }

    try {
        const synth = window.speechSynthesis;
        synth.cancel();

        const speakWithVoices = () => {
            const voices = synth.getVoices();
            if (!voices || voices.length === 0) {
                showStatus('Loading voices...', 'info');
                synth.onvoiceschanged = () => {
                    synth.onvoiceschanged = null;
                    speakWithVoices();
                };
                return;
            }

            const voiceList = [...voices];
            const isEnUs = voice => (voice.lang || '').toLowerCase().includes('en-us');
            const femaleNames = voiceList.filter(voice => /female|woman|girl|amy|aria|emma|olivia|salli|joanna|linda|allison|nicole|kendra|kimberly/i.test(voice.name));
            const preferred = femaleNames.find(isEnUs)
                || voiceList.find(isEnUs)
                || femaleNames[0]
                || voiceList.find(voice => (voice.lang || '').toLowerCase().startsWith('en'))
                || voiceList[0];

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1;
            utterance.pitch = 1;
            if (preferred) utterance.voice = preferred;
            utterance.onend = () => showStatus(`Said: "${text}"`, 'success');
            utterance.onerror = event => {
                console.error('Speech synthesis error', event);
                showStatus('Could not speak that phrase.', 'error');
            };

            synth.speak(utterance);
            showStatus(`Saying "${text}"...`, 'info');
        };

        speakWithVoices();
    } catch (error) {
        console.error('Speech synthesis exception', error);
        showStatus('Could not start speaking. Try again.', 'error');
    }
}

function startToddlerTimer(durationSeconds = 300, label = 'Timer') {
    const secondsValue = Number(Array.isArray(durationSeconds) ? durationSeconds[0] : durationSeconds);
    const labelValue = Array.isArray(durationSeconds) && durationSeconds.length > 1 ? durationSeconds[1] : label;
    const displayLabel = typeof labelValue === 'string' && labelValue.trim().length > 0 ? labelValue.trim() : 'Timer';

    const overlay = document.getElementById('timerOverlay');
    const labelEl = document.getElementById('timerLabel');
    if (!overlay || !labelEl) {
        console.warn('Timer overlay elements are missing.');
        return;
    }

    const sanitizedSeconds = Number.isFinite(secondsValue) && secondsValue > 0 ? secondsValue : 300;

    cancelToddlerTimer({ silent: true });

    timerDurationMs = sanitizedSeconds * 1000;
    timerEndTimestamp = Date.now() + timerDurationMs;
    timerLabelText = displayLabel || 'Timer';

    labelEl.textContent = `${timerLabelText} — ${formatTimerDuration(sanitizedSeconds)} timer`;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    updateToddlerTimerDisplay();
    showStatus(`Started ${timerLabelText} for ${formatTimerDuration(sanitizedSeconds)}.`, 'success');
}

function formatTimerDuration(totalSeconds = 0) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.max(0, Math.round(totalSeconds % 60));
    const minutePart = minutes > 0 ? `${minutes} min` : '';
    const secondPart = seconds > 0 ? `${seconds} sec` : '';
    return `${minutePart} ${secondPart}`.trim() || '0 sec';
}

function updateToddlerTimerDisplay() {
    const overlay = document.getElementById('timerOverlay');
    const countdownEl = document.getElementById('timerCountdown');
    const progressCircle = document.getElementById('timerProgressCircle');
    if (!overlay || overlay.classList.contains('hidden')) {
        return;
    }

    const now = Date.now();
    const remainingMs = Math.max(0, timerEndTimestamp - now);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const seconds = String(remainingSeconds % 60).padStart(2, '0');

    if (countdownEl) {
        countdownEl.textContent = `${minutes}:${seconds}`;
    }

    if (progressCircle && timerDurationMs > 0) {
        const progress = Math.min(1, 1 - remainingMs / timerDurationMs);
        const offset = TIMER_CIRCUMFERENCE * (1 - progress);
        progressCircle.style.strokeDashoffset = offset.toString();
    }

    if (remainingMs <= 0) {
        completeToddlerTimer();
        return;
    }

    timerAnimationFrame = requestAnimationFrame(updateToddlerTimerDisplay);
}

function completeToddlerTimer() {
    cancelToddlerTimer({ silent: true });
    speakTts(`${timerLabelText || 'Timer'} is done!`);
    showStatus('Timer finished!', 'success');
}

function cancelToddlerTimer({ silent = false } = {}) {
    if (timerAnimationFrame) {
        cancelAnimationFrame(timerAnimationFrame);
        timerAnimationFrame = null;
    }
    const overlay = document.getElementById('timerOverlay');
    const progressCircle = document.getElementById('timerProgressCircle');
    const countdownEl = document.getElementById('timerCountdown');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    if (progressCircle) {
        progressCircle.style.strokeDashoffset = TIMER_CIRCUMFERENCE.toString();
    }
    if (countdownEl) {
        countdownEl.textContent = '00:00';
    }
    timerEndTimestamp = 0;
    timerDurationMs = 0;
    timerLabelText = '';
    if (!silent) {
        showStatus('Timer cancelled.', 'info');
    }
}

function startFireworksShow(durationSeconds = 6, message = 'Fireworks!') {
    const overlay = document.getElementById('fireworksOverlay');
    const labelEl = document.getElementById('fireworksLabel');
    const stage = document.getElementById('fireworksStage');

    if (!overlay || !labelEl || !stage) {
        console.warn('Fireworks overlay elements are missing.');
        return;
    }

    stopFireworksShow({ silent: true });

    const safeSeconds = Number(durationSeconds);
    const durationMs = Number.isFinite(safeSeconds) && safeSeconds > 0 ? safeSeconds * 1000 : 6000;
    const messageText = String(message || 'Fireworks!').trim() || 'Fireworks!';

    labelEl.textContent = messageText;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    const launchBurst = () => {
        createFireworkBurst(stage);
    };

    launchBurst();
    fireworksInterval = setInterval(launchBurst, 700);
    fireworksTimeout = setTimeout(() => {
        stopFireworksShow({ silent: true });
    }, durationMs);

    speakTts(messageText);
    showStatus('Fireworks launched!', 'success');
}

function stopFireworksShow({ silent = false } = {}) {
    if (fireworksInterval) {
        clearInterval(fireworksInterval);
        fireworksInterval = null;
    }
    if (fireworksTimeout) {
        clearTimeout(fireworksTimeout);
        fireworksTimeout = null;
    }

    const overlay = document.getElementById('fireworksOverlay');
    const stage = document.getElementById('fireworksStage');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    if (stage) {
        stage.innerHTML = '';
    }

    if (!silent) {
        showStatus('Fireworks finished.', 'info');
    }
}

function createFireworkBurst(stage) {
    if (!stage) return;
    const colors = ['#fde68a', '#fca5a5', '#a5b4fc', '#7dd3fc', '#f9a8d4', '#bbf7d0'];
    const particleCount = 18;
    const rect = stage.getBoundingClientRect();
    const stageWidth = rect.width || stage.clientWidth || 1;
    const stageHeight = rect.height || stage.clientHeight || 1;
    const originX = stageWidth / 2;
    const originY = stageHeight / 2;

    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
        const distance = 80 + Math.random() * 80;
        const targetX = originX + Math.cos(angle) * distance;
        const targetY = originY + Math.sin(angle) * distance;

        const particle = document.createElement('div');
        particle.className = 'firework-particle';
        particle.style.setProperty('--x', `${(targetX / stageWidth) * 100}%`);
        particle.style.setProperty('--y', `${(targetY / stageHeight) * 100}%`);
        particle.style.background = colors[i % colors.length];
        particle.style.animationDuration = `${700 + Math.random() * 500}ms`;

        stage.appendChild(particle);

        setTimeout(() => {
            particle.remove();
        }, 1100);
    }
}

// Save IP to localStorage
function saveIp() {
    const ip = document.getElementById('rokuIp').value.trim();
    if (!ip) {
        showStatus('Ask a grown-up to enter the Roku IP address in settings.', 'error');
        return;
    }

    // Basic IP validation (optional :port)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?$/;
    if (!ipRegex.test(ip)) {
        showStatus('Ask a grown-up to enter a valid Roku IP address (e.g., 192.168.1.100 or 192.168.1.100:8060).', 'error');
        return;
    }

    localStorage.setItem(STORAGE_KEY, ip);
    showStatus('IP address saved! Click "Check Status" to connect.', 'success');
}

// Get saved IP
function getSavedIp() {
    const ip = localStorage.getItem(STORAGE_KEY);
    if (!ip) {
        showStatus('Ask a grown-up to unlock settings and enter the Roku IP address first.', 'error');
        return null;
    }
    return ip;
}

const RokuTransport = (() => {
    const capacitor = typeof window !== 'undefined' ? window.Capacitor : undefined;
    const isNative = Boolean(capacitor?.isNativePlatform?.() && capacitor.getPlatformId?.() !== 'web');
    const httpPlugin = isNative ? capacitor?.Plugins?.Http : null;
    const xhrSupported = typeof XMLHttpRequest !== 'undefined';

    function buildUrl(ip, endpoint) {
        const trimmed = (ip || '').trim();
        if (!trimmed) {
            throw new Error('Missing Roku IP address.');
        }

        const protocolMatch = trimmed.match(/^(https?:\/\/)/i);
        const protocol = protocolMatch ? protocolMatch[1].toLowerCase() : 'http://';
        const remainder = protocolMatch ? trimmed.slice(protocolMatch[1].length) : trimmed;

        const [hostPortRaw] = remainder.split('/');
        if (!hostPortRaw) {
            throw new Error('Invalid Roku address. Double-check the IP in settings.');
        }

        const hostPort = hostPortRaw.includes(':') ? hostPortRaw : `${hostPortRaw}:8060`;
        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

        return `${protocol}${hostPort}${path}`;
    }

    async function request(ip, endpoint, { method = 'GET', body, headers = {}, responseType = 'text' } = {}) {
        if (!ip) {
            throw new Error('Missing Roku IP address.');
        }

        const url = buildUrl(ip, endpoint);

        if (httpPlugin) {
            const options = {
                url,
                method,
                headers,
                responseType: responseType === 'xml' ? 'text' : responseType
            };

            if (body !== undefined && body !== null) {
                options.data = body;
            } else if (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT') {
                options.data = '';
            }

            const response = await httpPlugin.request(options);
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.data;
        }

        if (xhrSupported) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open(method, url, true);
                Object.entries(headers).forEach(([key, value]) => {
                    xhr.setRequestHeader(key, value);
                });

                return await new Promise((resolve, reject) => {
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState === XMLHttpRequest.DONE) {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                resolve(responseType === 'json' ? JSON.parse(xhr.responseText) : xhr.responseText);
                            } else {
                                reject(new Error(`HTTP ${xhr.status}`));
                            }
                        }
                    };
                    xhr.onerror = () => reject(new Error('Network error'));
                    xhr.send(body ?? null);
                });
            } catch (error) {
                console.warn('XHR request failed, falling back to fetch:', error);
            }
        }

        try {
            const fetchOptions = {
                method,
                headers
            };

            if (body !== undefined && body !== null) {
                fetchOptions.body = body;
            }

            const response = await fetch(url, fetchOptions);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            if (responseType === 'json') {
                return await response.json();
            }

            return await response.text();
        } catch (error) {
            if (error instanceof TypeError || error.message.includes('Failed to fetch')) {
                throw new Error('Direct Roku requests were blocked. Build and run with Capacitor to avoid browser CORS limits.');
            }
            throw error;
        }
    }

    async function requestXml(ip, endpoint) {
        const xmlText = await request(ip, endpoint, { responseType: 'text' });
        const parser = new DOMParser();
        return parser.parseFromString(xmlText, 'text/xml');
    }

    return {
        request,
        requestXml,
        isNative,
        hasPlugin: () => Boolean(httpPlugin)
    };
})();

async function rokuPost(ip, endpoint) {
    await RokuTransport.request(ip, endpoint, { method: 'POST' });
}

function encodeRokuPathSegment(segment) {
    if (!segment) return '';
    return encodeURIComponent(segment).replace(/%25([0-9a-fA-F]{2})/g, '%$1');
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.classList.add('hidden');
    }
    showToast(message, type);
}

function showToast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    container.innerHTML = '';

    const variant = STATUS_VARIANTS[type] || STATUS_VARIANTS.info;
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl backdrop-blur ${variant.classes}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'text-base';
    iconSpan.textContent = variant.icon || 'ℹ️';

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;

    toast.append(iconSpan, messageSpan);
    container.appendChild(toast);
    container.classList.remove('hidden');

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
        container.classList.add('hidden');
        container.innerHTML = '';
    }, duration);
}

function showInlineMessage(element, message, type = 'info') {
    const variant = INLINE_VARIANTS[type] || INLINE_VARIANTS.info;
    element.className = `w-full rounded-2xl px-4 py-3 text-xs text-left ${variant}`;
    element.textContent = message;
    element.classList.remove('hidden');
}

function launchConfiguredApp(config) {
    const desiredName = config.appName || config.label || '';
    const contentId = config.contentId || null;
    let appId = config.appId || resolveAppIdByName(desiredName);

    if (!appId) {
        showStatus(`Couldn't find ${desiredName || 'that app'} on this Roku yet. Try loading apps first.`, 'error');
        return;
    }

    const appLabel = config.label || desiredName || `App ${appId}`;
    launchApp(appId, appLabel, contentId);
}

function resolveAppIdByName(name) {
    if (!name) return '';
    const normalized = name.trim().toLowerCase();
    return installedAppMap.get(normalized) || '';
}

// Common Roku app IDs (fallback when /query/apps is blocked)
const COMMON_APPS = [
    { id: '12', name: 'Netflix' },
    { id: '13', name: 'Amazon Prime Video' },
    { id: '2213', name: 'Hulu' },
    { id: '837', name: 'YouTube' },
    { id: '41468', name: 'Disney+' },
    { id: '593099', name: 'Apple TV+' },
    { id: '61322', name: 'HBO Max' },
    { id: '74519', name: 'Peacock TV' },
    { id: '151908', name: 'Plex' },
    { id: '2285', name: 'Spotify' },
    { id: '19977', name: 'Pandora' },
    { id: '50539', name: 'The Roku Channel' },
];

// Check Roku status and load apps
async function checkStatus() {
    const ip = getSavedIp();
    if (!ip) return;

    showStatus('Connecting to Roku...', 'info');

    try {
        // Get device info
        const deviceInfo = await fetchRokuData(ip, '/query/device-info');
        displayDeviceInfo(deviceInfo);

        // Try to get apps list
        try {
            const appsData = await fetchRokuData(ip, '/query/apps');
            displayApps(appsData);
        } catch (appsError) {
            // If apps query fails (403), show common apps as fallback
            console.warn('Apps query blocked, using common apps:', appsError);
            displayCommonApps();
        }

        // Check what's currently playing
        checkNowPlaying();

        showStatus('Connected successfully!', 'success');
    } catch (error) {
        showStatus('Connection failed: ' + error.message + '. Ask a grown-up to check the Roku IP in settings.', 'error');
        console.error('Full error:', error);
    }
}

// Fetch data from Roku via proxy
async function fetchRokuData(ip, endpoint) {
    try {
        return await RokuTransport.requestXml(ip, endpoint);
    } catch (error) {
        if (!RokuTransport.hasPlugin() && !RokuTransport.isNative) {
            throw new Error(`${error.message} (build the Capacitor app to bypass browser CORS restrictions)`);
        }
        throw error;
    }
}

// Display device information
function displayDeviceInfo(xmlDoc) {
    const deviceInfoEl = document.getElementById('deviceInfo');
    const friendlyName = xmlDoc.querySelector('friendly-device-name')?.textContent || 'Unknown';
    const modelName = xmlDoc.querySelector('model-name')?.textContent || 'Unknown';
    const serialNumber = xmlDoc.querySelector('serial-number')?.textContent || 'Unknown';

    deviceInfoEl.innerHTML = `
        <dl class="grid gap-1 text-indigo-100">
            <div><span class="font-semibold text-white">Device:</span> ${friendlyName}</div>
            <div><span class="font-semibold text-white">Model:</span> ${modelName}</div>
            <div><span class="font-semibold text-white">Serial:</span> ${serialNumber}</div>
        </dl>
    `;
    deviceInfoEl.classList.remove('hidden');
}

// Display available apps from XML
function displayApps(xmlDoc) {
    const appsSection = document.getElementById('appsSection');
    const appsList = document.getElementById('appsList');

    const apps = xmlDoc.querySelectorAll('app');
    if (apps.length === 0) {
        installedApps = [];
        installedAppMap = new Map();
        appsList.innerHTML = '<p class="col-span-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-indigo-100">No apps found.</p>';
        return;
    }

    appsList.innerHTML = '';
    installedApps = [];
    installedAppMap = new Map();

    apps.forEach(app => {
        const id = app.getAttribute('id');
        const name = app.textContent;
        const displayName = (name || '').trim() || `App ${id}`;

        installedApps.push({ id, name: displayName });
        if (name) {
            installedAppMap.set(name.trim().toLowerCase(), id);
        }
        installedAppMap.set(displayName.trim().toLowerCase(), id);

        const button = document.createElement('button');
        button.className = 'rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white shadow transition hover:-translate-y-1 hover:bg-white/15 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-white/30';
        button.innerHTML = `
            <span class="block text-base font-bold text-white">${displayName}</span>
            <span class="mt-1 block text-xs font-mono uppercase tracking-wide text-indigo-200/80">ID: ${id}</span>
        `;
        button.onclick = () => launchApp(id, displayName);
        appsList.appendChild(button);
    });

    if (settingsUnlocked) {
        appsSection.classList.remove('hidden');
    }
}

// Display common apps (fallback when query is blocked)
function displayCommonApps() {
    const appsSection = document.getElementById('appsSection');
    const appsList = document.getElementById('appsList');

    appsList.innerHTML = '<p class="col-span-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-indigo-100">Your Roku blocked the apps query. Showing common apps:</p>';

    installedApps = [...COMMON_APPS];
    installedAppMap = new Map(COMMON_APPS.map(app => [app.name.trim().toLowerCase(), app.id]));

    COMMON_APPS.forEach(app => {
        const button = document.createElement('button');
        button.className = 'rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white shadow transition hover:-translate-y-1 hover:bg-white/15 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-white/30';
        button.innerHTML = `
            <span class="block text-base font-bold text-white">${app.name}</span>
            <span class="mt-1 block text-xs font-mono uppercase tracking-wide text-indigo-200/80">ID: ${app.id}</span>
        `;
        button.onclick = () => launchApp(app.id, app.name);
        appsList.appendChild(button);
    });

    if (settingsUnlocked) {
        appsSection.classList.remove('hidden');
    }
}

// Launch an app (with optional deep link)
async function launchApp(appId, appName, contentId = null) {
    const ip = getSavedIp();
    if (!ip) return;

    showStatus(`Launching ${appName}...`, 'info');

    try {
        let endpoint = `/launch/${appId}`;
        // Add content ID for deep linking (if provided)
        if (contentId) {
            endpoint += `?contentID=${encodeURIComponent(contentId)}`;
        }

        await rokuPost(ip, endpoint);
        showStatus(`Launched ${appName}!`, 'success');
        // Auto-refresh now playing after launch
        setTimeout(() => checkNowPlaying(), 2000);
    } catch (error) {
        showStatus(`Failed to launch ${appName}: ${error.message}`, 'error');
        console.error('Launch error:', error);
    }
}

// Check what's currently playing
async function checkNowPlaying() {
    const ip = getSavedIp();
    if (!ip) return;

    const nowPlayingSection = document.getElementById('nowPlayingSection');
    const nowPlayingInfo = document.getElementById('nowPlayingInfo');

    try {
        // Get active app info
        const activeAppData = await fetchRokuData(ip, '/query/active-app');
        const app = activeAppData.querySelector('app');

        if (!app) {
            nowPlayingInfo.innerHTML = '<em>No active app detected</em>';
            if (settingsUnlocked) {
                nowPlayingSection.classList.remove('hidden');
            }
            return;
        }

        const appId = app.getAttribute('id');
        const appName = app.textContent;
        const version = app.getAttribute('version') || 'Unknown';

        let htmlContent = `
            <strong>Active App:</strong> ${appName}<br>
            <strong>App ID:</strong> ${appId}<br>
            <strong>Version:</strong> ${version}<br>
        `;

        // Try to get app UI info (may contain content details)
        try {
            const appUIData = await fetchRokuData(ip, `/query/app-ui?app=${appId}`);
            console.log('App UI XML:', new XMLSerializer().serializeToString(appUIData));

            // Look for any useful content metadata
            const allUIElements = appUIData.querySelectorAll('*');
            const contentFields = [];

            allUIElements.forEach(el => {
                const tagName = el.tagName.toLowerCase();
                const text = el.textContent.trim();

                // Look for fields that might contain content info
                if ((tagName.includes('title') ||
                     tagName.includes('name') ||
                     tagName.includes('content') ||
                     tagName.includes('media') ||
                     tagName.includes('episode') ||
                     tagName.includes('series') ||
                     tagName.includes('show')) && text && text.length > 0) {

                    // Avoid duplicates and long text
                    if (!contentFields.includes(text) && text.length < 200) {
                        contentFields.push({ tag: el.tagName, value: text });
                    }
                }
            });

            if (contentFields.length > 0) {
                htmlContent += '<br><strong style="color: #6633cc;">Content Info:</strong><br>';
                contentFields.forEach(field => {
                    htmlContent += `<strong>${field.tag}:</strong> ${field.value}<br>`;
                });
            }
        } catch (uiError) {
            console.log('App UI info not available:', uiError);
        }

        // Try to get media player info (technical playback details)
        try {
            const mediaData = await fetchRokuData(ip, '/query/media-player');
            latestMediaData = mediaData; // Store for detailed view

            const player = mediaData.querySelector('player');

            if (player) {
                htmlContent += '<br><strong style="color: #6633cc;">Media Player Info:</strong><br>';

                // Get plugin info
                const plugin = player.querySelector('plugin');
                if (plugin) {
                    const pluginId = plugin.getAttribute('id');
                    const pluginName = plugin.getAttribute('name') || plugin.textContent;
                    if (pluginId) htmlContent += `<strong>Plugin ID:</strong> ${pluginId}<br>`;
                    if (pluginName) htmlContent += `<strong>Plugin:</strong> ${pluginName}<br>`;
                }

                // Get all child elements of player and display them
                const children = player.children;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    const tagName = child.tagName;
                    const text = child.textContent.trim();

                    // Skip plugin since we already handled it
                    if (tagName.toLowerCase() === 'plugin') continue;

                    // Format time fields
                    if (tagName.toLowerCase().includes('duration') ||
                        tagName.toLowerCase().includes('position') ||
                        tagName.toLowerCase().includes('runtime')) {
                        const timeVal = parseInt(text);
                        if (!isNaN(timeVal)) {
                            htmlContent += `<strong>${tagName}:</strong> ${formatTime(timeVal)}<br>`;
                            continue;
                        }
                    }

                    // Show all other fields
                    if (text) {
                        htmlContent += `<strong>${tagName}:</strong> ${text}<br>`;
                    }

                    // Show attributes too
                    Array.from(child.attributes).forEach(attr => {
                        htmlContent += `<strong>${tagName}.${attr.name}:</strong> ${attr.value}<br>`;
                    });
                }

                console.log('Full media player XML:', new XMLSerializer().serializeToString(mediaData));
            }
        } catch (mediaError) {
            // Media player info not available (normal for some apps)
            console.log('Media player info not available:', mediaError);
            latestMediaData = null;
        }

        nowPlayingInfo.innerHTML = htmlContent;
        if (settingsUnlocked) {
            nowPlayingSection.classList.remove('hidden');
        }
    } catch (error) {
        nowPlayingInfo.innerHTML = `<em>Error: ${error.message}</em>`;
        if (settingsUnlocked) {
            nowPlayingSection.classList.remove('hidden');
        }
        console.error('Now playing error:', error);
    }
}

// Show full media player XML details
function showFullMediaInfo() {
    const fullMediaInfo = document.getElementById('fullMediaInfo');

    if (!latestMediaData) {
        fullMediaInfo.textContent = 'No media data available. Click "Refresh Now Playing" first.';
        if (settingsUnlocked) {
            fullMediaInfo.classList.remove('hidden');
        }
        return;
    }

    // Pretty print the XML
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(latestMediaData);

    // Format the XML for better readability
    const formatted = formatXml(xmlString);
    fullMediaInfo.textContent = formatted;
    if (settingsUnlocked) {
        fullMediaInfo.classList.remove('hidden');
    }
}

// Helper to format XML with indentation
function formatXml(xml) {
    let formatted = '';
    let indent = '';
    const tab = '  ';

    xml.split(/>\s*</).forEach(node => {
        if (node.match(/^\/\w/)) indent = indent.substring(tab.length); // Decrease indent
        formatted += indent + '<' + node + '>\n';
        if (node.match(/^<?\w[^>]*[^\/]$/)) indent += tab; // Increase indent
    });

    return formatted.substring(1, formatted.length - 2);
}

// Helper function to format time (milliseconds to readable format)
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Launch specific YouTube video by ID
async function launchSpecificYouTube(videoId) {
    const ip = getSavedIp();
    if (!ip) return;

    showStatus(`Launching YouTube video ${videoId}...`, 'info');

    try {
        const appId = '837'; // YouTube app ID
        const endpoint = `/launch/${appId}?contentId=${videoId}`;
        console.log('Launching YouTube:', endpoint);

        await rokuPost(ip, endpoint);
        showStatus(`Launched YouTube video!`, 'success');
        showToast('Launched on Roku!', 'success');
        setTimeout(() => checkNowPlaying(), 2000);
    } catch (error) {
        showStatus(`Failed to launch YouTube: ${error.message}`, 'error');
    }
}

// Launch YouTube video from URL
async function launchYouTube() {
    const url = document.getElementById('youtubeUrl').value.trim();
    const result = document.getElementById('youtubeResult');

    if (!url) {
        showInlineMessage(result, 'Please enter a YouTube URL.', 'error');
        return;
    }

    // YouTube URL patterns:
    // https://www.youtube.com/watch?v=VIDEO_ID
    // https://youtu.be/VIDEO_ID
    // https://m.youtube.com/watch?v=VIDEO_ID

    const patterns = [
        /[?&]v=([a-zA-Z0-9_-]+)/,  // ?v= parameter
        /youtu\.be\/([a-zA-Z0-9_-]+)/, // youtu.be short links
        /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/, // embed links
    ];

    let videoId = null;

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            videoId = match[1];
            break;
        }
    }

    if (!videoId) {
        showInlineMessage(result, 'Could not extract a video ID. Double-check the URL.', 'error');
        return;
    }

    showInlineMessage(result, `Launching YouTube video ${videoId}...`, 'info');

    const appId = '837'; // YouTube app ID
    const ip = getSavedIp();
    if (!ip) return;

    try {
        // YouTube uses contentId parameter
        const endpoint = `/launch/${appId}?contentId=${videoId}`;
        console.log('Launching YouTube:', endpoint);

        await rokuPost(ip, endpoint);
        showStatus(`Launched YouTube video!`, 'success');
        showInlineMessage(result, `✓ Launched video ${videoId}!`, 'success');
        setTimeout(() => checkNowPlaying(), 2000);
    } catch (error) {
        showStatus(`Failed to launch YouTube: ${error.message}`, 'error');
        showInlineMessage(result, `Failed to launch: ${error.message}`, 'error');
    }
}

// Extract Disney+ content ID from URL
function extractDisneyId() {
    const url = document.getElementById('disneyUrl').value.trim();
    const result = document.getElementById('disneyIdResult');

    if (!url) {
        showInlineMessage(result, 'Please enter a Disney+ URL.', 'error');
        return;
    }

    // Disney+ URL patterns:
    // https://www.disneyplus.com/series/NAME/ID
    // https://www.disneyplus.com/movies/NAME/ID
    // https://www.disneyplus.com/video/ID
    // https://www.disneyplus.com/play/UUID (direct play links)

    const patterns = [
        /disneyplus\.com\/play\/([a-zA-Z0-9_-]+)/,
        /disneyplus\.com\/series\/[^\/]+\/([a-zA-Z0-9_-]+)/,
        /disneyplus\.com\/movies\/[^\/]+\/([a-zA-Z0-9_-]+)/,
        /disneyplus\.com\/video\/([a-zA-Z0-9_-]+)/,
        /disneyplus\.com\/[^\/]+\/[^\/]+\/([a-zA-Z0-9_-]+)/
    ];

    let contentId = null;
    let contentType = 'unknown';

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            contentId = match[1];
            if (url.includes('/play/')) contentType = 'play';
            else if (url.includes('/series/')) contentType = 'series';
            else if (url.includes('/movies/')) contentType = 'movie';
            else if (url.includes('/video/')) contentType = 'video';
            break;
        }
    }

    if (contentId) {
        result.className = 'rounded-2xl bg-slate-950/60 px-4 py-4 text-xs text-indigo-50 space-y-3';
        result.innerHTML = `
            <div class="text-sm font-semibold text-emerald-300">
                Found ${contentType} ID:
                <code class="ml-1 rounded bg-emerald-500/20 px-2 py-1 font-mono text-[11px] text-emerald-100">${contentId}</code>
            </div>
            <div class="flex flex-col gap-2 sm:flex-row">
                <button class="rounded-2xl bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25" onclick="tryDisneyDeepLinkSingle('${contentId}', 0)">
                    Try Format 1
                </button>
                <button class="rounded-2xl bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark" onclick="tryDisneyDeepLink('${contentId}', '${contentType}')">
                    Try All (30s)
                </button>
            </div>
            <div id="disneyFormatNav" class="hidden items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-[11px] text-indigo-100">
                <button class="rounded-xl bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20" onclick="tryDisneyPrevFormat()">◄ Prev</button>
                <span id="disneyFormatInfo" class="text-center">Format 1/10</span>
                <button class="rounded-xl bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20" onclick="tryDisneyNextFormat()">Next ►</button>
            </div>
            <p class="text-[11px] text-indigo-200/80">
                Disney+ deep linking is undocumented. Try different formats until one sticks.
            </p>
        `;
        result.classList.remove('hidden');

        // Store content ID for navigation
        window.currentDisneyContentId = contentId;
        window.currentDisneyContentType = contentType;
        window.currentDisneyFormatIndex = 0;

        // Show navigation
        const nav = document.getElementById('disneyFormatNav');
        if (nav) {
            nav.classList.remove('hidden');
        }
    } else {
        showInlineMessage(result, 'Could not extract an ID. Make sure the Disney+ URL is valid.', 'error');
    }
}

// Get Disney+ format list
function getDisneyFormats(contentId, contentType) {
    return [
        `contentId=${contentId}`,
        `videoId=${contentId}`,
        `programId=${contentId}`,
        `seriesId=${contentId}`,
        `mediaType=${contentType}&contentId=${contentId}`,
        `playbackVideoId=${contentId}`,
        `guid=${contentId}`,
        `uuid=${contentId}`,
        `id=${contentId}`,
        `contentId=${encodeURIComponent(contentId)}`
    ];
}

// Try single Disney+ format
async function tryDisneyDeepLinkSingle(contentId, formatIndex) {
    const appId = '291097';
    const formats = getDisneyFormats(contentId, window.currentDisneyContentType || 'play');

    if (formatIndex >= formats.length) formatIndex = 0;
    if (formatIndex < 0) formatIndex = formats.length - 1;

    window.currentDisneyFormatIndex = formatIndex;

    const params = formats[formatIndex];
    showStatus(`Trying format ${formatIndex + 1}/${formats.length}: ${params}`, 'info');

    // Update nav display
    const navInfo = document.getElementById('disneyFormatInfo');
    if (navInfo) {
        navInfo.textContent = `Format ${formatIndex + 1}/${formats.length}: ${params.substring(0, 40)}${params.length > 40 ? '...' : ''}`;
    }

    try {
        await launchAppWithParams(appId, params);
        setTimeout(() => checkNowPlaying(), 2000);
    } catch (error) {
        showStatus(`Format ${formatIndex + 1} failed: ${error.message}`, 'error');
    }
}

// Navigation functions
function tryDisneyNextFormat() {
    const contentId = window.currentDisneyContentId;
    const currentIndex = window.currentDisneyFormatIndex || 0;
    tryDisneyDeepLinkSingle(contentId, currentIndex + 1);
}

function tryDisneyPrevFormat() {
    const contentId = window.currentDisneyContentId;
    const currentIndex = window.currentDisneyFormatIndex || 0;
    tryDisneyDeepLinkSingle(contentId, currentIndex - 1);
}

// Try Disney+ deep link with extracted ID (all formats)
async function tryDisneyDeepLink(contentId, contentType) {
    const appId = '291097'; // Disney+ app ID
    const formats = getDisneyFormats(contentId, contentType);

    showStatus(`Trying Disney+ deep link (format 1/${formats.length})...`, 'info');

    // Try each format with longer delays
    for (let i = 0; i < formats.length; i++) {
        const params = formats[i];
        showStatus(`Trying format ${i + 1}/${formats.length}: ${params}`, 'info');

        try {
            await launchAppWithParams(appId, params);
            // Wait 3 seconds between attempts to give Disney+ time to respond
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.log(`Format ${i + 1} failed:`, error);
        }
    }

    showStatus('Tried all formats. Check your Roku to see if any worked! Refreshing status...', 'info');
    setTimeout(() => checkNowPlaying(), 3000);
}

// Helper to launch with specific params
async function launchAppWithParams(appId, params = '') {
    const ip = getSavedIp();
    if (!ip) return;

    let endpoint = `/launch/${appId}`;
    if (params) {
        endpoint += `?${params}`;
    }
    console.log('Trying endpoint:', endpoint);

    await rokuPost(ip, endpoint);
}

// Launch deep link from manual input
async function launchDeepLink() {
    const appId = document.getElementById('deepLinkAppId').value.trim();
    const contentId = document.getElementById('deepLinkContentId').value.trim();

    if (!appId) {
        showStatus('Please enter an App ID', 'error');
        return;
    }

    if (!contentId) {
        showStatus('Please enter content parameters', 'error');
        return;
    }

    const ip = getSavedIp();
    if (!ip) return;

    showStatus(`Launching deep link...`, 'info');

    try {
        // Build the deep link URL
        // Format: /launch/{appId}?contentId=xxx or other params
        let endpoint = `/launch/${appId}?${contentId}`;

        // If contentId doesn't start with a parameter name, assume it's contentId
        if (!contentId.includes('=')) {
            endpoint = `/launch/${appId}?contentId=${encodeURIComponent(contentId)}`;
        }

        console.log('Deep link endpoint:', endpoint);

        await rokuPost(ip, endpoint);
        showStatus(`Deep link launched!`, 'success');
        setTimeout(() => checkNowPlaying(), 2000);
    } catch (error) {
        showStatus(`Failed to launch deep link: ${error.message}`, 'error');
        console.error('Deep link error:', error);
    }
}

// Macro System
function initMacroSystem() {
    try {
        const stored = localStorage.getItem(MACRO_STORAGE_KEY);
        macros = stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.warn('Failed to parse macros:', error);
        macros = [];
    }

    macroStepsDraft = [];

    const form = document.getElementById('macroForm');
    if (form) {
        form.addEventListener('submit', handleMacroSubmit);
    }

    updateMacroPreview();
    renderMacroList();
    updateFavoriteMacroButton();
}

function handleMacroSubmit(event) {
    event.preventDefault();

    const nameInput = document.getElementById('macroName');
    const favoriteCheckbox = document.getElementById('macroMarkFavorite');
    const name = nameInput.value.trim();

    if (!name) {
        showStatus('Give your macro a fun name before saving.', 'error');
        return;
    }

    if (macroStepsDraft.length === 0) {
        showStatus('Add at least one step to the macro.', 'error');
        return;
    }

    const macro = {
        id: `macro-${Date.now()}`,
        name,
        steps: [...macroStepsDraft],
        favorite: favoriteCheckbox.checked
    };

    if (macro.favorite) {
        macros = macros.map(existing => ({ ...existing, favorite: false }));
    }

    macros.push(macro);
    saveMacros();

    macroStepsDraft = [];
    updateMacroPreview();
    renderMacroList();
    updateFavoriteMacroButton();

    event.target.reset();
    showStatus(`Saved macro "${macro.name}".`, 'success');
}

function addMacroStep() {
    const type = document.getElementById('macroActionType').value;
    const valueInput = document.getElementById('macroActionValue');
    const rawValue = valueInput.value.trim();

    if (!rawValue) {
        showStatus('Enter a value for the macro step.', 'error');
        return;
    }

    let step = null;

    if (type === 'key') {
        step = { type: 'key', key: rawValue };
    } else if (type === 'launch') {
        const { appId, params, label } = parseLaunchValue(rawValue);
        if (!appId) {
            showStatus('Launch steps need an app ID.', 'error');
            return;
        }
        step = { type: 'launch', appId, params, label };
    } else if (type === 'delay') {
        const duration = parseInt(rawValue, 10);
        if (Number.isNaN(duration) || duration < 0) {
            showStatus('Delay steps must be a positive number of milliseconds.', 'error');
            return;
        }
        step = { type: 'delay', duration };
    }

    if (!step) {
        showStatus('Could not add that step. Please try again.', 'error');
        return;
    }

    macroStepsDraft.push(step);
    updateMacroPreview();
    valueInput.value = '';
    valueInput.focus();
}

function removeMacroStep(index) {
    macroStepsDraft.splice(index, 1);
    updateMacroPreview();
}

function parseLaunchValue(rawValue) {
    const [endpointPart, labelPart] = rawValue.split('|').map(piece => piece.trim());
    const endpoint = endpointPart || '';
    const label = labelPart || '';

    if (!endpoint) return { appId: '', params: '', label };

    const [appIdPart, paramsPart = ''] = endpoint.split('?');
    return {
        appId: appIdPart.trim(),
        params: paramsPart.trim(),
        label
    };
}

function describeMacroStep(step) {
    switch (step.type) {
        case 'key':
            return `Press ${step.key}`;
        case 'launch': {
            const label = step.label || resolveAppName(step.appId);
            return `Launch ${label}${step.params ? ` (${step.params})` : ''}`;
        }
        case 'delay':
            return `Wait ${(step.duration / 1000).toFixed(step.duration % 1000 === 0 ? 0 : 1)}s`;
        default:
            return 'Unknown step';
    }
}

function updateMacroPreview() {
    const preview = document.getElementById('macroStepsPreview');
    if (!preview) return;

    preview.innerHTML = '';

    if (macroStepsDraft.length === 0) {
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'rounded-2xl bg-white/5 px-4 py-3 text-sm text-indigo-200';
        emptyMessage.textContent = 'No steps yet. Add a key press, launch, or delay.';
        preview.appendChild(emptyMessage);
        return;
    }

    macroStepsDraft.forEach((step, index) => {
        const item = document.createElement('li');
        item.className = 'flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-2 text-sm text-indigo-100';

        const description = document.createElement('span');
        description.textContent = describeMacroStep(step);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/20';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeMacroStep(index));

        item.append(description, removeBtn);
        preview.appendChild(item);
    });
}

function renderMacroList() {
    const list = document.getElementById('macroList');
    if (!list) return;

    list.innerHTML = '';

    if (macros.length === 0) {
        const emptyState = document.createElement('p');
        emptyState.className = 'rounded-2xl bg-white/10 px-4 py-3 text-sm text-indigo-100';
        emptyState.textContent = 'No macros yet. Build one above to unlock automations.';
        list.appendChild(emptyState);
        return;
    }

    macros.forEach(macro => {
        const card = document.createElement('div');
        card.className = 'rounded-2xl bg-white/10 p-4 text-sm text-indigo-100 shadow';

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-3';

        const title = document.createElement('h4');
        title.className = 'text-base font-semibold text-white';
        title.textContent = macro.name;

        const badge = document.createElement('span');
        if (macro.favorite) {
            badge.className = 'rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white';
            badge.textContent = 'Magic Button';
        }

        const steps = document.createElement('p');
        steps.className = 'mt-3 text-xs leading-relaxed text-indigo-100/80';
        steps.textContent = macro.steps.map(describeMacroStep).join(' • ');

        const actions = document.createElement('div');
        actions.className = 'mt-4 flex flex-wrap gap-2';

        const runBtn = document.createElement('button');
        runBtn.className = 'rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark';
        runBtn.textContent = 'Run';
        runBtn.addEventListener('click', () => runMacro(macro.id));

        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = 'rounded-2xl bg-white/15 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/25';
        favoriteBtn.textContent = macro.favorite ? 'Unset Magic Button' : 'Set as Magic Button';
        favoriteBtn.addEventListener('click', () => setFavoriteMacro(macro.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'rounded-2xl bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteMacro(macro.id));

        header.append(title);
        if (macro.favorite) header.append(badge);
        actions.append(runBtn, favoriteBtn, deleteBtn);
        card.append(header, steps, actions);
        list.appendChild(card);
    });
}

function setFavoriteMacro(macroId) {
    let updated = false;
    macros = macros.map(macro => {
        if (macro.id === macroId) {
            updated = true;
            return { ...macro, favorite: !macro.favorite };
        }
        return { ...macro, favorite: false };
    });

    if (!updated) {
        showStatus('Macro not found.', 'error');
        return;
    }

    saveMacros();
    renderMacroList();
    updateFavoriteMacroButton();
}

function deleteMacro(macroId) {
    macros = macros.filter(macro => macro.id !== macroId);
    saveMacros();
    renderMacroList();
    updateFavoriteMacroButton();
    showStatus('Macro deleted.', 'info');
}

function updateFavoriteMacroButton() {
    const button = document.getElementById('favoriteMacroButton');
    const label = document.getElementById('favoriteMacroLabel');

    if (!button || !label) return;

    const favoriteMacro = macros.find(macro => macro.favorite);

    if (favoriteMacro) {
        label.textContent = favoriteMacro.name;
        button.classList.remove('hidden');
    } else {
        button.classList.add('hidden');
    }
}

let macroRunning = false;

async function runMacro(macroId) {
    if (macroRunning) {
        showStatus('A macro is already running.', 'error');
        return;
    }

    const macro = macros.find(item => item.id === macroId);
    if (!macro) {
        showStatus('Macro not found.', 'error');
        return;
    }

    const ip = getSavedIp();
    if (!ip) return;

    macroRunning = true;
    showStatus(`Running macro "${macro.name}"...`, 'info');

    try {
        for (const step of macro.steps) {
            await executeMacroStep(step);
        }
        showStatus(`Macro "${macro.name}" finished!`, 'success');
    } catch (error) {
        showStatus(`Macro stopped: ${error.message}`, 'error');
    } finally {
        macroRunning = false;
    }
}

async function executeMacroStep(step) {
    switch (step.type) {
        case 'key':
            await sendKey(step.key);
            await sleep(300);
            break;
        case 'launch': {
            const label = step.label || resolveAppName(step.appId);
            showStatus(`Macro launching ${label}...`, 'info');
            await launchAppWithParams(step.appId, step.params);
            await sleep(1500);
            break;
        }
        case 'delay':
            await sleep(step.duration);
            break;
        default:
            console.warn('Unknown macro step encountered:', step);
    }
}

function resolveAppName(appId) {
    const match = COMMON_APPS.find(app => app.id === appId);
    return match ? match.name : `App ${appId}`;
}

function saveMacros() {
    localStorage.setItem(MACRO_STORAGE_KEY, JSON.stringify(macros));
}

function runFavoriteMacro() {
    const favorite = macros.find(macro => macro.favorite);
    if (!favorite) {
        showStatus('Set a macro as the Magic Button in Settings first.', 'error');
        return;
    }
    runMacro(favorite.id);
}

function openMacroHelp() {
    showStatus('Add steps (Press Key, Launch App, Wait) to craft routines. Mark one as the Magic Button to show it in kid mode.', 'info');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Settings Lock Functions
function handleSettingsClick(event) {
    const pinModal = document.getElementById('pinModal');
    const modalOpen = pinModal && !pinModal.classList.contains('hidden');
    if (settingsUnlocked && !modalOpen) {
        event.preventDefault();
        hideSettings();
        return;
    }
    if (!settingsUnlocked && !modalOpen) {
        event.preventDefault();
        showStatus('Hold the gear button for two seconds to unlock advanced controls.', 'info');
    }
}

function startSettingsHold() {
    if (isHolding) return;
    if (settingsUnlocked) {
        hideSettings();
        return;
    }
    isHolding = true;

    const circle = document.getElementById('progressCircle');
    const lockBtn = document.getElementById('settingsLock');
    lockBtn.classList.add('scale-95', 'ring-4', 'ring-white/60');

    const startTime = Date.now();
    const interval = 50; // Update every 50ms

    holdTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        holdProgress = Math.min(elapsed / HOLD_DURATION, 1);

        // Update circle progress
        const offset = PROGRESS_CIRCUMFERENCE - (holdProgress * PROGRESS_CIRCUMFERENCE);
        circle.style.strokeDashoffset = offset;

        if (holdProgress >= 1) {
            stopSettingsHold();
            openPinModal();
        }
    }, interval);
}

function stopSettingsHold() {
    if (!isHolding) return;
    isHolding = false;

    clearInterval(holdTimer);
    holdTimer = null;
    holdProgress = 0;

    const circle = document.getElementById('progressCircle');
    const lockBtn = document.getElementById('settingsLock');
    circle.style.strokeDashoffset = PROGRESS_CIRCUMFERENCE;
    lockBtn.classList.remove('scale-95', 'ring-4', 'ring-white/60');
}

// PIN Modal Functions
function openPinModal() {
    const modal = document.getElementById('pinModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    currentPin = '';
    updatePinDisplay();
}

function closePinModal() {
    const modal = document.getElementById('pinModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentPin = '';
}

function enterPin(digit) {
    if (currentPin.length < 4) {
        currentPin += digit;
        updatePinDisplay();

        if (currentPin.length === 4) {
            checkPin();
        }
    }
}

function clearPin() {
    currentPin = '';
    updatePinDisplay();
}

function updatePinDisplay() {
    const display = document.getElementById('pinDisplay');
    const filled = '●'.repeat(currentPin.length);
    const empty = '○'.repeat(Math.max(0, 4 - currentPin.length));
    display.textContent = (filled + empty).padEnd(4, '○');
    display.classList.remove('text-rose-500');
    display.classList.add('text-indigo-600');
}

function checkPin() {
    if (currentPin === PIN_CODE) {
        settingsUnlocked = true;
        closePinModal();
        showSettings();
    } else {
        // Wrong PIN - shake and clear
        const display = document.getElementById('pinDisplay');
        display.textContent = '✖ Wrong PIN';
        display.classList.remove('text-indigo-600');
        display.classList.add('text-rose-500');
        setTimeout(() => {
            clearPin();
        }, 1000);
    }
}

function showSettings() {
    // Show all advanced settings
    const advancedSections = document.querySelectorAll('[data-settings]');
    advancedSections.forEach(section => {
        section.classList.remove('hidden');
    });
    renderQuickLaunchSettings(toddlerQuickLaunchItems);
    updateToddlerContentCacheMeta();
    showStatus('Settings unlocked! Advanced controls are now visible.', 'success');

    const contentSourceSection = document.getElementById('contentSourceSection');
    if (contentSourceSection) {
        setTimeout(() => {
            contentSourceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            contentSourceSection.classList.add('showcase-highlight');
            setTimeout(() => {
                contentSourceSection.classList.remove('showcase-highlight');
            }, 1600);
        }, 50);
    }
}

function hideSettings() {
    const advancedSections = document.querySelectorAll('[data-settings]');
    advancedSections.forEach(section => {
        section.classList.add('hidden');
    });
    const contentSourceSection = document.getElementById('contentSourceSection');
    if (contentSourceSection) {
        contentSourceSection.classList.remove('showcase-highlight');
    }
    settingsUnlocked = false;
    showStatus('Advanced controls hidden. Hold the gear button to unlock again.', 'info');
}

// Toggle dark/light theme
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
}

// Initialize theme on separate listener to avoid conflicts
(function() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    applyTheme(savedTheme);
})();

function applyTheme(theme) {
    const body = document.body;
    const darkClasses = ['from-indigo-500', 'via-indigo-600', 'to-purple-700', 'text-white'];
    const lightClasses = ['from-indigo-200', 'via-purple-100', 'to-pink-200', 'text-slate-900'];

    if (theme === 'light') {
        body.classList.remove(...darkClasses);
        body.classList.add(...lightClasses);
    } else {
        body.classList.remove(...lightClasses);
        body.classList.add(...darkClasses);
    }
}

// Send key press to Roku
async function sendKey(key) {
    const ip = getSavedIp();
    if (!ip) return;

    try {
        await rokuPost(ip, `/keypress/${encodeRokuPathSegment(key)}`);

        // Visual feedback
        console.log(`Sent key: ${key}`);
    } catch (error) {
        showStatus(`Failed to send key ${key}: ${error.message}`, 'error');
        console.error('Key press error:', error);
    }
}
