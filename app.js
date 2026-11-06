const launcher = document.querySelector("#launcher");
const appWindow = document.querySelector("#appWindow");
const content = document.querySelector("#windowContent");
const bootScreen = document.querySelector("#bootScreen");
const accountGate = document.querySelector("#accountGate");
const accountGateContent = document.querySelector("#accountGateContent");
const appNames = {files:"files",browser:"browser",messages:"global chat",paint:"paint",terminal:"terminal",music:"music",movies:"movies",appCreator:"app creator",camera:"camera",calculator:"calculator",games:"games",settings:"settings",clock:"clock",profile:"profile",shop:"shop"};
const icons = {files:"▤",browser:"◎",messages:"#",paint:"◉",terminal:"›_",music:"♫",movies:"▶",appCreator:"</>",camera:"▣",calculator:"＋",games:"✣",settings:"⚙",clock:"◷",profile:"◉",shop:"◇"};
const appCatalog = Object.keys(appNames).map(id=>({id,name:appNames[id],icon:icons[id]}));
const LUMIN_URL = "https://cdn.jsdelivr.net/gh/luminsdk/script@latest/lumin.min.js";
let luminLoading;
let luminReady = false;
let tracks = [];
let currentTrack = -1;
let activeChatUser = null;
let guestSession = false;
let accountGateMode = "walkthrough";
let accountPolicyVersion = "";
let activityTimer = null;
let lastUserActivity = Date.now();
let chatEvents = null;
let chatMessages = [];
let browserController = null;
let bareConnection = null;
let restoreWindowStyles = null;
const browserScripts = new Map();
let browserTabs = [];
let activeBrowserTabId = null;
let nextBrowserTabId = 1;
let notes = [];
let activeNoteId = null;
let fileItems = [];
let fileItemsInitialized = false;
let fileFolders = [];
let currentFileFolder = "home";
let photoItems = [];
let movieObjectUrl = null;
let creatorPreviewTimer = null;
let creatorMessageListener = null;
let cameraStream = null;
let timerTicker = null;
let timerEndsAt = 0;
let timerInitial = 0;
let timerRemaining = 0;
let timerFinished = false;
let uiAudioContext = null;
let stopwatchStartedAt = 0;
let stopwatchElapsed = 0;
let stopwatchTimer = null;
let clockTimer = null;
let tasks = [];
let currentCalendarDate = new Date();
let selectedCalendarDate = new Date();
const BROWSER_RESET_KEY = "zorune-browser-storage-reset";
let browserStorageRecovery = Promise.resolve(true);
if (["pending", "failed"].includes(sessionStorage.getItem(BROWSER_RESET_KEY))) {
  browserStorageRecovery = resetBrowserStorage().then(() => { sessionStorage.removeItem(BROWSER_RESET_KEY); return true; }).catch(error => {
    sessionStorage.setItem(BROWSER_RESET_KEY, "failed");
    console.warn("Browser storage reset did not finish:", error.message);
    return false;
  });
}
function openApp(name) {
  if (!Object.hasOwn(appNames, name)) return;
  if (!activeChatUser && !guestSession) { showAccountGate(); return; }
  const title = appNames[name] || name;
  stopCamera();
  stopMovies();
  clearTimeout(creatorPreviewTimer);creatorPreviewTimer=null;
  if(creatorMessageListener){window.removeEventListener("message",creatorMessageListener);creatorMessageListener=null}
  clearInterval(clockTimer); clockTimer = null;
  if(name!=="messages"&&chatEvents){chatEvents.close();chatEvents=null}
  if(name === "browser") browserTabs.forEach(tab=>{tab.view=null;tab.startPage=null;tab.frameHolder=null});
  appWindow.classList.remove("maximized","browser-window","creator-window","movies-window");appWindow.removeAttribute("style");restoreWindowStyles=null;
  document.querySelector("#windowTitle").textContent = title;
  document.querySelector("#windowSymbol").textContent = icons[name] || "";
  document.querySelector("#activeApp").textContent = title;
  content.innerHTML = appContent(name);
  appWindow.classList.toggle("browser-window", name === "browser");
  appWindow.classList.toggle("creator-window", name === "appCreator");
  appWindow.classList.toggle("movies-window", name === "movies");
  appWindow.hidden = false;
  launcher.hidden = true;
  const launcherSearch=document.querySelector("#searchLauncher");if(launcherSearch.value){launcherSearch.value="";filterApps("")}
  content.onkeydown=null;
  if(guestSession&&["messages","profile","shop"].includes(name)){
    content.innerHTML=`<div class="app-page"><header class="app-page-head"><div><h2>${escapeHtml(title)}</h2><p>This feature requires an account. Global Chat is unavailable to guests.</p></div></header><button class="primary-button" id="guestSignIn">sign in or create an account</button></div>`;
    content.querySelector("#guestSignIn").addEventListener("click",()=>{accountGateMode="login";showAccountGate("auth")});
    return;
  }
  if (name === "notes") wireNotes();
  if (name === "settings") wireSettings();
  if (name === "files") wireFiles();
  if (name === "paint") wirePaint();
  if (name === "terminal") wireTerminal();
  if (name === "camera") wireCamera();
  if (name === "calculator") wireCalculator();
  if (name === "browser") initBrowser();
  if (name === "music") wireMusic();
  if (name === "messages") wireChat();
  if (name === "profile") wireProfile();
  if (name === "shop") wireShop();
  if (name === "games") initGames();
  if (name === "calendar") wireCalendar();
  if (name === "tasks") wireTasks();
  if (name === "photos") wirePhotos();
  if (name === "clock") wireClock();
  if (name === "movies") wireMovies();
  if (name === "appCreator") wireAppCreator();
}
function appContent(name) {
  if (name === "files") return `<div class="app-page"><header class="app-page-head"><div><h2>files</h2><p>Browse this session’s files and folders.</p></div><div class="page-actions"><button class="soft-button" id="newFolder">new folder</button><label class="primary-button">upload<input id="fileUpload" type="file" multiple hidden></label></div></header><div class="file-toolbar"><input id="fileSearch" type="search" placeholder="Search files" aria-label="Search files"><select id="fileSort" aria-label="Sort files"><option value="name">name</option><option value="type">type</option></select></div><div class="file-manager"><aside id="fileFolders" class="file-folders"></aside><div id="fileList" class="file-list"></div></div></div>`;
  if (name === "notes") return `<div class="notes-app"><aside class="notes-sidebar"><div class="notes-side-head"><span>your notes</span><div><button id="newNote" aria-label="New note">+</button><button id="deleteNote" aria-label="Delete note">×</button></div></div><input id="noteSearch" type="search" placeholder="Find a note"><div id="noteList" class="note-list"></div></aside><section class="note-editor"><input id="noteTitle" class="note-title" aria-label="Note title" placeholder="Untitled note"><textarea id="noteBody" class="notes-area" placeholder="Start writing…"></textarea><footer class="note-status" id="noteStatus">saved on this device</footer></section></div>`;
  if (name === "settings") { const s=readSettings(); return `<div class="settings-app"><aside class="settings-rail"><div class="settings-heading">settings</div><a href="#appearance">appearance</a><a href="#desktop">desktop</a><a href="#accessibility">accessibility</a><a href="#sound">sound</a><a href="#system">system</a></aside><div class="settings-content"><header class="app-page-head"><div><h2>make zorune yours</h2><p>Your choices stay on this device.</p></div></header><section class="settings-section" id="appearance"><h3>appearance</h3><label class="settings-control"><span>surface<small>Choose the desktop tone</small></span><select data-setting="theme"><option value="black" ${s.theme==="black"?"selected":""}>deep black</option><option value="graphite" ${s.theme==="graphite"?"selected":""}>graphite</option></select></label><label class="settings-control"><span>accent color<small>Used for focus and selection</small></span><select data-setting="accent"><option value="white" ${s.accent==="white"?"selected":""}>soft white</option><option value="blue" ${s.accent==="blue"?"selected":""}>blue</option><option value="violet" ${s.accent==="violet"?"selected":""}>violet</option><option value="green" ${s.accent==="green"?"selected":""}>green</option></select></label><label class="settings-control"><span>interface scale<small>Adjust the desktop density</small></span><select data-setting="scale"><option value="compact" ${s.scale==="compact"?"selected":""}>compact</option><option value="comfortable" ${s.scale==="comfortable"?"selected":""}>comfortable</option><option value="large" ${s.scale==="large"?"selected":""}>large</option></select></label></section><section class="settings-section" id="desktop"><h3>desktop</h3>${settingCheck("showDate","show date on desktop",s.showDate)}${settingCheck("showIcons","show desktop apps",s.showIcons)}${settingCheck("compactDock","compact dock",s.compactDock)}${settingCheck("clock24","24-hour clock",s.clock24)}</section><section class="settings-section" id="accessibility"><h3>accessibility</h3>${settingCheck("reduceMotion","reduce motion",s.reduceMotion)}${settingCheck("highContrast","increase contrast",s.highContrast)}<label class="settings-control"><span>text size<small>Scale app content</small></span><select data-setting="textSize"><option value="normal" ${s.textSize==="normal"?"selected":""}>normal</option><option value="large" ${s.textSize==="large"?"selected":""}>large</option></select></label></section><section class="settings-section" id="sound"><h3>sound</h3><label class="settings-control"><span>master volume<small>Preview desktop sound level</small></span><input type="range" min="0" max="100" data-setting="volume" value="${s.volume}"></label>${settingCheck("sounds","interface sounds",s.sounds)}</section><section class="settings-section" id="system"><h3>system</h3>${settingCheck("bootScreen","show startup screen",s.bootScreen)}<button id="resetSettings" class="soft-button">restore defaults</button><p class="settings-about">zoruneOS desktop preview · v0.1.0</p></section></div></div>`; }
  if (name === "profile") return `<div class="app-page profile-app"><header class="app-page-head"><div><h2>your profile</h2><p>One account for your zoruneOS identity and chat.</p></div><span class="coin-pill" id="profileCoinCount">◈ 0</span></header><section class="profile-banner" id="profileBanner"><label class="profile-banner-upload">change banner<input id="bannerUpload" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></section><div class="profile-editor"><label class="profile-avatar-upload"><span id="profileAvatarPreview">z</span><input id="avatarUpload" type="file" accept="image/png,image/jpeg,image/webp" hidden><small>change photo</small></label><form id="profileForm" class="profile-form"><label>display name<input name="displayName" maxlength="32" required></label><label>pronouns<input name="pronouns" maxlength="32" placeholder="optional"></label><label>about you<textarea name="bio" maxlength="160" rows="3" placeholder="A little about yourself"></textarea></label><label>active status<select name="status"><option value="online">online</option><option value="idle">idle</option><option value="busy">busy</option><option value="invisible">invisible</option></select></label><button class="primary-button" type="submit">save profile</button><span id="profileSaveStatus" role="status"></span></form></div><div class="account-meta"><span id="profileUsername"></span><span id="profileEmail"></span><button id="profileSignOut" class="soft-button">sign out</button><button id="profileDelete" class="danger-button">delete account</button></div></div>`;
  if (name === "shop") return `<div class="app-page shop-app"><header class="app-page-head"><div><h2>zorune shop</h2><p>Collect name styles with coins earned in zoruneOS.</p></div><span class="coin-pill" id="shopCoinCount">◈ 0 coins</span></header><section class="daily-reward-card"><div><strong>daily check-in</strong><small>claim 50 coins once each day</small></div><button class="primary-button" id="claimDaily">claim reward</button></section><p class="activity-note" id="activityNote">Stay active in zoruneOS to occasionally earn a few bonus coins.</p><div class="shop-grid" id="shopItems"></div><p class="shop-footnote">Coins have no cash value and cannot be purchased with real money.</p></div>`;
  if (name === "calculator") return `<div class="calc"><div class="calc-display" id="calcDisplay">0</div><div class="calc-keys">${["C","±","%","÷","7","8","9","×","4","5","6","−","1","2","3","+","⌫","0",".","="].map(k => `<button data-key="${k}">${k}</button>`).join("")}</div></div>`;
  if (name === "browser") return `<div class="browser-shell"><div class="browser-tabs" id="browserTabs" role="tablist" aria-label="Browser tabs"></div><div class="browser-toolbar"><button type="button" data-browser="back" aria-label="Back" title="Back">‹</button><button type="button" data-browser="forward" aria-label="Forward" title="Forward">›</button><button type="button" data-browser="reload" aria-label="Reload" title="Reload">↻</button><button type="button" data-browser="home" aria-label="Home" title="Home">⌂</button><form id="browserForm"><input id="browserAddress" type="text" spellcheck="false" placeholder="Search DuckDuckGo or enter address" aria-label="Search DuckDuckGo or enter address"><button type="submit">go</button></form></div><div class="browser-status" id="browserStatus">Starting browser…</div><div class="browser-host" id="browserHost"></div><div class="browser-credit">zorune browser · powered by scramjet</div></div>`;
  if (name === "music") return `<div class="app-page"><header class="app-page-head"><div><h2>music</h2><p>Play songs from your device.</p></div><label class="primary-button">add music<input id="musicFiles" type="file" accept="audio/*" multiple hidden></label></header><div class="music-layout"><div class="music-now"><strong id="trackTitle">no track selected</strong><small id="trackDetail">your files stay on this device</small><audio id="audioPlayer" controls></audio></div><div class="music-controls"><button id="prevTrack" class="soft-button">previous</button><button id="playPause" class="soft-button">play</button><button id="nextTrack" class="soft-button">next</button><label class="volume-control">volume <input id="musicVolume" type="range" min="0" max="100" value="80"></label></div><div class="track-list" id="trackList"></div></div></div>`;
  if (name === "movies") return `<div class="movies-app"><header class="app-page-head"><div><h2>movies</h2><p>Discover titles with TMDB, then play a video source you can access.</p></div></header><nav class="movie-tabs" aria-label="Movies sections"><button type="button" class="active" data-movie-tab="browse">browse</button><button type="button" data-movie-tab="player">player</button></nav><section class="movies-panel movie-browse" id="movieBrowse"><form id="movieSearchForm" class="movie-link-form"><input id="movieSearchQuery" type="search" placeholder="Search movies" aria-label="Search movie catalog"><button class="primary-button">search</button><button type="button" id="movieTrending" class="soft-button">trending</button></form><div id="movieApiStatus" class="movie-api-status" role="status">Checking TMDB connection…</div><div class="movie-catalog-layout"><div id="movieResults" class="movie-results"></div><aside id="movieDetails" class="movie-details"><span class="movie-detail-placeholder">Choose a title to see its details.</span></aside></div><footer class="tmdb-credit"><img src="/api/tmdb/logo" alt="TMDB" onerror="this.hidden=true"><div><a href="https://www.themoviedb.org/" target="_blank" rel="noopener">The Movie Database (TMDB)</a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></div></footer></section><section class="movies-panel movie-player-panel" id="moviePlayerPanel" hidden><div class="movie-player-controls"><label class="primary-button">open video<input id="movieUpload" type="file" accept="video/*,.mp4,.webm,.ogv,.mov,.m4v" hidden></label><form id="movieForm" class="movie-link-form"><input id="movieUrl" type="url" placeholder="Paste a direct video file link" aria-label="Direct video link" required><button class="primary-button">play link</button></form></div><p class="app-hint">TMDB helps you discover titles; it does not provide movie streams. Use a direct .mp4, .webm, or other browser-playable video URL, or select a file. Streaming watch pages and DRM videos cannot be played here.</p><div class="movie-player-wrap"><video id="moviePlayer" controls playsinline preload="metadata" aria-label="Movie player" hidden></video><div id="movieEmpty" class="movie-empty"><span>▶</span><strong>ready when you are</strong><small>Choose a video file or paste a media link above.</small></div></div><div id="movieStatus" class="movie-status" role="status">nothing playing</div><div class="movie-recent"><strong>recent links</strong><div id="movieRecents" class="movie-recents"></div></div></section></div>`;
  if (name === "appCreator") return `<div class="app-creator"><header class="app-page-head creator-head"><div><h2>app creator</h2><p>Build a small web app, preview it, then download one HTML file.</p></div><div class="page-actions"><button id="creatorReset" class="soft-button">new project</button><button id="creatorDownload" class="primary-button">download app</button></div></header><div class="creator-workspace"><section class="creator-editor"><div class="creator-project"><label>project name<input id="creatorName" maxlength="48" value="my zorune app"></label><span id="creatorSaved" role="status">saved on this device</span></div><div class="creator-tabs" role="tablist" aria-label="Code files"><button type="button" data-creator-tab="html" class="active" role="tab" aria-selected="true">index.html</button><button type="button" data-creator-tab="css" role="tab" aria-selected="false">style.css</button><button type="button" data-creator-tab="js" role="tab" aria-selected="false">app.js</button></div><label class="creator-code-label" for="creatorHtml">Edit your app code</label><textarea id="creatorHtml" class="creator-code" data-creator-pane="html" spellcheck="false" aria-label="HTML code"></textarea><textarea id="creatorCss" class="creator-code" data-creator-pane="css" spellcheck="false" aria-label="CSS code" hidden></textarea><textarea id="creatorJs" class="creator-code" data-creator-pane="js" spellcheck="false" aria-label="JavaScript code" hidden></textarea><div class="creator-editor-foot"><span>HTML · CSS · JavaScript</span><button id="creatorRun" class="soft-button">run preview</button></div></section><section class="creator-preview"><div class="creator-preview-head"><div><strong>live preview</strong><small id="creatorPreviewStatus">ready</small></div><select id="creatorViewport" aria-label="Preview size"><option value="desktop">desktop</option><option value="mobile">mobile</option></select></div><div class="creator-preview-stage"><iframe id="creatorFrame" title="App preview" sandbox="allow-scripts"></iframe></div><p class="creator-footnote">Preview code runs in an isolated frame. Download creates a standalone HTML file.</p></section></div></div>`;
  if (name === "messages") return `<div class="chat-root" id="chatRoot"><div class="games-status">Connecting to zoruneos chat server…</div></div>`;
  if (name === "games") return `<div class="games-host" id="gamesRoot"></div>`;
  if (name === "paint") return `<div class="paint-app"><header class="paint-toolbar"><label>color<input id="paintColor" type="color" value="#eeeeee"></label><label>brush<input id="paintSize" type="range" min="1" max="40" value="6"></label><button id="paintUndo" class="soft-button">undo</button><button id="paintClear" class="soft-button">clear</button><button id="paintSave" class="primary-button">save image</button></header><div class="paint-canvas-wrap"><canvas id="paintCanvas" aria-label="Drawing canvas"></canvas></div></div>`;
  if (name === "terminal") return `<div class="terminal-app"><div class="terminal-topline">zorune shell <span>safe preview</span></div><div class="terminal-output" id="terminalOutput"><p>Welcome to zoruneOS.<br>Type <strong>help</strong> to see available commands.</p></div><form id="terminalForm" class="terminal-input-row"><span>z&gt;</span><input id="terminalInput" autocomplete="off" spellcheck="false" aria-label="Terminal command"><button class="soft-button">run</button></form></div>`;
  if (name === "camera") return `<div class="camera-app"><video id="cameraVideo" autoplay playsinline></video><div class="camera-empty" id="cameraEmpty"><strong>camera is off</strong><span>Allow camera access when your browser asks.</span></div><div class="camera-controls"><button id="startCamera" class="primary-button">start camera</button><button id="takePhoto" class="soft-button" disabled>take photo</button><button id="stopCamera" class="soft-button" disabled>stop</button></div><div id="cameraMessage" class="app-hint">Camera access works on localhost or a secure connection.</div></div>`;
  if (name === "calendar") return `<div class="calendar-app"><header class="app-page-head"><div><h2>calendar</h2><p id="calendarMonth"></p></div><div class="page-actions"><button class="soft-button" id="calendarPrev">‹</button><button class="soft-button" id="calendarToday">today</button><button class="soft-button" id="calendarNext">›</button></div></header><div class="calendar-grid" id="calendarGrid"></div><section class="calendar-events"><div class="calendar-event-head"><h3 id="selectedDayTitle">events</h3><button class="soft-button" id="newEvent">add event</button></div><form id="eventForm" hidden><input id="eventTitle" placeholder="Event name" maxlength="80" required><input id="eventDate" type="date" required><button class="primary-button">save</button></form><div id="eventList"></div></section></div>`;
  if (name === "tasks") return `<div class="app-page tasks-app"><header class="app-page-head"><div><h2>tasks</h2><p>Small steps, kept on this device.</p></div><span id="taskCount" class="count-pill">0 open</span></header><form id="taskForm" class="task-form"><input id="taskInput" maxlength="140" placeholder="Add a task…" required><button class="primary-button">add task</button></form><div class="task-filters"><button data-task-filter="all" class="active">all</button><button data-task-filter="open">to do</button><button data-task-filter="done">completed</button></div><div id="taskList" class="task-list"></div></div>`;
  if (name === "photos") return `<div class="app-page photos-app"><header class="app-page-head"><div><h2>photos</h2><p>Your selected pictures stay in this session.</p></div><label class="primary-button">import images<input id="photoUpload" type="file" accept="image/*" multiple hidden></label></header><div class="photo-grid" id="photoGrid"></div><div id="photoViewer" class="photo-viewer" hidden><button id="closePhoto" aria-label="Close image">×</button><button id="deletePhoto" aria-label="Remove image">remove</button><img id="photoPreview" alt="Selected photo"></div></div>`;
  if (name === "clock") return `<div class="clock-app"><div class="clock-live"><span>local time</span><strong id="liveClock">--:--:--</strong><small id="liveDate"></small></div><div class="clock-tools"><section><h3>stopwatch</h3><output id="stopwatchOutput">00:00.0</output><div><button id="stopwatchStart" class="primary-button">start</button><button id="stopwatchLap" class="soft-button">lap</button><button id="stopwatchReset" class="soft-button">reset</button></div><ol id="stopwatchLaps"></ol></section><section><h3>timer</h3><div class="timer-inputs"><input id="timerMinutes" type="number" min="0" max="999" value="5" aria-label="Timer minutes"><span>min</span><input id="timerSeconds" type="number" min="0" max="59" value="0" aria-label="Timer seconds"><span>sec</span></div><output id="timerOutput">05:00</output><div><button id="timerStart" class="primary-button">start timer</button><button id="timerReset" class="soft-button">reset</button></div></section></div></div>`;
  return `<div class="app-page"><header class="app-page-head"><div><h2>${escapeHtml(appNames[name]||name)}</h2><p>Welcome to zoruneOS.</p></div></header><p>This app is ready to use.</p></div>`;
}
async function loadBrowserScript(src) {
  if (browserScripts.has(src)) return browserScripts.get(src);
  const promise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src;script.onload=resolve;script.onerror=()=>{browserScripts.delete(src);reject(new Error(`Could not load ${src}. Open zoruneos at the address shown in the server terminal and keep the server running.`))};document.head.append(script)});browserScripts.set(src,promise);return promise;
}
async function initBrowser() {
  const host=content.querySelector("#browserHost");const status=content.querySelector("#browserStatus");if(!host)return;
  if(!await browserStorageRecovery){status.textContent="Browser storage is still in use. Close other zoruneOS tabs, then reopen this page.";status.classList.add("browser-error");return;}
  try{const response=await fetch("/api/status",{cache:"no-store"});if(!response.ok)throw new Error("server unavailable");await response.json()}catch{status.textContent="Open zoruneos at the address shown in the server terminal. Live Server cannot provide the Browser connection.";status.classList.add("browser-error");return;}
  if (!browserTabs.length) createBrowserTab(false);
  const form=content.querySelector("#browserForm");const address=content.querySelector("#browserAddress");
  const tabStrip=content.querySelector("#browserTabs");
  function navigate(value){const raw=value.trim();if(!raw)return;let target;try{target=/^https?:\/\//i.test(raw)?raw:/^[\w-]+\.[\w.-]+(?::\d+)?(?:\/.*)?$/.test(raw)?`https://${raw}`:`https://duckduckgo.com/?q=${encodeURIComponent(raw)}`;new URL(target)}catch{target=`https://duckduckgo.com/?q=${encodeURIComponent(raw)}`}navigateBrowserTab(target)}
  form.addEventListener("submit",event=>{event.preventDefault();navigate(address.value)});
  content.querySelectorAll("[data-browser]").forEach(button=>button.addEventListener("click",()=>{
    const tab=getActiveBrowserTab();if(!tab)return;
    if(button.dataset.browser==="home"){tab.url="";tab.title="new tab";if(tab.startPage)tab.startPage.hidden=false;if(tab.frameHolder)tab.frameHolder.hidden=true;renderBrowserTabs();showBrowserTab(tab);return}
    if(!tab.frame)return;
    try{if(button.dataset.browser==="back")tab.frame.frame.contentWindow.history.back();else if(button.dataset.browser==="forward")tab.frame.frame.contentWindow.history.forward();else tab.frame.go(tab.url||address.value)}catch{tab.frame.go(tab.url||address.value)}
  }));
  tabStrip.addEventListener("click",event=>{
    const close=event.target.closest("[data-close-tab]");
    if(close){event.stopPropagation();closeBrowserTab(Number(close.dataset.closeTab));return}
    const tabButton=event.target.closest("[data-tab-id]");if(tabButton)activateBrowserTab(Number(tabButton.dataset.tabId));
  });
  try {
    await loadBrowserScript("/scram/scramjet.all.js");
    await loadBrowserScript("/baremux/index.js");
    if(!browserController){
      const registration=await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller){await new Promise(resolve=>{const timer=setTimeout(resolve,5000);navigator.serviceWorker.addEventListener("controllerchange",()=>{clearTimeout(timer);resolve()},{once:true})})}
      const serviceworker=navigator.serviceWorker.controller||registration.active;
      if(!serviceworker)throw new Error("The browser service worker is not ready yet. Refresh and open Browser again.");
      const {ScramjetController}=window.$scramjetLoadController();
      browserController=new ScramjetController({files:{wasm:"/scram/scramjet.wasm.wasm",all:"/scram/scramjet.all.js",sync:"/scram/scramjet.sync.js"}});
      await browserController.init();
      bareConnection=new window.BareMux.BareMuxConnection("/baremux/worker.js");
      const wispUrl=`${location.protocol==="https:"?"wss":"ws"}://${location.host}/wisp/`;
      await bareConnection.setTransport("/libcurl/index.mjs",[{websocket:wispUrl}]);
    }
    browserTabs.forEach(tab=>mountBrowserTab(tab,host));
    showBrowserTab(getActiveBrowserTab());
    status.hidden=true;
  } catch(error) {
    status.textContent=`Browser setup failed: ${error.message}`;status.classList.add("browser-error");
    if(/object store|transaction/i.test(error.message)){
      const reset=document.createElement("button");reset.type="button";reset.className="browser-reset";reset.textContent="reset browser storage and retry";
      reset.addEventListener("click",async()=>{reset.disabled=true;reset.textContent="resetting…";sessionStorage.setItem(BROWSER_RESET_KEY,"pending");try{const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map(registration=>registration.unregister()))}catch{}location.reload()});
      status.append(document.createElement("br"),reset);
    }
  }
}
function createBrowserTab(activate=true){
  const tab={id:nextBrowserTabId++,title:"new tab",url:"",frame:null,view:null,frameHolder:null,startPage:null};
  browserTabs.push(tab);
  if(activate||!activeBrowserTabId)activeBrowserTabId=tab.id;
  const host=content.querySelector("#browserHost");if(host)mountBrowserTab(tab,host);
  renderBrowserTabs();
  if(activate)showBrowserTab(tab);
  return tab;
}
function getActiveBrowserTab(){return browserTabs.find(tab=>tab.id===activeBrowserTabId)||browserTabs[0]||null}
function activateBrowserTab(id){const tab=browserTabs.find(item=>item.id===id);if(!tab)return;activeBrowserTabId=id;renderBrowserTabs();showBrowserTab(tab)}
function closeBrowserTab(id){const index=browserTabs.findIndex(tab=>tab.id===id);if(index<0)return;const [tab]=browserTabs.splice(index,1);tab.frame?.frame.remove();tab.view?.remove();if(!browserTabs.length)createBrowserTab(false);if(activeBrowserTabId===id)activeBrowserTabId=browserTabs[Math.max(0,index-1)].id;renderBrowserTabs();showBrowserTab(getActiveBrowserTab())}
function renderBrowserTabs(){
  const strip=content.querySelector("#browserTabs");if(!strip)return;
  strip.replaceChildren();
  for(const tab of browserTabs){
    const item=document.createElement("div");item.className=`browser-tab${tab.id===activeBrowserTabId?" active":""}`;item.setAttribute("role","presentation");
    const select=document.createElement("button");select.type="button";select.className="browser-tab-select";select.dataset.tabId=String(tab.id);select.setAttribute("role","tab");select.setAttribute("aria-selected",String(tab.id===activeBrowserTabId));select.textContent=tab.title;
    const close=document.createElement("button");close.type="button";close.className="browser-tab-close";close.dataset.closeTab=String(tab.id);close.setAttribute("aria-label",`Close ${tab.title}`);close.textContent="×";
    item.append(select,close);strip.append(item);
  }
  const add=document.createElement("button");add.type="button";add.className="browser-new-tab";add.dataset.newTab="";add.setAttribute("aria-label","New tab");add.title="New tab";add.textContent="+";strip.append(add);
  add.addEventListener("click",()=>createBrowserTab(true));
}
function mountBrowserTab(tab,host){
  if(tab.view)return;
  const view=document.createElement("div");view.className="browser-tab-view";view.hidden=true;
  const start=document.createElement("section");start.className="browser-start";start.innerHTML=`<div class="browser-start-content"><div class="browser-brand"><span class="browser-brand-mark"><img src="logo.png" alt=""></span><span>zorune</span></div><p class="browser-start-caption">a little space to find your way</p><form class="browser-start-form"><span aria-hidden="true">⌕</span><input type="text" placeholder="Search DuckDuckGo or enter an address" aria-label="Search DuckDuckGo or enter an address"><button type="submit" aria-label="Search">→</button></form><div class="browser-shortcuts" aria-label="Quick links">${[["duckduckgo","search","https://duckduckgo.com"],["youtube","watch","https://youtube.com"],["wikipedia","learn","https://wikipedia.org"],["github","build","https://github.com"],["reddit","explore","https://reddit.com"]].map(([name,label,url])=>`<button type="button" data-browser-url="${url}"><span>${name[0]}</span><small>${label}</small></button>`).join("")}</div><p class="browser-start-note">search with duckduckgo · zorune browser preview</p></div>`;
  const form=start.querySelector("form");form.addEventListener("submit",event=>{event.preventDefault();const input=form.querySelector("input");const shell=content.querySelector("#browserAddress");if(shell)shell.value=input.value;navigateBrowserInput(input.value)});
  start.querySelectorAll("[data-browser-url]").forEach(button=>button.addEventListener("click",()=>navigateBrowserTab(button.dataset.browserUrl)));
  const frameHolder=document.createElement("div");frameHolder.className="browser-frame-holder";frameHolder.hidden=true;
  if(tab.frame)frameHolder.append(tab.frame.frame);
  view.append(start,frameHolder);host.append(view);
  tab.view=view;tab.startPage=start;tab.frameHolder=frameHolder;
}
function showBrowserTab(tab){
  if(!tab)return;
  const host=content.querySelector("#browserHost");if(!host)return;
  browserTabs.forEach(item=>{if(item.view)item.view.hidden=item.id!==tab.id});
  const address=content.querySelector("#browserAddress");if(address)address.value=tab.url||"";
  renderBrowserTabs();
}
function navigateBrowserInput(value){const raw=value.trim();if(!raw)return;let target;try{target=/^https?:\/\//i.test(raw)?raw:/^[\w-]+\.[\w.-]+(?::\d+)?(?:\/.*)?$/.test(raw)?`https://${raw}`:`https://duckduckgo.com/?q=${encodeURIComponent(raw)}`;new URL(target)}catch{target=`https://duckduckgo.com/?q=${encodeURIComponent(raw)}`}navigateBrowserTab(target)}
function navigateBrowserTab(target){
  const tab=getActiveBrowserTab();if(!tab)return;
  tab.url=target;
  try{tab.title=new URL(target).hostname.replace(/^www\./,"")||"new tab"}catch{tab.title="new tab"}
  if(browserController){
    if(!tab.frame){tab.frame=browserController.createFrame();tab.frame.frame.style.width="100%";tab.frame.frame.style.height="100%";tab.frame.frame.style.border="0";tab.frame.frame.title=`zorune browser: ${tab.title}`;tab.frameHolder?.append(tab.frame.frame)}
    if(tab.frameHolder)tab.frameHolder.hidden=false;
    if(tab.startPage)tab.startPage.hidden=true;
    tab.frame.go(target);
  }
  const address=content.querySelector("#browserAddress");if(address)address.value=target;
  renderBrowserTabs();
}
async function resetBrowserStorage(){
  const names=new Set(["$scramjet","EM_FS_/"]);
  try{for(const database of await indexedDB.databases())if(database.name&&(/scramjet/i.test(database.name)||database.name.startsWith("EM_FS_")))names.add(database.name)}catch{}
  await Promise.all([...names].map(name=>new Promise((resolve,reject)=>{
    let timer;
    try{
      const request=indexedDB.deleteDatabase(name);
      request.onsuccess=()=>{clearTimeout(timer);resolve()};
      request.onerror=()=>{clearTimeout(timer);reject(request.error||new Error(`Could not remove ${name}`))};
      request.onblocked=()=>{timer=setTimeout(()=>reject(new Error(`Closing another zoruneOS tab is needed to remove ${name}`)),10000)};
    }catch(error){reject(error)}
  })));
}
const SETTINGS_KEY="zorune-settings";
function localDataKey(key){return activeChatUser?`zorune-account:${activeChatUser.id||activeChatUser.username}:${key}`:key}
function readAppData(key,fallback){try{const value=JSON.parse(localStorage.getItem(localDataKey(key))||"null");return value??fallback}catch{return fallback}}
function writeAppData(key,value){localStorage.setItem(localDataKey(key),JSON.stringify(value))}
function removeAppData(key){localStorage.removeItem(localDataKey(key))}
const defaultSettings={theme:"black",accent:"white",scale:"comfortable",showDate:true,showIcons:true,compactDock:false,reduceMotion:false,highContrast:false,textSize:"normal",volume:70,sounds:false,bootScreen:true,clock24:false};
function readSettings(){try{return{...defaultSettings,...JSON.parse(localStorage.getItem(localDataKey(SETTINGS_KEY))||"{}")}}catch{return{...defaultSettings}}}
function settingCheck(key,label,value){return `<label class="settings-control"><span>${label}<small>Turn this option on or off</small></span><input type="checkbox" data-setting="${key}" ${value?"checked":""}></label>`}
function applySettings(){
  const s=readSettings(),desktop=document.querySelector(".desktop");
  desktop.dataset.theme=s.theme;desktop.dataset.accent=s.accent;desktop.classList.toggle("reduce-motion",s.reduceMotion);desktop.classList.toggle("high-contrast",s.highContrast);desktop.classList.toggle("scale-compact",s.scale==="compact");desktop.classList.toggle("scale-large",s.scale==="large");desktop.classList.toggle("text-large",s.textSize==="large");
  document.querySelector(".desktop-date").hidden=!s.showDate;document.querySelector(".app-area").hidden=!s.showIcons;document.querySelector(".dock").classList.toggle("compact",s.compactDock);
  const boot=document.querySelector("#bootScreen");if(boot&&!document.documentElement.dataset.bootComplete)boot.hidden=!s.bootScreen;
}
function wireSettings(){
  content.querySelectorAll("[data-setting]").forEach(input=>input.addEventListener("change",()=>{
    const s=readSettings();s[input.dataset.setting]=input.type==="checkbox"?input.checked:input.type==="range"?Number(input.value):input.value;localStorage.setItem(localDataKey(SETTINGS_KEY),JSON.stringify(s));applySettings();
  }));
  content.querySelector("#resetSettings").addEventListener("click",()=>{localStorage.setItem(localDataKey(SETTINGS_KEY),JSON.stringify(defaultSettings));applySettings();openApp("settings")});
}
function readJSON(key,fallback){return readAppData(key,fallback)}
function wireNotes(){
  notes=readJSON("zorune-notes-v2",null);
  if(!Array.isArray(notes)){const old=readAppData("zorune-notes","");notes=old?[{id:crypto.randomUUID(),title:"my note",body:old,updated:Date.now()}]:[]}
  if(!notes.length)notes=[{id:crypto.randomUUID(),title:"welcome",body:"This is your private notes space.\n\nCreate a note and start writing.",updated:Date.now()}];
  activeNoteId=notes[0].id;renderNoteList();selectNote(activeNoteId);
  content.querySelector("#newNote").addEventListener("click",()=>{const note={id:crypto.randomUUID(),title:"untitled note",body:"",updated:Date.now()};notes.unshift(note);persistNotes();renderNoteList();selectNote(note.id);content.querySelector("#noteTitle").focus()});
  content.querySelector("#deleteNote").addEventListener("click",()=>{if(!activeNoteId)return;notes=notes.filter(item=>item.id!==activeNoteId);persistNotes();activeNoteId=null;content.querySelector("#noteTitle").value="";content.querySelector("#noteBody").value="";content.querySelector("#noteStatus").textContent="select a note or create a new one";renderNoteList()});
  content.querySelector("#noteSearch").addEventListener("input",renderNoteList);
  ["#noteTitle","#noteBody"].forEach(selector=>content.querySelector(selector).addEventListener("input",()=>{
    const note=notes.find(item=>item.id===activeNoteId);if(!note)return;note.title=content.querySelector("#noteTitle").value||"untitled note";note.body=content.querySelector("#noteBody").value;note.updated=Date.now();persistNotes();renderNoteList();content.querySelector("#noteStatus").textContent="saved just now";
  }));
}
function persistNotes(){writeAppData("zorune-notes-v2",notes);removeAppData("zorune-notes")}
function renderNoteList(){const list=content.querySelector("#noteList");if(!list)return;list.replaceChildren();const query=content.querySelector("#noteSearch").value.toLowerCase(),filtered=notes.filter(item=>(item.title+" "+item.body).toLowerCase().includes(query));if(!filtered.length){const empty=document.createElement("small");empty.className="note-empty";empty.textContent=notes.length?"No matching notes":"No notes yet";list.append(empty)}for(const note of filtered){const button=document.createElement("button");button.className=`note-list-item${note.id===activeNoteId?" active":""}`;button.innerHTML=`<strong>${escapeHtml(note.title||"untitled note")}</strong><small>${escapeHtml((note.body||"empty note").slice(0,52))}</small>`;button.addEventListener("click",()=>selectNote(note.id));list.append(button)}}
function selectNote(id){const note=notes.find(item=>item.id===id);if(!note)return;activeNoteId=id;content.querySelector("#noteTitle").value=note.title;content.querySelector("#noteBody").value=note.body;content.querySelector("#noteStatus").textContent=`edited ${new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(note.updated)}`;renderNoteList()}
function wireFiles(){
  fileFolders=readJSON("zorune-folders",["home","documents","pictures","downloads"]);if(!fileItemsInitialized){fileItemsInitialized=true;if(!fileItems.length)fileItems=[{name:"welcome-to-zoruneos.txt",type:"text/plain",folder:"documents",size:56,text:"Welcome to zoruneOS.\nUse this space to organize your local session."}]}
  renderFileFolders();renderFileList();content.querySelector("#newFolder").addEventListener("click",()=>{const name=prompt("Folder name");if(!name?.trim())return;const safe=name.trim().slice(0,32);if(fileFolders.some(folder=>folder.toLowerCase()===safe.toLowerCase()))return;fileFolders.push(safe);writeAppData("zorune-folders",fileFolders);currentFileFolder=safe;renderFileFolders();renderFileList()});
  content.querySelector("#fileUpload").addEventListener("change",event=>{for(const file of event.target.files)fileItems.push({name:file.name,type:file.type||"application/octet-stream",folder:currentFileFolder,size:file.size,file,url:URL.createObjectURL(file)});renderFileList();event.target.value=""});
  content.querySelector("#fileSearch").addEventListener("input",renderFileList);content.querySelector("#fileSort").addEventListener("change",renderFileList);
}
function renderFileFolders(){const rail=content.querySelector("#fileFolders");if(!rail)return;rail.replaceChildren();for(const folder of fileFolders){const button=document.createElement("button");button.className=folder===currentFileFolder?"active":"";button.textContent=`▰  ${folder}`;button.addEventListener("click",()=>{currentFileFolder=folder;renderFileFolders();renderFileList()});rail.append(button)}}
function renderFileList(){const list=content.querySelector("#fileList");if(!list)return;list.replaceChildren();const q=content.querySelector("#fileSearch").value.toLowerCase();const sort=content.querySelector("#fileSort").value;const entries=fileItems.filter(item=>item.folder===currentFileFolder&&item.name.toLowerCase().includes(q)).sort((a,b)=>(a[sort]||a.name).localeCompare(b[sort]||b.name));if(!entries.length){const empty=document.createElement("div");empty.className="empty-state";empty.innerHTML="<strong>nothing here yet</strong><span>Upload a file or choose another folder.</span>";list.append(empty);return}for(const item of entries){const row=document.createElement("div");row.className="file-entry";const icon=document.createElement("span");icon.className="file-entry-icon";icon.textContent=item.type.startsWith("image/")?"▧":item.type.startsWith("audio/")?"♫":"▤";const name=document.createElement("button");name.textContent=item.name;name.addEventListener("click",()=>openFileItem(item));const size=document.createElement("small");size.textContent=formatBytes(item.size);const remove=document.createElement("button");remove.className="file-remove";remove.setAttribute("aria-label",`Remove ${item.name}`);remove.textContent="×";remove.addEventListener("click",()=>{if(item.url)URL.revokeObjectURL(item.url);fileItems=fileItems.filter(entry=>entry!==item);renderFileList()});row.append(icon,name,size,remove);list.append(row)}}
function openFileItem(item){if(item.url){window.open(item.url,"_blank","noopener");return}const blob=new Blob([item.text||""],{type:item.type});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=item.name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}
function wirePaint(){const canvas=content.querySelector("#paintCanvas"),ctx=canvas.getContext("2d"),wrap=content.querySelector(".paint-canvas-wrap");let drawing=false,last=null,history=[];function resize(){const old=document.createElement("canvas");old.width=canvas.width;old.height=canvas.height;if(old.width&&old.height)old.getContext("2d").drawImage(canvas,0,0);const rect=wrap.getBoundingClientRect();canvas.width=Math.max(1,Math.floor(rect.width));canvas.height=Math.max(1,Math.floor(rect.height));ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);if(old.width&&old.height)ctx.drawImage(old,0,0,canvas.width,canvas.height)}resize();new ResizeObserver(resize).observe(wrap);canvas.addEventListener("pointerdown",event=>{drawing=true;canvas.setPointerCapture(event.pointerId);history.push(ctx.getImageData(0,0,canvas.width,canvas.height));history=history.slice(-12);const r=canvas.getBoundingClientRect();last={x:event.clientX-r.left,y:event.clientY-r.top};ctx.beginPath();ctx.moveTo(last.x,last.y)});canvas.addEventListener("pointermove",event=>{if(!drawing)return;const r=canvas.getBoundingClientRect(),point={x:event.clientX-r.left,y:event.clientY-r.top};ctx.strokeStyle=content.querySelector("#paintColor").value;ctx.lineWidth=Number(content.querySelector("#paintSize").value);ctx.lineCap="round";ctx.lineJoin="round";ctx.lineTo(point.x,point.y);ctx.stroke();last=point});canvas.addEventListener("pointerup",()=>{drawing=false;last=null});content.querySelector("#paintUndo").addEventListener("click",()=>{const image=history.pop();if(image)ctx.putImageData(image,0,0)});content.querySelector("#paintClear").addEventListener("click",()=>{history.push(ctx.getImageData(0,0,canvas.width,canvas.height));ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height)});content.querySelector("#paintSave").addEventListener("click",()=>{const link=document.createElement("a");link.download="zorune-drawing.png";link.href=canvas.toDataURL("image/png");link.click()})}
function wireTerminal(){const output=content.querySelector("#terminalOutput"),input=content.querySelector("#terminalInput");content.querySelector("#terminalForm").addEventListener("submit",event=>{event.preventDefault();const line=input.value.trim();if(!line)return;const echo=document.createElement("p");echo.className="terminal-command";echo.textContent=`z> ${line}`;output.append(echo);input.value="";const [command,...args]=line.split(/\s+/),responses={help:"Commands: help, about, apps, date, clear, echo <text>, open <app>",about:"zoruneOS desktop preview — browser based and local to this device.",apps:appCatalog.map(app=>app.name).join(" · "),date:new Date().toString()};if(command==="clear")output.replaceChildren();else if(command==="echo")terminalLine(output,args.join(" "));else if(command==="open"){const app=appCatalog.find(item=>item.id===args.join(" ").toLowerCase());terminalLine(output,app?`Opening ${app.name}…`:"App not found. Type apps to list apps.");if(app)setTimeout(()=>openApp(app.id),150)}else terminalLine(output,responses[command]||"Unknown command. Type help.");output.scrollTop=output.scrollHeight})}
function terminalLine(output,text){const p=document.createElement("p");p.textContent=text;output.append(p)}
function wireCamera(){const video=content.querySelector("#cameraVideo"),message=content.querySelector("#cameraMessage"),empty=content.querySelector("#cameraEmpty"),start=content.querySelector("#startCamera"),snap=content.querySelector("#takePhoto"),stop=content.querySelector("#stopCamera");video.hidden=true;start.addEventListener("click",async()=>{try{if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access is unavailable in this browser.");cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});video.srcObject=cameraStream;video.hidden=false;empty.hidden=true;message.textContent="Camera is live. Take a photo to download a snapshot.";start.disabled=true;snap.disabled=false;stop.disabled=false}catch(error){message.textContent=error.name==="NotAllowedError"?"Camera permission was denied. Allow camera access in your browser settings and try again.":error.message||"No camera was found or the camera is busy."}});snap.addEventListener("click",()=>{if(!video.videoWidth)return;const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext("2d").drawImage(video,0,0);const link=document.createElement("a");link.download=`zorune-photo-${Date.now()}.png`;link.href=canvas.toDataURL("image/png");link.click()});stop.addEventListener("click",stopCamera);}
function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null}const video=content.querySelector("#cameraVideo");if(video){video.srcObject=null;video.hidden=true}const empty=content.querySelector("#cameraEmpty");if(empty)empty.hidden=false;const start=content.querySelector("#startCamera"),snap=content.querySelector("#takePhoto"),stop=content.querySelector("#stopCamera");if(start)start.disabled=false;if(snap)snap.disabled=true;if(stop)stop.disabled=true}
function wireTasks(){tasks=readJSON("zorune-tasks",[]);let filter="all";const persist=()=>writeAppData("zorune-tasks",tasks);const render=()=>{const list=content.querySelector("#taskList");list.replaceChildren();const visible=tasks.filter(task=>filter==="all"||Boolean(task.done)===(filter==="done"));content.querySelector("#taskCount").textContent=`${tasks.filter(task=>!task.done).length} open`;if(!visible.length){const empty=document.createElement("div");empty.className="empty-state";empty.innerHTML="<strong>you’re all clear</strong><span>Add a task whenever you need a reminder.</span>";list.append(empty)}for(const task of visible){const row=document.createElement("div");row.className=`task-row${task.done?" done":""}`;const check=document.createElement("input");check.type="checkbox";check.checked=task.done;check.setAttribute("aria-label",`Complete ${task.text}`);check.addEventListener("change",()=>{task.done=check.checked;persist();render()});const text=document.createElement("span");text.textContent=task.text;const del=document.createElement("button");del.textContent="×";del.setAttribute("aria-label",`Delete ${task.text}`);del.addEventListener("click",()=>{tasks=tasks.filter(item=>item.id!==task.id);persist();render()});row.append(check,text,del);list.append(row)}};content.querySelector("#taskForm").addEventListener("submit",event=>{event.preventDefault();const input=content.querySelector("#taskInput"),text=input.value.trim();if(!text)return;tasks.unshift({id:crypto.randomUUID(),text,done:false,created:Date.now()});input.value="";persist();render();input.focus()});content.querySelectorAll("[data-task-filter]").forEach(button=>button.addEventListener("click",()=>{filter=button.dataset.taskFilter;content.querySelectorAll("[data-task-filter]").forEach(item=>item.classList.toggle("active",item===button));render()}));render()}
function wirePhotos(){const input=content.querySelector("#photoUpload"),grid=content.querySelector("#photoGrid"),viewer=content.querySelector("#photoViewer");let selected=null;const render=()=>{grid.replaceChildren();for(const item of photoItems){const tile=document.createElement("button");tile.className="photo-tile";const image=document.createElement("img");image.src=item.url;image.alt=item.name;const label=document.createElement("span");label.textContent=item.name;tile.append(image,label);tile.addEventListener("click",()=>{selected=item;content.querySelector("#photoPreview").src=item.url;viewer.hidden=false});grid.append(tile)}if(!photoItems.length){const empty=document.createElement("div");empty.className="empty-state";empty.innerHTML="<strong>your gallery starts here</strong><span>Import a few images from your device.</span>";grid.append(empty)}};input.addEventListener("change",()=>{for(const file of input.files)photoItems.push({name:file.name,url:URL.createObjectURL(file)});render();input.value=""});content.querySelector("#closePhoto").addEventListener("click",()=>viewer.hidden=true);content.querySelector("#deletePhoto").addEventListener("click",()=>{if(selected){URL.revokeObjectURL(selected.url);photoItems=photoItems.filter(item=>item!==selected);selected=null;viewer.hidden=true;render()}});viewer.addEventListener("click",event=>{if(event.target===viewer)viewer.hidden=true});render()}
function wireCalendar(){currentCalendarDate=new Date(selectedCalendarDate);const events=readJSON("zorune-events",[]);content.querySelector("#calendarPrev").addEventListener("click",()=>{currentCalendarDate=new Date(currentCalendarDate.getFullYear(),currentCalendarDate.getMonth()-1,1);renderCalendar()});content.querySelector("#calendarNext").addEventListener("click",()=>{currentCalendarDate=new Date(currentCalendarDate.getFullYear(),currentCalendarDate.getMonth()+1,1);renderCalendar()});content.querySelector("#calendarToday").addEventListener("click",()=>{currentCalendarDate=new Date();selectedCalendarDate=new Date();renderCalendar()});content.querySelector("#newEvent").addEventListener("click",()=>{const form=content.querySelector("#eventForm");form.hidden=!form.hidden;content.querySelector("#eventDate").value=dateKey(selectedCalendarDate)});content.querySelector("#eventForm").addEventListener("submit",event=>{event.preventDefault();events.push({id:crypto.randomUUID(),title:content.querySelector("#eventTitle").value.trim(),date:content.querySelector("#eventDate").value});writeAppData("zorune-events",events);content.querySelector("#eventTitle").value="";content.querySelector("#eventForm").hidden=true;renderCalendar()});function renderCalendar(){const year=currentCalendarDate.getFullYear(),month=currentCalendarDate.getMonth(),first=new Date(year,month,1),days=new Date(year,month+1,0).getDate(),grid=content.querySelector("#calendarGrid");content.querySelector("#calendarMonth").textContent=new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(first);grid.replaceChildren();for(const day of ["sun","mon","tue","wed","thu","fri","sat"]){const label=document.createElement("span");label.className="calendar-weekday";label.textContent=day;grid.append(label)}for(let i=0;i<first.getDay();i++)grid.append(document.createElement("span"));for(let day=1;day<=days;day++){const date=new Date(year,month,day),key=dateKey(date),button=document.createElement("button");button.className=`calendar-day${key===dateKey(selectedCalendarDate)?" selected":""}${key===dateKey(new Date())?" today":""}`;button.textContent=String(day);if(events.some(item=>item.date===key))button.dataset.events="true";button.addEventListener("click",()=>{selectedCalendarDate=date;renderCalendar()});grid.append(button)}content.querySelector("#selectedDayTitle").textContent=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(selectedCalendarDate);const list=content.querySelector("#eventList");list.replaceChildren();const found=events.filter(item=>item.date===dateKey(selectedCalendarDate));if(!found.length){const empty=document.createElement("p");empty.className="empty-subtle";empty.textContent="No events for this day.";list.append(empty)}for(const item of found){const row=document.createElement("div");row.className="calendar-event";const title=document.createElement("span");title.textContent=item.title;const remove=document.createElement("button");remove.textContent="×";remove.setAttribute("aria-label",`Remove ${item.title}`);remove.addEventListener("click",()=>{const index=events.findIndex(entry=>entry.id===item.id);if(index>=0)events.splice(index,1);writeAppData("zorune-events",events);renderCalendar()});row.append(title,remove);list.append(row)}}renderCalendar()}
function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`}
function wireClock(){const live=content.querySelector("#liveClock"),date=content.querySelector("#liveDate"),sw=content.querySelector("#stopwatchOutput"),timer=content.querySelector("#timerOutput"),timerButton=content.querySelector("#timerStart");let stopwatchRunning=stopwatchStartedAt>0;function tick(){const now=new Date();live.textContent=new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!readSettings().clock24}).format(now);date.textContent=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(now);const elapsed=stopwatchElapsed+(stopwatchRunning?Date.now()-stopwatchStartedAt:0);sw.textContent=formatStopwatch(elapsed);const remaining=timerFinished?0:timerEndsAt?Math.max(0,timerEndsAt-Date.now()):timerRemaining||timerInitial||300000;timer.textContent=formatCountdown(remaining);if(timerEndsAt&&!remaining){timerFinished=true;timerEndsAt=0;timerRemaining=0;clearInterval(timerTicker);timerTicker=null;timerButton.textContent="start timer";document.title="timer finished · zoruneos";alert("Your timer is done.")}}tick();clockTimer=setInterval(tick,200);content.querySelector("#stopwatchStart").textContent=stopwatchRunning?"pause":"start";content.querySelector("#stopwatchStart").addEventListener("click",()=>{if(stopwatchRunning){stopwatchElapsed+=Date.now()-stopwatchStartedAt;stopwatchStartedAt=0;stopwatchRunning=false}else{stopwatchStartedAt=Date.now();stopwatchRunning=true}content.querySelector("#stopwatchStart").textContent=stopwatchRunning?"pause":"start"});content.querySelector("#stopwatchReset").addEventListener("click",()=>{stopwatchRunning=false;stopwatchStartedAt=0;stopwatchElapsed=0;content.querySelector("#stopwatchStart").textContent="start";content.querySelector("#stopwatchLaps").replaceChildren()});content.querySelector("#stopwatchLap").addEventListener("click",()=>{const lap=document.createElement("li");lap.textContent=sw.textContent;content.querySelector("#stopwatchLaps").prepend(lap)});timerButton.textContent=timerEndsAt?"pause timer":timerRemaining?"resume timer":"start timer";timerButton.addEventListener("click",()=>{if(timerEndsAt){timerRemaining=Math.max(0,timerEndsAt-Date.now());timerEndsAt=0;clearInterval(timerTicker);timerTicker=null;timerButton.textContent="resume timer";timer.textContent=formatCountdown(timerRemaining);return}if(!timerRemaining){timerInitial=(Math.max(0,Number(content.querySelector("#timerMinutes").value))*60+Math.max(0,Number(content.querySelector("#timerSeconds").value)))*1000;timerRemaining=timerInitial}if(!timerRemaining)return;timerFinished=false;timerEndsAt=Date.now()+timerRemaining;timerRemaining=0;timerButton.textContent="pause timer";if(!timerTicker)timerTicker=setInterval(()=>{if(!timerEndsAt){clearInterval(timerTicker);timerTicker=null;return}const left=Math.max(0,timerEndsAt-Date.now()),output=document.querySelector("#timerOutput");if(output)output.textContent=formatCountdown(left);if(left===0){timerFinished=true;timerEndsAt=0;timerRemaining=0;clearInterval(timerTicker);timerTicker=null;const button=document.querySelector("#timerStart");if(button)button.textContent="start timer";alert("Your timer is done.")}},250)});content.querySelector("#timerReset").addEventListener("click",()=>{timerFinished=false;timerEndsAt=0;timerRemaining=0;clearInterval(timerTicker);timerTicker=null;timerInitial=(Math.max(0,Number(content.querySelector("#timerMinutes").value))*60+Math.max(0,Number(content.querySelector("#timerSeconds").value)))*1000;timer.textContent=formatCountdown(timerInitial);timerButton.textContent="start timer"})}
function formatStopwatch(ms){const tenth=Math.floor(ms/100)%10,seconds=Math.floor(ms/1000)%60,minutes=Math.floor(ms/60000);return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${tenth}`}
function formatCountdown(ms){const seconds=Math.ceil(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`}
function stopMovies(){const player=content.querySelector("#moviePlayer");if(player){player.pause();player.removeAttribute("src");player.load()}if(movieObjectUrl){URL.revokeObjectURL(movieObjectUrl);movieObjectUrl=null}}
function wireMovies(){
  const player=content.querySelector("#moviePlayer"),empty=content.querySelector("#movieEmpty"),playerStatus=content.querySelector("#movieStatus"),urlInput=content.querySelector("#movieUrl"),recents=readJSON("zorune-movie-links",[]),apiStatus=content.querySelector("#movieApiStatus"),results=content.querySelector("#movieResults"),details=content.querySelector("#movieDetails");
  function showPlayerStatus(message){playerStatus.textContent=message}
  function renderRecents(){const list=content.querySelector("#movieRecents");list.replaceChildren();if(!recents.length){const note=document.createElement("small");note.textContent="links you play will show up here";list.append(note);return}for(const url of recents){const button=document.createElement("button");button.type="button";button.className="movie-recent-link";button.textContent=url.replace(/^https?:\/\//,"").slice(0,58);button.title=url;button.addEventListener("click",()=>{urlInput.value=url;playLink(url)});list.append(button)}}
  function playLink(value){let parsed;try{parsed=new URL(value)}catch{showPlayerStatus("enter a complete video link, including https://");return}if(!["http:","https:"].includes(parsed.protocol)){showPlayerStatus("only http and https video links are supported");return}stopMovies();empty.hidden=true;player.hidden=false;player.src=parsed.href;player.load();showPlayerStatus("loading video…");if(!recents.includes(parsed.href)){recents.unshift(parsed.href);recents.splice(12);writeAppData("zorune-movie-links",recents);renderRecents()}player.play().catch(()=>showPlayerStatus("video is ready — press play if it did not start automatically"))}
  function setMovieTab(tab){const browse=tab==="browse";content.querySelector("#movieBrowse").hidden=!browse;content.querySelector("#moviePlayerPanel").hidden=browse;content.querySelectorAll("[data-movie-tab]").forEach(button=>button.classList.toggle("active",button.dataset.movieTab===tab))}
  content.querySelectorAll("[data-movie-tab]").forEach(button=>button.addEventListener("click",()=>setMovieTab(button.dataset.movieTab)));
  content.querySelector("#movieForm").addEventListener("submit",event=>{event.preventDefault();playLink(urlInput.value.trim())});
  content.querySelector("#movieUpload").addEventListener("change",event=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith("video/")&&!/\.(mp4|webm|ogv|mov|m4v)$/i.test(file.name)){showPlayerStatus("choose a video file such as MP4 or WebM");event.target.value="";return}stopMovies();movieObjectUrl=URL.createObjectURL(file);empty.hidden=true;player.hidden=false;player.src=movieObjectUrl;player.load();showPlayerStatus("ready · "+file.name);player.play().catch(()=>{});event.target.value=""});
  player.addEventListener("loadedmetadata",()=>{const d=Number.isFinite(player.duration)?Math.floor(player.duration/60)+":"+String(Math.floor(player.duration%60)).padStart(2,"0"):"stream";showPlayerStatus("ready · "+d)});player.addEventListener("error",()=>showPlayerStatus("could not play this source — use a direct browser-playable video link, not a watch page or DRM stream"));player.addEventListener("ended",()=>showPlayerStatus("playback finished"));renderRecents();
  function showSetup(){apiStatus.replaceChildren();const message=document.createElement("span");message.textContent="To connect TMDB, create an API Read Access Token and set TMDB_READ_ACCESS_TOKEN in the VS Code terminal before starting the server.";const link=document.createElement("a");link.href="https://developer.themoviedb.org/docs/getting-started";link.target="_blank";link.rel="noopener";link.textContent="TMDB setup guide";apiStatus.append(message,link)}
  function showMovieDetails(movie){details.replaceChildren();if(movie.backdrop_path){const backdrop=document.createElement("img");backdrop.className="movie-backdrop";backdrop.src="/api/tmdb/image?path="+encodeURIComponent(movie.backdrop_path);backdrop.alt="";details.append(backdrop)}const title=document.createElement("h3");title.textContent=movie.title||movie.name||"Untitled";const meta=document.createElement("small");meta.textContent=[movie.release_date?.slice(0,4),Number.isFinite(movie.vote_average)?"TMDB ★ "+movie.vote_average.toFixed(1):""].filter(Boolean).join(" · ");const overview=document.createElement("p");overview.textContent=movie.overview||"No overview is available.";const actions=document.createElement("div");actions.className="movie-detail-actions";const source=document.createElement("a");source.href="https://www.themoviedb.org/movie/"+encodeURIComponent(movie.id);source.target="_blank";source.rel="noopener";source.textContent="view on TMDB";const play=document.createElement("button");play.type="button";play.className="soft-button";play.textContent="open player";play.addEventListener("click",()=>setMovieTab("player"));actions.append(source,play);details.append(title,meta,overview,actions)}
  function renderMovieResults(movies){results.replaceChildren();if(!movies.length){const note=document.createElement("p");note.className="movie-no-results";note.textContent="No movies found. Try another title.";results.append(note);return}for(const movie of movies){const card=document.createElement("button");card.type="button";card.className="movie-card";card.setAttribute("aria-label",(movie.title||movie.name||"Movie")+(movie.release_date?", "+movie.release_date.slice(0,4):""));if(movie.poster_path){const poster=document.createElement("img");poster.loading="lazy";poster.alt="";poster.src="/api/tmdb/image?path="+encodeURIComponent(movie.poster_path);card.append(poster)}else{const poster=document.createElement("span");poster.className="movie-poster-placeholder";poster.textContent="no poster";card.append(poster)}const title=document.createElement("strong");title.textContent=movie.title||movie.name||"Untitled";const meta=document.createElement("small");meta.textContent=[movie.release_date?.slice(0,4),Number.isFinite(movie.vote_average)?"★ "+movie.vote_average.toFixed(1):""].filter(Boolean).join(" · ");card.append(title,meta);card.addEventListener("click",()=>showMovieDetails(movie));results.append(card)}}
  async function loadCatalog(path,label){apiStatus.textContent=label;results.replaceChildren();try{const response=await fetch(path,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error||"TMDB request failed.");renderMovieResults(Array.isArray(data.results)?data.results:[]);apiStatus.textContent=(data.total_results??data.results?.length??0)+" results from TMDB"}catch(error){apiStatus.textContent=error.message;results.replaceChildren()}}
  content.querySelector("#movieSearchForm").addEventListener("submit",event=>{event.preventDefault();const query=content.querySelector("#movieSearchQuery").value.trim();if(query)loadCatalog("/api/tmdb/search?query="+encodeURIComponent(query),"Searching TMDB…")});content.querySelector("#movieTrending").addEventListener("click",()=>loadCatalog("/api/tmdb/trending?window=week","Loading trending movies…"));
  fetch("/api/tmdb/config",{cache:"no-store"}).then(response=>response.json()).then(config=>{if(!config.configured){showSetup();return}loadCatalog("/api/tmdb/trending?window=week","Loading trending movies…")}).catch(()=>{apiStatus.textContent="Could not reach the zoruneOS server."});
}
const creatorStarter={name:"my zorune app",html:"<main class=\"card\">\n  <span class=\"eyebrow\">MY FIRST APP</span>\n  <h1>Hello, zorune.</h1>\n  <p>Change the code and see your app update.</p>\n  <button id=\"helloButton\">say hello</button>\n  <p id=\"message\" aria-live=\"polite\"></p>\n</main>",css:"* { box-sizing: border-box; }\nbody { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #080808; color: #f5f5f5; font: 16px system-ui, sans-serif; }\n.card { width: min(100%, 440px); padding: 32px; border: 1px solid #303030; border-radius: 16px; background: #111; }\n.eyebrow { color: #aaa; font-size: 11px; letter-spacing: .16em; }\nh1 { margin: 12px 0; font-size: 36px; }\np { color: #aaa; line-height: 1.6; }\nbutton { padding: 10px 15px; border: 0; border-radius: 8px; background: #f4f4f4; color: #111; font: inherit; cursor: pointer; }",js:"document.querySelector('#helloButton').addEventListener('click', () => {\n  document.querySelector('#message').textContent = 'Your app is working.';\n});"};
function wireAppCreator(){
  const root=content.querySelector(".app-creator"),nameInput=content.querySelector("#creatorName"),htmlInput=content.querySelector("#creatorHtml"),cssInput=content.querySelector("#creatorCss"),jsInput=content.querySelector("#creatorJs"),frame=content.querySelector("#creatorFrame"),status=content.querySelector("#creatorPreviewStatus"),saved=content.querySelector("#creatorSaved");
  const draft=readJSON("zorune-app-creator-draft",creatorStarter);nameInput.value=draft.name||creatorStarter.name;htmlInput.value=draft.html??creatorStarter.html;cssInput.value=draft.css??creatorStarter.css;jsInput.value=draft.js??creatorStarter.js;
  function documentSource(){const safeTitle=(nameInput.value||"my zorune app").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));const css=cssInput.value.replace(/<\/style/gi,"<\\/style"),js=jsInput.value.replace(/<\/script/gi,"<\\/script");return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>${css}</style></head><body>${htmlInput.value}<script>window.addEventListener('error',event=>parent.postMessage({type:'zorune-app-error',message:event.message},'*'));<\/script><script>${js}<\/script></body></html>`}
  function run(){frame.srcdoc=documentSource();status.textContent="updating preview…";clearTimeout(creatorPreviewTimer);creatorPreviewTimer=setTimeout(()=>{if(status.isConnected)status.textContent="preview ready"},500)}
  function save(){try{writeAppData("zorune-app-creator-draft",{name:nameInput.value,html:htmlInput.value,css:cssInput.value,js:jsInput.value});saved.textContent="draft saved on this device"}catch{saved.textContent="could not save draft · download your app to keep it"}clearTimeout(creatorPreviewTimer);creatorPreviewTimer=setTimeout(run,220)}
  root.querySelectorAll("[data-creator-tab]").forEach(button=>button.addEventListener("click",()=>{root.querySelectorAll("[data-creator-tab]").forEach(tab=>{const active=tab===button;tab.classList.toggle("active",active);tab.setAttribute("aria-selected",String(active))});root.querySelectorAll("[data-creator-pane]").forEach(pane=>pane.hidden=pane.dataset.creatorPane!==button.dataset.creatorTab)}));
  [nameInput,htmlInput,cssInput,jsInput].forEach(input=>input.addEventListener("input",save));root.querySelectorAll("[data-creator-pane]").forEach(pane=>pane.addEventListener("keydown",event=>{if(event.key==="Tab"){event.preventDefault();const start=pane.selectionStart,end=pane.selectionEnd;pane.setRangeText("  ",start,end,"end");pane.dispatchEvent(new Event("input",{bubbles:true}))}}));
  content.querySelector("#creatorRun").addEventListener("click",run);content.querySelector("#creatorViewport").addEventListener("change",event=>frame.classList.toggle("mobile",event.target.value==="mobile"));
  content.querySelector("#creatorReset").addEventListener("click",()=>{if(!confirm("Start a new project and replace the saved draft?"))return;nameInput.value=creatorStarter.name;htmlInput.value=creatorStarter.html;cssInput.value=creatorStarter.css;jsInput.value=creatorStarter.js;save();run()});
  content.querySelector("#creatorDownload").addEventListener("click",()=>{const blob=new Blob([documentSource()],{type:"text/html;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a"),base=(nameInput.value||"zorune-app").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"zorune-app";link.href=url;link.download=`${base}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500)});
  if(creatorMessageListener)window.removeEventListener("message",creatorMessageListener);creatorMessageListener=event=>{if(event.source===frame.contentWindow&&event.data?.type==="zorune-app-error")status.textContent=`preview error · ${String(event.data.message).slice(0,90)}`};window.addEventListener("message",creatorMessageListener);run();
}
function wireMusic() {
  const input = content.querySelector("#musicFiles");
  input.addEventListener("change", () => {
    for (const file of input.files) tracks.push({name:file.name, url:URL.createObjectURL(file), size:file.size});
    if (tracks.length && currentTrack < 0) currentTrack = 0;
    renderTracks();
  });
  content.querySelector("#audioPlayer").addEventListener("ended", () => playTrack((currentTrack + 1) % tracks.length));
  content.querySelector("#prevTrack").addEventListener("click",()=>playTrack(currentTrack-1));
  content.querySelector("#nextTrack").addEventListener("click",()=>playTrack(currentTrack+1));
  content.querySelector("#playPause").addEventListener("click",()=>{const audio=content.querySelector("#audioPlayer");if(!audio.src&&tracks.length)playTrack(currentTrack<0?0:currentTrack);else if(audio.paused)audio.play().catch(()=>{});else audio.pause();content.querySelector("#playPause").textContent=audio.paused?"play":"pause"});
  const audio=content.querySelector("#audioPlayer");audio.volume=readSettings().volume/100;audio.addEventListener("play",()=>content.querySelector("#playPause").textContent="pause");audio.addEventListener("pause",()=>content.querySelector("#playPause").textContent="play");
  content.querySelector("#musicVolume").value=String(readSettings().volume);content.querySelector("#musicVolume").addEventListener("input",event=>{audio.volume=Number(event.target.value)/100});
  renderTracks();
}
function renderTracks() {
  const list = content.querySelector("#trackList");
  if (!list) return;
  list.replaceChildren();
  if (!tracks.length) { const empty=document.createElement("div"); empty.className="track-empty"; empty.textContent="Add audio files to build your playlist."; list.append(empty);currentTrack=-1;const audio=content.querySelector("#audioPlayer");if(audio){audio.pause();audio.removeAttribute("src");audio.load()}const title=content.querySelector("#trackTitle"),detail=content.querySelector("#trackDetail");if(title)title.textContent="no track selected";if(detail)detail.textContent="your files stay on this device";return; }
  tracks.forEach((track,index) => {
    const row=document.createElement("div"); row.className=`track-row${index===currentTrack?" active":""}`;
    const button=document.createElement("button"); button.type="button"; button.textContent=track.name; button.addEventListener("click",()=>playTrack(index));
    const size=document.createElement("span"); size.textContent=formatBytes(track.size);
    const remove=document.createElement("button");remove.className="track-remove";remove.textContent="×";remove.setAttribute("aria-label",`Remove ${track.name}`);remove.addEventListener("click",()=>{URL.revokeObjectURL(track.url);tracks.splice(index,1);if(currentTrack>=tracks.length)currentTrack=tracks.length-1;renderTracks()});
    row.append(button,size,remove); list.append(row);
  });
  if (currentTrack >= 0) {
    const track=tracks[currentTrack];
    content.querySelector("#trackTitle").textContent=track.name;
    content.querySelector("#trackDetail").textContent=`track ${currentTrack+1} of ${tracks.length}`;
    const audio=content.querySelector("#audioPlayer");
    if (audio.src !== track.url) { audio.src=track.url; audio.load(); }
    audio.volume=Number(content.querySelector("#musicVolume")?.value||80)/100;
  }
  const audio=content.querySelector("#audioPlayer"),play=content.querySelector("#playPause");if(audio&&play)play.textContent=audio.paused?"play":"pause";
}
function playTrack(index) { if (!tracks.length) return; currentTrack=(index+tracks.length)%tracks.length; renderTracks(); const audio=content.querySelector("#audioPlayer"); audio.play().catch(()=>{}); }
function formatBytes(bytes) { if (!bytes) return "0 B"; const units=["B","KB","MB","GB"];const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3);return `${(bytes/1024**i).toFixed(i?1:0)} ${units[i]}`; }
async function apiRequest(url, options = {}) {
  const headers = { ...(options.body ? {"Content-Type":"application/json"} : {}), ...(options.headers || {}) };
  const response = await fetch(url, { credentials:"same-origin", ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.error || `Request failed (${response.status}).`); error.status=response.status; throw error; }
  return result;
}
const walkApps=["browser","messages","files","music","games","movies","appCreator","settings","paint"];
let selectedWalkApps=["browser","messages","files","settings"];
let gateFormValues={};
function showAccountGate(step="auth",errorText=""){
  accountGate.hidden=false;accountGate.dataset.step=step;
  const statusMessage=errorText?`<p class="gate-error" role="alert">${escapeHtml(errorText)}</p>`:"";
  if(step==="walkthrough"){
    accountGateContent.innerHTML=`<div class="gate-brand"><img src="logo.png" alt=""><span>zoruneos</span></div><p class="gate-kicker">a quick start</p><h1>make this space yours</h1><p class="gate-copy">Choose a few apps to pin near the top of your launcher. You can change them any time.</p><div class="walk-app-grid">${walkApps.map(id=>`<label><input type="checkbox" value="${id}" ${selectedWalkApps.includes(id)?"checked":""}><span>${escapeHtml(appNames[id])}</span></label>`).join("")}</div><div class="gate-actions"><button class="soft-button" id="walkSkip">skip for now</button><button class="primary-button" id="walkContinue">continue <span>→</span></button></div><button class="gate-switch" id="continueAsGuest">continue as guest</button><div class="gate-steps"><i class="active"></i><i></i><i></i></div>`;
    accountGateContent.querySelectorAll(".walk-app-grid input").forEach(input=>input.addEventListener("change",()=>{selectedWalkApps=[...accountGateContent.querySelectorAll(".walk-app-grid input:checked")].map(item=>item.value)}));
    accountGateContent.querySelector("#walkContinue").addEventListener("click",()=>showAccountGate("terms"));
    accountGateContent.querySelector("#walkSkip").addEventListener("click",()=>{selectedWalkApps=["browser","messages","files","settings"];showAccountGate("terms")});
    accountGateContent.querySelector("#continueAsGuest").addEventListener("click",enterGuestDesktop);
    return;
  }
  if(step==="terms"){
    accountGateContent.innerHTML=`<div class="gate-brand"><img src="logo.png" alt=""><span>zoruneos</span></div><p class="gate-kicker">before you begin</p><h1>your account, your space</h1><p class="gate-copy">Please review the service terms and how zoruneOS handles account, profile, chat, and Browser data.</p><div class="policy-links"><a href="/terms.html" target="_blank" rel="noreferrer">read terms of service ↗</a><a href="/privacy.html" target="_blank" rel="noreferrer">read privacy policy ↗</a></div><label class="policy-accept"><input id="policyAccept" type="checkbox"><span>I agree to the <a href="/terms.html" target="_blank" rel="noreferrer">terms</a> and have read the <a href="/privacy.html" target="_blank" rel="noreferrer">privacy policy</a>.</span></label>${statusMessage}<div class="gate-actions"><button class="soft-button" id="termsBack">back</button><button class="primary-button" id="termsContinue" disabled>continue <span>→</span></button></div><button class="gate-switch" id="continueAsGuest">continue as guest</button><div class="gate-steps"><i class="active"></i><i class="active"></i><i></i></div>`;
    const agree=accountGateContent.querySelector("#policyAccept"),next=accountGateContent.querySelector("#termsContinue");agree.addEventListener("change",()=>next.disabled=!agree.checked);next.addEventListener("click",()=>{if(agree.checked){localStorage.setItem("zorune-walkthrough-done","yes");accountGateMode="register";showAccountGate("auth")}});accountGateContent.querySelector("#termsBack").addEventListener("click",()=>showAccountGate(localStorage.getItem("zorune-walkthrough-done")==="yes"?"auth":"walkthrough"));accountGateContent.querySelector("#continueAsGuest").addEventListener("click",enterGuestDesktop);return;
  }
  const registering=accountGateMode==="register";
  accountGateContent.innerHTML=`<div class="gate-brand"><img src="logo.png" alt=""><span>zoruneos</span></div><p class="gate-kicker">${registering?"create your account":"welcome back"}</p><h1>${registering?"join zoruneOS":"sign in"}</h1><p class="gate-copy">One account for your desktop, profile, and global chat.</p>${statusMessage}<form id="accountForm" class="account-form">${registering?`<div class="account-form-row"><label>username<input name="username" minlength="2" maxlength="24" autocomplete="username" required value="${escapeHtml(gateFormValues.username||"")}"></label><label>display name<input name="displayName" maxlength="32" autocomplete="nickname" required value="${escapeHtml(gateFormValues.displayName||"")}"></label></div><label>email<input name="email" type="email" maxlength="254" autocomplete="email" required value="${escapeHtml(gateFormValues.email||"")}"></label>`:`<label>username or email<input name="identity" autocomplete="username" required value="${escapeHtml(gateFormValues.identity||"")}"></label>`}<label>password<input name="password" type="password" minlength="8" maxlength="200" autocomplete="${registering?"new-password":"current-password"}" required></label>${registering&&accountGate.dataset.ownerSetupRequired==="true"?`<label>owner setup code<input name="setupCode" autocomplete="off" required><small>Use the one-time code printed in the server terminal.</small></label>`:""}<label class="policy-accept"><input name="policyAccept" type="checkbox" required><span>I agree to the <a href="/terms.html" target="_blank" rel="noreferrer">terms</a> and have read the <a href="/privacy.html" target="_blank" rel="noreferrer">privacy policy</a>.</span></label><button class="primary-button gate-submit" type="submit">${registering?"create account":"sign in"} <span>→</span></button></form><button class="gate-switch" id="gateSwitch">${registering?"already have an account? sign in":"new to zoruneOS? create an account"}</button><button class="gate-switch" id="continueAsGuest">continue as guest</button><div class="gate-steps"><i class="active"></i><i class="active"></i><i class="active"></i></div>`;
  accountGateContent.querySelector("#gateSwitch").addEventListener("click",()=>{gateFormValues={};accountGateMode=registering?"login":"register";showAccountGate("auth")});
  accountGateContent.querySelector("#continueAsGuest").addEventListener("click",enterGuestDesktop);
  accountGateContent.querySelector("#accountForm").addEventListener("submit",async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);gateFormValues=Object.fromEntries(form.entries());const body={policyVersion:accountPolicyVersion};
    if(registering){body.username=form.get("username");body.displayName=form.get("displayName");body.email=form.get("email");body.password=form.get("password");body.setupCode=form.get("setupCode");body.selectedApps=selectedWalkApps}
    else{body.identity=form.get("identity");body.password=form.get("password")}
    try{const result=await apiRequest(registering?"/api/register":"/api/login",{method:"POST",body:JSON.stringify(body)});gateFormValues={};localStorage.setItem("zorune-walkthrough-done","yes");await enterDesktop(result.user)}catch(error){showAccountGate("auth",error.message)}
  });
}
async function enterDesktop(user){
  guestSession=false;activeChatUser=user;accountGate.hidden=true;migrateLocalAppData();document.querySelector("#launcherDisplayName").textContent=user.displayName||user.username;document.querySelector("#launcherAvatar").textContent=(user.displayName||user.username||"z").slice(0,1).toLowerCase();
  applyAccountPins();applyAccountTheme();finishBoot();startActivityRewards();
}
function enterGuestDesktop(){
  activeChatUser=null;guestSession=true;clearInterval(activityTimer);accountGate.hidden=true;appWindow.hidden=true;launcher.hidden=true;
  document.querySelector("#activeApp").textContent="desktop";document.querySelector("#launcherDisplayName").textContent="guest";document.querySelector("#launcherAvatar").textContent="g";
  applyAccountPins();applyAccountTheme();finishBoot();
}
function migrateLocalAppData(){if(!activeChatUser)return;for(const key of ["zorune-settings","zorune-notes-v2","zorune-notes","zorune-folders","zorune-tasks","zorune-events","zorune-movie-links","zorune-app-creator-draft"]){const scoped=`zorune-account:${activeChatUser.id||activeChatUser.username}:${key}`;if(!localStorage.getItem(scoped)&&localStorage.getItem(key))localStorage.setItem(scoped,localStorage.getItem(key));}}
function applyAccountTheme(){const avatar=document.querySelector("#launcherAvatar");avatar.style.backgroundImage=activeChatUser?.avatar?`url("${activeChatUser.avatar}")`:"";avatar.classList.toggle("has-image",Boolean(activeChatUser?.avatar))}
function applyAccountPins(){const host=document.querySelector(".launcher-pins");if(!host||(!activeChatUser&&!guestSession))return;const ids=guestSession?["browser","files","settings","clock"]:(activeChatUser.selectedApps||[]).filter(id=>appNames[id]).slice(0,4);host.replaceChildren(...(ids.length?ids:["browser","messages","files","settings"]).map(id=>{const button=document.createElement("button");button.dataset.app=id;button.innerHTML=`<svg><use href="#i-${id}"/></svg>${escapeHtml(appNames[id])}`;button.addEventListener("click",()=>openApp(id));return button}))}
async function bootstrapAccount(){try{const status=await apiRequest("/api/status");accountPolicyVersion=status.policyVersion||"2026-11-06";accountGate.dataset.ownerSetupRequired=String(status.ownerSetupRequired);try{const result=await apiRequest("/api/me");await enterDesktop(result.user)}catch(error){if(error.status!==401)throw error;const hasWalkthrough=localStorage.getItem("zorune-walkthrough-done")==="yes";accountGateMode=hasWalkthrough?"login":"register";showAccountGate(hasWalkthrough?"auth":"walkthrough")}}catch(error){showAccountGate("auth",`zoruneOS could not reach its account server. Start node server.js, then refresh. ${error.message}`)}}
function startActivityRewards(){clearInterval(activityTimer);const note=()=>{lastUserActivity=Date.now()};["pointerdown","keydown","touchstart","wheel"].forEach(type=>document.addEventListener(type,note,{passive:true}));activityTimer=setInterval(async()=>{if(!activeChatUser)return;const active=document.visibilityState==="visible"&&Date.now()-lastUserActivity<5*60*1000;try{const result=await apiRequest("/api/activity",{method:"POST",body:JSON.stringify({active})});activeChatUser.coins=result.coins;if(result.earned){const target=document.querySelector("#shopCoinCount");if(target)target.textContent=`◈ ${result.coins} coins`;const label=document.querySelector("#activityNote");if(label)label.textContent=`zorune noticed you around and added ${result.earned} coins.`}}catch{}}
  ,60000)}
async function wireChat() {
  if (chatEvents) { chatEvents.close(); chatEvents=null; }
  const root=content.querySelector("#chatRoot");
  try {
    const status=await apiRequest("/api/status");
    try { const result=await apiRequest("/api/me"); activeChatUser=result.user; await showChatApp(root); }
    catch(error) { if(error.status===401) showAuth(root,status.ownerSetupRequired); else throw error; }
  } catch(error) { showServerUnavailable(root,error); }
}
function showAuth(root, ownerSetupRequired, mode="login", errorText="") {
  root.innerHTML=`<div class="chat-error">${escapeHtml(errorText||"Sign in to your zoruneOS account to use Global Chat.")}</div><button class="primary-button" type="button" id="openAccountGate">open account sign in</button>`;
  root.querySelector("#openAccountGate").addEventListener("click",()=>{accountGateMode="login";showAccountGate("auth")});
}
function showServerUnavailable(root,error) {
  root.innerHTML=`<div class="auth-card server-offline"><div class="auth-brand"><img src="logo.png" alt=""><span>chat server offline</span></div><p class="auth-copy">Start the zoruneos server from the project folder, then use the address printed in its terminal.</p><pre>node server.js</pre><p class="auth-copy">${escapeHtml(error.message)}</p></div>`;
}
async function showChatApp(root) {
  root.innerHTML=`<div class="chat-shell"><aside class="chat-side"><h3>channels</h3><div class="channel-item"><span>#</span> global</div><div id="roleManager"></div><small>zoruneos global channel<br>server connected</small></aside><section class="chat-main"><header class="chat-head"><span># &nbsp;global</span><div class="chat-account"><button class="chat-self-profile" id="chatProfile">${escapeHtml(activeChatUser.displayName||activeChatUser.username)} · ${escapeHtml(activeChatUser.role)}</button><button id="chatLogout">sign out of zoruneOS</button></div></header><div class="chat-messages" id="chatMessages"></div><form class="chat-form" id="chatForm"><div class="chat-form-row"><input id="chatInput" maxlength="500" placeholder="Message #global" autocomplete="off"><button type="submit">send</button></div><div class="chat-meta"><span>signed in as ${escapeHtml(activeChatUser.username)}</span><span class="chat-local-note">messages are shared through this server</span></div></form></section></div><div class="chat-profile-backdrop" id="chatProfileBackdrop" hidden></div>`;
  try { const result=await apiRequest("/api/messages");chatMessages=result.messages;renderChatMessages(); }
  catch(error){showAuth(root,false,"login",error.message);return}
  if(activeChatUser.role==="owner") loadRoleManager();
  root.querySelector("#chatForm").addEventListener("submit",async event=>{event.preventDefault();const input=root.querySelector("#chatInput"),text=input.value.trim();if(!text)return;input.disabled=true;try{await apiRequest("/api/messages",{method:"POST",body:JSON.stringify({text})});input.value=""}catch(error){showChatError(error.message)}finally{input.disabled=false;input.focus()}});
  root.querySelector("#chatLogout").addEventListener("click",logoutAccount);
  root.querySelector("#chatProfile").addEventListener("click",()=>showChatProfile(activeChatUser));
  chatEvents=new EventSource("/api/events");chatEvents.onmessage=event=>{try{chatMessages=JSON.parse(event.data).messages;renderChatMessages()}catch{}};chatEvents.onerror=()=>{const status=root.querySelector(".chat-head");if(status)status.dataset.connection="reconnecting"};
}
function renderChatMessages() {
  const list=content.querySelector("#chatMessages");if(!list)return;list.replaceChildren();
  if(!chatMessages.length){const welcome=document.createElement("div");welcome.className="track-empty";welcome.textContent="Welcome to #global. Start the conversation.";list.append(welcome);return;}
  for(const message of chatMessages){
    const row=document.createElement("article");row.className="chat-message";
    const profile=message.profile||{username:message.username,displayName:message.username,role:message.role};
    const avatar=document.createElement("button");avatar.className="chat-avatar";avatar.type="button";avatar.textContent=(profile.displayName||message.username||"?").slice(0,1).toLowerCase();if(profile.avatar){avatar.style.backgroundImage=`url("${profile.avatar}")`;avatar.classList.add("has-image")}avatar.addEventListener("click",()=>showChatProfile(profile));
    const author=document.createElement("button");author.type="button";author.className=`chat-author chat-profile-trigger ${profile.equippedEffect?`effect-${profile.equippedEffect}`:""}`;author.textContent=profile.displayName||message.username||"zorune user";author.addEventListener("click",()=>showChatProfile(profile));
    if(message.role==="owner"||message.role==="moderator"){const badge=document.createElement("span");badge.className="role-badge";badge.textContent=message.role;author.append(badge)}
    const text=document.createElement("div");text.className="chat-text";text.textContent=message.text;row.append(avatar,author,text);
    if(activeChatUser&&(activeChatUser.role==="owner"||activeChatUser.role==="moderator")){const actions=document.createElement("div");actions.className="chat-actions";const remove=document.createElement("button");remove.textContent="remove";remove.addEventListener("click",async()=>{try{await apiRequest(`/api/messages/${encodeURIComponent(message.id)}`,{method:"DELETE"})}catch(error){showChatError(error.message)}});actions.append(remove);row.append(actions)}
    list.append(row);
  }
  list.scrollTop=list.scrollHeight;
}
async function loadRoleManager() {
  const target=content.querySelector("#roleManager");if(!target)return;
  try {
    const result=await apiRequest("/api/users");target.innerHTML=`<h3 class="member-heading">members</h3>`;
    for(const user of result.users){
      const row=document.createElement("div");row.className="member-row";
      const label=document.createElement("span");label.textContent=user.username;
      const select=document.createElement("select");select.setAttribute("aria-label",`Role for ${user.username}`);
      for(const role of ["owner","moderator","member"]){const option=document.createElement("option");option.value=role;option.textContent=role;option.selected=role===user.role;select.append(option)}
      select.addEventListener("change",async()=>{try{const updated=await apiRequest(`/api/users/${encodeURIComponent(user.username)}`,{method:"PATCH",body:JSON.stringify({role:select.value})});if(user.username.toLowerCase()===activeChatUser.username.toLowerCase())activeChatUser=updated.user;loadRoleManager()}catch(error){showChatError(error.message);loadRoleManager()}});
      row.append(label,select);target.append(row);
    }
  } catch(error) { target.textContent=error.message; }
}
function showChatError(message) { const note=content.querySelector(".chat-head");if(!note)return;let error=content.querySelector(".chat-error-toast");if(!error){error=document.createElement("span");error.className="chat-error-toast";note.append(error)}error.textContent=message;setTimeout(()=>error.remove(),3500); }
function showChatProfile(profile){const backdrop=content.querySelector("#chatProfileBackdrop");if(!backdrop||!profile)return;const card=document.createElement("article");card.className="chat-profile-card";const banner=document.createElement("div");banner.className="chat-profile-banner";if(profile.banner)banner.style.backgroundImage=`linear-gradient(90deg,#0007,#0002),url("${profile.banner}")`;const close=document.createElement("button");close.className="chat-profile-close";close.type="button";close.textContent="×";close.setAttribute("aria-label","Close profile");const avatar=document.createElement("div");avatar.className="chat-profile-avatar";avatar.textContent=(profile.displayName||profile.username||"?").slice(0,1).toLowerCase();if(profile.avatar){avatar.style.backgroundImage=`url("${profile.avatar}")`;avatar.classList.add("has-image")}const name=document.createElement("h3");name.className=`${profile.equippedEffect?`effect-${profile.equippedEffect}`:""}`;name.textContent=profile.displayName||profile.username||"zorune user";const handle=document.createElement("p");handle.className="chat-profile-handle";handle.textContent=`@${profile.username||"user"}${profile.pronouns?` · ${profile.pronouns}`:""}`;const bio=document.createElement("p");bio.className="chat-profile-bio";bio.textContent=profile.bio||"No bio yet.";const status=document.createElement("span");status.className=`profile-status status-${profile.status||"online"}`;status.textContent=profile.status||"online";card.append(banner,close,avatar,name,handle,bio,status);backdrop.replaceChildren(card);backdrop.hidden=false;close.addEventListener("click",()=>backdrop.hidden=true);backdrop.addEventListener("click",event=>{if(event.target===backdrop)backdrop.hidden=true},{once:true})}
async function imageDataUrl(file,maxDimension){
  if(!file||!file.type.startsWith("image/"))throw new Error("Choose an image file.");
  const bitmap=await createImageBitmap(file);let scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
  for(let attempt=0;attempt<8;attempt++){
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL("image/jpeg",Math.max(.42,.84-attempt*.07));if(data.length<(maxDimension===512?350000:700000)){bitmap.close();return data}scale*=.82;
  }
  bitmap.close();throw new Error("That image is too large to use. Pick a smaller image.");
}
function paintProfilePreview(user=activeChatUser){
  if(!user)return;const avatar=content.querySelector("#profileAvatarPreview");if(avatar){avatar.textContent=(user.displayName||user.username||"z").slice(0,1).toLowerCase();avatar.style.backgroundImage=user.avatar?`url("${user.avatar}")`:"";avatar.classList.toggle("has-image",Boolean(user.avatar))}
  const banner=content.querySelector("#profileBanner");if(banner)banner.style.backgroundImage=user.banner?`linear-gradient(90deg,#0008,#0003),url("${user.banner}")`:"";
}
function wireProfile(){
  const form=content.querySelector("#profileForm"),status=content.querySelector("#profileSaveStatus");if(!form||!activeChatUser)return;
  form.elements.displayName.value=activeChatUser.displayName||activeChatUser.username;form.elements.pronouns.value=activeChatUser.pronouns||"";form.elements.bio.value=activeChatUser.bio||"";form.elements.status.value=activeChatUser.status||"online";
  content.querySelector("#profileUsername").textContent=`@${activeChatUser.username}`;content.querySelector("#profileEmail").textContent=activeChatUser.email||"email not available for this account";content.querySelector("#profileCoinCount").textContent=`◈ ${activeChatUser.coins||0} coins`;paintProfilePreview();
  const save=async patch=>{status.textContent="saving…";try{const result=await apiRequest("/api/profile",{method:"PATCH",body:JSON.stringify(patch)});activeChatUser={...activeChatUser,...result.user};status.textContent="saved";document.querySelector("#launcherDisplayName").textContent=activeChatUser.displayName;document.querySelector("#launcherAvatar").textContent=(activeChatUser.displayName||"z").slice(0,1).toLowerCase();applyAccountTheme();paintProfilePreview()}catch(error){status.textContent=error.message}};
  form.addEventListener("submit",event=>{event.preventDefault();save({displayName:form.elements.displayName.value,pronouns:form.elements.pronouns.value,bio:form.elements.bio.value,status:form.elements.status.value})});
  content.querySelector("#avatarUpload").addEventListener("change",async event=>{try{const avatar=await imageDataUrl(event.target.files[0],512);await save({avatar})}catch(error){status.textContent=error.message}});
  content.querySelector("#bannerUpload").addEventListener("change",async event=>{try{const banner=await imageDataUrl(event.target.files[0],1200);await save({banner})}catch(error){status.textContent=error.message}});
  content.querySelector("#profileSignOut").addEventListener("click",logoutAccount);
  content.querySelector("#profileDelete").addEventListener("click",async()=>{if(!confirm("Delete your zoruneOS account, profile, rewards, and chat messages? This cannot be undone."))return;try{await apiRequest("/api/account",{method:"DELETE"});activeChatUser=null;guestSession=false;showAccountGate("auth");content.innerHTML="";appWindow.hidden=true}catch(error){status.textContent=error.message}});
}
async function wireShop(){
  const grid=content.querySelector("#shopItems");if(!grid)return;
  const render=async()=>{try{const data=await apiRequest("/api/shop");activeChatUser.coins=data.coins;content.querySelector("#shopCoinCount").textContent=`◈ ${data.coins} coins`;grid.replaceChildren();for(const item of data.items){const owned=data.ownedEffects.includes(item.id),equipped=data.equippedEffect===item.id,card=document.createElement("article");card.className="shop-item";const sample=document.createElement("strong");sample.className=`shop-name effect-${item.id}`;sample.textContent=activeChatUser.displayName||activeChatUser.username;const title=document.createElement("h3");title.textContent=item.name;const price=document.createElement("p");price.textContent=owned?"owned":`◈ ${item.cost} coins`;const button=document.createElement("button");button.className=equipped?"soft-button":"primary-button";button.textContent=equipped?"equipped":owned?"equip":"unlock effect";button.disabled=equipped;button.addEventListener("click",async()=>{try{if(!owned){const bought=await apiRequest("/api/shop/buy",{method:"POST",body:JSON.stringify({itemId:item.id})});activeChatUser.coins=bought.coins;activeChatUser.ownedEffects=bought.ownedEffects;activeChatUser.equippedEffect=bought.equippedEffect}else{const result=await apiRequest("/api/profile",{method:"PATCH",body:JSON.stringify({equippedEffect:item.id})});activeChatUser={...activeChatUser,...result.user}}await render()}catch(error){price.textContent=error.message}});card.append(sample,title,price,button);grid.append(card)}
    }catch(error){grid.textContent=error.message}};
  content.querySelector("#claimDaily").addEventListener("click",async event=>{const button=event.currentTarget;button.disabled=true;try{const result=await apiRequest("/api/rewards/daily",{method:"POST",body:JSON.stringify({})});activeChatUser.coins=result.coins;content.querySelector("#shopCoinCount").textContent=`◈ ${result.coins} coins`;button.textContent="claimed · +50 coins";await render()}catch(error){button.textContent=error.message.includes("already claimed")?"claimed for today":error.message}});
  await render();
}
async function logoutAccount(){if(chatEvents){chatEvents.close();chatEvents=null}await apiRequest("/api/logout",{method:"POST"}).catch(()=>{});activeChatUser=null;guestSession=false;clearInterval(activityTimer);appWindow.hidden=true;accountGateMode="login";showAccountGate("auth");}
function escapeHtml(value) { const node=document.createElement("span");node.textContent=String(value);return node.innerHTML; }function initGames() {
  const root=content.querySelector("#gamesRoot");if(!root)return;
  root.innerHTML=`<section class="games-home"><div class="games-library-grid"><button class="games-library-card" type="button" data-library="lumin"><span class="games-library-icon">✣</span><strong>LuminSDK</strong><small>browse the Lumin game collection</small><span class="games-library-action">open library →</span></button><button class="games-library-card" type="button" data-library="gnmath"><span class="games-library-icon">g</span><strong>gn-math</strong><small>browse the gn-math game collection</small><span class="games-library-action">open library →</span></button></div><p class="games-library-note">external libraries load only after you choose them.</p></section>`;
  root.querySelector('[data-library="lumin"]').addEventListener("click",()=>openLuminLibrary(root));
  root.querySelector('[data-library="gnmath"]').addEventListener("click",()=>openGnMathLibrary(root));
}
function showGameLibrary(root,title,contentHtml){
  root.innerHTML=`<section class="games-library"><header class="games-library-bar"><button class="soft-button" id="gamesBack">← libraries</button><h2>${escapeHtml(title)}</h2></header>${contentHtml}</section>`;
  root.querySelector("#gamesBack").addEventListener("click",initGames);
}
function openLuminLibrary(root){
  showGameLibrary(root,"LuminSDK",'<div class="games-status" id="gamesStatus">loading game library…</div><div class="lumin-games-host" id="luminGames"></div>');
  const host=root.querySelector("#luminGames"),status=root.querySelector("#gamesStatus");
  loadLumin().then(()=>{
    if(!root.isConnected||!host.isConnected)return;
    const initialized=window.Lumin.init({container:"#luminGames",theme:"dark",columns:3,rows:2});
    return Promise.resolve(initialized).then(()=>{luminReady=true;if(status.isConnected)status.remove()});
  }).catch(error=>{
    if(!root.isConnected||!host.isConnected)return;
    console.warn("LuminSDK could not start:",error.message);
    showOfflineGames(host);
  });
}
function openGnMathLibrary(root){
  showGameLibrary(root,"gn-math",'<p class="games-status" id="gnMathStatus">loading gn-math library…</p><iframe class="gnmath-frame" id="gnMathFrame" title="gn-math game library" sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>');
  const frame=root.querySelector("#gnMathFrame");
  const srcdoc=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{min-height:100%;margin:0;background:#090909;color:#eee;font:14px system-ui,sans-serif}body{overflow:auto}</style></head><body><p id="gnMathLoadError">loading gn-math…</p><script>window.gnMathLoadFailed=false;window.addEventListener("error",event=>{if(event.target?.tagName==="SCRIPT"&&event.target.src==="https://cdn.jsdelivr.net/gh/gn-math/gn-math.github.io@main/gnmath.js"){window.gnMathLoadFailed=true;const status=document.getElementById("gnMathLoadError");if(status)status.textContent="gn-math could not be loaded. check your connection and return to libraries to retry."}},true)</script><script src="https://cdn.jsdelivr.net/gh/gn-math/gn-math.github.io@main/gnmath.js"></script><script>if(!window.gnMathLoadFailed)document.getElementById("gnMathLoadError")?.remove()</script></body></html>`;
  frame.srcdoc=srcdoc;
}
function loadLumin() {
  if(window.Lumin)return Promise.resolve();if(luminLoading)return luminLoading;
  luminLoading=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=LUMIN_URL;script.async=true;script.onload=()=>window.Lumin?resolve():reject(new Error("SDK did not initialize"));script.onerror=()=>reject(new Error("SDK failed to load"));document.head.append(script)});
  return luminLoading;
}
function showOfflineGames(host){host.replaceChildren();const panel=document.createElement("section");panel.className="offline-arcade";panel.innerHTML="<h2>zorune arcade</h2><p>LuminSDK is offline. Play a local game while it reconnects.</p><button class='soft-button' id='retryLumin'>retry LuminSDK</button><h3>tic-tac-toe · you vs zorune</h3><div class='tic-board' id='ticBoard'></div><button class='soft-button' id='ticReset'>new round</button>";host.append(panel);panel.querySelector("#retryLumin").addEventListener("click",()=>{luminLoading=null;openLuminLibrary(content.querySelector("#gamesRoot"))});const board=panel.querySelector("#ticBoard");let cells=Array(9).fill(""),done=false;function draw(){board.replaceChildren();cells.forEach((cell,index)=>{const button=document.createElement("button");button.textContent=cell;button.disabled=!!cell||done;button.addEventListener("click",()=>{cells[index]="x";if(winner(cells)){done=true;return draw()}if(cells.every(Boolean)){done=true;return draw()}const available=cells.map((v,i)=>v?null:i).filter(v=>v!==null);if(available.length)cells[available[Math.floor(Math.random()*available.length)]]="o";if(winner(cells)||cells.every(Boolean))done=true;draw()});board.append(button)});const result=winner(cells);if(result||done){const note=document.createElement("p");note.className="arcade-result";note.textContent=result?`${result==="x"?"you":"zorune"} won`:"draw";board.after(note)}}panel.querySelector("#ticReset").addEventListener("click",()=>{cells=Array(9).fill("");done=false;panel.querySelector(".arcade-result")?.remove();draw()});draw()}
function winner(cells){for(const line of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(cells[line[0]]&&cells[line[0]]===cells[line[1]]&&cells[line[1]]===cells[line[2]])return cells[line[0]];return ""}
function wireCalculator(){let expression="";const display=content.querySelector("#calcDisplay");function press(key){if(key==="C")expression="";else if(key==="⌫")expression=expression.slice(0,-1);else if(key==="="){if(!expression){display.textContent="0";return}try{const safe=expression.replace(/[×]/g,"*").replace(/[÷]/g,"/").replace(/[−]/g,"-");if(!/^[0-9+*/.() -]+$/.test(safe))throw Error();const result=Function(`"use strict";return (${safe})`)();expression=Number.isFinite(result)?String(Number(result.toPrecision(12))):"Error"}catch{expression="Error"}}else if(key==="±")expression=expression.startsWith("-")?expression.slice(1):"-"+expression;else if(key==="%")expression+=/\d$/.test(expression)?"/100":"";else if(expression==="Error")expression=/^[0-9.]$/.test(key)?key:"";else expression+=key;display.textContent=expression||"0"}content.querySelectorAll("[data-key]").forEach(button=>button.addEventListener("click",()=>press(button.dataset.key)));content.onkeydown=event=>{if(/^[0-9.]$/.test(event.key)){event.preventDefault();press(event.key)}else if(["+","-","*","/"].includes(event.key)){event.preventDefault();press(({"*":"×","/":"÷","-":"−"})[event.key]||event.key)}else if(event.key==="Enter"){event.preventDefault();press("=")}else if(event.key==="Backspace"){event.preventDefault();press("⌫")}else if(event.key==="Escape"){event.preventDefault();press("C")}}}
function toggleLauncher(force){launcher.hidden=!(force??launcher.hidden);document.querySelector("#startButton").setAttribute("aria-expanded",String(!launcher.hidden));const search=document.querySelector("#searchLauncher");if(!launcher.hidden){search.value="";filterApps("");setTimeout(()=>search.focus(),0)}else if(search.value){search.value="";filterApps("")}}
function buildLauncherApps(){const list=document.querySelector("#launcherApps");list.replaceChildren();for(const app of appCatalog){const button=document.createElement("button");button.className="launcher-app";button.dataset.app=app.id;button.innerHTML=`<span class="launcher-app-icon">${escapeHtml(app.icon)}</span><span>${escapeHtml(app.name)}</span>`;button.addEventListener("click",()=>openApp(app.id));list.append(button)}document.querySelector("#appCount").textContent=String(appCatalog.length)}
function filterApps(query){const value=query.trim().toLowerCase();document.querySelectorAll(".app[data-app]").forEach(button=>{button.hidden=!button.textContent.toLowerCase().includes(value)});document.querySelectorAll(".launcher-app").forEach(button=>{button.hidden=!button.textContent.toLowerCase().includes(value)});document.querySelectorAll(".launcher-pins [data-app]").forEach(button=>{button.hidden=!!value&&!button.textContent.toLowerCase().includes(value)});const settingsResults=document.querySelector("#launcherSettingsResults");settingsResults.replaceChildren();const settingTargets=[{id:"appearance",name:"appearance settings",keys:"theme accent color scale graphite black"},{id:"desktop",name:"desktop settings",keys:"desktop date icons dock clock 24 hour"},{id:"accessibility",name:"accessibility settings",keys:"accessibility motion contrast text size"},{id:"sound",name:"sound settings",keys:"sound volume tones"},{id:"system",name:"system settings",keys:"system startup boot reset defaults"}];const matches=value?settingTargets.filter(item=>(item.name+" "+item.keys).includes(value)):[];settingsResults.hidden=!matches.length;for(const match of matches){const button=document.createElement("button");button.className="launcher-setting-result";button.innerHTML=`<span>⚙</span><span>${escapeHtml(match.name)}<small>open this section in settings</small></span>`;button.addEventListener("click",()=>{openApp("settings");setTimeout(()=>content.querySelector(`#${match.id}`)?.scrollIntoView({block:"start",behavior:readSettings().reduceMotion?"auto":"smooth"}),0)});settingsResults.append(button)}let empty=document.querySelector("#launcherNoResults");if(!empty){empty=document.createElement("p");empty.id="launcherNoResults";empty.className="launcher-empty";empty.textContent="No apps or settings found. Try another name.";document.querySelector("#launcherSettingsResults").after(empty)}empty.hidden=!value||Boolean(document.querySelector(".launcher-app:not([hidden])"))||Boolean(matches.length)}
document.querySelector("#searchLauncher").addEventListener("input",event=>filterApps(event.target.value));document.querySelector("#searchLauncher").addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();toggleLauncher(false)}if(event.key==="Enter"){const app=document.querySelector(".launcher-app:not([hidden])");if(app)openApp(app.dataset.app);else document.querySelector(".launcher-setting-result")?.click()}});
buildLauncherApps();
document.querySelector("#startButton").addEventListener("click",()=>toggleLauncher());document.querySelector("#brandButton").addEventListener("click",()=>toggleLauncher());document.querySelector("#closeLauncher").addEventListener("click",()=>toggleLauncher(false));
document.querySelector("#launcherProfile").addEventListener("click",()=>openApp("profile"));
document.querySelector("#launcherRestart").addEventListener("click",()=>location.reload());
document.querySelector("#closeWindow").addEventListener("click",()=>{stopCamera();stopMovies();clearTimeout(creatorPreviewTimer);creatorPreviewTimer=null;if(creatorMessageListener){window.removeEventListener("message",creatorMessageListener);creatorMessageListener=null}clearInterval(clockTimer);clockTimer=null;appWindow.hidden=true;appWindow.classList.remove("maximized","browser-window","creator-window","movies-window");appWindow.removeAttribute("style");restoreWindowStyles=null;if(chatEvents){chatEvents.close();chatEvents=null}document.querySelector("#activeApp").textContent="desktop"});document.querySelector("#minimizeWindow").addEventListener("click",()=>appWindow.hidden=true);
function toggleMaximize(){
  if(appWindow.classList.contains("maximized")){
    appWindow.classList.remove("maximized");
    if(restoreWindowStyles){for(const [key,value] of Object.entries(restoreWindowStyles))appWindow.style[key]=value;restoreWindowStyles=null}
  }else{
    const rect=appWindow.getBoundingClientRect();
    restoreWindowStyles={left:appWindow.style.left,top:appWindow.style.top,right:appWindow.style.right,bottom:appWindow.style.bottom,width:appWindow.style.width,height:appWindow.style.height,transform:appWindow.style.transform};
    appWindow.classList.add("maximized");
  }
}
document.querySelector("#maximizeWindow").addEventListener("click",toggleMaximize);
const titleBar=appWindow.querySelector(".window-bar");
titleBar.addEventListener("dblclick",event=>{if(!event.target.closest("button"))toggleMaximize()});
titleBar.addEventListener("pointerdown",event=>{
  if(event.target.closest("button")||appWindow.classList.contains("maximized"))return;
  const rect=appWindow.getBoundingClientRect(),offsetX=event.clientX-rect.left,offsetY=event.clientY-rect.top;
  titleBar.setPointerCapture(event.pointerId);
  appWindow.style.left=`${rect.left}px`;appWindow.style.top=`${rect.top}px`;appWindow.style.width=`${rect.width}px`;appWindow.style.height=`${rect.height}px`;appWindow.style.right="auto";appWindow.style.bottom="auto";appWindow.style.transform="none";
  titleBar.onpointermove=move=>{if(!titleBar.hasPointerCapture(move.pointerId))return;appWindow.style.left=`${Math.max(0,Math.min(innerWidth-appWindow.offsetWidth,move.clientX-offsetX))}px`;appWindow.style.top=`${Math.max(43,Math.min(innerHeight-80,move.clientY-offsetY))}px`};
  titleBar.onpointerup=up=>{if(titleBar.hasPointerCapture(up.pointerId))titleBar.releasePointerCapture(up.pointerId);titleBar.onpointermove=null;titleBar.onpointerup=null};
});
const resizeHandle=document.querySelector("#windowResize");
resizeHandle.addEventListener("pointerdown",event=>{
  if(appWindow.classList.contains("maximized"))return;
  event.preventDefault();const rect=appWindow.getBoundingClientRect(),startX=event.clientX,startY=event.clientY;
  resizeHandle.setPointerCapture(event.pointerId);appWindow.style.left=`${rect.left}px`;appWindow.style.top=`${rect.top}px`;appWindow.style.right="auto";appWindow.style.bottom="auto";appWindow.style.transform="none";
  resizeHandle.onpointermove=move=>{if(!resizeHandle.hasPointerCapture(move.pointerId))return;const minWidth=appWindow.classList.contains("browser-window")?320:300;appWindow.style.width=`${Math.max(minWidth,Math.min(innerWidth-rect.left,rect.width+move.clientX-startX))}px`;appWindow.style.height=`${Math.max(250,Math.min(innerHeight-rect.top-70,rect.height+move.clientY-startY))}px`};
  resizeHandle.onpointerup=up=>{if(resizeHandle.hasPointerCapture(up.pointerId))resizeHandle.releasePointerCapture(up.pointerId);resizeHandle.onpointermove=null;resizeHandle.onpointerup=null};
});
document.addEventListener("click",event=>{if(!event.target.closest(".launcher,.dock-mark,.brand"))toggleLauncher(false)});
document.querySelectorAll("[data-app]").forEach(button=>button.addEventListener("click",()=>openApp(button.dataset.app)));
function finishBoot(){document.documentElement.dataset.bootComplete="true";bootScreen.classList.add("done");setTimeout(()=>bootScreen.remove(),350)}
document.querySelector("#skipBoot").addEventListener("click",finishBoot);setTimeout(finishBoot,1700);
function updateClock(){const now=new Date();document.querySelector("#topClock").textContent=new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit",hour12:!readSettings().clock24}).format(now);document.querySelector("#dayLabel").textContent=new Intl.DateTimeFormat(undefined,{weekday:"long"}).format(now).toUpperCase();document.querySelector("#dateLabel").textContent=new Intl.DateTimeFormat(undefined,{month:"long",day:"numeric"}).format(now).toUpperCase()}
applySettings();updateClock();setInterval(updateClock,30000);
bootstrapAccount();
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!launcher.hidden)toggleLauncher(false);if((event.ctrlKey||event.metaKey)&&event.code==="Space"){event.preventDefault();toggleLauncher()}});
function playInterfaceTone(){try{const AudioContextType=window.AudioContext||window.webkitAudioContext;if(!AudioContextType)return;uiAudioContext??=new AudioContextType();if(uiAudioContext.state==="suspended")uiAudioContext.resume();const oscillator=uiAudioContext.createOscillator(),gain=uiAudioContext.createGain();oscillator.type="sine";oscillator.frequency.value=520;gain.gain.setValueAtTime(Math.max(.001,readSettings().volume/1000),uiAudioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,uiAudioContext.currentTime+.045);oscillator.connect(gain);gain.connect(uiAudioContext.destination);oscillator.start();oscillator.stop(uiAudioContext.currentTime+.05)}catch{}}
document.addEventListener("click",event=>{if(readSettings().sounds&&event.target.closest("button"))playInterfaceTone()},true);
