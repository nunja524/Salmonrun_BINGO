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
let ALL_WEAPONS = [];
let currentGridSize = parseInt(sizeSelect.value, 10);

let state = {
  size: currentGridSize,
  kumaMode: kumaSelect.value,
  markerStyle: markerStyleSelect.value,
  jitter: !!jitterToggle.checked,
  showLines: !!lineToggle.checked,
  board: [],
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
  return list;
};

const pickWeapons = (pool, count, allowDuplicates=false) => {
  if (!allowDuplicates && pool.length < count) {
    allowDuplicates = true;
  }
  if (!allowDuplicates) return shuffle(pool).slice(0, count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[Math.floor(Math.random()*pool.length)]);
  return out;
};

// ========= グリッド密度制御 =========
function applyGridTightness(size){
  if (size >= 6){
    bingoEl.classList.add("dense");
  }else{
    bingoEl.classList.remove("dense");
  }
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
  bingoEl.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;
  applyGridTightness(size);

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

// ========= ライン描画 =========
function getCells(){ return Array.from(bingoEl.querySelectorAll(".cell")); }
function isRowComplete(size, r){ for(let c=0;c<size;c++) if(!state.board[r*size+c].selected) return false; return true; }
function isColComplete(size, c){ for(let r=0;r<size;r++) if(!state.board[r*size+c].selected) return false; return true; }
function isDiagMainComplete(size){ for(let i=0;i<size;i++) if(!state.board[i*size+i].selected) return false; return true; }
function isDiagAntiComplete(size){ for(let i=0;i<size;i++) if(!state.board[i*size+(size-1-i)].selected) return false; return true; }

function cellCenter(idx){
  const cells = getCells();
  const cell = cells[idx];
  const gridRect = bingoEl.getBoundingClientRect();
  const rect = cell.getBoundingClientRect();
  return { x:(rect.left+rect.right)/2 - gridRect.left,
           y:(rect.top+rect.bottom)/2 - gridRect.top };
}
function clearLines(){ lineLayer.innerHTML=""; }
function drawLine(p1,p2){
  const line=document.createElementNS("http://www.w3.org/2000/svg","line");
  line.setAttribute("x1",p1.x); line.setAttribute("y1",p1.y);
  line.setAttribute("x2",p2.x); line.setAttribute("y2",p2.y);
  line.setAttribute("class","line");
  lineLayer.appendChild(line);
}
function updateLines(){
  clearLines();
  if(!state.showLines) return;
  const s=state.size;
  for(let r=0;r<s;r++) if(isRowComplete(s,r)) drawLine(cellCenter(r*s),cellCenter(r*s+(s-1)));
  for(let c=0;c<s;c++) if(isColComplete(s,c)) drawLine(cellCenter(c),cellCenter((s-1)*s+c));
  if(isDiagMainComplete(s)) drawLine(cellCenter(0),cellCenter(s*s-1));
  if(isDiagAntiComplete(s)) drawLine(cellCenter(s-1),cellCenter((s-1)*s));
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
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save(); ctx.scale(dpr,dpr);

  const d = 2.0; // 白縁の太さ
  const offsets = [
    {x: d,y:0},{x:-d,y:0},{x:0,y:d},{x:0,y:-d},
    {x:d,y:d},{x:d,y:-d},{x:-d,y:d},{x:-d,y:-d}
  ];
const globalOffsetY = -2
  offsets.forEach(({x,y})=>{
    ctx.save();
    ctx.drawImage(img, x, y + globalOffsetY, rect.width, rect.height);
    ctx.globalCompositeOperation="source-in";
    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,rect.width,rect.height);
    ctx.restore();
  });

  ctx.globalCompositeOperation="source-over";
  ctx.restore();
}

// ========= キャプチャ（クリーンモードON/OFF） =========
function setCleanCaptureMode(on){
  const area=document.getElementById("captureArea");
  if(!area) return;
  if(on) area.classList.add("capture-clean");
  else   area.classList.remove("capture-clean");
}

async function exportBoardAsImage(){
  const target=document.getElementById("captureArea");
  if(!target) throw new Error("キャプチャ対象なし");

  updateLines();
  drawTitleStrokeCanvas(); // 保存前に白縁を最新化

  setCleanCaptureMode(true);
  await new Promise(r=>requestAnimationFrame(r));
  const scale=Math.max(1,Math.min(window.devicePixelRatio||1,3));
  const canvas=await html2canvas(target,{useCORS:true,allowTaint:false,backgroundColor:null,scale});
  setCleanCaptureMode(false);

  return new Promise(res=>{
    canvas.toBlob(blob=>{res({blob,dataURL:canvas.toDataURL("image/png")});},"image/png",1.0);
  });
}

