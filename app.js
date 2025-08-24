// ========= 設定 =========
const JSON_PATH   = "weapons.json";
const STORAGE_KEY = "salmon_bingo_v1";

// ロゴ白縁のチューニング（必要なら調整）
const TITLE_STROKE_THICKNESS = 2.0;  // 白縁の太さ(px)
const TITLE_STROKE_Y_OFFSET  = 0;    // 白縁の全体的な上下補正（上へ -1 / 下へ +1 など）

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

const captureArea  = document.getElementById("captureArea");
const boardWrap    = document.getElementById("boardWrap");
const titleWrap    = document.querySelector(".title-wrap");

// ========= 状態 =========
let ALL_WEAPONS = [];  // JSON読み込み後に格納
let currentGridSize = parseInt(sizeSelect.value, 10);

let state = {
  size: currentGridSize,
  kumaMode: kumaSelect.value,           // exclude | include | kuma_only（HTML側のselectedが反映されます）
  markerStyle: markerStyleSelect.value, // circle | golden_roe | stamp
  jitter: !!jitterToggle.checked,
  showLines: !!lineToggle.checked,
  board: [], // size*size の配列 { weapon: {name,img,tag} | null, selected: boolean }
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
  return "normal";
};

const filterByKumaMode = (list, mode) => {
  if (mode === "kuma_only") return list.filter(w => normTag(w.tag) === "kuma");
  if (mode === "exclude")   return list.filter(w => normTag(w.tag) === "normal");
  return list; // include
};

// 重複あり/なしでcount個ピック
const pickWeapons = (pool, count, allowDuplicates=false) => {
  if (!allowDuplicates && pool.length < count) allowDuplicates = true;
  if (!allowDuplicates) return shuffle(pool).slice(0, count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[Math.floor(Math.random()*pool.length)]);
  return out;
};

// 9x9用：同じ武器を最大cap回（デフォ2回）までに抑えてcount個ピック
function pickWeaponsCap2(pool, count, cap = 2){
  if (pool.length * cap >= count){
    // 種類が十分ある：cap上限を守って配る
    const shuffled = shuffle(pool);
    const result = [];
    const usedCount = new Map(); // name -> 使用回数
    let idx = 0;
    while(result.length < count){
      const w = shuffled[idx % shuffled.length];
      const n = (usedCount.get(w.name) || 0);
      if (n < cap){ result.push(w); usedCount.set(w.name, n+1); }
      idx++;
    }
    return result;
  }
  // 種類が少なくcap制限を満たせないとき（例：クマのみ）→ ランダムで埋める
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[Math.floor(Math.random()*pool.length)]);
  return out;
}

// ========= グリッド密度制御（6列以上はdense） =========
function applyGridTightness(size){
  if (size >= 6) bingoEl.classList.add("dense");
  else           bingoEl.classList.remove("dense");
}

// ========= レイアウト微調整（7×7以上/9×9で余白やgapを詰める） =========
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
  drawTitleStrokeCanvas(); // レイアウト変更時は白縁も描き直す
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
  drawTitleStrokeCanvas();
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
  const dpr  = Math.min(window.devicePixelRatio || 1, 2); // 重くならないよう上限
  canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width  = rect.width + "px";
  canvas.style.height = rect.height + "px";

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(dpr, dpr);

  const d = TITLE_STROKE_THICKNESS; // 太さ
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

// ========= 画像保存 / 共有 =========
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

async function shareTwitter(){
  try{
    const { blob } = await exportBoardAsImage();
    downloadBlob(blob, buildFilename()); // まず保存
    const size = state.size;
    const modeLabel = state.kumaMode === "exclude" ? "クマ無し"
                     : state.kumaMode === "include" ? "クマ含む"
                     : "クマのみ";
    const text = encodeURIComponent(`サモラン・ビンゴ！ ${size}×${size} ／ ${modeLabel}\n#サーモンラン #スプラトゥーン`);
    const intent = `https://twitter.com/intent/tweet?text=${text}`;
    window.open(intent, "_blank", "noopener");
  }catch(e){
    console.error(e);
    alert("画像の書き出しに失敗しました。");
  }
}

// ========= 保存・復元 =========
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.warn("状態の保存に失敗:", e); }
}
let saveTimer = null;
function scheduleSave(){
  if (saveTimer) cancelAnimationFrame(saveTimer);
  saveTimer = requestAnimationFrame(saveState);
}
function loadState(){
  try{
    const j = localStorage.getItem(STORAGE_KEY);
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
}

// ========= 生成 / リセット =========
function generateBingo(){
  const size = parseInt(sizeSelect.value, 10);
  const mode = kumaSelect.value;
  const total = size * size;

  state.size = size;
  state.kumaMode = mode;

  const pool = filterByKumaMode(ALL_WEAPONS, mode);

  let selectedWeapons;
  if (size === 9 && mode !== "kuma_only"){
    // 9×9：同一武器が3つ以上にならない（最大2回）※クマのみは除外
    selectedWeapons = pickWeaponsCap2(pool, total, 2);
  } else {
    const allowDup = (mode === "kuma_only") || (pool.length < total);
    selectedWeapons = pickWeapons(pool, total, allowDup);
  }

  state.board = selectedWeapons.map(w => ({
    weapon: { name: w.name || "", img: w.img || "", tag: normTag(w.tag) },
    selected: false
  }));

  renderBingo(size);
  scheduleSave();
}

function resetBoard(){
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

lineToggle.addEventListener("change", () => {
  state.showLines = !!lineToggle.checked;
  updateLines();
  scheduleSave();
});

sizeSelect.addEventListener("change", () => {
  const newSize = parseInt(sizeSelect.value, 10);
  state.size = newSize;

  state.board = Array.from({length: newSize*newSize}, () => ({ weapon: null, selected: false }));
  renderEmptyGrid(newSize);
  scheduleSave();
});

kumaSelect.addEventListener("change", () => {
  state.kumaMode = kumaSelect.value;
  scheduleSave();
});

markerStyleSelect.addEventListener("change", () => {
  state.markerStyle = markerStyleSelect.value;
  // 既存のマークを描き直し
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

  // 保存状態の復元
  const loaded = loadState();
  if (loaded && loaded.size){
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

    const hasAnyWeapon = state.board.some(c => !!c.weapon);
    if (hasAnyWeapon) renderBingo(state.size);
    else              renderEmptyGrid(state.size);
  }else{
    // 初期は空盤面
    state.size = currentGridSize;
    state.board = Array.from({length: state.size*state.size}, () => ({ weapon: null, selected: false }));
    applyStateToUI();
    renderEmptyGrid(state.size);
    scheduleSave();
  }

  // ロゴ白縁 初回描画
  drawTitleStrokeCanvas();
})();
