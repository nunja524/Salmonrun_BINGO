// ========= 設定 =========
const JSON_PATH         = "weapons.json";
const BASE_STORAGE_KEY  = "salmon_bingo_v1"; // 1カード=1キーで保存
const LATEST_POINTER_KEY = `${BASE_STORAGE_KEY}:LATEST`; // 直近カードへのポインタ

// ロゴ白縁のチューニング（必要なら調整）
const TITLE_STROKE_THICKNESS = 2.0;  // 白縁の太さ(px)
const TITLE_STROKE_Y_OFFSET  = -2;   // 白縁の上下補正（上へ - / 下へ +）

// ========= DOM取得 =========
const bingoEl      = document.getElementById("bingo");
const lineLayer    = document.getElementById("lineLayer");
const sizeSelect   = document.getElementById("sizeSelect");
const kumaSelect   = document.getElementById("kumaSelect");
const markerStyleSelect = document.getElementById("markerStyle");
const jitterToggle = document.getElementById("jitterToggle");
const lineToggle   = document.getElementById("lineToggle");
const freeToggle   = document.getElementById("freeToggle");
const btnGenerate  = document.getElementById("btnGenerate");
const btnReset     = document.getElementById("btnReset");
const btnSave      = document.getElementById("btnSave");

// 共有URL
const shareUrlInput = document.getElementById("shareUrl");
const copyUrlBtn    = document.getElementById("copyUrlBtn");

const captureArea  = document.getElementById("captureArea");
const boardWrap    = document.getElementById("boardWrap");
const titleWrap    = document.querySelector(".title-wrap");

// ========= 状態 =========
let ALL_WEAPONS = [];  // JSON読み込み後に格納
let currentGridSize = parseInt(sizeSelect.value, 10);

// URLパラメータ
const urlParams = new URLSearchParams(location.search);
const urlSeed   = urlParams.get("seed") || "";          // 文字列
const urlSize   = parseInt(urlParams.get("size")||"",10);
const urlMode   = urlParams.get("mode");                // exclude/include/kuma_only
const urlFree   = urlParams.get("free");                // "0"/"1"

// 乱数（シード）
let currentSeed = urlSeed || ""; // 空なら未固定

let state = {
  seed: currentSeed, // ← どのカードか識別するため保存にも持たせる
  size: isFinite(urlSize) && urlSize >= 3 && urlSize <= 9 ? urlSize : currentGridSize,
  kumaMode: ["exclude","include","kuma_only"].includes(urlMode) ? urlMode : kumaSelect.value,
  markerStyle: markerStyleSelect.value, // circle | golden_roe | stamp
  jitter: !!jitterToggle.checked,
  showLines: !!lineToggle.checked,
  free: urlFree === "1" ? true : urlFree === "0" ? false : !!freeToggle.checked,
  board: [],                            // size*size の配列
};

// ========= シード付きPRNG =========
function seedFromString(str){
  let h = 2166136261 >>> 0;
  for (let i=0; i<str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t>>>15), t | 1);
    t ^= t + Math.imul(t ^ (t>>>7), t | 61);
    return ((t ^ (t>>>14)) >>> 0) / 4294967296;
  };
}
function makeRng(seedStr){ return mulberry32(seedFromString(seedStr)); }
function newSeed(){
  return (Date.now().toString(36) + Math.random().toString(36).slice(2,8)).toUpperCase();
}

// ========= LATEST ポインタ =========
function markAsLatest(key){
  try{ localStorage.setItem(LATEST_POINTER_KEY, key); }catch(e){ /* noop */ }
}
function loadLatestState(){
  try{
    const key = localStorage.getItem(LATEST_POINTER_KEY);
    if (!key) return null;
    const j = localStorage.getItem(key);
    return j ? JSON.parse(j) : null;
  }catch(e){
    console.warn("最新カードの読み込みに失敗:", e);
    return null;
  }
}