// ========= 保存/共有 =========
function buildFilename(){
  const size=state.size;
  const mode=state.kumaMode==="exclude"?"no-kuma":state.kumaMode==="include"?"with-kuma":"kuma-only";
  return `salmon-bingo_${size}x${size}_${mode}.png`;
}
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a);
  a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function saveImageOnly(){ const {blob}=await exportBoardAsImage(); downloadBlob(blob,buildFilename()); }
async function shareTwitter(){
  const {blob}=await exportBoardAsImage(); downloadBlob(blob,buildFilename());
  const size=state.size;
  const mode=state.kumaMode==="exclude"?"クマ無し":state.kumaMode==="include"?"クマ含む":"クマのみ";
  const text=encodeURIComponent(`サモラン・ビンゴ！ ${size}×${size} ／ ${mode}\n#サーモンラン #スプラトゥーン`);
  window.open(`https://twitter.com/intent/tweet?text=${text}`,"_blank","noopener");
}

// ========= 保存・復元 =========
function saveState(){ try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(e){} }
let saveTimer=null;
function scheduleSave(){ if(saveTimer)cancelAnimationFrame(saveTimer); saveTimer=requestAnimationFrame(saveState); }
function loadState(){ try{const j=localStorage.getItem(STORAGE_KEY); return j?JSON.parse(j):null;}catch(e){return null;} }
function applyStateToUI(){
  sizeSelect.value=String(state.size);
  kumaSelect.value=state.kumaMode;
  markerStyleSelect.value=state.markerStyle;
  jitterToggle.checked=!!state.jitter;
  lineToggle.checked=!!state.showLines;
}

// ========= 生成/リセット =========
function generateBingo(){
  const size=parseInt(sizeSelect.value,10);
  const mode=kumaSelect.value;
  state.size=size; state.kumaMode=mode;
  const pool=filterByKumaMode(ALL_WEAPONS,mode);
  const allowDup=(mode==="kuma_only");
  const weaps=pickWeapons(pool,size*size,allowDup);
  state.board=weaps.map(w=>({weapon:{name:w.name,img:w.img,tag:normTag(w.tag)},selected:false}));
  renderBingo(size); scheduleSave();
}
function resetBoard(){
  state.board=Array.from({length:state.size*state.size},()=>({weapon:null,selected:false}));
  renderEmptyGrid(state.size); scheduleSave();
}

// ========= イベント =========
btnGenerate.addEventListener("click",generateBingo);
btnReset.addEventListener("click",resetBoard);
btnSave.addEventListener("click",saveImageOnly);
btnTwitter.addEventListener("click",shareTwitter);
lineToggle.addEventListener("change",()=>{state.showLines=!!lineToggle.checked;updateLines();scheduleSave();});
sizeSelect.addEventListener("change",()=>{
  const s=parseInt(sizeSelect.value,10);
  state.size=s;
  state.board=Array.from({length:s*s},()=>({weapon:null,selected:false}));
  renderEmptyGrid(s); scheduleSave();
});
kumaSelect.addEventListener("change",()=>{state.kumaMode=kumaSelect.value;scheduleSave();});
markerStyleSelect.addEventListener("change",()=>{
  state.markerStyle=markerStyleSelect.value;
  document.querySelectorAll(".cell").forEach((c,i)=>{ if(state.board[i].selected) setCellSelected(c,true); });
  scheduleSave();
});
jitterToggle.addEventListener("change",()=>{
  state.jitter=!!jitterToggle.checked;
  document.querySelectorAll(".cell").forEach((c,i)=>{ if(state.board[i].selected) setCellSelected(c,true); });
  scheduleSave();
});

// リサイズで再計算
let resizeTimer=null;
window.addEventListener("resize",()=>{
  if(resizeTimer) cancelAnimationFrame(resizeTimer);
  resizeTimer=requestAnimationFrame(()=>{updateLines();drawTitleStrokeCanvas();});
});

// ========= 初期化 =========
(async function init(){
  try{
    const res=await fetch(JSON_PATH);
    const data=await res.json();
    ALL_WEAPONS=(Array.isArray(data)?data:[]).map(w=>({name:w.name||"",img:w.img||"",tag:normTag(w.tag)}));
  }catch(e){ alert("武器データの読み込みに失敗しました。"); }

  const loaded=loadState();
  if(loaded){
    Object.assign(state,loaded);
    applyStateToUI();
    const hasAny=state.board.some(c=>!!c.weapon);
    if(hasAny) renderBingo(state.size); else renderEmptyGrid(state.size);
  }else{
    state.board=Array.from({length:state.size*state.size},()=>({weapon:null,selected:false}));
    renderEmptyGrid(state.size);
    scheduleSave();
  }
  drawTitleStrokeCanvas(); // 初期白縁
})();
