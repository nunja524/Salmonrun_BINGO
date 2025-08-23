// ---- 設定 ----
const JSON_PATH = "weapons.json";

// DOM取得
const bingoEl = document.getElementById("bingo");
const sizeSelect = document.getElementById("sizeSelect");
const kumaSelect = document.getElementById("kumaSelect");
const btnGenerate = document.getElementById("btnGenerate");
const btnReset = document.getElementById("btnReset");
const btnTwitter = document.getElementById("btnTwitter");

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
  if (!allowDuplicates) {
    if (pool.length < count) {
      console.warn("プールが不足：重複なし指定ですが必要数に足りません。重複許可に切り替えます。");
      allowDuplicates = true;
    }
  }
  if (!allowDuplicates) {
    return shuffle(pool).slice(0, count);
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
  }
  return out;
};

// レンダリング
const renderEmpty = () => {
  bingoEl.innerHTML = "";
  bingoEl.style.gridTemplateColumns = ""; // リセット
};

const renderBingo = (size, weapons) => {
  bingoEl.innerHTML = "";
  bingoEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  weapons.forEach(w => {
    const cell = document.createElement("div");
    cell.className = "cell";
    const img = document.createElement("img");
    img.src = w.img;
    img.alt = w.name;
    img.title = w.name;
    cell.appendChild(img);
    bingoEl.appendChild(cell);
  });
};

// 生成処理
const generateBingo = () => {
  const size = parseInt(sizeSelect.value, 10);
  currentGridSize = size;
  const mode = kumaSelect.value; // exclude | include | kuma_only
  const total = size * size;

  // プール作成
  const pool = filterByKumaMode(ALL_WEAPONS, mode);

  // 重複ルール：通常は重複なし／クマのみのときは重複あり
  const allowDup = (mode === "kuma_only");

  const selected = pickWeapons(pool, total, allowDup);
  renderBingo(size, selected);
};

// リセット
const resetBoard = () => {
  renderEmpty();
  // コントロールはそのままにする（必要なら初期化）
  // sizeSelect.value = "5"; kumaSelect.value = "exclude";
};

// Twitter共有（暫定：テキスト投稿）
// 画像添付はブラウザだけではできないため、後でhtml2canvasによる保存→手動添付を想定。
const shareTwitter = () => {
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
};

// イベント
btnGenerate.addEventListener("click", generateBingo);
btnReset.addEventListener("click", resetBoard);
btnTwitter.addEventListener("click", shareTwitter);

// 初期は空表示
renderEmpty();

// JSON読み込み
fetch(JSON_PATH)
  .then(res => {
    if (!res.ok) throw new Error(`JSON読み込み失敗: ${res.status}`);
    return res.json();
  })
  .then(data => {
    // 正規化して保持
    ALL_WEAPONS = (Array.isArray(data) ? data : []).map(w => ({
      name: w.name || "",
      img:  w.img  || "",
      tag:  normTag(w.tag)
    }));
  })
  .catch(err => {
    console.error(err);
    alert("武器データの読み込みに失敗しました。ファイルパスとJSON形式を確認してください。");
  });