// ========= ユーティリティ =========
const shuffleSeeded = (arr, rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const normTag = (tag) => {
  const t = String(tag || "").toLowerCase();
  if (["kuma","クマ","くま","クマブキ"].some(x => t.includes(x))) return "kuma";
  return "normal";
};

const filterByKumaMode = (list, mode) => {
  if (mode === "kuma_only") return list.filter(w => normTag(w.tag) === "kuma");
  if (mode === "exclude")   return list.filter(w => normTag(w.tag) === "normal");
  return list; // include
};

// 重複あり/なしでcount個ピック（seed対応）
const pickWeaponsSeeded = (pool, count, allowDuplicates, rng) => {
  if (!allowDuplicates && pool.length < count) allowDuplicates = true;
  if (!allowDuplicates) return shuffleSeeded(pool, rng).slice(0, count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[Math.floor(rng()*pool.length)]);
  return out;
};

// 9x9用：同じ武器を最大cap回（デフォ2回）までに抑えてcount個ピック（seed対応）
function pickWeaponsCap2Seeded(pool, count, cap = 2, rng){
  if (pool.length * cap >= count){
    const shuffled = shuffleSeeded(pool, rng);
    const result = [];
    const usedCount = new Map();
    let idx = 0;
    while(result.length < count){
      const w = shuffled[idx % shuffled.length];
      const n = (usedCount.get(w.name) || 0);
      if (n < cap){ result.push(w); usedCount.set(w.name, n+1); }
      idx++;
    }
    return result;
  }
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[Math.floor(rng()*pool.length)]);
  return out;
}

// ========= グリッド密度制御 =========
function applyGridTightness(size){
  if (size >= 6) bingoEl.classList.add("dense");
  else           bingoEl.classList.remove("dense");
}

// ========= レイアウト微調整 =========
function applyLayoutTuning(size){
  const t7 = size >= 7;
  const t9 = size >= 9;

  captureArea?.classList.toggle("tight-7", t7);
  captureArea?.classList.toggle("tight-9", t9);
  boardWrap?.classList.toggle("tight-7", t7);
  boardWrap?.classList.toggle("tight-9", t9);
  bingoEl.classList.toggle("tight-7", t7);
  bingoEl.classList.toggle("tight-9", t9);
  titleWrap?.classList.toggle("tight-7", t7);
  titleWrap?.classList.toggle("tight-9", t9);
}

// ========= マーク関連 =========
function randomJitter(enabled) {
  if (!enabled) return { tx: 0, ty: 0, rot: 0 };
  const tx = (Math.random() * 10 - 5);
  const ty = (Math.random() * 10 - 5);
  const rot = (Math.random() * 14 - 7);
  return { tx, ty, rot };
}

function createMark(style, jitterEnabled) {
  const wrap = document.createElement("div");
  wrap.className = "mark";

  const inner = document.createElement("div");
  inner.className = "mark-inner";

  if (style === "golden_roe") {
    wrap.classList.add("mark--img");
    inner.style.backgroundImage = "url('images/markers/golden_roe.png')";
  } else if (style === "stamp") {
    wrap.classList.add("mark--img");
    inner.style.backgroundImage = "url('images/markers/stamp.png')";
  } else {
    wrap.classList.add("mark--circle");
  }

  const { tx, ty, rot } = randomJitter(jitterEnabled);
  inner.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;

  wrap.appendChild(inner);
  return wrap;
}

function setCellSelected(cell, selected){
  cell.dataset.selected = selected ? "true" : "false";
  const prev = cell.querySelector(".mark");
  if (prev) prev.remove();
  if (selected){
    const mark = createMark(state.markerStyle, state.jitter);
    cell.appendChild(mark);
  }
}

function toggleCell(cell, idx) {
  const selected = cell.dataset.selected === "true";
  setCellSelected(cell, !selected);
  state.board[idx].selected = !selected;
  scheduleSave();
  updateLines();
}

