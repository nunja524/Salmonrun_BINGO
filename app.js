// ---- 設定 ----
const JSON_PATH = "weapons.json";

// DOM取得
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

// 状態
let ALL_WEAPONS = [];  // JSON読込後に格納
let currentGridSize = parseInt(sizeSelect.value, 10);

// ユーティリティ
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

// ===== マーク関連 =====
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

  if (style === "fish") {
    wrap.classList.add("mark--img");
    inner.style.backgroundImage = "url('images/markers/fish.png')";
  } else {
    wrap.classList.add("mark--circle");
  }

  const { tx, ty, rot } = randomJitter(jitterEnabled);
  inner.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;

  wrap.appendChild(inner);
  return wrap;
}

function toggleCell(cell) {
  const selected = cell.dataset.selected === "true";
  if (selected) {
    cell.dataset.selected = "false";
    const mark = cell.querySelector(".mark");
    if (mark) mark.remove();
  } else {
    cell.dataset.selected = "true";
    const style = markerStyleSelect.value;      // circle | fish
    const jitterEnabled = jitterToggle.checked; // true | false
    const mark = createMark(style, jitterEnabled);
    cell.appendChild(mark);
  }
  // セルの状態が変わったらライン更新
  updateLines();
}

// ===== 盤面レンダリング =====
function renderEmptyGrid(size){
  bingoEl.innerHTML = "";
  lineLayer.innerHTML = "";
  bingoEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  const total = size * size;
  for (let i = 0; i < total; i++){
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.selected = "false";
    // 画像なしの空セルでもON/OFFできるように
    cell.addEventListener("click", () => toggleCell(cell));
    bingoEl.appendChild(cell);
  }
  // サイズ変更時もラインをクリア
  updateLines();
}

function renderBingo(size, weapons) {
  bingoEl.innerHTML = "";
  lineLayer.innerHTML = "";
  bingoEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  weapons.forEach(w => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.selected = "false";

    const img = document.createElement("img");
    img.src = w.img;
    img.alt = w.name;
    img.title = w.name;

    cell.appendChild(img);
    cell.addEventListener("click", () => toggleCell(cell));
    bingoEl.appendChild(cell);
  });

  updateLines();
}

// ===== ライン成立判定 & 描画 =====
function getCells(){
  return Array.from(bingoEl.querySelectorAll(".cell"));
}

function isRowComplete(size, rowIdx){
  const cells = getCells();
  for (let c = 0; c < size; c++){
    const idx = rowIdx * size + c;
    if (cells[idx]?.dataset.selected !== "true") return false;
  }
  return true;
}

function isColComplete(size, colIdx){
  const cells = getCells();
  for (let r = 0; r < size; r++){
    const idx = r * size + colIdx;
    if (cells[idx]?.dataset.selected !== "true") return false;
  }
  return true;
}

function isDiagMainComplete(size){
  const cells = getCells();
  for (let i = 0; i < size; i++){
    const idx = i * size + i;
    if (cells[idx]?.dataset.selected !== "true") return false;
  }
  return true;
}

function isDiagAntiComplete(size){
  const cells = getCells();
  for (let i = 0; i < size; i++){
    const idx = i * size + (size - 1 - i);
    if (cells[idx]?.dataset.selected !== "true") return false;
  }
  return true;
}

// セル中心座標（SVG内座標）を取得
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
  if (!lineToggle.checked) return;          // 表示OFF
  const size = currentGridSize;
  const total = size * size;
  if (getCells().length !== total) return;  // まだ盤面未生成

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

// リサイズ時も再計算（セル位置が変わるため）
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (resizeTimer) cancelAnimationFrame(resizeTimer);
  resizeTimer = requestAnimationFrame(updateLines);
});

// ===== 生成/リセット/共有 =====
function generateBingo(){
  const size = parseInt(sizeSelect.value, 10);
  currentGridSize = size;
  const mode = kumaSelect.value; // exclude | include | kuma_only
  const total = size * size;

  const pool = filterByKumaMode(ALL_WEAPONS, mode);
  const allowDup = (mode === "kuma_only");
  const selected = pickWeapons(pool, total, allowDup);
  renderBingo(size, selected);
}

function resetBoard(){
  // 画像は消し、空グリッドへ
  renderEmptyGrid(currentGridSize);
}

function shareTwitter(){
  const size = parseInt(sizeSelect.value, 10);
  const mode = kumaSelect.value;
  const modeLabel = mode === "exclude" ? "クマ無し"
                   : mode === "include" ? "クマ含む"
                   : "クマのみ";
  const text = encodeURIComponent(`サモラン・ビンゴを作成！ サイズ: ${size}×${size} ／ 設定: ${modeLabel}`);
  const url  = ""; // 公開URLがあれば設定
  const via  = ""; // アカウントがあれば設定
  const intent = `https://twitter.com/intent/tweet?text=${text}${url ? `&url=${encodeURIComponent(url)}` : ""}${via ? `&via=${encodeURIComponent(via)}` : ""}`;
  window.open(intent, "_blank", "noopener");
}

// イベント
btnGenerate.addEventListener("click", generateBingo);
btnReset.addEventListener("click", resetBoard);
btnTwitter.addEventListener("click", shareTwitter);

// ライン表示ON/OFF
lineToggle.addEventListener("change", updateLines);

// サイズ変更時：即空グリッドを再構築（未抽選でもマス表示）
sizeSelect.addEventListener("change", () => {
  currentGridSize = parseInt(sizeSelect.value, 10);
  renderEmptyGrid(currentGridSize);
});

// 初期は「未抽選だがマスは出ている」状態
renderEmptyGrid(currentGridSize);

// JSON読み込み
fetch(JSON_PATH)
  .then(res => {
    if (!res.ok) throw new Error(`JSON読み込み失敗: ${res.status}`);
    return res.json();
  })
  .then(data => {
    ALL_WEAPONS = (Array.isArray(data) ? data : []).map(w => ({
      name: w.name || "",
      img:  w.img  || "",
      tag:  normTag(w.tag)
    }));
  })
  .catch(err => {
    console.error(err);
    alert("武器データの読み込みに失敗しました。GitHub Pages等のHTTP環境で開いているか、JSONパスをご確認ください。");
  });
