// ========= 設定 =========
const JSON_PATH = "weapons.json";
const STORAGE_KEY = "salmon_bingo_v1";

// ========= DOM取得 =========
const bingoEl      = document.getElementById("bingo");
const lineLayer    = document.getElementById("lineLayer");
const sizeSelect   = document.getElementById("sizeSelect");
const kumaSelect   = document.getElementById("kumaSelect");
const markerStyleSelect = document.getElementById("markerStyle");
const jitterToggle = document.getElementById("jitterToggle");
const lineToggle   = document.getElementById("lineToggle");
const btnGenerate  = document.getElementById("btnGenerate");
const btnReset     = document.getElementById("btnReset");
const btnTwitter   = document.getElementById("btnTwitter");
const btnSave      = document.getElementById("btnSave");

// ========= 状態 =========
let ALL_WEAPONS = [];  // JSON読込後に格納
let currentGridSize = parseInt(sizeSelect.value, 10);

// 保存対象の状態（boardは size*size の配列、各要素 { weapon?:{name,img,tag}|null, selected:boolean }）
let state = {
  size: currentGridSize,
  kumaMode: kumaSelect.value,           // exclude | include | kuma_only
  markerStyle: markerStyleSelect.value, // circle | fish
  jitter: !!jitterToggle.checked,
  showLines: !!lineToggle.checked,
  board: [],                            // 後で初期化
};

// ========= ユーティリティ =========
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const normTag = (tag) => {
  const t = String(tag || "").toLowerCase();
  if (["kuma","クマ","くま","クマブキ"].some(x => t.includes(x))) return "kuma";
  return ["normal","通常","通常武器"].some(x => t.includes(x)) ? "normal" : "normal";
};

const filterByKumaMode = (list, mode) => {
  if (mode === "kuma_only") return list.filter(w => normTag(w.tag) === "kuma");
  if (mode === "exclude")   return list.filter(w => normTag(w.tag) === "normal");
  return list; // include
};

const pickWeapons = (pool, count, allowDuplicates=false) => {
  if (!allowDuplicates && pool.length < count) {
    console.warn("プール不足：重複なし指定ですが必要数に足りません。重複許可に切替。");
    allowDuplicates = true;
  }
  if (!allowDuplicates) return shuffle(pool).slice(0, count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[Math.floor(Math.random()*pool.length)]);
  return out;
};

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
    inner.style.backgroundImage = "url('images/markers/fish.png')";
  } else if (style === "stamp") {
    wrap.classList.add("mark--img");
    inner.style.backgroundImage = "url('images/markers/uhanko.png')";
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

  // 状態更新
  state.board[idx].selected = !selected;
  scheduleSave();
  updateLines();
}

// ========= 盤面レンダリング =========
function renderEmptyGrid(size){
  bingoEl.innerHTML = "";
  lineLayer.innerHTML = "";
  // ← 重要：スマホで溢れないよう minmax(0,1fr)
  bingoEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;

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
}