// ========= 盤面レンダリング =========
function renderEmptyGrid(size){
  bingoEl.innerHTML = "";
  lineLayer.innerHTML = "";
  bingoEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;

  applyGridTightness(size);
  applyLayoutTuning(size);

  const total = size * size;
  if (!state.board || state.board.length !== total){
    state.board = Array.from({length: total}, () => ({ weapon: null, selected: false }));
  }

  for (let i = 0; i < total; i++){
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.selected = state.board[i].selected ? "true" : "false";
    cell.addEventListener("click", () => toggleCell(cell, i));
    if (state.board[i].selected){
      const mark = createMark(state.markerStyle, state.jitter);
      cell.appendChild(mark);
    }
    bingoEl.appendChild(cell);
  }
  updateLines();
  drawTitleStrokeCanvas();
  applyFreeCell(size);
}

function renderBingo(size){
  bingoEl.innerHTML = "";
  lineLayer.innerHTML = "";
  bingoEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;

  applyGridTightness(size);
  applyLayoutTuning(size);

  const total = size * size;
  for (let i = 0; i < total; i++){
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.selected = state.board[i].selected ? "true" : "false";

    const w = state.board[i].weapon;
    if (w && w.img){
      const img = document.createElement("img");
      img.crossOrigin = "anonymous";
      img.src = w.img;
      img.alt = w.name ?? "";
      img.title = w.name ?? "";
      cell.appendChild(img);
    }

    if (state.board[i].selected){
      const mark = createMark(state.markerStyle, state.jitter);
      cell.appendChild(mark);
    }

    cell.addEventListener("click", () => toggleCell(cell, i));
    bingoEl.appendChild(cell);
  }
  updateLines();
  drawTitleStrokeCanvas();
  applyFreeCell(size);
}

// ========= FREEセル：見た目だけ付与（データは保持/未選択） =========
function applyFreeCell(size){
  getCells().forEach(c => c.classList.remove("free"));
  if (!(state.free && size % 2 === 1)) return;
  const mid = Math.floor(size / 2);
  const centerIdx = mid * size + mid;
  const cells = getCells();
  if (cells[centerIdx]) cells[centerIdx].classList.add("free");
}

// ========= ライン判定 & 描画 =========
function getCells(){ return Array.from(bingoEl.querySelectorAll(".cell")); }

function isRowComplete(size, r){
  for (let c=0; c<size; c++) if (!state.board[r*size+c].selected) return false;
  return true;
}
function isColComplete(size, c){
  for (let r=0; r<size; r++) if (!state.board[r*size+c].selected) return false;
  return true;
}
function isDiagMainComplete(size){
  for (let i=0; i<size; i++) if (!state.board[i*size+i].selected) return false;
  return true;
}
function isDiagAntiComplete(size){
  for (let i=0; i<size; i++) if (!state.board[i*size+(size-1-i)].selected) return false;
  return true;
}

function cellCenter(idx){
  const cells = getCells();
  const cell  = cells[idx];
  const gridRect = bingoEl.getBoundingClientRect();
  const rect  = cell.getBoundingClientRect();
  return {
    x: (rect.left + rect.right)/2 - gridRect.left,
    y: (rect.top  + rect.bottom)/2 - gridRect.top
  };
}

function clearLines(){ lineLayer.innerHTML = ""; }

function drawLine(p1, p2){
  const line = document.createElementNS("http://www.w3.org/2000/svg","line");
  line.setAttribute("x1", p1.x);
  line.setAttribute("y1", p1.y);
  line.setAttribute("x2", p2.x);
  line.setAttribute("y2", p2.y);
  line.setAttribute("class","line");
  lineLayer.appendChild(line);
}

function updateLines(){
  clearLines();
  if (!state.showLines) return;

  const size = state.size;
  if (!state.board || state.board.length !== size*size) return;

  for (let r=0; r<size; r++){
    if (isRowComplete(size, r))  drawLine(cellCenter(r*size), cellCenter(r*size + (size-1)));
  }
  for (let c=0; c<size; c++){
    if (isColComplete(size, c))  drawLine(cellCenter(c), cellCenter((size-1)*size + c));
  }
  if (isDiagMainComplete(size))  drawLine(cellCenter(0), cellCenter(size*size - 1));
  if (isDiagAntiComplete(size))  drawLine(cellCenter(size-1), cellCenter((size-1)*size));
}

// ========= ロゴ白縁（canvas方式） =========
function drawTitleStrokeCanvas(){
  const stack  = document.getElementById("titleStack");
  const img    = stack?.querySelector(".title-image");
  const canvas = document.getElementById("titleStroke");
  if (!stack || !img || !canvas) return;

  const rect = stack.getBoundingClientRect();
  const dpr  = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width  = rect.width + "px";
  canvas.style.height = rect.height + "px";

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(dpr, dpr);

  const d = TITLE_STROKE_THICKNESS;
  const offsets = [
    {x:  d, y:  0}, {x: -d, y:  0}, {x:  0, y:  d}, {x:  0, y: -d},
    {x:  d, y:  d}, {x:  d, y: -d}, {x: -d, y:  d}, {x: -d, y: -d}
  ];

  offsets.forEach(({x, y})=>{
    ctx.save();
    ctx.drawImage(img, x, y + TITLE_STROKE_Y_OFFSET, rect.width, rect.height);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.restore();
  });

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

// ========= キャプチャ（クリーンモードで黒線対策） =========
function setCleanCaptureMode(on){
  const area = document.getElementById("captureArea");
  if (!area) return;
  if (on) area.classList.add("capture-clean");
  else    area.classList.remove("capture-clean");
}

async function exportBoardAsImage(){
  const target = document.getElementById("captureArea");
  if (!target) throw new Error("キャプチャ対象が見つかりません。");

  updateLines();
  drawTitleStrokeCanvas(); // 保存直前に白縁を最新化

  setCleanCaptureMode(true);
  await new Promise(r => requestAnimationFrame(r));
  const scale  = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const canvas = await html2canvas(target, {
    useCORS: true, allowTaint: false, backgroundColor: null, scale
  });
  setCleanCaptureMode(false);

  return new Promise((resolve)=>{
    canvas.toBlob((blob)=>{
      resolve({ blob, dataURL: canvas.toDataURL("image/png") });
    }, "image/png", 1.0);
  });
}

// ========= 画像保存 =========
function buildFilename(){
  const size = state.size;
  const mode = state.kumaMode === "exclude" ? "no-kuma"
            : state.kumaMode === "include" ? "with-kuma"
            : "kuma-only";
  return `salmon-bingo_${size}x${size}_${mode}.png`;
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function saveImageOnly(){
  try{
    const { blob } = await exportBoardAsImage();
    downloadBlob(blob, buildFilename());
  }catch(e){
    console.error(e);
    alert("画像の書き出しに失敗しました。");
  }
}

// ========= 保存・復元（カード毎にキーを分ける） =========
function storageKeyFor(seed, size, mode, free){
  const s = seed || "NOSEED";
  return `${BASE_STORAGE_KEY}:${s}:${size}:${mode}:${free ? 1 : 0}`;
}
function currentStorageKey(){
  return storageKeyFor(state.seed || currentSeed, state.size, state.kumaMode, state.free);
}
function saveState(){
  try{
    const key = currentStorageKey();
    localStorage.setItem(key, JSON.stringify(state));
    markAsLatest(key); // ← 直近カードのポインタを更新
  }catch(e){
    console.warn("状態の保存に失敗:", e);
  }
}
let saveTimer = null;
function scheduleSave(){
  if (saveTimer) cancelAnimationFrame(saveTimer);
  saveTimer = requestAnimationFrame(saveState);
}
function loadStateBy(seed, size, mode, free){
  try{
    const key = storageKeyFor(seed, size, mode, free);
    const j = localStorage.getItem(key);
    return j ? JSON.parse(j) : null;
  }catch(e){
    console.warn("状態の読み込みに失敗:", e);
    return null;
  }
}
function applyStateToUI(){
  sizeSelect.value        = String(state.size);
  kumaSelect.value        = state.kumaMode;
  markerStyleSelect.value = state.markerStyle;
  jitterToggle.checked    = !!state.jitter;
  lineToggle.checked      = !!state.showLines;
  freeToggle.checked      = !!state.free;
}

// ========= シェアURL作成 =========
function buildShareUrl(){
  const url = new URL(location.href);
  const p = url.searchParams;
  p.set("size", String(state.size));
  p.set("mode", state.kumaMode);
  p.set("free", state.free ? "1" : "0");
  if (state.seed) p.set("seed", state.seed);
  else p.delete("seed");
  url.search = p.toString();
  return url.toString();
}
function updateShareBox(){
  const link = buildShareUrl();
  if (shareUrlInput) shareUrlInput.value = link;
  // ← アドレスバーは更新しない（履歴を汚さない）
}

// URLクリーンアップ（seed等を消してパスだけにする）
function cleanAddressBar(){
  const clean = location.origin + location.pathname;
  history.replaceState(null, "", clean);
}

// ========= 生成 / リセット =========
function ensureCenterIsDuplicateFor9x9(selectedWeapons){
  const size = state.size;
  if (!(size === 9 && state.free && state.kumaMode !== "kuma_only")) return;

  const mid = Math.floor(size / 2);
  const centerIdx = mid * size + mid;

  const counts = new Map();
  selectedWeapons.forEach(w => counts.set(w.name, (counts.get(w.name) || 0) + 1));

  let dupIdx = -1;
  for (let i = 0; i < selectedWeapons.length; i++){
    if (i === centerIdx) continue;
    const w = selectedWeapons[i];
    if ((counts.get(w.name) || 0) >= 2){ dupIdx = i; break; }
  }

  if (dupIdx !== -1){
    const temp = selectedWeapons[centerIdx];
    selectedWeapons[centerIdx] = selectedWeapons[dupIdx];
    selectedWeapons[dupIdx] = temp;
  } else if (selectedWeapons.length > 1){
    selectedWeapons[centerIdx] = selectedWeapons[0];
  }
}

function generateWithSeed(seedStr){
  const rng = makeRng(seedStr);
  const size = parseInt(sizeSelect.value, 10);
  const mode = kumaSelect.value;
  const total = size * size;

  state.seed = seedStr;     // ← このカードの識別子として保存
  state.size = size;
  state.kumaMode = mode;

  const pool = filterByKumaMode(ALL_WEAPONS, mode);

  let selectedWeapons;
  if (size === 9 && mode !== "kuma_only"){
    selectedWeapons = pickWeaponsCap2Seeded(pool, total, 2, rng);
  } else {
    const allowDup = (mode === "kuma_only") || (pool.length < total);
    selectedWeapons = pickWeaponsSeeded(pool, total, allowDup, rng);
  }

  ensureCenterIsDuplicateFor9x9(selectedWeapons);

  state.board = selectedWeapons.map(w => ({
    weapon: { name: w.name || "", img: w.img || "", tag: normTag(w.tag) },
    selected: false
  }));

  renderBingo(size);
  scheduleSave();
}

function generateBingo(){
  // ★毎回、新しいシードで作り直す（何度でもランダム生成OK）
  currentSeed = newSeed();
  state.seed  = currentSeed;
  generateWithSeed(currentSeed);
  updateShareBox(); // 共有用テキストのみ更新（アドレスバーは据え置き）
}

// すべてのマークを外す（盤面・武器構成は維持）
function resetBoardMarks(){
  if (!state.board || !state.board.length) return;
  state.board.forEach(cell => { cell.selected = false; });
  const cells = getCells();
  for (const cell of cells) {
    cell.dataset.selected = "false";
    const mark = cell.querySelector(".mark");
    if (mark) mark.remove();
  }
  updateLines();
  scheduleSave();
}

// ========= イベント =========
btnGenerate.addEventListener("click", (e)=>{
  e.preventDefault(); e.stopPropagation();
  generateBingo();
});
btnReset.addEventListener("click", (e)=>{
  e.preventDefault(); e.stopPropagation();
  resetBoardMarks();
});
btnSave.addEventListener("click", saveImageOnly);

copyUrlBtn?.addEventListener("click", async ()=>{
  try{
    await navigator.clipboard.writeText(shareUrlInput.value);
    copyUrlBtn.textContent = "コピー済み！";
    setTimeout(()=> copyUrlBtn.textContent = "コピー", 1200);
  }catch{
    shareUrlInput.select();
    document.execCommand("copy");
  }
});

lineToggle.addEventListener("change", () => {
  state.showLines = !!lineToggle.checked;
  updateLines();
  scheduleSave();
});
freeToggle.addEventListener("change", () => {
  state.free = !!freeToggle.checked;
  scheduleSave();
  const hasAny = state.board.some(c => !!c.weapon);
  if (hasAny) renderBingo(state.size);
  else        renderEmptyGrid(state.size);
  updateShareBox();
});
sizeSelect.addEventListener("change", () => {
  const newSize = parseInt(sizeSelect.value, 10);
  state.size = newSize;
  state.board = Array.from({length: newSize*newSize}, () => ({ weapon: null, selected: false }));
  renderEmptyGrid(newSize);
  scheduleSave();
  updateShareBox();
});
kumaSelect.addEventListener("change", () => {
  state.kumaMode = kumaSelect.value;
  scheduleSave();
  updateShareBox();
});
markerStyleSelect.addEventListener("change", () => {
  state.markerStyle = markerStyleSelect.value;
  document.querySelectorAll(".cell").forEach((cell, i) => {
    if (state.board[i].selected) setCellSelected(cell, true);
  });
  scheduleSave();
});
jitterToggle.addEventListener("change", () => {
  state.jitter = !!jitterToggle.checked;
  document.querySelectorAll(".cell").forEach((cell, i) => {
    if (state.board[i].selected) setCellSelected(cell, true);
  });
  scheduleSave();
});

// リサイズでライン再計算＆ロゴ白縁再描画
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (resizeTimer) cancelAnimationFrame(resizeTimer);
  resizeTimer = requestAnimationFrame(() => {
    updateLines();
    drawTitleStrokeCanvas();
  });
});