function renderBingo(size){
  bingoEl.innerHTML = "";
  lineLayer.innerHTML = "";
  // ← 重要：スマホで溢れないよう minmax(0,1fr)
  bingoEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;

  const total = size * size;
  for (let i = 0; i < total; i++){
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.selected = state.board[i].selected ? "true" : "false";

    const w = state.board[i].weapon;
    if (w && w.img){
      const img = document.createElement("img");
      img.crossOrigin = "anonymous";   // 画像出力用
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
}

// ========= ライン判定 & 描画 =========
function getCells(){
  return Array.from(bingoEl.querySelectorAll(".cell"));
}
function isRowComplete(size, rowIdx){
  for (let c = 0; c < size; c++){
    const idx = rowIdx * size + c;
    if (!state.board[idx].selected) return false;
  }
  return true;
}
function isColComplete(size, colIdx){
  for (let r = 0; r < size; r++){
    const idx = r * size + colIdx;
    if (!state.board[idx].selected) return false;
  }
  return true;
}
function isDiagMainComplete(size){
  for (let i = 0; i < size; i++){
    const idx = i * size + i;
    if (!state.board[idx].selected) return false;
  }
  return true;
}
function isDiagAntiComplete(size){
  for (let i = 0; i < size; i++){
    const idx = i * size + (size - 1 - i);
    if (!state.board[idx].selected) return false;
  }
  return true;
}

// セル中心座標（SVG内座標）
function cellCenter(idx){
  const cells = getCells();
  const cell = cells[idx];
  const gridRect = bingoEl.getBoundingClientRect();
  const rect = cell.getBoundingClientRect();
  const x = (rect.left + rect.right)/2 - gridRect.left;
  const y = (rect.top  + rect.bottom)/2 - gridRect.top;
  return { x, y };
}

function clearLines(){
  lineLayer.innerHTML = "";
}

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
  const total = size * size;
  if (!state.board || state.board.length !== total) return;

  // 行
  for (let r = 0; r < size; r++){
    if (isRowComplete(size, r)){
      const startIdx = r * size + 0;
      const endIdx   = r * size + (size - 1);
      drawLine(cellCenter(startIdx), cellCenter(endIdx));
    }
  }
  // 列
  for (let c = 0; c < size; c++){
    if (isColComplete(size, c)){
      const startIdx = 0 * size + c;
      const endIdx   = (size - 1) * size + c;
      drawLine(cellCenter(startIdx), cellCenter(endIdx));
    }
  }
  // 斜め
  if (isDiagMainComplete(size)){
    drawLine(cellCenter(0), cellCenter(size*size - 1));
  }
  if (isDiagAntiComplete(size)){
    drawLine(cellCenter(size - 1), cellCenter((size - 1) * size));
  }
}

// ========= 画像書き出し =========
function getCaptureElement(){
  return document.getElementById("boardWrap");
}
function buildFilename(){
  const size = state.size;
  const modeLabel = state.kumaMode === "exclude" ? "no-kuma" : state.kumaMode === "include" ? "with-kuma" : "kuma-only";
  return `salmon-bingo_${size}x${size}_${modeLabel}.png`;
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function exportBoardAsImage(){
  const target = getCaptureElement();
  if (!target) throw new Error("キャプチャ対象が見つかりません。");
  updateLines(); // 最新レイアウトに

  const scale = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const canvas = await html2canvas(target, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    scale
  });

  return new Promise((resolve)=>{
    canvas.toBlob((blob)=>{
      resolve({ blob, dataURL: canvas.toDataURL("image/png") });
    }, "image/png", 1.0);
  });
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

async function shareTwitter(){
  try{
    const { blob } = await exportBoardAsImage();
    downloadBlob(blob, buildFilename()); // まず保存
    const size = state.size;
    const modeLabel = state.kumaMode === "exclude" ? "クマ無し"
                     : state.kumaMode === "include" ? "クマ含む"
                     : "クマのみ";
    const text = encodeURIComponent(`サモラン・ビンゴの結果画像！ サイズ: ${size}×${size} ／ 設定: ${modeLabel}\n#サーモンラン #スプラトゥーン`);
    const intent = `https://twitter.com/intent/tweet?text=${text}`;
    window.open(intent, "_blank", "noopener");
  }catch(e){
    console.error(e);
    alert("画像の書き出しに失敗しました。");
  }
}

// ========= 保存・復元 =========
function saveState(){
  try{
    const json = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, json);
  }catch(e){
    console.warn("状態の保存に失敗しました:", e);
  }
}
let saveTimer = null;
function scheduleSave(){
  if (saveTimer) cancelAnimationFrame(saveTimer);
  saveTimer = requestAnimationFrame(saveState);
}

function loadState(){
  try{
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    const obj = JSON.parse(json);
    return obj;
  }catch(e){
    console.warn("状態の読み込みに失敗しました:", e);
    return null;
  }
}

function applyStateToUI(){
  sizeSelect.value = String(state.size);
  kumaSelect.value = state.kumaMode;
  markerStyleSelect.value = state.markerStyle;
  jitterToggle.checked = !!state.jitter;
  lineToggle.checked = !!state.showLines;
}

function buildBoardFromWeapons(weaponsArr){
  const total = state.size * state.size;
  state.board = Array.from({length: total}, (_, i) => ({
    weapon: weaponsArr[i] ?? null,
    selected: false
  }));
}

// ========= 生成/リセット =========
function generateBingo(){
  const size = parseInt(sizeSelect.value, 10);
  const mode = kumaSelect.value;
  const total = size * size;

  // UI値→state
  state.size = size;
  state.kumaMode = mode;

  // プールから武器抽選
  const pool = filterByKumaMode(ALL_WEAPONS, mode);
  const allowDup = (mode === "kuma_only");
  const selectedWeapons = pickWeapons(pool, total, allowDup);

  // 盤面に配置（選択状態はリセット）
  state.board = selectedWeapons.map(w => ({
    weapon: { name: w.name || "", img: w.img || "", tag: normTag(w.tag) },
    selected: false
  }));

  renderBingo(size);
  scheduleSave();
}

function resetBoard(){
  // 画像を消し、空グリッドへ（選択状態もクリア）
  const size = state.size;
  state.board = Array.from({length: size*size}, () => ({ weapon: null, selected: false }));
  renderEmptyGrid(size);
  scheduleSave();
}

// ========= イベント =========
btnGenerate.addEventListener("click", generateBingo);
btnReset.addEventListener("click", resetBoard);
btnSave.addEventListener("click", saveImageOnly);
btnTwitter.addEventListener("click", shareTwitter);

// ライン表示切替
lineToggle.addEventListener("change", () => {
  state.showLines = !!lineToggle.checked;
  updateLines();
  scheduleSave();
});

// サイズ変更：未抽選でも即空盤面リサイズ
sizeSelect.addEventListener("change", () => {
  const newSize = parseInt(sizeSelect.value, 10);
  state.size = newSize;
  currentGridSize = newSize;

  // boardを新サイズに合わせて作り直し（武器は消す）
  state.board = Array.from({length: newSize*newSize}, () => ({ weapon: null, selected: false }));
  renderEmptyGrid(newSize);
  scheduleSave();
});

// クマ設定／マーク設定／手書き風ズレ
kumaSelect.addEventListener("change", () => {
  state.kumaMode = kumaSelect.value;
  scheduleSave();
});
markerStyleSelect.addEventListener("change", () => {
  state.markerStyle = markerStyleSelect.value;
  // 既存マークを描き直す（見た目が変わるため）
  const cells = getCells();
  cells.forEach((cell, i) => {
    if (state.board[i].selected){
      setCellSelected(cell, true);
    }
  });
  scheduleSave();
});
jitterToggle.addEventListener("change", () => {
  state.jitter = !!jitterToggle.checked;
  // 既存マークを描き直してズレを再適用
  const cells = getCells();
  cells.forEach((cell, i) => {
    if (state.board[i].selected){
      setCellSelected(cell, true);
    }
  });
  scheduleSave();
});

// リサイズでライン再計算（レスポンシブ）
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (resizeTimer) cancelAnimationFrame(resizeTimer);
  resizeTimer = requestAnimationFrame(updateLines);
});