// ========= 初期化 =========
(async function init(){
  // JSON読み込み
  try{
    const res = await fetch(JSON_PATH);
    if (!res.ok) throw new Error(`JSON読み込み失敗: ${res.status}`);
    const data = await res.json();
    ALL_WEAPONS = (Array.isArray(data) ? data : []).map(w => ({
      name: w.name || "",
      img:  w.img  || "",
      tag:  normTag(w.tag)
    }));
  }catch(err){
    console.error(err);
    alert("武器データの読み込みに失敗しました。HTTP環境（例: GitHub Pages）で開いているか、JSONパスをご確認ください。");
  }

  // URLにseedがある：そのカードを復元 → 保存 → アドレスバーをクリーン化
  if (urlSeed){
    state.seed = urlSeed;
    const loaded = loadStateBy(urlSeed, state.size, state.kumaMode, state.free);
    applyStateToUI();

    if (loaded && Array.isArray(loaded.board) && loaded.board.length === state.size*state.size){
      state = { ...state, ...loaded, seed: urlSeed };
      renderBingo(state.size);
    }else{
      generateWithSeed(urlSeed);
    }

    // 現在表示中のカードを保存して直近ポインタ更新 → アドレスバーからクエリ削除
    saveState();
    cleanAddressBar();

  }else{
    // URLにseedが無い：直近カードを復元して表示
    const last = loadLatestState();
    if (last && Array.isArray(last.board) && last.board.length === (last.size * last.size)) {
      state = { ...state, ...last };
      applyStateToUI();
      renderBingo(state.size);
    } else {
      applyStateToUI();
      renderEmptyGrid(state.size);
    }
  }

  // 共有URL 初期表示（アドレスバーは触らない）
  updateShareBox();

  // ロゴ白縁 初回描画
  drawTitleStrokeCanvas();
})();