// ========= 起動処理 =========
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
    alert("武器データの読み込みに失敗しました。GitHub Pages等のHTTP環境で開いているか、JSONパスをご確認ください。");
  }

  // 保存済み状態があれば復元
  const loaded = loadState();
  if (loaded && loaded.size){
    // 互換性確保しつつマージ
    state.size        = parseInt(loaded.size, 10) || state.size;
    state.kumaMode    = loaded.kumaMode ?? state.kumaMode;
    state.markerStyle = loaded.markerStyle ?? state.markerStyle;
    state.jitter      = !!loaded.jitter;
    state.showLines   = loaded.showLines !== false;

    const total = state.size * state.size;
    if (Array.isArray(loaded.board) && loaded.board.length === total){
      state.board = loaded.board.map(cell => ({
        weapon: cell.weapon ? { name: cell.weapon.name||"", img: cell.weapon.img||"", tag: normTag(cell.weapon.tag) } : null,
        selected: !!cell.selected
      }));
    }else{
      state.board = Array.from({length: total}, () => ({ weapon: null, selected: false }));
    }

    applyStateToUI();

    // 盤面に武器があれば画像付きで、なければ空グリッドを描画
    const hasAnyWeapon = state.board.some(c => !!c.weapon);
    if (hasAnyWeapon){
      renderBingo(state.size);
    }else{
      renderEmptyGrid(state.size);
    }
  }else{
    // 初期状態：空グリッド
    state.size = currentGridSize;
    state.board = Array.from({length: state.size*state.size}, () => ({ weapon: null, selected: false }));
    applyStateToUI();
    renderEmptyGrid(state.size);
    scheduleSave();
  }
})();
