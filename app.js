const PHASE = {
  LOADING: "loading",
  SETUP: "setup",
  BATTLE: "battle",
  CONSTRUCTION: "construction",
  GAME_OVER: "game_over",
};

function nowTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function splitTopLevel(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  const out = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "（" || ch === "(") depth += 1;
    if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "，" || ch === ",")) {
      const t = cur.trim();
      if (t) out.push(t);
      cur = "";
      continue;
    }
    cur += ch;
  }
  const t = cur.trim();
  if (t) out.push(t);
  return out;
}

function splitTopLevelBy(text, separators) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  const sepSet = new Set(separators);
  const out = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "（" || ch === "(") depth += 1;
    if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && sepSet.has(ch)) {
      const t = cur.trim();
      if (t) out.push(t);
      cur = "";
      continue;
    }
    cur += ch;
  }
  const t = cur.trim();
  if (t) out.push(t);
  return out;
}

function splitEffectList(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  return splitTopLevelBy(s, ["；", ";"]);
}

function splitLinkGroup(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  return splitTopLevelBy(s, ["&", "＆"]);
}

function parseHpRules(line) {
  const s = String(line ?? "");
  const rules = [];
  const re = /HP=(\d+)（([^）]+)）/g;
  for (const m of s.matchAll(re)) {
    const effect = m[2].trim();
    const stop = effect === "卡";
    const effects = stop ? [] : parseCardEffects(effect);
    rules.push({ hp: Number(m[1]), effect, stop, effects });
  }
  return rules;
}

function parseFighters(txt) {
  const lines = String(txt ?? "")
    .replaceAll("\r\n", "\n")
    .split("\n");

  const fighters = [];
  let cur = null;
  let inDeck = false;
  let deckMode = null;
  let deckTextLines = [];
  let deckNameLines = [];
  let planLines = [];
  let inSpecial = false;

  function commit() {
    if (!cur) return;
    const deck = deckTextLines.map((t) => t.trim()).filter(Boolean);
    const names = deckNameLines.map((t) => t.trim()).filter(Boolean);
    const plans = planLines.map((t) => t.trim()).filter(Boolean);
    cur.deckTextByNo = new Map(deck.map((t, idx) => [idx + 1, t]));
    cur.deckNameByNo = new Map(names.map((t, idx) => [idx + 1, t]));
    cur.deckSize = deck.length;
    cur.planTextByNo = new Map(plans.map((t, idx) => [idx + 1, t]));
    cur.planSize = plans.length;
    fighters.push(cur);
    cur = null;
    inDeck = false;
    deckMode = null;
    deckTextLines = [];
    deckNameLines = [];
    planLines = [];
    inSpecial = false;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const fighterStart = /^Fighter\s+(.+):$/.exec(line);
    if (fighterStart) {
      commit();
      cur = {
        id: fighterStart[1].trim(),
        name: fighterStart[1].trim(),
        code: null,
        beginHp: null,
        beginPower: null,
        startBonus: null,
        koLine: 0,
        hpRules: [],
        special: "",
        deckTextByNo: new Map(),
        deckNameByNo: new Map(),
        deckSize: 0,
        planTextByNo: new Map(),
        planSize: 0,
      };
      continue;
    }
    if (!cur) continue;

    if (line.startsWith("Deck No.")) {
      deckMode = "text";
      inSpecial = false;
      continue;
    }
    if (line.startsWith("DeckName No.")) {
      deckMode = "name";
      inSpecial = false;
      continue;
    }
    if (line.startsWith("Plan No.")) {
      deckMode = "plan";
      inSpecial = false;
      continue;
    }

    if (line.startsWith("{")) {
      inDeck = true;
      const rest = line.slice(1).trim();
      if (rest) {
        if (deckMode === "name") deckNameLines.push(rest);
        else if (deckMode === "plan") planLines.push(rest);
        else deckTextLines.push(rest);
      }
      continue;
    }
    if (inDeck && line.includes("}")) {
      const idx = line.indexOf("}");
      const inside = line.slice(0, idx).trim();
      if (inside) {
        if (deckMode === "name") deckNameLines.push(inside);
        else if (deckMode === "plan") planLines.push(inside);
        else deckTextLines.push(inside);
      }
      inDeck = false;
      continue;
    }
    if (line.endsWith("}")) {
      const inside = line.slice(0, -1).trim();
      if (inside) {
        if (deckMode === "name") deckNameLines.push(inside);
        else if (deckMode === "plan") planLines.push(inside);
        else deckTextLines.push(inside);
      }
      inDeck = false;
      continue;
    }
    if (inDeck) {
      if (deckMode === "name") deckNameLines.push(line);
      else if (deckMode === "plan") planLines.push(line);
      else deckTextLines.push(line);
      continue;
    }

    if (line.startsWith("Name:")) cur.name = line.slice("Name:".length).trim();
    if (line.startsWith("Code:")) {
      const raw = line.slice("Code:".length).trim();
      const m = /-?\d+/.exec(raw);
      cur.code = m ? Number(m[0]) : Number(raw);
    }
    if (line.startsWith("BeginningHP:")) {
      const raw = line.slice("BeginningHP:".length).trim();
      const m = /-?\d+/.exec(raw);
      cur.beginHp = m ? Number(m[0]) : Number(raw);
    }
    if (line.startsWith("Beginning力量:")) {
      const raw = line.slice("Beginning力量:".length).trim();
      const m = /-?\d+/.exec(raw);
      cur.beginPower = m ? Number(m[0]) : Number(raw);
      if (raw.includes("且友军起始力量+1")) cur.startBonus = { teammatePower: 1 };
    }
    if (line.startsWith("KOline：")) {
      const raw = line.slice("KOline：".length).trim();
      if (raw.includes("&")) {
        cur.koLines = raw
          .split("&")
          .map((s) => Number(String(s).trim().replace(/[^\d\-]/g, "")))
          .filter((n) => Number.isFinite(n));
        cur.koLine = Math.min(...cur.koLines);
      } else {
        cur.koLine = Number(raw);
      }
    }
    if (line.startsWith("HP规则：")) {
      inSpecial = false;
      cur.hpRules = parseHpRules(line.slice("HP规则：".length).trim());
      continue;
    }
    if (line.startsWith("Special system:")) {
      cur.special = line.slice("Special system:".length).trim();
      inSpecial = true;
      continue;
    }
    if (inSpecial) {
      cur.special = cur.special ? `${cur.special}\n${line}` : line;
      continue;
    }
  }

  commit();
  return fighters;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardId(playerId, fighterName, cardNo, serial) {
  return `${playerId}:${fighterName}:${cardNo}:${serial}`;
}

function formatCardLabel(card) {
  if (!card) return "-";
  const n = card.cardName ? String(card.cardName).trim() : "";
  if (n) return `${card.fighterName}·${n}`;
  return `${card.fighterName}#${card.cardNo}`;
}

function hasUnknownEffect(effects) {
  const walk = (e) => {
    if (!e) return false;
    if (e.type === "unknown") return true;
    if (e.type === "linked" || e.type === "conditional" || e.type === "block" || e.type === "onInsert" || e.type === "afterAll") {
      for (const x of e.inner ?? []) if (walk(x)) return true;
    }
    if (e.type === "ifElse") {
      for (const x of e.thenInner ?? []) if (walk(x)) return true;
      for (const x of e.elseInner ?? []) if (walk(x)) return true;
    }
    return false;
  };
  for (const e of effects ?? []) if (walk(e)) return true;
  return false;
}

function ensureCardCompiled(card) {
  if (!card) return [];
  const eff = parseCardEffects(card.text ?? "", card);
  const needsRecompile = () => {
    const walk = (e) => {
      if (!e) return false;
      if (e.type === "unknown") return true;
      if (e.type === "attack") {
        const raw = String(e.raw ?? "");
        if (raw.includes("己方辅助") && e.target !== "allySupport") return true;
        if (raw.includes("攻击焰") && e.flame !== true) return true;
      }
      if (e.type === "linked" || e.type === "conditional" || e.type === "block" || e.type === "onInsert" || e.type === "afterAll") {
        for (const x of e.inner ?? []) if (walk(x)) return true;
      }
      if (e.type === "ifElse") {
        for (const x of e.thenInner ?? []) if (walk(x)) return true;
        for (const x of e.elseInner ?? []) if (walk(x)) return true;
      }
      return false;
    };
    for (const e of eff ?? []) if (walk(e)) return true;
    return false;
  };
  if (!needsRecompile()) return eff;
  const text = card.text ?? "";
  const next = parseCardEffects(text, card);
  const onInsert = next.filter((e) => e.type === "onInsert").flatMap((e) => e.inner);
  card.getEffects = () => parseCardEffects(card.text ?? "", card);
  card.getOnInsertEffects = () => parseCardEffects(card.text ?? "", card).filter((e) => e.type === "onInsert").flatMap((e) => e.inner);
  return next;
}

function buildPlayerDeck(playerId, fighterDefs) {
  let serial = 1;
  const cards = [];
  for (const f of fighterDefs) {
    for (let no = 1; no <= f.deckSize; no++) {
      const text = f.deckTextByNo.get(no) ?? "";
      cards.push({
        id: cardId(playerId, f.name, no, serial++),
        fighterName: f.name,
        fighterAlias: f.id,
        fighterCode: f.code,
        cardNo: no,
        cardName: f.deckNameByNo?.get(no) ?? "",
        text,
        flipped: false,
        getEffects: function () {
          return parseCardEffects(this.text ?? "", this);
        },
        getOnInsertEffects: function () {
          return this.getEffects().filter((e) => e.type === "onInsert").flatMap((e) => e.inner);
        },
      });
    }
  }
  return cards;
}

function createInitialState(fighterPoolByName, picksByPlayer, startTopByPlayer) {
  function initPlayer(playerId) {
    const pickedNames = picksByPlayer[playerId] ?? [];
    const fighterDefs = pickedNames.map((n) => fighterPoolByName.get(n)).filter(Boolean);
    const buildElf = (def) => {
      const special = String(def?.special ?? "");
      const spirits = [];
      for (let i = 1; i <= 3; i++) {
        const re = new RegExp(`灵${i}：HP上限为(\\d+)，HP规则：([^\\n]+)`);
        const m = re.exec(special);
        const maxHp = m ? Number(m[1]) : 0;
        const hpRules = m ? parseHpRules(String(m[2]).trim()) : [];
        spirits.push({ maxHp, hpRules });
      }
      return { soul: 1, spirits, active: null, dead: [false, false, false], pendingPick: true, pendingKoIndex: null, gameKo: false };
    };
    const fighters = fighterDefs.map((f) => ({
      id: `${playerId}:${f.name}`,
      name: f.name,
      alias: f.id,
      code: f.code,
      hp: f.name === "精灵族" ? 0 : f.beginHp,
      maxHp: f.name === "精灵族" ? 0 : f.beginHp,
      power: f.beginPower,
      revelation: 0,
      battleship: 0,
      snake: f.name === "靡菲斯特" ? (Math.random() < 0.5 ? 0 : 1) : 0,
      snakeFlipMark: null,
      flame: {},
      ning: f.name === "黄飞鸿" ? { [playerId]: 2 } : {},
      guard: f.name === "魔像",
      elf: f.name === "精灵族" ? buildElf(f) : null,
      rage: f.name === "博德瓦尔" ? 0 : null,
      bodvarForm: f.name === "博德瓦尔" ? "human" : null,
      plan:
        f.name === "米莱狄"
          ? { available: Array.from({ length: Math.max(0, Number(f.planSize) || 0) }, (_, i) => i + 1), ready: [], discard: [] }
          : null,
      planTexts: f.name === "米莱狄" ? Array.from({ length: Math.max(0, Number(f.planSize) || 0) }, (_, i) => f.planTextByNo?.get(i + 1) ?? "") : null,
      police: false,
      koLine: f.koLine,
      koLines: Array.isArray(f.koLines) ? [...f.koLines] : null,
      hpRules: f.name === "精灵族" ? [] : f.hpRules,
    }));
    for (const def of fighterDefs) {
      if (def?.startBonus?.teammatePower) {
        const owner = fighters.find((x) => x.name === def.name);
        const teammate = fighters.find((x) => x.id !== owner?.id);
        if (teammate) teammate.power = Math.max(0, (Number(teammate.power) || 0) + Number(def.startBonus.teammatePower || 0));
      }
    }
    const fightersByName = new Map();
    for (const x of fighters) {
      fightersByName.set(x.name, x);
      if (x.alias) fightersByName.set(x.alias, x);
    }

    const allCards = buildPlayerDeck(playerId, fighterDefs);
    const startCards = allCards.filter((c) => c.cardNo === 1);
    const otherCards = allCards.filter((c) => c.cardNo !== 1);

    const topName = startTopByPlayer[playerId];
    const topCard = startCards.find((c) => c.fighterName === topName) ?? startCards[0];
    const bottomCard = startCards.find((c) => c.id !== topCard?.id) ?? startCards[1];

    shuffleInPlace(otherCards);

    return {
      id: playerId,
      fighters,
      fightersByName,
      battleDeck: [topCard, bottomCard].filter(Boolean),
      resolvedPile: [],
      constructionDeck: otherCards,
    };
  }

  const p1 = initPlayer("p1");
  const p2 = initPlayer("p2");
  const allFighters = [...p1.fighters, ...p2.fighters];
  const pike = allFighters.find((f) => f.name === "派克帮");
  if (pike) {
    for (const f of allFighters) f.police = false;
    pike.police = true;
  }

  return {
    phase: PHASE.BATTLE,
    round: 1,
    turn: 1,
    showDecks: false,
    awaitingConstruction: false,
    pendingGameOver: null,
    pendingElfPickByPlayer: {
      p1: p1.fighters.some((f) => f.name === "精灵族"),
      p2: p2.fighters.some((f) => f.name === "精灵族"),
    },
    doubleNextByPlayer: {
      p1: false,
      p2: false,
    },
    pendingDoubleQueue: [],
    lastFlip: null,
    lastRound: null,
    lastIntermissionEffect: null,
    compareHold: false,
    players: { p1, p2 },
    construction: {
      p1: null,
      p2: null,
      active: "p1",
    },
    winner: null,
  };
}

function getFighter(player, fighterName) {
  const f = player.fighters.find((x) => x.name === fighterName);
  if (!f) throw new Error(`fighter not found: ${fighterName}`);
  return f;
}

function getOtherFighter(player, fighterName) {
  const other = player.fighters.find((x) => x.name !== fighterName);
  if (!other) throw new Error(`other fighter not found`);
  return other;
}

function parseEffect(effectText) {
  const s0Raw = String(effectText ?? "").trim();
  if (!s0Raw) return null;
  const starIdx = s0Raw.indexOf("*");
  const s0 = (starIdx >= 0 ? s0Raw.slice(0, starIdx) : s0Raw).trim();
  if (!s0) return null;
  if (s0.startsWith("结算过上述效果后")) {
    const idx = s0.indexOf("，");
    const rest = idx >= 0 ? s0.slice(idx + 1).trim() : s0.slice("结算过上述效果后".length).trim();
    return parseEffect(rest);
  }
  if (s0.startsWith("结算后")) {
    const rest = s0.slice("结算后".length).trim().replace(/^[，,]/, "").trim();
    return parseEffect(rest);
  }
  if (s0.startsWith("随后")) {
    const rest = s0.slice("随后".length).trim().replace(/^[，,]/, "").trim();
    const inner = splitEffectList(rest).map(parseEffect).filter(Boolean);
    return { type: "afterAll", raw: s0, inner };
  }
  if (s0.startsWith("警在己方：") || s0.startsWith("警在己方:")) {
    const rest = s0.slice(s0.indexOf("：") >= 0 ? "警在己方：".length : "警在己方:".length).trim();
    return parseEffect(`如果警在己方，${rest}`);
  }
  if (s0.startsWith("警在对方：") || s0.startsWith("警在对方:")) {
    const rest = s0.slice(s0.indexOf("：") >= 0 ? "警在对方：".length : "警在对方:".length).trim();
    return parseEffect(`如果警在对方，${rest}`);
  }
  if (s0.startsWith("如为人：") || s0.startsWith("如为人:")) {
    const rest = s0.slice(s0.indexOf("：") >= 0 ? "如为人：".length : "如为人:".length).trim();
    const inner = splitEffectList(rest).map(parseEffect).filter(Boolean);
    return { type: "conditional", raw: s0, condRaw: "如为人", condFn: compileCondition("如为人"), inner };
  }
  if (s0.startsWith("如为熊：") || s0.startsWith("如为熊:")) {
    const rest = s0.slice(s0.indexOf("：") >= 0 ? "如为熊：".length : "如为熊:".length).trim();
    const inner = splitEffectList(rest).map(parseEffect).filter(Boolean);
    return { type: "conditional", raw: s0, condRaw: "如为熊", condFn: compileCondition("如为熊"), inner };
  }
  const sKeyAll = s0
    .replace(/\s+/g, "")
    .replaceAll("＋", "+")
    .replaceAll("－", "-")
    .replaceAll("，", "")
    .replaceAll(",", "");

  if ((s0.startsWith("如果") || s0.startsWith("如")) && (s0.includes("否则，") || s0.includes("否则,"))) {
    const m = /^(如果|如)(.+?)(?:，|,)(.+?)(?:，|,)?否则(?:，|,)(.+)$/.exec(s0);
    if (m) {
      const condRaw = `${m[1]}${m[2]}`;
      const thenInner = splitEffectList(String(m[3]).trim()).map(parseEffect).filter(Boolean);
      const elseInner = splitEffectList(String(m[4]).trim()).map(parseEffect).filter(Boolean);
      return { type: "ifElse", raw: s0, condRaw, condFn: compileCondition(condRaw), thenInner, elseInner };
    }
  }

  if (s0.startsWith("入库时")) {
    const rest = s0.slice("入库时".length).trim();
    return { type: "onInsert", raw: s0, inner: splitEffectList(rest).map(parseEffect).filter(Boolean) };
  }

  if (s0 === "取消") return { type: "cancel", raw: s0 };

  const winOnSelfKo = /^如果本回合末己方以任意方式被KO在最终结算时结算为己方胜利对方失败$/.exec(sKeyAll);
  if (winOnSelfKo) return { type: "winOnSelfKo", raw: s0 };

  const afterOpp = /^先结算对方卡牌结算后如果对方有HP不大于(\d+)的战士则对其造成等于其剩余HP的直接伤害$/.exec(sKeyAll);
  if (afterOpp) return { type: "afterOppExecuteLowHp", raw: s0, threshold: Number(afterOpp[1]) };

  if (sKeyAll === "将所有对己方的攻击伤害加总转移至敌方辅助") {
    return { type: "transferBlockedAttackToEnemySupport", raw: s0 };
  }

  if (sKeyAll === "烈焰") return { type: "flame", raw: s0 };

  if (sKeyAll === "卡牌结算结束后将此牌和对手的牌移除游戏") return { type: "removeFromGameBothAfter", raw: s0 };

  if (sKeyAll === "判定精灵族被KO游戏结束") return { type: "elfKo", raw: s0 };

  if (sKeyAll === "护移交辅助" || sKeyAll === "护移交队友") return { type: "guardToSupport", raw: s0 };

  if (sKeyAll === "下回合抽出的卡牌效果结算2次") return { type: "golemRebirth", raw: s0 };

  const ningPlace = /^将(\d+)个凝置于对方主攻$/.exec(sKeyAll);
  if (ningPlace) return { type: "ningPlace", raw: s0, amount: Number(ningPlace[1]) };

  if (sKeyAll === "收回所有凝") return { type: "ningRecall", raw: s0, amount: null };
  const ningRecall = /^收回(\d+)个凝$/.exec(sKeyAll);
  if (ningRecall) return { type: "ningRecall", raw: s0, amount: Number(ningRecall[1]) };
  if (sKeyAll === "收回凝" || sKeyAll === "收回本回合放的凝" || sKeyAll === "收回本回合放的凝至黄飞鸿手中") {
    return { type: "ningRecallThisTurn", raw: s0 };
  }

  if (s0.startsWith("如果") && !s0.includes("则") && (s0.includes("，") || s0.includes(","))) {
    const idx = s0.indexOf("，") >= 0 ? s0.indexOf("，") : s0.indexOf(",");
    const cond = s0.slice(0, idx).trim();
    const tail = s0.slice(idx + 1).trim();
    const inner = splitEffectList(tail).map(parseEffect).filter(Boolean);
    return { type: "conditional", raw: s0, condRaw: cond, condFn: compileCondition(cond), inner };
  }
  if (s0.startsWith("如") && !s0.includes("则") && (s0.includes("，") || s0.includes(","))) {
    const idx = s0.indexOf("，") >= 0 ? s0.indexOf("，") : s0.indexOf(",");
    const cond = s0.slice(0, idx).trim();
    const tail = s0.slice(idx + 1).trim();
    const inner = splitEffectList(tail).map(parseEffect).filter(Boolean);
    return { type: "conditional", raw: s0, condRaw: cond, condFn: compileCondition(cond), inner };
  }

  if (s0.startsWith("如果") && s0.includes("则")) {
    const idx = s0.indexOf("则");
    const cond = s0.slice(0, idx).trim();
    const tail = s0.slice(idx + 1).trim();
    const inner = splitEffectList(tail).map(parseEffect).filter(Boolean);
    return { type: "conditional", raw: s0, condRaw: cond, condFn: compileCondition(cond), inner };
  }
  if (s0.startsWith("如") && s0.includes("则")) {
    const idx = s0.indexOf("则");
    const cond = s0.slice(0, idx).trim();
    const tail = s0.slice(idx + 1).trim();
    const inner = splitEffectList(tail).map(parseEffect).filter(Boolean);
    return { type: "conditional", raw: s0, condRaw: cond, condFn: compileCondition(cond), inner };
  }

  const linked = splitLinkGroup(s0);
  if (linked.length >= 2) {
    return { type: "linked", raw: s0, inner: linked.map(parseEffect).filter(Boolean) };
  }

  if (!s0.startsWith("如果") && !s0.startsWith("如")) {
    const policeToOppMain = /将警交给对方主攻$/.exec(sKeyAll);
    if (policeToOppMain) return { type: "policeMove", raw: s0, to: "oppMain" };

    if (sKeyAll === "交警") return { type: "policeMove", raw: s0, to: "oppMain" };

    const policeToSelf = /^警取回己方$/.exec(sKeyAll);
    if (policeToSelf) return { type: "policeMove", raw: s0, to: "selfMain" };

    const policeAcquire = /^获得警$/.exec(sKeyAll);
    if (policeAcquire) return { type: "policeMove", raw: s0, to: "selfMain" };
  }

  const parenStart = s0.indexOf("（");
  const parenEnd = s0.lastIndexOf("）");
  const hasParen = parenStart >= 0 && parenEnd > parenStart;
  const head = hasParen ? s0.slice(0, parenStart).trim() : s0;
  const innerText = hasParen ? s0.slice(parenStart + 1, parenEnd).trim() : "";
  let innerParts = innerText ? splitEffectList(innerText) : [];
  const expanded = [];
  for (const p of innerParts) {
    const t = String(p ?? "").trim();
    if (!t) continue;
    if (!t.startsWith("如果") && !t.startsWith("如") && (t.includes("，") || t.includes(","))) {
      expanded.push(...splitTopLevel(t));
    } else {
      expanded.push(t);
    }
  }
  const inner = expanded.map(parseEffect).filter(Boolean);
  const headNorm = head.startsWith("己方") ? head.slice(2).trim() : head;
  const headKey = headNorm.replace(/\s+/g, "").replaceAll("＋", "+").replaceAll("－", "-");

  if (headKey === "神示") return { type: "revelation", raw: s0 };

  if (headKey === "辅助攻击") return { type: "attack", raw: s0, attackerMode: "support", defenderMode: "single", target: "enemyMain", inner };

  if (headKey === "蛇翻面") return { type: "snakeFlip", raw: s0 };

  const powerIfPolice = /^有警的战士力量\+(\d+)$/.exec(headKey);
  if (powerIfPolice) return { type: "powerToPoliceOwner", raw: s0, amount: Number(powerIfPolice[1]) };

  if (headKey === "取消回复效果") return { type: "cancelOpponentHeal", raw: s0 };
  if (headKey === "回复对方原回复量") return { type: "stealOpponentHeal", raw: s0 };

  const rageUp = /^怒\+(\d+)$/.exec(headKey);
  if (rageUp) return { type: "rage", raw: s0, amount: Number(rageUp[1]) };

  if (headKey === "制定计划") return { type: "planDraft", raw: s0 };
  if (headKey === "实施计划" || headKey === "实施一条计划") return { type: "planExecute", raw: s0 };
  if (headKey === "毒") return { type: "poison", raw: s0 };

  if (headKey === "翻转") return { type: "flip", raw: s0 };

  if (headKey === "以其力量攻击") return { type: "attackByOppMainPower", raw: s0, inner };

  if (headKey === "使力量等于辅助力量") return { type: "setPowerToSupportPower", raw: s0 };

  const summon = /^召唤：(.+)$/.exec(headNorm);
  if (summon) return { type: "summon", raw: s0, name: summon[1].trim() };

  const shipDelta = /^战船\+(\d+)$/.exec(headKey);
  if (shipDelta) return { type: "battleship", raw: s0, delta: Number(shipDelta[1]) };

  if (headKey === "战船数归零") return { type: "battleship", raw: s0, setTo: 0 };

  const shipUltimate = /^对2位对手战士分别造成其现有HP-1的直接伤害且本回合2位对手战士无视其他HP伤害或回复效果且战船数归零$/.exec(sKeyAll);
  if (shipUltimate) return { type: "battleshipUltimate", raw: s0 };

  if (headKey === "格挡") return { type: "block", raw: s0, inner };

  if (headKey === "雷击") return { type: "linked", raw: s0, inner };

  if (headKey.startsWith("攻击焰") || headKey.startsWith("攻击") || headKey.startsWith("双战攻击")) {
    const flame = headKey.startsWith("攻击焰");
    const attackerMode = headKey.startsWith("双战") ? "double" : "single";
    const defenderMode = headKey.includes("攻击双战") || headKey.includes("焰双战") || headKey.endsWith("双战") ? "double" : "single";
    let target = "enemyMain";
    if (headKey.includes("对方辅助")) target = "enemySupport";
    else if (headKey.includes("己方辅助")) target = "allySupport";
    const bonusMode = headKey.includes("攻击力额外附加魂数") ? "soul" : null;
    return { type: "attack", raw: s0, attackerMode, defenderMode, target, inner, flame, bonusMode };
  }

  const healSupportSoul = /^辅助回复(\d+)x魂$/.exec(headKey);
  if (healSupportSoul) return { type: "heal", raw: s0, target: "allySupport", amountMode: "soulMul", base: Number(healSupportSoul[1]) };

  const healSupport = /^辅助回复(\d+)$/.exec(headKey);
  if (healSupport) return { type: "heal", raw: s0, target: "allySupport", amount: Number(healSupport[1]) };

  if (headKey === "辅助回复等于主攻力量" || headKey === "辅助回复等于主攻力量值") {
    return { type: "heal", raw: s0, target: "allySupport", amountMode: "startPowerMain" };
  }

  const healBoth = /^(?:己方)?双战回复(\d+)$/.exec(headKey);
  if (healBoth) return { type: "heal", raw: s0, target: "allyBoth", amount: Number(healBoth[1]) };

  const namedHeal = /^(.+?)回复(\d+)$/.exec(headKey);
  if (namedHeal) {
    return { type: "heal", raw: s0, target: { kind: "named", name: namedHeal[1].trim() }, amount: Number(namedHeal[2]) };
  }

  const healMain = /^回复(\d+)$/.exec(headKey);
  if (healMain) return { type: "heal", raw: s0, target: "allyMain", amount: Number(healMain[1]) };

  if (headKey === "回复等于回合初力量值") {
    return { type: "heal", raw: s0, target: "allyMain", amountMode: "startPowerMain" };
  }

  if (headKey === "回复等于本次攻击方回合开始力量") {
    return { type: "heal", raw: s0, target: "allyMain", amountMode: "blockedAttackStartPower" };
  }

  const selfDirect = /^自身受(\d+)直伤$/.exec(headKey);
  if (selfDirect) return { type: "direct", raw: s0, target: "allyMain", amount: Number(selfDirect[1]) };

  const supportDirect = /^辅助受(\d+)直伤$/.exec(headKey);
  if (supportDirect) return { type: "direct", raw: s0, target: "allySupport", amount: Number(supportDirect[1]) };

  const namedDirect = /^(.+?)受(\d+)直伤$/.exec(headKey);
  if (namedDirect) {
    return { type: "direct", raw: s0, target: { kind: "named", name: namedDirect[1].trim() }, amount: Number(namedDirect[2]) };
  }

  const allDirect = /^4位战士各受(\d+)直伤$/.exec(headKey);
  if (allDirect) return { type: "directAll", raw: s0, amount: Number(allDirect[1]) };

  const direct = /^直伤(\d+)(.*)$/.exec(headKey);
  if (direct) {
    const amount = Number(direct[1]);
    const rest = direct[2] ?? "";
    let target = "enemyMain";
    if (rest.includes("对方辅助")) target = "enemySupport";
    if (rest.includes("己方辅助")) target = "allySupport";
    if (rest.includes("己方主攻")) target = "allyMain";
    return { type: "direct", raw: s0, target, amount };
  }

  const mainPower = /^主攻力量([+-])(\d+)$/.exec(headKey);
  if (mainPower) {
    const sign = mainPower[1] === "-" ? -1 : 1;
    return { type: "power", raw: s0, target: "allyMain", amount: sign * Number(mainPower[2]) };
  }

  const supportPower = /^辅助力量([+-])(\d+)$/.exec(headKey);
  if (supportPower) {
    const sign = supportPower[1] === "-" ? -1 : 1;
    return { type: "power", raw: s0, target: "allySupport", amount: sign * Number(supportPower[2]) };
  }

  const selfNamedPower = /^该战士力量\+(\d+)$/.exec(headKey);
  if (selfNamedPower) return { type: "powerStartPoliceOwner", raw: s0, amount: Number(selfNamedPower[1]) };

  const bothPower = /^力量同时\+(\d+)$/.exec(headKey);
  if (bothPower) return { type: "powerBoth", raw: s0, amount: Number(bothPower[1]) };

  const namedPower = /^(.+?)战士力量\+(\d+)$/.exec(headKey);
  if (namedPower) {
    return { type: "power", raw: s0, target: { kind: "named", name: namedPower[1].trim() }, amount: Number(namedPower[2]) };
  }

  const plainPowerUp = /^力量\+(\d+)$/.exec(headKey);
  if (plainPowerUp) return { type: "power", raw: s0, target: "allyMain", amount: Number(plainPowerUp[1]) };

  const plainPowerDown = /^力量-(\d+)$/.exec(headKey);
  if (plainPowerDown) return { type: "power", raw: s0, target: "allyMain", amount: -Number(plainPowerDown[1]) };

  return { type: "unknown", raw: s0 };
}

function parseCardEffects(cardText, card) {
  let s = String(cardText ?? "").trim();
  if (!s) return [];
  const idx = s.indexOf("//");
  if (idx >= 0) {
    const before = s.slice(0, idx).trim();
    const after = s.slice(idx + 2).trim();
    if (after) s = card?.flipped === true ? after : before;
    else s = before;
  }
  return splitEffectList(s).map(parseEffect).filter(Boolean);
}

function selfTestFighters(fighterDefs) {
  const out = [];
  for (const f of fighterDefs ?? []) {
    const size = Number(f.deckSize) || 0;
    const nameSize = Number(f.deckNameByNo?.size) || 0;
    if (nameSize && nameSize !== size) {
      out.push(`战士 ${f.name}：DeckName 数量 ${nameSize} 与 Deck 数量 ${size} 不一致`);
    }
    for (let no = 1; no <= size; no++) {
      const text = f.deckTextByNo?.get(no) ?? "";
      const effects = parseCardEffects(text);
      const unknown = [];
      const walk = (arr) => {
        for (const e of arr ?? []) {
          if (!e) continue;
          if (e.type === "unknown") unknown.push(e.raw);
          if (e.type === "conditional" || e.type === "block" || e.type === "onInsert" || e.type === "linked") walk(e.inner);
        }
      };
      walk(effects);
      if (unknown.length) {
        out.push(`战士 ${f.name}#${no}：未识别词条 ${unknown.join(" / ")}`);
      }
    }
  }
  return out;
}

function buildContextForBattle(player, opponent, myCard, oppCard) {
  const myMain = getFighter(player, myCard.fighterName);
  const mySupport = getOtherFighter(player, myCard.fighterName);
  const oppMain = getFighter(opponent, oppCard.fighterName);
  const oppSupport = getOtherFighter(opponent, oppCard.fighterName);

  const startPower = new Map();
  for (const f of player.fighters) startPower.set(f.id, f.power);
  for (const f of opponent.fighters) startPower.set(f.id, f.power);

  return {
    kind: "battle",
    my: {
      playerId: player.id,
      mainId: myMain.id,
      supportId: mySupport.id,
      bothIds: [myMain.id, mySupport.id],
    },
    opp: {
      playerId: opponent.id,
      mainId: oppMain.id,
      supportId: oppSupport.id,
      bothIds: [oppMain.id, oppSupport.id],
    },
    startPower,
  };
}

function buildContextForInsert(player, opponent, insertedCard) {
  const myMain = getFighter(player, insertedCard.fighterName);
  const mySupport = getOtherFighter(player, insertedCard.fighterName);
  const oppMain = opponent.fighters[0];
  const oppSupport = opponent.fighters[1];

  const startPower = new Map();
  for (const f of player.fighters) startPower.set(f.id, f.power);
  for (const f of opponent.fighters) startPower.set(f.id, f.power);

  return {
    kind: "insert",
    my: {
      playerId: player.id,
      mainId: myMain.id,
      supportId: mySupport.id,
      bothIds: [myMain.id, mySupport.id],
    },
    opp: {
      playerId: opponent.id,
      mainId: oppMain.id,
      supportId: oppSupport.id,
      bothIds: [oppMain.id, oppSupport.id],
    },
    startPower,
  };
}

function targetToFighterIds(ctx, target, playerMap) {
  if (target === "allyMain") return [ctx.my.mainId];
  if (target === "allySupport") return [ctx.my.supportId];
  if (target === "allyBoth") return ctx.my.bothIds;
  if (target === "enemyMain") return [ctx.opp.mainId];
  if (target === "enemySupport") return [ctx.opp.supportId];
  if (typeof target === "object" && target?.kind === "named") {
    const fighter = playerMap.get(target.name);
    if (!fighter) return [];
    return [fighter.id];
  }
  return [];
}

function computeAttackDamage(ctx, effect) {
  if (effect.attackerMode === "double") {
    const a1 = ctx.startPower.get(ctx.my.bothIds[0]) ?? 0;
    const a2 = ctx.startPower.get(ctx.my.bothIds[1]) ?? 0;
    return a1 + a2;
  }
  if (effect.attackerMode === "support") {
    return ctx.startPower.get(ctx.my.supportId) ?? 0;
  }
  return ctx.startPower.get(ctx.my.mainId) ?? 0;
}

function flipContext(ctx) {
  return {
    kind: ctx.kind,
    my: ctx.opp,
    opp: ctx.my,
    startPower: ctx.startPower,
  };
}

function compileCondition(condRaw) {
  const s0 = String(condRaw ?? "").trim();
  let s = s0.replace(/^(如果|如)/, "").trim().replace(/\s+/g, "").replaceAll("＋", "+").replaceAll("－", "-");
  s = s.replace(/[，,；;。]+$/g, "");

  if (s === "为人" || s === "为熊") {
    return (ctx, runtime) => {
      const f = runtime?.fighterById?.get?.(ctx.my.mainId);
      const form = runtime?.formAtStart ?? f?.bodvarForm ?? "human";
      return s === "为熊" ? form === "bear" : form !== "bear";
    };
  }

  if (s === "被攻击" || s === "自身被攻击" || s === "自身遭受攻击") {
    return (ctx, runtime) => {
      const m = runtime?.wasAttackedByPlayerId;
      if (m && typeof m.get === "function") return m.get(ctx?.my?.playerId) === true;
      if (runtime && Object.prototype.hasOwnProperty.call(runtime, "miladyWasAttacked")) return runtime.miladyWasAttacked === true;
      return runtime?.oppAttacking === true;
    };
  }

  if (s === "攻击被格挡") {
    return (_, runtime) => runtime?.attackBlocked === true;
  }

  if (s === "对方已有凝") {
    return (ctx, runtime) => {
      if (runtime && Object.prototype.hasOwnProperty.call(runtime, "oppMainHadNing")) return runtime.oppMainHadNing === true;
      const ownerPid = ctx?.my?.playerId;
      const f = runtime?.fighterById?.get?.(ctx?.opp?.mainId);
      const v = f?.ning && typeof f.ning === "object" ? Number(f.ning[ownerPid]) || 0 : 0;
      return v > 0;
    };
  }

  const hpEq = /^HP=(\d+)$/.exec(s);
  if (hpEq) {
    const threshold = Number(hpEq[1]);
    return (ctx, runtime) => {
      const id = ctx.my.mainId;
      const v = runtime?.hpAt ? Number(runtime.hpAt(id)) || 0 : Number(runtime?.fighterById?.get?.(id)?.hp) || 0;
      return v === threshold;
    };
  }

  const m1 = /^己方辅助力量>(\d+)$/.exec(s);
  if (m1) {
    const threshold = Number(m1[1]);
    return (ctx) => {
      const v = ctx.startPower.get(ctx.my.supportId) ?? 0;
      return v > threshold;
    };
  }

  const m2 = /^回合开始时力量至少为(\d+)$/.exec(s);
  if (m2) {
    const threshold = Number(m2[1]);
    return (ctx) => {
      const v = ctx.startPower.get(ctx.my.mainId) ?? 0;
      return v >= threshold;
    };
  }

  const soulEq = /^本回合开始时魂=(\d+)$/.exec(s);
  if (soulEq) {
    const threshold = Number(soulEq[1]);
    return (_, runtime) => Number(runtime?.soulAtStart) === threshold;
  }

  if (s === "护在魔像") {
    return (ctx, runtime) => {
      const pid = ctx?.my?.playerId;
      if (!pid) return false;
      const golem = [...(runtime?.fighterById?.values?.() ?? [])].find((x) => x?.name === "魔像" && String(x.id).startsWith(`${pid}:`));
      return golem?.guard === true;
    };
  }

  if (s === "护在辅助" || s === "护在队友") {
    return (ctx, runtime) => {
      const pid = ctx?.my?.playerId;
      if (!pid) return false;
      const byId = runtime?.fighterById;
      const values = byId?.values?.() ?? [];
      const all = [...values];
      const golem = all.find((x) => x?.name === "魔像" && String(x.id).startsWith(`${pid}:`)) ?? null;
      const teammate =
        (golem ? all.find((x) => String(x.id).startsWith(`${pid}:`) && x.id !== golem.id) : null) ??
        (ctx?.my?.bothIds ? all.find((x) => (ctx.my.bothIds ?? []).includes(x.id) && x?.name !== "魔像") : null) ??
        null;
      return teammate?.guard === true;
    };
  }

  const m3 = /^(?:对方)?HP>(\d+)$/.exec(s);
  if (m3) {
    const threshold = Number(m3[1]);
    return (ctx, runtime) => {
      const id = ctx.opp.mainId;
      const f = runtime?.fighterById?.get?.(id);
      const hp = f?.hp ?? 0;
      return hp > threshold;
    };
  }

  const m4 = /^(?:对方)?HP大于(\d+)$/.exec(s);
  if (m4) {
    const threshold = Number(m4[1]);
    return (ctx, runtime) => {
      const id = ctx.opp.mainId;
      const f = runtime?.fighterById?.get?.(id);
      const hp = f?.hp ?? 0;
      return hp > threshold;
    };
  }

  const shipLt = /^战船<(\d+)$/.exec(s);
  if (shipLt) {
    const threshold = Number(shipLt[1]);
    return (ctx, runtime) => {
      const f = runtime?.fighterById?.get?.(ctx.my.mainId);
      const v = Number(f?.battleship) || 0;
      if (threshold === 7) return v <= 7;
      return v < threshold;
    };
  }

  const shipEq = /^战船=(\d+)$/.exec(s);
  if (shipEq) {
    const threshold = Number(shipEq[1]);
    return (ctx, runtime) => {
      const f = runtime?.fighterById?.get?.(ctx.my.mainId);
      const v = Number(f?.battleship) || 0;
      return v === threshold;
    };
  }

  const shipRange1 = /^战船>(\d+)<(\d+)$/.exec(s);
  if (shipRange1) {
    const a = Number(shipRange1[1]);
    const b = Number(shipRange1[2]);
    return (ctx, runtime) => {
      const f = runtime?.fighterById?.get?.(ctx.my.mainId);
      const v = Number(f?.battleship) || 0;
      return v > a && v < b;
    };
  }

  const shipRange2 = /^战船>(\d+)<=(\d+)$/.exec(s);
  if (shipRange2) {
    const a = Number(shipRange2[1]);
    const b = Number(shipRange2[2]);
    return (ctx, runtime) => {
      const f = runtime?.fighterById?.get?.(ctx.my.mainId);
      const v = Number(f?.battleship) || 0;
      return v > a && v <= b;
    };
  }

  if (s === "2位对手均未攻击" || s === "进入回合时对方2位战士均不能执行自动攻击") {
    return (ctx, runtime) => {
      const oppEffects = runtime?.oppEffects ?? [];
      const oppCtx = flipContext(ctx);
      const oppRuntime = runtime
        ? { myEffects: runtime.oppEffects, oppEffects: runtime.myEffects, fighterById: runtime.fighterById, card: runtime.oppCard, oppCard: runtime.card }
        : null;
      return !hasAutoAttack(oppEffects, oppCtx, oppRuntime);
    };
  }

  if (s === "蛇为白" || s === "蛇为黑") {
    return (ctx, runtime) => {
      const f = runtime?.fighterById?.get?.(ctx.my.mainId);
      const v = Number(f?.snake) || 0;
      return s === "蛇为黑" ? v === 1 : v === 0;
    };
  }

  if (s === "对方卡牌为该战士的初始卡牌") {
    return (_, runtime) => {
      const cardNo = Number(runtime?.oppCard?.cardNo);
      return Number.isFinite(cardNo) && cardNo === 1;
    };
  }

  if (s === "对手即将结算回复") {
    return (ctx, runtime) => {
      const oppEffects = runtime?.oppEffects ?? [];
      const oppCtx = flipContext(ctx);
      const oppRuntime = runtime
        ? {
            myEffects: runtime.oppEffects,
            oppEffects: runtime.myEffects,
            fighterById: runtime.fighterById,
            card: runtime.oppCard,
            oppCard: runtime.card,
            startPoliceOwnerPlayerId: runtime.startPoliceOwnerPlayerId,
            startPoliceOwnerFighterId: runtime.startPoliceOwnerFighterId,
          }
        : null;
      const hasHeal = (effects) => {
        for (const e of effects ?? []) {
          if (!e) continue;
          if (e.type === "heal") return true;
          if (e.type === "linked" && hasHeal(e.inner)) return true;
          if (e.type === "conditional" && condOk(e, oppCtx, oppRuntime) && hasHeal(e.inner)) return true;
          if (e.type === "block") continue;
        }
        return false;
      };
      return hasHeal(oppEffects);
    };
  }

  if (s === "警在己方" || s === "警在对方") {
    return (ctx, runtime) => {
      const ownerPid = runtime?.startPoliceOwnerPlayerId ?? null;
      if (!ownerPid) return false;
      return s === "警在己方" ? ownerPid === ctx.my.playerId : ownerPid === ctx.opp.playerId;
    };
  }

  return () => false;
}

function condOk(effect, ctx, runtime) {
  if (!effect) return false;
  const fn = effect.condFn;
  if (typeof fn !== "function") return false;
  return fn(ctx, runtime);
}

function effectsMayContainAttack(effects) {
  for (const e of effects ?? []) {
    if (!e) continue;
    if (e.type === "attack" || e.type === "attackByOppMainPower") return true;
    if (e.type === "block") {
      if (effectsMayContainAttack(e.inner)) return true;
    }
    if (e.type === "conditional") {
      if (effectsMayContainAttack(e.inner)) return true;
    }
    if (e.type === "afterAll") {
      if (effectsMayContainAttack(e.inner)) return true;
    }
    if (e.type === "ifElse") {
      if (effectsMayContainAttack(e.thenInner)) return true;
      if (effectsMayContainAttack(e.elseInner)) return true;
    }
  }
  return false;
}

function hasAutoAttack(effects, ctx, runtime) {
  for (const e of effects ?? []) {
    if (!e) continue;
    if (e.type === "attack" || e.type === "attackByOppMainPower") return true;
    if (e.type === "block") continue;
    if (e.type === "conditional") {
      if (condOk(e, ctx, runtime)) {
        if (hasAutoAttack(e.inner, ctx, runtime)) return true;
      }
    }
    if (e.type === "afterAll") {
      if (hasAutoAttack(e.inner, ctx, runtime)) return true;
    }
    if (e.type === "ifElse") {
      const ok = condOk(e, ctx, runtime);
      if (ok) {
        if (hasAutoAttack(e.thenInner, ctx, runtime)) return true;
      } else {
        if (hasAutoAttack(e.elseInner, ctx, runtime)) return true;
      }
    }
  }
  return false;
}

function hasAttackForBlock(effects, ctx, runtime) {
  for (const e of effects) {
    if (!e) continue;
    if (e.type === "attack" || e.type === "attackByOppMainPower") return true;
    if (e.type === "conditional") {
      if (condOk(e, ctx, runtime)) {
        if (hasAttackForBlock(e.inner, ctx, runtime)) return true;
      }
    }
    if (e.type === "afterAll") {
      if (hasAttackForBlock(e.inner, ctx, runtime)) return true;
    }
    if (e.type === "ifElse") {
      const ok = condOk(e, ctx, runtime);
      if (ok) {
        if (hasAttackForBlock(e.thenInner, ctx, runtime)) return true;
      } else {
        if (hasAttackForBlock(e.elseInner, ctx, runtime)) return true;
      }
    }
    if (e.type === "linked") {
      if (hasAttackForBlock(e.inner, ctx, runtime)) return true;
    }
  }
  return false;
}

function hasAttackTargetingEnemyMain(effects, ctx, runtime) {
  for (const e of effects ?? []) {
    if (!e) continue;
    if (e.type === "attack") {
      if (e.defenderMode === "double") return true;
      if (e.target === "enemyMain") return true;
      continue;
    }
    if (e.type === "conditional") {
      if (condOk(e, ctx, runtime)) {
        if (hasAttackTargetingEnemyMain(e.inner, ctx, runtime)) return true;
      }
      continue;
    }
    if (e.type === "afterAll") {
      if (hasAttackTargetingEnemyMain(e.inner, ctx, runtime)) return true;
      continue;
    }
    if (e.type === "ifElse") {
      const ok = condOk(e, ctx, runtime);
      if (ok) {
        if (hasAttackTargetingEnemyMain(e.thenInner, ctx, runtime)) return true;
      } else {
        if (hasAttackTargetingEnemyMain(e.elseInner, ctx, runtime)) return true;
      }
      continue;
    }
    if (e.type === "linked") {
      if (hasAttackTargetingEnemyMain(e.inner, ctx, runtime)) return true;
    }
  }
  return false;
}

function settleEffects({
  ctx,
  myCard,
  oppCard,
  myEffects,
  oppEffects,
  myPlayer,
  oppPlayer,
  onlySide,
  guardAtStartById: guardAtStartByIdIn,
}) {
  const log = [];
  const hpDelta = new Map();
  const powerDelta = new Map();
  const planEvents = [];
  let removeBothCardsFromGame = false;
  const flameKoByPlayerId = new Set();
  const golemRebirthByPlayerId = new Set();
  const guardBlockedByPlayerId = new Set();
  const flipTriggeredByCardId = new Set();
  const fighterById = new Map(
    [...myPlayer.fighters, ...oppPlayer.fighters].map((f) => [f.id, f])
  );
  const guardAtStartById =
    guardAtStartByIdIn && typeof guardAtStartByIdIn.get === "function"
      ? guardAtStartByIdIn
      : new Map([...fighterById.entries()].map(([id, f]) => [id, f?.guard === true]));
  const powerOpsP1 = [];
  const powerOpsP2 = [];
  const hpShield = new Set();
  const winOnSelfKoByPlayer = new Map();
  const startPoliceOwnerFighterId = (() => {
    const owner = [...fighterById.values()].find((f) => f.police === true);
    return owner?.id ?? null;
  })();
  const startPoliceOwnerPlayerId = startPoliceOwnerFighterId ? String(startPoliceOwnerFighterId).split(":")[0] || null : null;

  const p1HasCancel = myEffects.some((e) => e.type === "cancel");
  const p2HasCancel = oppEffects.some((e) => e.type === "cancel");
  const p1Canceled = !p1HasCancel && p2HasCancel;
  const p2Canceled = !p2HasCancel && p1HasCancel;
  const bothCanceled = p1HasCancel && p2HasCancel;

  if (bothCanceled) {
    log.push(`双方打出取消：本回合两边卡牌效果都不结算`);
    return {
      log,
      hpDelta,
      powerDelta,
      planEvents,
      removeBothCardsFromGame,
      myCanceled: true,
      oppCanceled: true,
      myBlockSuccess: false,
      oppBlockSuccess: false,
      winOnSelfKoByPlayer,
    };
  }

  const applyP1 = !onlySide || onlySide === ctx?.my?.playerId;
  const applyP2 = !onlySide || onlySide === ctx?.opp?.playerId;

  const p1Attacking =
    !p1Canceled &&
    hasAttackForBlock(myEffects, ctx, { myEffects, oppEffects, fighterById, card: myCard, oppCard, startPoliceOwnerPlayerId });
  const p2Attacking =
    !p2Canceled &&
    hasAttackForBlock(oppEffects, flipContext(ctx), {
      myEffects: oppEffects,
      oppEffects: myEffects,
      fighterById,
      card: oppCard,
      oppCard: myCard,
      startPoliceOwnerPlayerId,
    });
  const p1HasBlock = !p1Canceled && myEffects.some((e) => e.type === "block");
  const p2HasBlock = !p2Canceled && oppEffects.some((e) => e.type === "block");
  const p1BlockInner = p1HasBlock ? myEffects.filter((e) => e.type === "block").flatMap((e) => e.inner ?? []) : [];
  const p2BlockInner = p2HasBlock ? oppEffects.filter((e) => e.type === "block").flatMap((e) => e.inner ?? []) : [];
  const blockInnerByPlayerId = { p1: p1BlockInner, p2: p2BlockInner };
  const blockActiveByPlayerId = { p1: p1HasBlock && !p1Canceled, p2: p2HasBlock && !p2Canceled };
  const wasAttackedByPlayerId = new Map([
    ["p1", false],
    ["p2", false],
  ]);
  const p1BlockSuccess = p1HasBlock && p2Attacking;
  const p2BlockSuccess = p2HasBlock && p1Attacking;
  const p1MiladyWasAttacked = (() => {
    const me = fighterById.get(ctx.my.mainId);
    if (me?.name !== "米莱狄") return false;
    if (p2Canceled) return false;
    return hasAttackTargetingEnemyMain(oppEffects, flipContext(ctx), {
      myEffects: oppEffects,
      oppEffects: myEffects,
      fighterById,
      card: oppCard,
      oppCard: myCard,
      startPoliceOwnerPlayerId,
    });
  })();
  const p2MiladyWasAttacked = (() => {
    const me = fighterById.get(ctx.opp.mainId);
    if (me?.name !== "米莱狄") return false;
    if (p1Canceled) return false;
    return hasAttackTargetingEnemyMain(myEffects, ctx, {
      myEffects,
      oppEffects,
      fighterById,
      card: myCard,
      oppCard,
      startPoliceOwnerPlayerId,
    });
  })();
  const deferredAfterOppP1 = [];
  const deferredAfterOppP2 = [];
  const deferredAfterAllP1 = [];
  const deferredAfterAllP2 = [];
  const cancelHealByPlayerId = new Map();
  const mapFor = (playerId) => (playerId === myPlayer.id ? myPlayer.fightersByName : oppPlayer.fightersByName);
  const stopHpById = new Set();
  const poisonQueue = [];
  const ningPlacedThisTurn = new Map();

  function getKoFloor(f) {
    if (Array.isArray(f?.koLines) && f.koLines.length > 0) {
      const vals = f.koLines.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      if (vals.length) return Math.min(...vals);
    }
    return Number(f?.koLine) || 0;
  }

  function flameCountByOwner(f, ownerPlayerId) {
    if (!f) return 0;
    const v = f?.flame?.[ownerPlayerId];
    return Number.isFinite(v) ? Number(v) : 0;
  }

  function setFlameCountByOwner(f, ownerPlayerId, n) {
    if (!f) return;
    if (!f.flame || typeof f.flame !== "object") f.flame = {};
    f.flame[ownerPlayerId] = Math.max(0, Math.min(5, Number(n) || 0));
  }

  function ningCountByOwner(f, ownerPlayerId) {
    if (!f) return 0;
    const v = f?.ning?.[ownerPlayerId];
    return Number.isFinite(v) ? Number(v) : 0;
  }

  function setNingCountByOwner(f, ownerPlayerId, n) {
    if (!f) return;
    if (!f.ning || typeof f.ning !== "object") f.ning = {};
    f.ning[ownerPlayerId] = Math.max(0, Math.min(2, Number(n) || 0));
  }

  function recordNingPlaced(ownerPid, targetId, n) {
    if (!ownerPid || !targetId) return;
    const d = Math.max(0, Number(n) || 0);
    if (!d) return;
    let m = ningPlacedThisTurn.get(ownerPid);
    if (!m) {
      m = new Map();
      ningPlacedThisTurn.set(ownerPid, m);
    }
    m.set(targetId, (m.get(targetId) ?? 0) + d);
  }

  function addHp(id, delta, opts) {
    if (stopHpById.has(id)) return;
    const f = fighterById.get(id);
    if (f?.name === "精灵族" && f?.elf && f.elf.active == null) return;
    const force = opts?.force === true;
    if (!force && hpShield.has(id)) return;
    const d = Number(delta) || 0;
    if (!d) return;
    hpDelta.set(id, (hpDelta.get(id) ?? 0) + d);
  }

  const hpAt = (id) => {
    const f = fighterById.get(id);
    const base = f?.hp ?? 0;
    let next = base + (hpDelta.get(id) ?? 0);
    const maxHp = Number(f?.maxHp);
    if (Number.isFinite(maxHp)) next = Math.min(next, maxHp);
    if (f) {
      if (f.name === "玛曼布丽吉特") next = Math.max(next, -2);
      else next = Math.max(next, getKoFloor(f));
    }
    return next;
  };

  function addPower(id, delta) {
    powerDelta.set(id, (powerDelta.get(id) ?? 0) + delta);
  }

  function findFirstTriggeredAttackDamage(effects, atkCtx, runtimeForAtk) {
    for (const e of effects ?? []) {
      if (!e) continue;
      if (e.type === "attack") return computeAttackDamage(atkCtx, e);
      if (e.type === "block") continue;
      if (e.type === "linked") {
        const v = findFirstTriggeredAttackDamage(e.inner, atkCtx, runtimeForAtk);
        if (v != null) return v;
        continue;
      }
      if (e.type === "conditional") {
        if (condOk(e, atkCtx, runtimeForAtk)) {
          const v = findFirstTriggeredAttackDamage(e.inner, atkCtx, runtimeForAtk);
          if (v != null) return v;
        }
      }
    }
    return null;
  }

  function sumTriggeredAttackDamage(effects, atkCtx, runtimeForAtk) {
    let sum = 0;
    for (const e of effects ?? []) {
      if (!e) continue;
      if (e.type === "attack") {
        const dmg = computeAttackDamage(atkCtx, e);
        sum += (e.defenderMode === "double" ? 2 : 1) * dmg;
        if (e.inner?.length) sum += sumTriggeredAttackDamage(e.inner, atkCtx, runtimeForAtk);
        continue;
      }
      if (e.type === "block") continue;
      if (e.type === "linked") {
        sum += sumTriggeredAttackDamage(e.inner, atkCtx, runtimeForAtk);
        continue;
      }
      if (e.type === "conditional") {
        if (condOk(e, atkCtx, runtimeForAtk)) sum += sumTriggeredAttackDamage(e.inner, atkCtx, runtimeForAtk);
      }
    }
    return sum;
  }

  function computeHealAmount(effect, sideCtx, runtime) {
    if (Number.isFinite(effect.amount)) return Number(effect.amount) || 0;
    if (effect.amountMode === "startPowerMain") return sideCtx.startPower.get(sideCtx.my.mainId) ?? 0;
    if (effect.amountMode === "soulMul") return (Number(effect.base) || 0) * (Number(runtime?.soulAtStart) || 0);
    if (effect.amountMode === "blockedAttackStartPower") {
      const atkCtx = flipContext(sideCtx);
      const atkRuntime = runtime
        ? {
            myEffects: runtime.oppEffects,
            oppEffects: runtime.myEffects,
            fighterById: runtime.fighterById,
            card: runtime.oppCard,
            oppCard: runtime.card,
            startPoliceOwnerPlayerId: runtime.startPoliceOwnerPlayerId,
            startPoliceOwnerFighterId: runtime.startPoliceOwnerFighterId,
          }
        : null;
      return findFirstTriggeredAttackDamage(runtime?.oppEffects ?? [], atkCtx, atkRuntime) ?? 0;
    }
    return 0;
  }

  function sumTriggeredHealAmount(effects, healCtx, runtimeForHeal) {
    let sum = 0;
    for (const e of effects ?? []) {
      if (!e) continue;
      if (e.type === "heal") {
        const amount = computeHealAmount(e, healCtx, runtimeForHeal);
        const ids = targetToFighterIds(healCtx, e.target, mapFor(healCtx.my.playerId));
        sum += amount * ids.length;
        continue;
      }
      if (e.type === "block") continue;
      if (e.type === "linked") {
        sum += sumTriggeredHealAmount(e.inner, healCtx, runtimeForHeal);
        continue;
      }
      if (e.type === "conditional") {
        if (condOk(e, healCtx, runtimeForHeal)) sum += sumTriggeredHealAmount(e.inner, healCtx, runtimeForHeal);
      }
    }
    return sum;
  }

  function applyAtomicEffect(
    sideCtx,
    effect,
    canceledSelf,
    opponentBlockSuccess,
    blockSuccess,
    playerMap,
    queuePower,
    runtime,
    linkId
  ) {
    if (!effect) return;
    if (canceledSelf) return;
    if (effect.type === "unknown") {
      log.push(`未实现效果：${effect.raw}`);
      return;
    }
    if (effect.type === "afterAll") {
      const q = runtime?.deferredAfterAll;
      if (Array.isArray(q)) q.push({ sideCtx, effects: effect.inner ?? [], canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, linkId });
      return;
    }
    if (effect.type === "cancel") return;
    if (effect.type === "onInsert") return;
    if (effect.type === "afterOppExecuteLowHp") return;
    if (effect.type === "linked") {
      for (const inner of effect.inner) {
        applyAtomicEffect(sideCtx, inner, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, `L${String(effect.raw).slice(0, 40)}`);
      }
      return;
    }
    if (effect.type === "winOnSelfKo") {
      winOnSelfKoByPlayer.set(sideCtx.my.playerId, true);
      log.push(`${runtime?.prefix ?? ""}${effect.raw}`);
      return;
    }
    if (effect.type === "revelation") {
      const jeanne = playerMap.get("贞德");
      if (!jeanne) return;
      const f = fighterById.get(jeanne.id);
      if (!f) return;
      const before = Number(f.revelation) || 0;
      let next = before + 1;
      if (next === 2) queuePower(jeanne.id, 1, null);
      if (next === 4) {
        const teammateId = (sideCtx.my.bothIds ?? []).find((id) => id !== jeanne.id);
        if (teammateId) queuePower(teammateId, 1, null);
      }
      if (next >= 5) {
        next = 1;
      }
      next = Math.max(0, Math.min(4, next));
      f.revelation = next;
      log.push(`${runtime?.prefix ?? ""}神示：贞德 ${before}→${next}`);
      return;
    }
    if (effect.type === "snakeFlip") {
      const f = fighterById.get(sideCtx.my.mainId);
      if (!f) return;
      const before = Number(f.snake) || 0;
      const next = before === 1 ? 0 : 1;
      f.snake = next;
      if (Array.isArray(f.snakeFlipMark)) {
        const last = f.snakeFlipMark[f.snakeFlipMark.length - 1];
        if (last !== before) f.snakeFlipMark.push(before);
        f.snakeFlipMark.push(next);
      } else {
        f.snakeFlipMark = [before, next];
      }
      const b = before === 1 ? "黑" : "白";
      const n = next === 1 ? "黑" : "白";
      log.push(`${runtime?.prefix ?? ""}蛇翻面：${f.name} ${b}→${n}`);
      return;
    }
    if (effect.type === "policeMove") {
      const targetId = effect.to === "oppMain" ? sideCtx.opp.mainId : sideCtx.my.mainId;
      for (const x of fighterById.values()) x.police = false;
      const t = fighterById.get(targetId);
      if (t) t.police = true;
      const name = t?.name ?? targetId;
      log.push(`${runtime?.prefix ?? ""}警：移动到 ${name}`);
      return;
    }
    if (effect.type === "removeFromGameBothAfter") {
      removeBothCardsFromGame = true;
      log.push(`${runtime?.prefix ?? ""}${effect.raw}`);
      return;
    }
    if (effect.type === "elfKo") {
      const elfRef = playerMap.get("精灵族");
      if (!elfRef) return;
      const f = fighterById.get(elfRef.id);
      if (!f) return;
      if (!f.elf || typeof f.elf !== "object") f.elf = { soul: 0, spirits: [], active: null, dead: [false, false, false], pendingPick: false, gameKo: false };
      f.elf.gameKo = true;
      log.push(`${runtime?.prefix ?? ""}${effect.raw}`);
      return;
    }
    if (effect.type === "flip") {
      if (runtime?.card && typeof runtime.card === "object") {
        runtime.card.flipped = true;
        if (runtime?.flipTriggeredByCardId && typeof runtime.flipTriggeredByCardId.add === "function" && runtime.card.id)
          runtime.flipTriggeredByCardId.add(runtime.card.id);
      }
      return;
    }
    if (effect.type === "summon") {
      log.push(`${runtime?.prefix ?? ""}${effect.raw}`);
      return;
    }
    if (effect.type === "setPowerToSupportPower") {
      const mainId = sideCtx.my.mainId;
      const supportId = sideCtx.my.supportId;
      const target = sideCtx.startPower.get(supportId) ?? 0;
      const cur = (fighterById.get(mainId)?.power ?? 0) + (powerDelta.get(mainId) ?? 0);
      addPower(mainId, target - cur);
      log.push(`${runtime?.prefix ?? ""}力量：${fighterById.get(mainId)?.name ?? "?"} 设为辅助力量 ${target}`);
      return;
    }
    if (effect.type === "ningPlace") {
      const ownerPid = sideCtx.my.playerId;
      const huangRef = playerMap.get("黄飞鸿");
      if (!huangRef) return;
      const huang = fighterById.get(huangRef.id);
      const target = fighterById.get(sideCtx.opp.mainId);
      if (!huang || !target) return;
      const amount = Math.max(0, Number(effect.amount) || 0);
      const targetCur = ningCountByOwner(target, ownerPid);
      let need = Math.max(0, Math.min(amount, 2 - targetCur));
      if (!need) return;
      let moved = 0;
      const available = ningCountByOwner(huang, ownerPid);
      const takeFromHuang = Math.max(0, Math.min(available, need));
      if (takeFromHuang) {
        setNingCountByOwner(huang, ownerPid, available - takeFromHuang);
        moved += takeFromHuang;
        need -= takeFromHuang;
      }
      if (need > 0) {
        const srcIds = [sideCtx.opp.supportId, sideCtx.my.supportId, sideCtx.my.mainId].filter(Boolean);
        for (const id of srcIds) {
          if (need <= 0) break;
          if (id === target.id) continue;
          if (id === huang.id) continue;
          const src = fighterById.get(id);
          if (!src) continue;
          const cur = ningCountByOwner(src, ownerPid);
          const take = Math.max(0, Math.min(cur, need));
          if (!take) continue;
          setNingCountByOwner(src, ownerPid, cur - take);
          moved += take;
          need -= take;
        }
      }
      if (!moved) return;
      setNingCountByOwner(target, ownerPid, targetCur + moved);
      recordNingPlaced(ownerPid, target.id, moved);
      log.push(`${runtime?.prefix ?? ""}凝：置于 ${target.name}（${moved}）`);
      return;
    }
    if (effect.type === "ningRecallThisTurn") {
      const ownerPid = sideCtx.my.playerId;
      const huangRef = playerMap.get("黄飞鸿");
      if (!huangRef) return;
      const huang = fighterById.get(huangRef.id);
      if (!huang) return;
      const m = ningPlacedThisTurn.get(ownerPid);
      if (!m || m.size === 0) {
        log.push(`${runtime?.prefix ?? ""}凝：收回本回合放的凝（0）`);
        return;
      }
      let recalled = 0;
      for (const [targetId, n] of m.entries()) {
        const t = fighterById.get(targetId);
        if (!t) continue;
        const cur = ningCountByOwner(t, ownerPid);
        const take = Math.max(0, Math.min(cur, Math.max(0, Number(n) || 0)));
        if (!take) continue;
        setNingCountByOwner(t, ownerPid, cur - take);
        recalled += take;
      }
      ningPlacedThisTurn.set(ownerPid, new Map());
      setNingCountByOwner(huang, ownerPid, ningCountByOwner(huang, ownerPid) + recalled);
      log.push(`${runtime?.prefix ?? ""}凝：收回本回合放的凝（${recalled}）`);
      return;
    }
    if (effect.type === "ningRecall") {
      const ownerPid = sideCtx.my.playerId;
      const huangRef = playerMap.get("黄飞鸿");
      if (!huangRef) return;
      const huang = fighterById.get(huangRef.id);
      if (!huang) return;
      const curHuang = ningCountByOwner(huang, ownerPid);
      const wantRaw = effect.amount;
      const want = wantRaw == null ? null : Math.max(0, Number(wantRaw) || 0);
      let recalled = 0;
      if (want == null) {
        for (const f of fighterById.values()) {
          if (f.id === huang.id) continue;
          recalled += ningCountByOwner(f, ownerPid);
          setNingCountByOwner(f, ownerPid, 0);
        }
      } else if (want > 0) {
        let remain = want;
        const order = [sideCtx.opp.mainId, sideCtx.opp.supportId, sideCtx.my.supportId];
        for (const id of order) {
          if (remain <= 0) break;
          const f = fighterById.get(id);
          if (!f || f.id === huang.id) continue;
          const cur = ningCountByOwner(f, ownerPid);
          const take = Math.max(0, Math.min(cur, remain));
          if (!take) continue;
          setNingCountByOwner(f, ownerPid, cur - take);
          recalled += take;
          remain -= take;
        }
        if (remain > 0) {
          for (const f of fighterById.values()) {
            if (remain <= 0) break;
            if (f.id === huang.id) continue;
            if (order.includes(f.id)) continue;
            const cur = ningCountByOwner(f, ownerPid);
            const take = Math.max(0, Math.min(cur, remain));
            if (!take) continue;
            setNingCountByOwner(f, ownerPid, cur - take);
            recalled += take;
            remain -= take;
          }
        }
      }
      setNingCountByOwner(huang, ownerPid, curHuang + recalled);
      log.push(`${runtime?.prefix ?? ""}凝：收回${recalled}`);
      return;
    }
    if (effect.type === "attackByOppMainPower") {
      const dmg = sideCtx.startPower.get(sideCtx.opp.mainId) ?? 0;
      const prefix = runtime?.prefix ?? "";
      const n = fighterById.get(sideCtx.opp.mainId)?.name ?? sideCtx.opp.mainId;
      if (!opponentBlockSuccess) {
        addHp(sideCtx.opp.mainId, -dmg);
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} 攻击：以对方力量对 ${n} 造成 ${dmg}`);
      } else {
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} 攻击：被格挡`);
      }
      if (effect.inner?.length) {
        for (const inner of effect.inner)
          applyAtomicEffect(sideCtx, inner, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, linkId);
      }
      return;
    }
    function tryBodvarTransform(f) {
      if (!f || f.name !== "博德瓦尔") return false;
      if (f.bodvarForm === "bear") return false;
      stopHpById.add(f.id);
      hpDelta.delete(f.id);
      addPower(f.id, 3);
      const nextPower = (Number(f.power) || 0) + (powerDelta.get(f.id) ?? 0);
      f.bodvarForm = "bear";
      f.rage = 7;
      f.maxHp = 15;
      f.hp = Math.min(15, nextPower);
      f.hpRules = [];
      log.push(`${runtime?.prefix ?? ""}变身：博德瓦尔 怒=7，停止本回合博德瓦尔自身伤害/回复结算，力量+3，切换为熊，HP上限=15，HP=${f.hp}`);
      return true;
    }
    if (effect.type === "rage") {
      const f = fighterById.get(sideCtx.my.mainId);
      if (!f || f.name !== "博德瓦尔") return;
      if (f.bodvarForm === "bear") return;
      const before = Math.max(0, Math.min(7, Number(f.rage) || 0));
      const d = Math.max(0, Number(effect.amount) || 0);
      const next = Math.max(0, Math.min(7, before + d));
      f.rage = next;
      log.push(`${runtime?.prefix ?? ""}怒：博德瓦尔 ${before}→${next}`);
      if (before < 7 && next >= 7) {
        tryBodvarTransform(f);
      }
      return;
    }
    if (effect.type === "planDraft" || effect.type === "planExecute") {
      const miladyRef = playerMap.get("米莱狄");
      const milady = miladyRef ? fighterById.get(miladyRef.id) : null;
      if (!milady || !milady.plan || !Array.isArray(milady.planTexts)) return;
      const plan = milady.plan;
      const prefix = runtime?.prefix ?? "";
      if (effect.type === "planDraft") {
        if (!Array.isArray(plan.available) || plan.available.length === 0) {
          log.push(`${prefix}计划：无可制定`);
          planEvents.push({ playerId: sideCtx.my.playerId, source: "card", kind: "draft", planNo: null, planText: "", result: "empty" });
          return;
        }
        const idx = Math.floor(Math.random() * plan.available.length);
        const no = plan.available.splice(idx, 1)[0];
        plan.ready.push(no);
        log.push(`${prefix}制定计划：#${no}`);
        planEvents.push({ playerId: sideCtx.my.playerId, source: "card", kind: "draft", planNo: no, planText: String(milady.planTexts[no - 1] ?? ""), result: "ok" });
        return;
      }
      if (!Array.isArray(plan.ready) || plan.ready.length === 0) {
        log.push(`${prefix}实施计划：无可实施`);
        planEvents.push({ playerId: sideCtx.my.playerId, source: "card", kind: "execute", planNo: null, planText: "", result: "empty" });
        return;
      }
      const depth = Number(runtime?.planDepth) || 0;
      if (depth >= 20) {
        log.push(`${prefix}实施计划：递归过深，终止`);
        planEvents.push({ playerId: sideCtx.my.playerId, source: "card", kind: "execute", planNo: null, planText: "递归过深，终止", result: "stop" });
        return;
      }
      const idx = Math.floor(Math.random() * plan.ready.length);
      const no = plan.ready.splice(idx, 1)[0];
      plan.discard.push(no);
      const text = String(milady.planTexts[no - 1] ?? "").trim();
      log.push(`${prefix}实施计划：#${no}${text ? `（${text}）` : ""}`);
      planEvents.push({ playerId: sideCtx.my.playerId, source: "card", kind: "execute", planNo: no, planText: text, result: "ok" });
      const planEffects = text ? parseCardEffects(text) : [];
      const nextRuntime = runtime && typeof runtime === "object" ? { ...runtime, planDepth: depth + 1 } : runtime;
      for (const pe of planEffects) applyAtomicEffect(sideCtx, pe, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, nextRuntime, linkId);
      return;
    }
    if (effect.type === "poison") {
      poisonQueue.push({ prefix: runtime?.prefix ?? "", sideCtx, raw: effect.raw });
      return;
    }
    if (effect.type === "flame") {
      const ownerPid = sideCtx.my.playerId;
      const mainId = sideCtx.opp.mainId;
      const supportId = sideCtx.opp.supportId;
      const main = fighterById.get(mainId);
      const support = fighterById.get(supportId);
      if (!main) return;
      const total = flameCountByOwner(main, ownerPid) + flameCountByOwner(support, ownerPid);
      if (total >= 5) return;
      const beforeMain = flameCountByOwner(main, ownerPid);
      const nextMain = Math.min(5, beforeMain + 1);
      setFlameCountByOwner(main, ownerPid, nextMain);
      log.push(`${runtime?.prefix ?? ""}焰：${main.name} ${beforeMain}→${nextMain}`);
      if (nextMain === 1 && support) {
        const beforeSupport = flameCountByOwner(support, ownerPid);
        if (beforeSupport > 0) {
          setFlameCountByOwner(support, ownerPid, 0);
          log.push(`${runtime?.prefix ?? ""}焰：清除 ${support.name} ${beforeSupport}→0`);
        }
      }
      if (nextMain >= 5) {
        main.koByFlame = true;
        flameKoByPlayerId.add(sideCtx.opp.playerId);
        hpDelta.delete(mainId);
        stopHpById.add(mainId);
        log.push(`${runtime?.prefix ?? ""}焰：${main.name} 焰=5 被KO`);
      }
      return;
    }
    if (effect.type === "transferBlockedAttackToEnemySupport") {
      const atkCtx = flipContext(sideCtx);
      const atkRuntime = runtime
        ? {
            myEffects: runtime.oppEffects,
            oppEffects: runtime.myEffects,
            fighterById: runtime.fighterById,
            card: runtime.oppCard,
            oppCard: runtime.card,
            startPoliceOwnerPlayerId: runtime.startPoliceOwnerPlayerId,
            startPoliceOwnerFighterId: runtime.startPoliceOwnerFighterId,
          }
        : null;
      const blocked = sumTriggeredAttackDamage(runtime?.oppEffects ?? [], atkCtx, atkRuntime);
      if (blocked > 0) {
        addHp(sideCtx.opp.supportId, -blocked);
        const n = fighterById.get(sideCtx.opp.supportId)?.name ?? sideCtx.opp.supportId;
        log.push(`${runtime?.prefix ?? ""}${effect.raw}：对 ${n} 造成直伤 ${blocked}`);
      }
      return;
    }
    if (effect.type === "powerToPoliceOwner") {
      const amount = Number(effect.amount) || 0;
      if (!amount) return;
      const owner = [...fighterById.values()].find((x) => x.police === true);
      if (!owner) return;
      queuePower(owner.id, amount, linkId ?? null);
      return;
    }
    if (effect.type === "powerBoth") {
      const amount = Number(effect.amount) || 0;
      if (!amount) return;
      queuePower(sideCtx.my.mainId, amount, linkId ?? null);
      const oppPid = sideCtx.opp.playerId;
      const oppPoliceId = runtime?.startPoliceOwnerFighterId ?? null;
      if (oppPoliceId && String(oppPoliceId).startsWith(`${oppPid}:`)) {
        queuePower(oppPoliceId, amount, linkId ?? null);
      }
      return;
    }
    if (effect.type === "powerStartPoliceOwner") {
      const amount = Number(effect.amount) || 0;
      if (!amount) return;
      const id = runtime?.startPoliceOwnerFighterId ?? null;
      if (!id) return;
      queuePower(id, amount, linkId ?? null);
      return;
    }
    if (effect.type === "battleship") {
      const shipOwner = playerMap.get("郑一嫂");
      if (!shipOwner) return;
      const f = fighterById.get(shipOwner.id);
      if (!f) return;
      if (Number.isFinite(effect.setTo)) {
        f.battleship = Math.max(0, Math.min(20, Number(effect.setTo)));
        log.push(`${runtime?.prefix ?? ""}战船：郑一嫂 归零`);
        return;
      }
      const d = Number(effect.delta) || 0;
      if (!d) return;
      const before = Number(f.battleship) || 0;
      const next = Math.max(0, Math.min(20, before + d));
      f.battleship = next;
      log.push(`${runtime?.prefix ?? ""}战船：郑一嫂 ${before}→${next}`);
      return;
    }
    if (effect.type === "battleshipUltimate") {
      const ids = sideCtx.opp.bothIds ?? [];
      for (const id of ids) {
        hpShield.add(id);
        hpDelta.set(id, 0);
      }
      for (const id of ids) {
        const baseHp = fighterById.get(id)?.hp ?? 0;
        const curHp = baseHp + (hpDelta.get(id) ?? 0);
        const dmg = Math.max(0, curHp - 1);
        addHp(id, -dmg, { force: true });
      }
      const shipOwner = playerMap.get("郑一嫂");
      const f = shipOwner ? fighterById.get(shipOwner.id) : null;
      if (f) f.battleship = 0;
      log.push(`${runtime?.prefix ?? ""}${effect.raw}`);
      return;
    }
    if (effect.type === "conditional") {
      if (condOk(effect, sideCtx, runtime)) {
        for (const inner of effect.inner)
          applyAtomicEffect(sideCtx, inner, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, linkId);
      }
      return;
    }
    if (effect.type === "ifElse") {
      const ok = condOk(effect, sideCtx, runtime);
      const arr = ok ? effect.thenInner : effect.elseInner;
      for (const inner of arr ?? []) {
        applyAtomicEffect(sideCtx, inner, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, linkId);
      }
      return;
    }
    if (effect.type === "guardToSupport") {
      const ownerPid = sideCtx.my.playerId;
      const golem = [...fighterById.values()].find((x) => x?.name === "魔像" && String(x.id).startsWith(`${ownerPid}:`));
      if (!golem) return;
      const teammateId =
        (sideCtx.my.bothIds ?? []).find((id) => id && id !== golem.id) ??
        [...fighterById.values()].find((x) => String(x.id).startsWith(`${ownerPid}:`) && x.id !== golem.id)?.id ??
        null;
      const teammate = teammateId ? fighterById.get(teammateId) : null;
      if (!teammate) return;
      golem.guard = false;
      teammate.guard = true;
      log.push(`${runtime?.prefix ?? ""}护：移交给 ${teammate.name}`);
      return;
    }
    if (effect.type === "golemRebirth") {
      golemRebirthByPlayerId.add(sideCtx.my.playerId);
      log.push(`${runtime?.prefix ?? ""}${effect.raw}`);
      return;
    }
    if (effect.type === "block") {
      return;
    }
    if (effect.type === "attack") {
      const base = computeAttackDamage(sideCtx, effect) + (effect.bonusMode === "soul" ? Number(runtime?.soulAtStart) || 0 : 0);
      const prefix = runtime?.prefix ?? "";
      const atkLabel = effect.flame ? "攻击焰" : "攻击";
      if (runtime?.wasAttackedByPlayerId && typeof runtime.wasAttackedByPlayerId.set === "function") {
        const mark = (targetId) => {
          if (targetId && targetId === sideCtx.opp.mainId) runtime.wasAttackedByPlayerId.set(sideCtx.opp.playerId, true);
        };
        if (effect.defenderMode === "double") {
          for (const tid of sideCtx.opp.bothIds ?? []) mark(tid);
        } else if (effect.target === "enemySupport") {
          mark(sideCtx.opp.supportId);
        } else if (effect.target === "allySupport") {
          mark(sideCtx.my.supportId);
        } else {
          mark(sideCtx.opp.mainId);
        }
      }
      const oppBlockActive = runtime?.oppBlockActive === true;
      const oppBlockInner = Array.isArray(runtime?.oppBlockInner) ? runtime.oppBlockInner : [];
      if (oppBlockActive && oppBlockInner.length > 0) {
        if (runtime && typeof runtime === "object") runtime.attackBlocked = true;
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} ${atkLabel}：被对方格挡`);
        const defCtx = flipContext(sideCtx);
        const defPlayerMap = runtime?.oppPlayerMap;
        const defQueuePower = runtime?.oppQueuePower;
        const defRuntime =
          runtime && typeof runtime === "object"
            ? {
                ...runtime,
                prefix: runtime.oppPrefix ?? "",
                oppPrefix: runtime.prefix ?? "",
                card: runtime.oppCard,
                oppCard: runtime.card,
                myEffects: runtime.oppEffects,
                oppEffects: runtime.myEffects,
                oppPlayerMap: playerMap,
                oppQueuePower: queuePower,
                oppCanceled: canceledSelf,
              }
            : null;
        for (const inner of oppBlockInner) {
          applyAtomicEffect(defCtx, inner, false, false, true, defPlayerMap, defQueuePower, defRuntime, linkId);
        }
        return;
      }
      if (runtime && typeof runtime === "object") runtime.attackBlocked = false;
      const tryGuardBlock = (targetId, dmg) => {
        if (!targetId) return false;
        const guardAtStartById = runtime?.guardAtStartById;
        if (guardAtStartById?.get?.(targetId) !== true) return false;
        const target = fighterById.get(targetId);
        if (!target) return false;
        if (target.guard !== true) return false;
        const pid = String(targetId).split(":")[0] || "";
        const golem = [...fighterById.values()].find((x) => x?.name === "魔像" && String(x.id).startsWith(`${pid}:`));
        if (!golem) return false;
        if (golem.id === targetId) return false;
        target.guard = false;
        golem.guard = true;
        if (runtime?.guardBlockedByPlayerId && typeof runtime.guardBlockedByPlayerId.add === "function") runtime.guardBlockedByPlayerId.add(pid);
        log.push(`${prefix}护：${target.name} 抵挡攻击伤害 ${dmg}，护移动回魔像`);
        return true;
      };
      if (effect.defenderMode === "double") {
        const id1 = sideCtx.opp.bothIds[0];
        const id2 = sideCtx.opp.bothIds[1];
        const d1 = base + (effect.flame ? flameCountByOwner(fighterById.get(id1), sideCtx.my.playerId) : 0);
        const d2 = base + (effect.flame ? flameCountByOwner(fighterById.get(id2), sideCtx.my.playerId) : 0);
        const b1 = tryGuardBlock(id1, d1);
        const b2 = tryGuardBlock(id2, d2);
        if (!b1) addHp(id1, -d1);
        if (!b2) addHp(id2, -d2);
        const n1 = fighterById.get(sideCtx.opp.bothIds[0])?.name ?? sideCtx.opp.bothIds[0];
        const n2 = fighterById.get(sideCtx.opp.bothIds[1])?.name ?? sideCtx.opp.bothIds[1];
        const dmgText = d1 === d2 ? `${d1}` : `${d1}/${d2}`;
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} ${atkLabel}：对 ${n1}/${n2} 造成 ${dmgText}${b1 || b2 ? "（部分被护抵挡）" : ""}`);
      } else if (effect.target === "enemySupport") {
        const id = sideCtx.opp.supportId;
        const dmg = base + (effect.flame ? flameCountByOwner(fighterById.get(id), sideCtx.my.playerId) : 0);
        const blockedByGuard = tryGuardBlock(id, dmg);
        if (!blockedByGuard) addHp(id, -dmg);
        const n = fighterById.get(sideCtx.opp.supportId)?.name ?? sideCtx.opp.supportId;
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} ${atkLabel}：对 ${n} 造成 ${dmg}${blockedByGuard ? "（被护抵挡）" : ""}`);
      } else if (effect.target === "allySupport") {
        const id = sideCtx.my.supportId;
        const dmg = base + (effect.flame ? flameCountByOwner(fighterById.get(id), sideCtx.my.playerId) : 0);
        const blockedByGuard = tryGuardBlock(id, dmg);
        if (!blockedByGuard) addHp(id, -dmg);
        const n = fighterById.get(id)?.name ?? id;
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} ${atkLabel}：对 ${n} 造成 ${dmg}${blockedByGuard ? "（被护抵挡）" : ""}`);
      } else {
        const id = sideCtx.opp.mainId;
        const dmg = base + (effect.flame ? flameCountByOwner(fighterById.get(id), sideCtx.my.playerId) : 0);
        const blockedByGuard = tryGuardBlock(id, dmg);
        if (!blockedByGuard) addHp(id, -dmg);
        const n = fighterById.get(sideCtx.opp.mainId)?.name ?? sideCtx.opp.mainId;
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} ${atkLabel}：对 ${n} 造成 ${dmg}${blockedByGuard ? "（被护抵挡）" : ""}`);
      }
      if (effect.inner.length) {
        for (const inner of effect.inner)
          applyAtomicEffect(sideCtx, inner, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, linkId);
      }
      return;
    }
    if (effect.type === "heal") {
      if (cancelHealByPlayerId.get(sideCtx.my.playerId) === true) return;
      let amount = 0;
      if (Number.isFinite(effect.amount)) amount = effect.amount;
      else if (effect.amountMode === "startPowerMain") amount = sideCtx.startPower.get(sideCtx.my.mainId) ?? 0;
      else if (effect.amountMode === "soulMul") amount = (Number(effect.base) || 0) * (Number(runtime?.soulAtStart) || 0);
      else if (effect.amountMode === "blockedAttackStartPower") {
        const atkCtx = flipContext(sideCtx);
        const atkRuntime = runtime
          ? { myEffects: runtime.oppEffects, oppEffects: runtime.myEffects, fighterById: runtime.fighterById, card: runtime.oppCard, oppCard: runtime.card }
          : null;
        amount = findFirstTriggeredAttackDamage(runtime?.oppEffects ?? [], atkCtx, atkRuntime) ?? 0;
      }
      const ids = targetToFighterIds(sideCtx, effect.target, playerMap);
      for (const id of ids) addHp(id, amount);
      return;
    }
    if (effect.type === "cancelOpponentHeal") {
      cancelHealByPlayerId.set(sideCtx.opp.playerId, true);
      return;
    }
    if (effect.type === "stealOpponentHeal") {
      const oppCtx = flipContext(sideCtx);
      const oppRuntime = runtime
        ? {
            myEffects: runtime.oppEffects,
            oppEffects: runtime.myEffects,
            fighterById: runtime.fighterById,
            card: runtime.oppCard,
            oppCard: runtime.card,
            startPoliceOwnerPlayerId: runtime.startPoliceOwnerPlayerId,
            startPoliceOwnerFighterId: runtime.startPoliceOwnerFighterId,
          }
        : null;
      const amount = sumTriggeredHealAmount(runtime?.oppEffects ?? [], oppCtx, oppRuntime);
      if (amount > 0) {
        cancelHealByPlayerId.set(sideCtx.opp.playerId, true);
        addHp(sideCtx.my.mainId, amount);
        log.push(`${runtime?.prefix ?? ""}取消对手回复并抢走：回复${amount}`);
      }
      return;
    }
    if (effect.type === "direct") {
      const ids = targetToFighterIds(sideCtx, effect.target, playerMap);
      for (const id of ids) addHp(id, -effect.amount);
      return;
    }
    if (effect.type === "directAll") {
      const ids = [...(sideCtx.my.bothIds ?? []), ...(sideCtx.opp.bothIds ?? [])];
      for (const id of ids) addHp(id, -(Number(effect.amount) || 0));
      log.push(`${runtime?.prefix ?? ""}${effect.raw}`);
      return;
    }
    if (effect.type === "power") {
      const ids = targetToFighterIds(sideCtx, effect.target, playerMap);
      for (const id of ids) queuePower(id, effect.amount, linkId ?? null);
      return;
    }
  }

  function applySide({
    prefix,
    sideCtx,
    card,
    effects,
    canceledSelf,
    opponentBlockSuccess,
    blockSuccess,
    playerMap,
    attackingForBlock,
    oppAttacking,
    miladyWasAttacked,
    queuePower,
    runtime,
    deferredAfterOpp,
  }) {
    if (canceledSelf) {
      log.push(`${prefix}${card.fighterName} 打出的卡被取消：效果不结算`);
      return;
    }
    if (runtime && typeof runtime === "object") {
      runtime.oppAttacking = oppAttacking === true;
      runtime.formAtStart = fighterById.get(sideCtx.my.mainId)?.bodvarForm ?? null;
      runtime.attackBlocked = false;
      runtime.hpAt = hpAt;
      runtime.miladyWasAttacked = miladyWasAttacked === true;
      runtime.oppMainHadNing = ningCountByOwner(fighterById.get(sideCtx.opp.mainId), sideCtx.my.playerId) > 0;
      const elf = [...fighterById.values()].find((x) => x?.name === "精灵族" && String(x.id).startsWith(`${sideCtx.my.playerId}:`));
      runtime.soulAtStart = Number(elf?.elf?.soul) || 0;
    }

    for (const e of effects) {
      if (e.type === "onInsert") continue;
      if (e.type === "block") continue;
      if (e.type === "afterOppExecuteLowHp") {
        deferredAfterOpp.push({ sideCtx, effect: e, prefix });
        continue;
      }
      applyAtomicEffect(sideCtx, e, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, null);
    }
  }

  if (applyP1) {
    applySide({
      prefix: "P1: ",
      sideCtx: ctx,
      card: myCard,
      effects: myEffects,
      canceledSelf: p1Canceled,
      opponentBlockSuccess: p2BlockSuccess,
      blockSuccess: p1BlockSuccess,
      playerMap: myPlayer.fightersByName,
      attackingForBlock: p1Attacking,
      oppAttacking: p2Attacking,
      miladyWasAttacked: p1MiladyWasAttacked,
      queuePower: (id, amount, linkId) => {
        powerOpsP1.push({ id, amount, linkId });
      },
      runtime: {
        myEffects,
        oppEffects,
        fighterById,
        prefix: "P1: ",
        oppPrefix: "P2: ",
        card: myCard,
        oppCard,
        oppPlayerMap: oppPlayer.fightersByName,
        oppQueuePower: (id, amount, linkId) => {
          powerOpsP2.push({ id, amount, linkId });
        },
        oppCanceled: p2Canceled,
        startPoliceOwnerPlayerId,
        startPoliceOwnerFighterId,
        deferredAfterAll: deferredAfterAllP1,
        guardAtStartById,
        oppBlockActive: blockActiveByPlayerId.p2,
        oppBlockInner: blockInnerByPlayerId.p2,
        wasAttackedByPlayerId,
        blockActiveByPlayerId,
        blockInnerByPlayerId,
        guardBlockedByPlayerId,
        flipTriggeredByCardId,
      },
      deferredAfterOpp: deferredAfterOppP1,
    });
  }
  if (applyP2) {
    applySide({
      prefix: "P2: ",
      sideCtx: flipContext(ctx),
      card: oppCard,
      effects: oppEffects,
      canceledSelf: p2Canceled,
      opponentBlockSuccess: p1BlockSuccess,
      blockSuccess: p2BlockSuccess,
      playerMap: oppPlayer.fightersByName,
      attackingForBlock: p2Attacking,
      oppAttacking: p1Attacking,
      miladyWasAttacked: p2MiladyWasAttacked,
      queuePower: (id, amount, linkId) => {
        powerOpsP2.push({ id, amount, linkId });
      },
      runtime: {
        myEffects: oppEffects,
        oppEffects: myEffects,
        fighterById,
        prefix: "P2: ",
        oppPrefix: "P1: ",
        card: oppCard,
        oppCard: myCard,
        oppPlayerMap: myPlayer.fightersByName,
        oppQueuePower: (id, amount, linkId) => {
          powerOpsP1.push({ id, amount, linkId });
        },
        oppCanceled: p1Canceled,
        startPoliceOwnerPlayerId,
        startPoliceOwnerFighterId,
        deferredAfterAll: deferredAfterAllP2,
        guardAtStartById,
        oppBlockActive: blockActiveByPlayerId.p1,
        oppBlockInner: blockInnerByPlayerId.p1,
        wasAttackedByPlayerId,
        blockActiveByPlayerId,
        blockInnerByPlayerId,
        guardBlockedByPlayerId,
        flipTriggeredByCardId,
      },
      deferredAfterOpp: deferredAfterOppP2,
    });
  }

  function runDeferredAfterAll(queue) {
    if (!Array.isArray(queue) || queue.length === 0) return;
    let i = 0;
    while (i < queue.length) {
      const item = queue[i++];
      if (!item) continue;
      const effects = item.effects ?? [];
      for (const e of effects) {
        applyAtomicEffect(item.sideCtx, e, item.canceledSelf, item.opponentBlockSuccess, item.blockSuccess, item.playerMap, item.queuePower, item.runtime, item.linkId ?? null);
      }
    }
  }

  runDeferredAfterAll(deferredAfterAllP1);
  runDeferredAfterAll(deferredAfterAllP2);

  function applyPowerOpsWithTransfer(ops) {
    const remaining = new Map();
    for (const [id, f] of fighterById.entries()) remaining.set(id, Number(f.power) || 0);

    const used = new Array(ops.length).fill(false);
    for (let i = 0; i < ops.length; i++) {
      const a = ops[i];
      if (!a || used[i]) continue;
      if (!(a.amount < 0)) continue;
      if (!a.linkId) continue;
      const x = Math.abs(a.amount);
      for (let j = 0; j < ops.length; j++) {
        const b = ops[j];
        if (!b || used[j]) continue;
        if (!(b.amount > 0)) continue;
        if (b.linkId !== a.linkId) continue;
        if (b.amount !== x) continue;
        if (b.id === a.id) continue;
        const avail = remaining.get(a.id) ?? 0;
        const actual = Math.max(0, Math.min(avail, x));
        remaining.set(a.id, avail - actual);
        if (actual !== 0) {
          addPower(a.id, -actual);
          addPower(b.id, actual);
        }
        used[i] = true;
        used[j] = true;
        break;
      }
    }

    for (let i = 0; i < ops.length; i++) {
      if (used[i]) continue;
      const op = ops[i];
      if (!op) continue;
      addPower(op.id, op.amount);
    }
  }

  applyPowerOpsWithTransfer(powerOpsP1);
  applyPowerOpsWithTransfer(powerOpsP2);

  function runDeferredAfterOpp(item) {
    const { sideCtx, effect, prefix } = item;
    const threshold = Number(effect.threshold) || 0;
    const targets = sideCtx.opp.bothIds ?? [];
    for (const id of targets) {
      const hpNow = hpAt(id);
      if (!(hpNow > 0)) continue;
      if (hpNow <= threshold) {
        addHp(id, -hpNow);
        const name = fighterById.get(id)?.name ?? id;
        log.push(`${prefix}${effect.raw}：对 ${name} 造成直伤 ${hpNow}`);
      }
    }
  }

  for (const item of deferredAfterOppP1) runDeferredAfterOpp(item);
  for (const item of deferredAfterOppP2) runDeferredAfterOpp(item);

  for (const item of poisonQueue) {
    const targetId = item?.sideCtx?.opp?.mainId;
    if (!targetId) continue;
    const hpNow = hpAt(targetId);
    if (!(hpNow > 0)) continue;
    const dmg = Math.max(0, Math.floor(hpNow / 2));
    if (!dmg) continue;
    addHp(targetId, -dmg);
    const name = fighterById.get(targetId)?.name ?? targetId;
    log.push(`${item.prefix ?? ""}毒：对 ${name} 造成 ${dmg}`);
  }

  return {
    log,
    hpDelta,
    powerDelta,
    planEvents,
    removeBothCardsFromGame,
    flameKoByPlayerId,
    golemRebirthByPlayerId,
    guardBlockedByPlayerId,
    flipTriggeredByCardId,
    blockActiveByPlayerId,
    blockInnerByPlayerId,
    myCanceled: p1Canceled,
    oppCanceled: p2Canceled,
    myBlockSuccess: p1BlockSuccess,
    oppBlockSuccess: p2BlockSuccess,
    winOnSelfKoByPlayer,
  };
}

function applyDeltas(state, hpDelta, powerDelta, startSnapshot, guardAtStartById, blockActiveByPlayerId, blockInnerByPlayerId) {
  const fighters = [...state.players.p1.fighters, ...state.players.p2.fighters];
  const fighterById = new Map(fighters.map((f) => [f.id, f]));
  const hpTraceById = new Map();
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  const startPowerById = new Map();
  const planEvents = [];
  const extraLog = [];
  const guardBlockedByPlayerId = new Set();
  const wasAttackedByPlayerId = new Map([
    ["p1", false],
    ["p2", false],
  ]);
  const playerMapByPlayerId = { p1: p1.fightersByName, p2: p2.fightersByName };
  for (const f of fighters) {
    const v = startSnapshot?.get?.(f.id)?.power;
    startPowerById.set(f.id, Number.isFinite(v) ? Number(v) : Number(f.power) || 0);
  }

  function buildStateCtx(ownerPid) {
    const myPlayer = ownerPid === "p1" ? p1 : p2;
    const oppPid = ownerPid === "p1" ? "p2" : "p1";
    const oppPlayer = ownerPid === "p1" ? p2 : p1;
    let myMain = myPlayer.fighters[0];
    let mySupport = myPlayer.fighters[1];
    let oppMain = oppPlayer.fighters[0];
    let oppSupport = oppPlayer.fighters[1];
    const lf = state.lastFlip;
    if (lf?.p1Card && lf?.p2Card) {
      const myCard = ownerPid === "p1" ? lf.p1Card : lf.p2Card;
      const oppCard = ownerPid === "p1" ? lf.p2Card : lf.p1Card;
      const mm = myPlayer.fighters.find((x) => x.name === myCard.fighterName);
      const om = oppPlayer.fighters.find((x) => x.name === oppCard.fighterName);
      if (mm) myMain = mm;
      if (om) oppMain = om;
      const ms = myPlayer.fighters.find((x) => x.id !== myMain.id);
      const os = oppPlayer.fighters.find((x) => x.id !== oppMain.id);
      if (ms) mySupport = ms;
      if (os) oppSupport = os;
    }
    const startPower = new Map();
    for (const f of myPlayer.fighters) startPower.set(f.id, startPowerById.get(f.id) ?? (Number(f.power) || 0));
    for (const f of oppPlayer.fighters) startPower.set(f.id, startPowerById.get(f.id) ?? (Number(f.power) || 0));
    return {
      kind: "state",
      my: { playerId: ownerPid, mainId: myMain?.id, supportId: mySupport?.id, bothIds: [myMain?.id, mySupport?.id].filter(Boolean) },
      opp: { playerId: oppPid, mainId: oppMain?.id, supportId: oppSupport?.id, bothIds: [oppMain?.id, oppSupport?.id].filter(Boolean) },
      startPower,
      myPlayer,
      oppPlayer,
    };
  }

  for (const [id, d] of powerDelta.entries()) {
    const f = fighterById.get(id);
    if (!f) continue;
    f.power = Math.max(0, f.power + d);
  }

  function stepHpChange(f, d0, trace) {
    let remaining = Number(d0) || 0;
    if (!remaining) return;
    if (f?.name === "精灵族" && f?.elf && f.elf.active == null) return;
    const dir = remaining > 0 ? 1 : -1;
    remaining = Math.abs(remaining);
    let stop = false;
    for (let step = 0; step < remaining; step++) {
      if (dir > 0 && f.hp >= f.maxHp) break;
      if (dir < 0 && f.name !== "玛曼布丽吉特" && f.hp <= f.koLine) break;
      if (dir < 0 && f.name === "玛曼布丽吉特" && f.hp <= -2) break;
      f.hp += dir;
      if (trace) trace.push(f.hp);

      const triggered = f.hpRules.find((r) => r.hp === f.hp);
      if (triggered) {
        if (triggered.stop === true) {
          stop = true;
        } else {
          const hpRuleEffects = triggered.effects ?? [];
          const ownerPid = String(f.id).startsWith("p2:") ? "p2" : "p1";
          const sc = buildStateCtx(ownerPid);
          const ctx = sc.kind === "state" ? { kind: "state", my: sc.my, opp: sc.opp, startPower: sc.startPower } : sc;
          const playerMap = sc.myPlayer.fightersByName;
          const poisonQueue = [];
          const runtime = {
            fighterById,
            hpAt: (id) => fighterById.get(id)?.hp ?? 0,
            oppAttacking: false,
            attackBlocked: false,
            formAtStart: fighterById.get(ctx.my.mainId)?.bodvarForm ?? null,
            guardAtStartById,
            wasAttackedByPlayerId,
            blockActiveByPlayerId,
            blockInnerByPlayerId,
            playerMapByPlayerId,
          };
          const applyOneWith = (e, localCtx, localPlayerMap) => {
            if (!e) return;
            if (e.type === "linked") {
              for (const x of e.inner ?? []) applyOneWith(x, localCtx, localPlayerMap);
              return;
            }
            if (e.type === "conditional") {
              if (condOk(e, localCtx, runtime)) for (const x of e.inner ?? []) applyOneWith(x, localCtx, localPlayerMap);
              return;
            }
            if (e.type === "poison") {
              poisonQueue.push({ ctx: { ...localCtx }, raw: e.raw });
              return;
            }
            if (e.type === "planDraft" || e.type === "planExecute") {
              const miladyRef = localPlayerMap.get("米莱狄");
              const milady = miladyRef ? fighterById.get(miladyRef.id) : null;
              if (!milady || !milady.plan || !Array.isArray(milady.planTexts)) return;
              const plan = milady.plan;
              if (e.type === "planDraft") {
                if (!Array.isArray(plan.available) || plan.available.length === 0) return;
                const idx = Math.floor(Math.random() * plan.available.length);
                const no = plan.available.splice(idx, 1)[0];
                plan.ready.push(no);
                planEvents.push({ playerId: localCtx.my.playerId, source: "hpRule", triggerId: f.id, triggerHp: f.hp, kind: "draft", planNo: no, planText: String(milady.planTexts[no - 1] ?? ""), result: "ok" });
                return;
              }
              if (!Array.isArray(plan.ready) || plan.ready.length === 0) {
                planEvents.push({ playerId: localCtx.my.playerId, source: "hpRule", triggerId: f.id, triggerHp: f.hp, kind: "execute", planNo: null, planText: "", result: "empty" });
                return;
              }
              const idx = Math.floor(Math.random() * plan.ready.length);
              const no = plan.ready.splice(idx, 1)[0];
              plan.discard.push(no);
              const text = String(milady.planTexts[no - 1] ?? "").trim();
              planEvents.push({ playerId: localCtx.my.playerId, source: "hpRule", triggerId: f.id, triggerHp: f.hp, kind: "execute", planNo: no, planText: text, result: "ok" });
              const planEffects = text ? parseCardEffects(text) : [];
              for (const pe of planEffects) applyOneWith(pe, localCtx, localPlayerMap);
              return;
            }
            if (e.type === "power") {
              const ids = targetToFighterIds(localCtx, e.target, localPlayerMap);
              for (const id of ids) {
                const t = fighterById.get(id);
                if (t) t.power = Math.max(0, (Number(t.power) || 0) + (Number(e.amount) || 0));
              }
              return;
            }
            if (e.type === "heal") {
              let amount = 0;
              if (Number.isFinite(e.amount)) amount = Number(e.amount) || 0;
              else if (e.amountMode === "startPowerMain") amount = localCtx.startPower.get(localCtx.my.mainId) ?? 0;
              const ids = targetToFighterIds(localCtx, e.target, localPlayerMap);
              for (const id of ids) {
                const t = fighterById.get(id);
                if (t) stepHpChange(t, amount, id === f.id ? trace : null);
              }
              return;
            }
            if (e.type === "direct") {
              const ids = targetToFighterIds(localCtx, e.target, localPlayerMap);
              for (const id of ids) {
                const t = fighterById.get(id);
                if (t) stepHpChange(t, -(Number(e.amount) || 0), id === f.id ? trace : null);
              }
              return;
            }
            if (e.type === "directAll") {
              const ids = [...(localCtx.my.bothIds ?? []), ...(localCtx.opp.bothIds ?? [])];
              for (const id of ids) {
                const t = fighterById.get(id);
                if (t) stepHpChange(t, -(Number(e.amount) || 0), id === f.id ? trace : null);
              }
              return;
            }
            if (e.type === "attack") {
              const dmg =
                e.attackerMode === "double"
                  ? (localCtx.startPower.get(localCtx.my.bothIds?.[0]) ?? 0) + (localCtx.startPower.get(localCtx.my.bothIds?.[1]) ?? 0)
                  : e.attackerMode === "support"
                    ? (localCtx.startPower.get(localCtx.my.supportId) ?? 0)
                    : (localCtx.startPower.get(localCtx.my.mainId) ?? 0);
              if (runtime?.wasAttackedByPlayerId && typeof runtime.wasAttackedByPlayerId.set === "function") {
                const mark = (targetId) => {
                  if (targetId && targetId === localCtx.opp.mainId) runtime.wasAttackedByPlayerId.set(localCtx.opp.playerId, true);
                };
                if (e.defenderMode === "double") {
                  for (const tid of localCtx.opp.bothIds ?? []) mark(tid);
                } else if (e.target === "enemySupport") {
                  mark(localCtx.opp.supportId);
                } else if (e.target === "allySupport") {
                  mark(localCtx.my.supportId);
                } else {
                  mark(localCtx.opp.mainId);
                }
              }
              const defenderPid = e.target === "allySupport" ? localCtx.my.playerId : localCtx.opp.playerId;
              const blockOk = blockActiveByPlayerId && blockActiveByPlayerId[defenderPid] === true;
              const blockInner = blockInnerByPlayerId && Array.isArray(blockInnerByPlayerId[defenderPid]) ? blockInnerByPlayerId[defenderPid] : [];
              if (blockOk && blockInner.length > 0) {
                runtime.attackBlocked = true;
                extraLog.push(`${defenderPid.toUpperCase()}: 格挡成功`);
                const defCtx = flipContext(localCtx);
                const defMap = playerMapByPlayerId[defenderPid];
                for (const inner of blockInner) applyOneWith(inner, defCtx, defMap);
                return;
              }
              runtime.attackBlocked = false;
              const applyAtk = (id, dmg) => {
                const t = fighterById.get(id);
                if (!t) return;
                if (guardAtStartById?.get?.(id) === true && t.guard === true) {
                  const pid = String(id).split(":")[0] || "";
                  const golem = [...fighterById.values()].find((x) => x?.name === "魔像" && String(x.id).startsWith(`${pid}:`));
                  if (golem && golem.id !== id) {
                    t.guard = false;
                    golem.guard = true;
                    guardBlockedByPlayerId.add(pid);
                    extraLog.push(`护：${t.name} 抵挡攻击伤害 ${dmg}，护移动回魔像`);
                    return;
                  }
                }
                stepHpChange(t, -dmg, id === f.id ? trace : null);
              };
              if (e.defenderMode === "double") {
                for (const id of localCtx.opp.bothIds ?? []) applyAtk(id, dmg);
                return;
              }
              if (e.target === "enemySupport") applyAtk(localCtx.opp.supportId, dmg);
              else if (e.target === "allySupport") applyAtk(localCtx.my.supportId, dmg);
              else applyAtk(localCtx.opp.mainId, dmg);
              return;
            }
            if (e.type === "snakeFlip") {
              const t = fighterById.get(localCtx.my.mainId);
              if (!t) return;
              const beforeSnake = Number(t.snake) || 0;
              const nextSnake = beforeSnake === 1 ? 0 : 1;
              t.snake = nextSnake;
              if (Array.isArray(t.snakeFlipMark)) {
                const last = t.snakeFlipMark[t.snakeFlipMark.length - 1];
                if (last !== beforeSnake) t.snakeFlipMark.push(beforeSnake);
                t.snakeFlipMark.push(nextSnake);
              } else {
                t.snakeFlipMark = [beforeSnake, nextSnake];
              }
            }
          };
          const applyOne = (e) => applyOneWith(e, ctx, playerMap);
          for (const e of hpRuleEffects) applyOne(e);
          for (const p of poisonQueue) {
            const targetId = p?.ctx?.opp?.mainId;
            if (!targetId) continue;
            const t = fighterById.get(targetId);
            if (!t) continue;
            const hpNow = Number(t.hp) || 0;
            if (!(hpNow > 0)) continue;
            const dmg = Math.max(0, Math.floor(hpNow / 2));
            if (!dmg) continue;
            stepHpChange(t, -dmg, targetId === f.id ? trace : null);
          }
        }
      }

      if (f.name === "玛曼布丽吉特" && f.hp === -2) {
        f.power = Math.max(0, (Number(f.power) || 0) + 1);
        f.hp = 4;
        if (trace) trace.push(4);
        stop = true;
      }

      if (stop) break;
    }
  }

  for (const [id, d0] of hpDelta.entries()) {
    const f = fighterById.get(id);
    if (!f) continue;
    const trace = [Number(f.hp) || 0];
    stepHpChange(f, d0, trace);
    if (trace.length >= 2) hpTraceById.set(id, trace);
  }
  return { hpTraceById, planEvents, log: extraLog, guardBlockedByPlayerId };
}

function snapshotFightersState(state) {
  const fighters = [...state.players.p1.fighters, ...state.players.p2.fighters];
  const m = new Map();
  for (const x of fighters) m.set(x.id, { hp: x.hp, power: x.power });
  return m;
}

function checkWinner(state) {
  const isKoNow = (f) => {
    if (f?.koByFlame === true) return true;
    if (f?.name === "精灵族") return f?.elf?.gameKo === true;
    return Array.isArray(f.koLines) && f.koLines.length > 0 ? f.koLines.includes(Number(f.hp) || 0) : Number(f.hp) <= Number(f.koLine);
  };
  const p1KO = state.players.p1.fighters.some(isKoNow);
  const p2KO = state.players.p2.fighters.some(isKoNow);
  if (p1KO && p2KO) return "draw";
  if (p1KO) return "p2";
  if (p2KO) return "p1";
  return null;
}

function enterConstructionIfNeeded(state, pushLog) {
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  const need1 = p1.battleDeck.length === 0;
  const need2 = p2.battleDeck.length === 0;
  if (!need1 || !need2) return false;

  p1.battleDeck = [...p1.resolvedPile].reverse();
  p1.resolvedPile = [];
  p2.battleDeck = [...p2.resolvedPile].reverse();
  p2.resolvedPile = [];
  state.phase = PHASE.CONSTRUCTION;
  state.construction.active = "p1";
  state.construction.p1 = null;
  state.construction.p2 = null;
  pushLog(`战斗牌库结算完：翻面形成新战斗牌库，进入构筑阶段`);
  return true;
}

function startConstructionForPlayer(state, playerId) {
  const player = state.players[playerId];
  if (player.constructionDeck.length < 3) {
    state.phase = PHASE.GAME_OVER;
    state.winner = "draw";
    return;
  }
  const drawn = [player.constructionDeck.shift(), player.constructionDeck.shift(), player.constructionDeck.shift()].filter(Boolean);
  state.construction[playerId] = {
    drawn,
    insertIndex: 0,
    insertPos: null,
    previewPos: null,
    dragging: false,
    bottomOrder: "01",
  };
}

function resolveOnInsert(state, playerId, insertedCard, pushLog) {
  const player = state.players[playerId];
  const oppId = playerId === "p1" ? "p2" : "p1";
  const opponent = state.players[oppId];
  const ctx = buildContextForInsert(player, opponent, insertedCard);
  const myEffects = insertedCard?.getOnInsertEffects ? insertedCard.getOnInsertEffects() : [];
  if (myEffects.length === 0) return;
  const oppEffects = [];

  const settlement = settleEffects({
    ctx,
    myCard: insertedCard,
    oppCard: { fighterName: "构筑阶段", text: "", id: "none" },
    myEffects,
    oppEffects,
    myPlayer: player,
    oppPlayer: opponent,
  });
  for (const line of settlement.log) pushLog(`[入库时][${playerId.toUpperCase()}] ${line}`);
  const beforeSnapshot = snapshotFightersState(state);
  applyDeltas(state, settlement.hpDelta, settlement.powerDelta, beforeSnapshot, null, null, null);
  const afterSnapshot = snapshotFightersState(state);
  const allFighters = [...player.fighters, ...opponent.fighters];
  const fighterById = new Map(allFighters.map((f) => [f.id, f]));
  for (const [id, a] of afterSnapshot.entries()) {
    const b = beforeSnapshot.get(id);
    if (!b) continue;
    const dh = (a.hp ?? 0) - (b.hp ?? 0);
    const dp = (a.power ?? 0) - (b.power ?? 0);
    if (dh === 0 && dp === 0) continue;
    const f = fighterById.get(id);
    const name = f?.name ?? id;
    const parts = [];
    if (dh !== 0) parts.push(`HP ${dh > 0 ? "+" : ""}${dh}`);
    if (dp !== 0) parts.push(`力量 ${dp > 0 ? "+" : ""}${dp}`);
    pushLog(`[入库时][${playerId.toUpperCase()}] 结算变化：${name}（${parts.join("，")}）`);
  }
}

function applyConstructionChoice(state, playerId, pushLog) {
  const choice = state.construction[playerId];
  if (!choice) return;
  const player = state.players[playerId];
  const drawn = choice.drawn;
  const insertCard = drawn[choice.insertIndex];
  const rest = drawn.filter((_, idx) => idx !== choice.insertIndex);
  const [c0, c1] = rest;
  const bottom = choice.bottomOrder === "01" ? [c0, c1] : [c1, c0];

  const pos = Math.max(0, Math.min(player.battleDeck.length, Number(choice.insertPos) || 0));
  player.battleDeck.splice(pos, 0, insertCard);
  pushLog(`${playerId.toUpperCase()} 构筑：将 ${formatCardLabel(insertCard)} 插入战斗牌库位置 ${pos}`);
  resolveOnInsert(state, playerId, insertCard, pushLog);

  for (const c of bottom) {
    if (c) player.constructionDeck.push(c);
  }

  state.construction[playerId] = null;
}

function beginNextConstructionStep(state, pushLog) {
  if (state.phase !== PHASE.CONSTRUCTION) return;
  for (const pid of ["p1", "p2"]) {
    if (!state.construction[pid]) startConstructionForPlayer(state, pid);
  }
  if (state.phase === PHASE.GAME_OVER) {
    pushLog(`构筑牌库不足 3 张：平局`);
  }
}

function createApp() {
  const els = {
    phase: document.getElementById("phase"),
    btnNewGame: document.getElementById("btn-new-game"),
    btnToggleDecks: document.getElementById("btn-toggle-decks"),
    btnOpenRules: document.getElementById("btn-open-rules"),
    btnOpenLog: document.getElementById("btn-open-log"),
    btnNextBattle: document.getElementById("btn-next-battle"),
    btnEnterConstruction: document.getElementById("btn-enter-construction"),
    btnCompare: document.getElementById("btn-compare"),
    btnConfirmEnd: document.getElementById("btn-confirm-end"),
    btnClearLog: document.getElementById("btn-clear-log"),
    battleReveal: document.getElementById("battle-reveal"),
    logDialog: document.getElementById("log-dialog"),
    log: document.getElementById("log"),
    p1Fighters: document.getElementById("p1-fighters"),
    p2Fighters: document.getElementById("p2-fighters"),
    p1BattleCount: document.getElementById("p1-battle-count"),
    p1ConstructCount: document.getElementById("p1-construct-count"),
    p1ResolvedCount: document.getElementById("p1-resolved-count"),
    p2BattleCount: document.getElementById("p2-battle-count"),
    p2ConstructCount: document.getElementById("p2-construct-count"),
    p2ResolvedCount: document.getElementById("p2-resolved-count"),
    p1Decks: document.getElementById("p1-decks"),
    p2Decks: document.getElementById("p2-decks"),
    constructionPanel: document.getElementById("construction-panel"),
    rulesDialog: document.getElementById("rules-dialog"),
    rulesText: document.getElementById("rules-text"),
  };

  const data = {
    rulesTxt: "",
    fightersTxt: "",
    cardsTxt: "",
    settlementTxt: "",
    fighterDefs: [],
  };

  let state = { phase: PHASE.LOADING };
  let renderQueued = false;
  let activeInsertDrag = null;

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function pushLog(line) {
    const text = `[${nowTime()}] ${line}\n`;
    els.log.textContent += text;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function clearLog() {
    els.log.textContent = "";
  }

  function phaseLabel() {
    if (state.phase === PHASE.BATTLE) return `战斗轮次 ${state.round} · 回合 ${state.turn}`;
    if (state.phase === PHASE.CONSTRUCTION) return `构筑阶段`;
    if (state.phase === PHASE.GAME_OVER) {
      const isKoNow = (f) => {
        if (f?.koByFlame === true) return true;
        if (f?.name === "精灵族") return f?.elf?.gameKo === true;
        return Array.isArray(f.koLines) && f.koLines.length > 0 ? f.koLines.includes(Number(f.hp) || 0) : Number(f.hp) <= Number(f.koLine);
      };
      const p1KO = state.players?.p1?.fighters?.some(isKoNow) === true;
      const p2KO = state.players?.p2?.fighters?.some(isKoNow) === true;
      const resLine =
        state.winner === "draw" ? `平局` : state.winner === "p1" ? `P1 胜 / P2 败` : state.winner === "p2" ? `P2 胜 / P1 败` : "-";
      return `结束结算：${resLine}（P1 ${p1KO ? "KO" : "未KO"}，P2 ${p2KO ? "KO" : "未KO"}）`;
    }
    if (state.phase === PHASE.SETUP) return `初始化`;
    if (state.phase === PHASE.LOADING) return `加载中`;
    return String(state.phase);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function headshotKey(name) {
    const n = String(name ?? "");
    if (n === "玛曼布丽吉特") return "玛曼";
    return n;
  }

  function headshotUrl(name) {
    const key = headshotKey(name);
    return `headshots/${encodeURIComponent(key)}.png`;
  }

  function headshotImgHtml(name, className) {
    const url = headshotUrl(name);
    const cls = className ? String(className) : "headshot";
    return `<img class="${escapeHtml(cls)}" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">`;
  }

  function cardLabel(card) {
    if (!card) return "-";
    const n = card.cardName ? String(card.cardName).trim() : "";
    return n ? `${card.fighterName}·${n}` : `${card.fighterName}#${card.cardNo}`;
  }

  function displayCardText(card) {
    if (!card) return "-";
    const showFlipHint =
      state?.phase === PHASE.BATTLE &&
      state?.lastRound?.round === state?.round &&
      state?.lastRound?.turn === state?.turn &&
      state?.lastRound?.flipTriggeredByCardId?.has?.(card.id) === true;
    if (card.fighterName === "郑一嫂" && Number(card.cardNo) === 1)
      return `船0~7攻击；8~15回复2；20群伤至1；战船+1${showFlipHint ? "（触发翻转）" : ""}`;
    if (card.fighterName === "派克帮" && Number(card.cardNo) === 1)
      return `警在己方：攻击&交警；警在对方：获得警&力量同时+1${showFlipHint ? "（触发翻转）" : ""}`;
    const t = card.text || "";
    let shownFlipped = card.flipped === true;
    const lf = state?.lastFlip;
    if (lf?.p1Card?.id && lf.p1Card.id === card.id) shownFlipped = lf.p1FlippedAtStart === true;
    else if (lf?.p2Card?.id && lf.p2Card.id === card.id) shownFlipped = lf.p2FlippedAtStart === true;
    const idx = t.indexOf("//");
    if (idx >= 0) {
      const before = t.slice(0, idx).trim();
      const after = t.slice(idx + 2).trim();
      if (after) {
        const base = shownFlipped === true ? `${after} // ${before}` : `${before} // ${after}`;
        return `${base}${showFlipHint ? "（触发翻转）" : ""}`;
      }
    }
    return `${t || "-"}${showFlipHint ? "（触发翻转）" : ""}`;
  }

  function cardTitleHtml(card) {
    if (!card) return "-";
    const n = card.cardName ? String(card.cardName).trim() : "";
    return `${escapeHtml(card.fighterName)}${n ? ` · ${escapeHtml(n)}` : `#${card.cardNo}`}`;
  }

  function snapshotFighters() {
    const fighters = [...state.players.p1.fighters, ...state.players.p2.fighters];
    const m = new Map();
    for (const x of fighters) m.set(x.id, { hp: x.hp, power: x.power });
    return m;
  }

  function renderHpGrid(f, overlay, opts) {
    const rulesByHp = new Map((f.hpRules ?? []).map((r) => [r.hp, r.effect]));
    const maxHp = Math.max(1, Number(f.maxHp) || 1);
    const hp = Number(f.hp) || 0;
    const extraLabelCount = f.name === "玛曼布丽吉特" ? 1 : 0;
    const koValuesRaw =
      Array.isArray(f.koLines) && f.koLines.length > 0 ? f.koLines : [Number(f.koLine) || 0];
    const koValues = [...koValuesRaw]
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b);
    const extraHead = extraLabelCount + Math.max(1, koValues.length);
    const maxIdx = Math.min(30, maxHp + extraHead);
    const idxForHp = (h) => {
      const v = Number(h);
      if (!Number.isFinite(v)) return extraHead + 1;
      const minKo = koValues[0] ?? 0;
      if (v <= minKo) return extraLabelCount + 1;
      const kIdx = koValues.indexOf(v);
      if (kIdx >= 0) return extraLabelCount + 1 + kIdx;
      const clamped = Math.max(1, Math.min(maxHp, v));
      return extraHead + clamped;
    };
    const slots = Math.max(1, Math.min(30, Number(opts?.cells) || 30));
    const maxIdx2 = Math.min(slots, maxHp + extraHead);
    const currentIdx = Math.max(1, Math.min(maxIdx2, idxForHp(hp)));
    const oldIdxRaw = overlay?.oldHp ?? null;
    const oldIdx =
      oldIdxRaw == null ? null : Math.max(1, Math.min(maxIdx2, idxForHp(Number(oldIdxRaw))));
    const hpDelta = Number(overlay?.hpDelta) || 0;
    const hpPath = Array.isArray(overlay?.hpPath) ? overlay.hpPath : null;
    const showHpDelta = Boolean(overlay?.showHpDelta) && hpDelta !== 0 && oldIdx != null && oldIdx !== currentIdx;
    const hpMoveLabel = showHpDelta ? `${hpDelta > 0 ? "→" : "←"}${Math.abs(hpDelta)}` : "";
    let cells = "";
    for (let i = 1; i <= slots; i++) {
      const enabled = i <= maxHp + extraHead;
      const isCurrent = enabled && i === currentIdx;
      const isKoCell = enabled && i > extraLabelCount && i <= extraHead;
      const filled = enabled && i > extraHead && i - extraHead <= hp;
      const ruleRaw = enabled && i > extraHead ? rulesByHp.get(i - extraHead) : null;
      const rule = ruleRaw ? String(ruleRaw).replaceAll("力量", "力") : null;
      const isOld = showHpDelta && i === oldIdx;
      const classes = `hp-cell${enabled ? "" : " disabled"}${filled ? " filled" : ""}${isCurrent ? " current" : ""}${isOld ? " old" : ""}`;
      let dataHp = "";
      if (f.name === "玛曼布丽吉特" && i === 1) dataHp = "bonus";
      else if (isKoCell) dataHp = `${koValues[i - extraLabelCount - 1] ?? koValues[0] ?? 0}`;
      else if (enabled && i > extraHead) dataHp = `${i - extraHead}`;
      cells += `
        <div class="${classes}" data-hp="${dataHp}">
          ${f.name === "玛曼布丽吉特" && i === 1 ? `<div class="hp-rule">力+1</div>` : ""}
          ${isKoCell ? `<div class="hp-ko">KO</div>` : ""}
          ${isCurrent ? `<div class="hp-cur">HP</div>` : ""}
          ${isOld ? `<div class="hp-move ${hpDelta > 0 ? "hp-move-up" : "hp-move-down"}">${hpMoveLabel}</div>` : ""}
          ${rule ? `<div class="hp-rule">${escapeHtml(rule)}</div>` : ""}
        </div>
      `;
    }
    const arrowHtml =
      f.name === "玛曼布丽吉特"
        ? `<div class="hp-arrow"></div>`
        : "";
    let jumpHtml = "";
    if (f.name === "玛曼布丽吉特" && hpPath && hpPath.length >= 3) {
      const idxNeg2 = hpPath.indexOf(-2);
      const idx4 = hpPath.lastIndexOf(4);
      if (idxNeg2 >= 1 && idx4 > idxNeg2) {
        const fromVal = hpPath[idxNeg2 - 1];
        jumpHtml = `<div class="hp-jump hp-jump-left" data-from="${fromVal}" data-to="bonus"></div><div class="hp-jump hp-jump-right" data-from="bonus" data-to="4"></div>`;
      }
    }
    if (opts?.compact === true) {
      return `
        <div class="hp-grid elf-compact" style="--hp-cells:${slots}">
          ${cells}
          ${arrowHtml}
          ${jumpHtml}
        </div>
      `;
    }
    return `
      <div class="hp-wrap">
        <div class="hp-label">HP</div>
        <div class="hp-grid" style="--hp-cells:${slots}">
          ${cells}
          ${arrowHtml}
          ${jumpHtml}
        </div>
        <div class="hp-num">${hp}/${maxHp}</div>
      </div>
    `;
  }

  function renderElfHpGrid(f, shownHp, overlay) {
    const spirits = Array.isArray(f?.elf?.spirits) ? f.elf.spirits : [];
    const dead = Array.isArray(f?.elf?.dead) ? f.elf.dead : [false, false, false];
    const active = Number.isFinite(f?.elf?.active) ? Number(f.elf.active) : null;
    const activeSpirit = active == null ? null : spirits[active] ?? null;
    const activeMax = Math.max(0, Number(activeSpirit?.maxHp) || 0);
    const hpNow = Math.max(0, Math.min(activeMax, Number(shownHp) || 0));
    const slots = 30;
    let cells = "";
    for (let col = 1; col <= slots; col++) {
      if (col > 18) {
        cells += `<div class="hp-cell disabled" data-hp=""></div>`;
        continue;
      }
      const g = Math.floor((col - 1) / 6);
      const pos = ((col - 1) % 6) + 1;
      const sp = spirits[g] ?? null;
      const spMax = Math.max(0, Number(sp?.maxHp) || 0);
      const isDead = dead[g] === true;
      const isActive = active === g;
      const tag = isDead ? "elf-dead" : isActive ? "elf-active" : "elf-idle";
      const rulesByHp = new Map((sp?.hpRules ?? []).map((r) => [r.hp, r.effect]));

      if (pos === 1) {
        const isCurrent = isActive && hpNow <= 0;
        cells += `
          <div class="hp-cell ${tag}${isCurrent ? " current" : ""}" data-hp="0">
            <div class="hp-ko">KO</div>
            ${isCurrent ? `<div class="hp-cur">HP</div>` : ""}
          </div>
        `;
        continue;
      }

      const hpIndex = pos - 1;
      if (hpIndex > spMax) {
        cells += `<div class="hp-cell placeholder ${tag}" data-hp=""></div>`;
        continue;
      }
      const hpVal = isDead ? 0 : isActive ? hpNow : spMax;
      const filled = hpIndex <= hpVal;
      const isCurrent = isActive && hpVal > 0 && hpIndex === hpVal;
      const ruleRaw = rulesByHp.get(hpIndex) ?? null;
      const rule = ruleRaw ? String(ruleRaw).replaceAll("力量", "力") : null;
      const oldIdxRaw = overlay?.oldHp ?? null;
      const oldHp = isActive && oldIdxRaw != null ? Math.max(0, Math.min(activeMax, Number(oldIdxRaw) || 0)) : null;
      const isOld = isActive && oldHp != null && hpIndex === oldHp && Number(overlay?.hpDelta) !== 0 && oldHp !== hpNow;
      const hpDelta = isActive ? Number(overlay?.hpDelta) || 0 : 0;
      const hpMoveLabel = isOld ? `${hpDelta > 0 ? "→" : "←"}${Math.abs(hpDelta)}` : "";
      const classes = `hp-cell ${tag}${filled ? " filled" : ""}${isCurrent ? " current" : ""}${isOld ? " old" : ""}`;
      cells += `
        <div class="${classes}" data-hp="${hpIndex}">
          ${isCurrent ? `<div class="hp-cur">HP</div>` : ""}
          ${isOld ? `<div class="hp-move ${hpDelta > 0 ? "hp-move-up" : "hp-move-down"}">${hpMoveLabel}</div>` : ""}
          ${rule ? `<div class="hp-rule">${escapeHtml(rule)}</div>` : ""}
        </div>
      `;
    }
    return `
      <div class="hp-wrap">
        <div class="hp-label">HP</div>
        <div class="hp-grid" style="--hp-cells:${slots}">
          ${cells}
        </div>
        <div class="hp-num">${active == null ? "-" : `${hpNow}/${activeMax}`}</div>
      </div>
    `;
  }

  function renderPowerGrid(f, overlay) {
    const slots = 30;
    const powerRaw = Number(f?.power) || 0;
    const power = Math.max(0, powerRaw);
    const filledCount = Math.min(slots, power);
    const over = power > slots;

    const oldPowerRaw = overlay?.oldPower ?? null;
    const oldPower = oldPowerRaw == null ? null : Math.max(0, Number(oldPowerRaw) || 0);
    const powerDelta = Number(overlay?.powerDelta) || 0;
    const showPowerDelta =
      Boolean(overlay?.showPowerDelta) && powerDelta !== 0 && oldPower != null && oldPower !== power;
    const oldIdx = showPowerDelta ? Math.max(1, Math.min(slots, Math.max(1, oldPower))) : null;
    const moveLabel = showPowerDelta ? `${powerDelta > 0 ? "→" : "←"}${Math.abs(powerDelta)}` : "";

    let cells = "";
    for (let i = 1; i <= slots; i++) {
      const filled = i <= filledCount;
      const isOld = showPowerDelta && i === oldIdx;
      const classes = `power-cell${filled ? " filled" : ""}${isOld ? " old" : ""}`;
      cells += `
        <div class="${classes}" data-power="${i}">
          ${isOld ? `<div class="power-move ${powerDelta > 0 ? "power-move-up" : "power-move-down"}">${moveLabel}</div>` : ""}
        </div>
      `;
    }

    return `
      <div class="power-wrap">
        <div class="power-label">力</div>
        <div class="power-grid" style="--hp-cells:${slots}">
          ${cells}
          ${over ? `<div class="power-plus">+</div>` : ""}
        </div>
        <div class="power-num">${power}</div>
      </div>
    `;
  }

  function renderFighter(f, opts) {
    const isMain = opts?.isMain === true;
    function isKoNow(fx) {
      if (fx?.koByFlame === true) return true;
      if (fx?.name === "精灵族") return fx?.elf?.gameKo === true;
      if (Array.isArray(fx.koLines) && fx.koLines.length > 0) {
        return fx.koLines.includes(Number(fx.hp) || 0);
      }
      return Number(fx.hp) <= Number(fx.koLine);
    }
    const isKo = isKoNow(f);
    const policeMark = f.police === true ? `<div class="police-mark">警</div>` : "";
    const flameTotal = (() => {
      const v = f?.flame;
      if (!v || typeof v !== "object") return 0;
      let sum = 0;
      for (const x of Object.values(v)) sum += Number(x) || 0;
      return Math.max(0, Math.min(5, sum));
    })();
    const flameMark = flameTotal > 0 ? `<div class="flame-mark">焰${flameTotal}</div>` : "";
    const ningTotal = (() => {
      const v = f?.ning;
      if (!v || typeof v !== "object") return 0;
      let sum = 0;
      for (const x of Object.values(v)) sum += Number(x) || 0;
      return Math.max(0, Math.min(2, sum));
    })();
    const ningMark = ningTotal > 0 ? `<div class="ning-mark">凝${ningTotal}</div>` : "";
    const guardMark = f.guard === true ? `<div class="guard-mark">护</div>` : "";
    const pidForMark = String(f?.id ?? "").split(":")[0];
    const golemBlockMark =
      f?.name === "魔像" &&
      state?.phase === PHASE.BATTLE &&
      state?.lastRound?.round === state?.round &&
      state?.lastRound?.turn === state?.turn &&
      state?.lastRound?.guardBlockedByPlayerId?.has?.(pidForMark) === true
        ? `<div class="golem-block-mark">魔像抵挡！</div>`
        : "";
    const headshot = headshotImgHtml(f.name, "fighter-headshot");
    const rev = Math.max(0, Math.min(4, Number(f.revelation) || 0));
    const revBar =
      f.name === "贞德"
        ? `
          <div class="revelation-wrap">
            <div class="revelation-label">神示</div>
            <div class="revelation-grid">
              <div class="revelation-cell${rev === 1 ? " active" : ""}"></div>
              <div class="revelation-cell${rev === 2 ? " active" : ""}"><div class="revelation-eff">力+1</div></div>
              <div class="revelation-cell${rev === 3 ? " active" : ""}"></div>
              <div class="revelation-cell${rev === 4 ? " active" : ""}"><div class="revelation-eff">友力+1</div></div>
            </div>
          </div>
        `
        : "";
    const ship = Math.max(0, Math.min(20, Number(f.battleship) || 0));
    let shipCells = "";
    for (let i = 1; i <= 20; i++) {
      shipCells += `<div class="ship-cell${i <= ship ? " filled" : ""}${ship > 0 && i === ship ? " current" : ""}"></div>`;
    }
    const shipBar =
      f.name === "郑一嫂"
        ? `
          <div class="ship-wrap">
            <div class="ship-label">战船</div>
            <div class="ship-grid">${shipCells}</div>
            <div class="ship-num">${ship}/20</div>
          </div>
        `
        : "";
    const rage = Math.max(0, Math.min(7, Number(f.rage) || 0));
    let rageCells = "";
    for (let i = 1; i <= 7; i++) {
      rageCells += `<div class="rage-cell${i <= rage ? " filled" : ""}${rage > 0 && i === rage ? " current" : ""}"></div>`;
    }
    const formLabel = f.bodvarForm === "bear" ? "熊" : "人";
    const rageBar =
      f.name === "博德瓦尔"
        ? `
          <div class="rage-wrap">
            <div class="rage-label">怒</div>
            <div class="rage-grid">${rageCells}</div>
            <div class="rage-num">${formLabel} ${rage}/7</div>
          </div>
        `
        : "";
    const planState = f?.plan;
    const planBar =
      f.name === "米莱狄" && planState
        ? `
          <div class="plan-wrap">
            <div class="plan-label">计划</div>
            <div class="plan-num">未${(planState.available ?? []).length} 已${(planState.ready ?? []).length} 弃${(planState.discard ?? []).length}</div>
          </div>
        `
        : "";
    const snakeFlipMark = f?.snakeFlipMark ?? null;
    const snakeSeq = (() => {
      const cur = (Number(f.snake) || 0) === 1 ? 1 : 0;
      const base = Array.isArray(snakeFlipMark) && snakeFlipMark.length > 0 ? snakeFlipMark.map((v) => ((Number(v) || 0) === 1 ? 1 : 0)) : [cur];
      if (base[base.length - 1] !== cur) base.push(cur);
      return base;
    })();
    const snakeChainHtml = snakeSeq
      .map((v) => `<span class="snake-chip ${v === 1 ? "black" : "white"}"></span>`)
      .join(`<span class="snake-arrow">→</span>`);
    const snakeBar =
      f.name === "靡菲斯特"
        ? `
          <div class="snake-wrap">
            <div class="snake-label">蛇</div>
            <div class="snake-cell"><div class="snake-chain">${snakeChainHtml}</div></div>
          </div>
        `
        : "";
    const lastRound = state.lastRound;
    const comparing = state.compareHold === true && lastRound?.before?.has(f.id);
    const base = comparing ? lastRound.before.get(f.id) : null;
    const shownHp = base ? base.hp : f.hp;
    const shownPower = base ? base.power : f.power;
    const pText = `${shownPower}`;
    const soulMark =
      f.name === "精灵族" ? `<div class="soul-mark">魂${Math.max(0, Number(f?.elf?.soul) || 0)}</div>` : "";
    const pidForElf = String(f?.id ?? "").split(":")[0];
    let elfPickHtml = "";
    if (f.name === "精灵族" && f.elf && state.phase === PHASE.BATTLE && state.pendingElfPickByPlayer?.[pidForElf]) {
      const spirits = Array.isArray(f.elf.spirits) ? f.elf.spirits : [];
      const dead = Array.isArray(f.elf.dead) ? f.elf.dead : [false, false, false];
      const soul = Math.max(0, Number(f?.elf?.soul) || 0);
      const pendingKoIndex = Number.isFinite(f?.elf?.pendingKoIndex) ? Number(f.elf.pendingKoIndex) : null;
      const buttons = [0, 1, 2]
        .map((i) => {
          const sp = spirits[i] ?? null;
          const maxHp = Math.max(0, Number(sp?.maxHp) || 0);
          const d = dead[i] === true || pendingKoIndex === i;
          const colStart = 1 + i * 6;
          return `<button type="button" class="elf-pick-btn${d ? " disabled" : ""}" data-elf-pick="${pidForElf}:${i}" ${
            d ? "disabled" : ""
          } style="grid-column:${colStart} / span 6"><div class="elf-pick-title">灵${i + 1}</div><div class="elf-pick-sub">血量${maxHp}</div></button>`;
        })
        .join("");
      elfPickHtml = `
        <div class="elf-pick-in-card">
          <div class="elf-pick-hint">${pendingKoIndex != null ? "选择下一位灵" : "选择进入游戏的灵"}（魂=${soul}）</div>
          <div class="elf-pick-row-grid" style="--hp-cells:30">${buttons}</div>
        </div>
      `;
    }

    let powerDeltaHtml = "";
    let powerOverlay = null;
    let hpOverlay = null;
    const overlay =
      !comparing && state.phase === PHASE.BATTLE && lastRound?.before?.has(f.id) && lastRound?.after?.has(f.id)
        ? lastRound
        : !comparing &&
            state.lastIntermissionEffect?.before?.has(f.id) &&
            state.lastIntermissionEffect?.after?.has(f.id) &&
            (state.phase === PHASE.CONSTRUCTION || (state.phase === PHASE.BATTLE && !state.lastFlip))
          ? state.lastIntermissionEffect
          : null;

    if (overlay) {
      const b = overlay.before.get(f.id);
      const a = overlay.after.get(f.id);
      const dp = (a.power ?? 0) - (b.power ?? 0);
      const dh = (a.hp ?? 0) - (b.hp ?? 0);
      if (dp !== 0) powerOverlay = { oldPower: b.power, powerDelta: dp, showPowerDelta: true };
      const hpPath = overlay?.hpTraceById?.get?.(f.id) ?? null;
      hpOverlay = { oldHp: b.hp, hpDelta: dh, showHpDelta: true, hpPath };
    }
    let hpHtml = renderHpGrid({ ...f, hp: shownHp }, hpOverlay);
    if (f.name === "精灵族" && f.elf) {
      hpHtml = renderElfHpGrid(f, shownHp, hpOverlay);
    }
    const powerHtml = renderPowerGrid({ ...f, power: shownPower }, powerOverlay);
    return `
      <div class="fighter${isMain ? " fighter-main" : ""}">
        ${policeMark}
        ${flameMark}
        ${ningMark}
        ${guardMark}
        ${golemBlockMark}
        <div class="fighter-top">
          ${headshot}
          <div class="fighter-name">${f.name}</div>
          ${soulMark}
          ${isKo ? `<div class="ko-badge">KO!</div>` : ""}
        </div>
        ${hpHtml}
        ${powerHtml}
        ${elfPickHtml}
        ${revBar}
        ${shipBar}
        ${rageBar}
        ${planBar}
        ${snakeBar}
      </div>
    `;
  }

  function renderDeckList(title, cards) {
    const lines = cards
      .map((c, idx) => `${String(idx + 1).padStart(2, "0")}. ${cardLabel(c)}  ${displayCardText(c)}`)
      .join("\n");
    return `
      <div class="deck-title">${title}</div>
      <div class="deck-list">${lines || "-"}</div>
    `;
  }

  function syncRevelationSizing() {
    const hpCell = els.constructionPanel.querySelector(`.hp-grid .hp-cell:not(.disabled)`) ?? document.querySelector(`.hp-grid .hp-cell:not(.disabled)`);
    if (!hpCell) return;
    const hpGrid = hpCell.closest(".hp-grid");
    if (!hpGrid) return;
    const cellW = hpCell.getBoundingClientRect().width;
    if (!(cellW > 0)) return;
    const revCellW = Math.max(10, Math.floor(cellW * 2));
    document.querySelectorAll(".revelation-grid").forEach((el) => {
      el.style.setProperty("--rev-cell-w", `${revCellW}px`);
    });
  }

  function renderPlayers() {
    if (state.phase === PHASE.LOADING) return;
    const p1 = state.players?.p1;
    const p2 = state.players?.p2;
    if (!p1 || !p2) {
      els.p1Fighters.innerHTML = "";
      els.p2Fighters.innerHTML = "";
      els.p1BattleCount.textContent = `战斗牌库: -`;
      els.p1ConstructCount.textContent = `构筑牌库: -`;
      els.p1ResolvedCount.textContent = `已结算: -`;
      els.p2BattleCount.textContent = `战斗牌库: -`;
      els.p2ConstructCount.textContent = `构筑牌库: -`;
      els.p2ResolvedCount.textContent = `已结算: -`;
      els.p1Decks.innerHTML = "";
      els.p2Decks.innerHTML = "";
      els.p1Decks.classList.add("hidden");
      els.p2Decks.classList.add("hidden");
      return;
    }

    const p1Main = state.phase === PHASE.BATTLE && state.lastFlip ? state.lastFlip.p1Card?.fighterName : null;
    const p2Main = state.phase === PHASE.BATTLE && state.lastFlip ? state.lastFlip.p2Card?.fighterName : null;
    els.p1Fighters.innerHTML = p1.fighters.map((f) => renderFighter(f, { isMain: p1Main === f.name })).join("");
    els.p2Fighters.innerHTML = p2.fighters.map((f) => renderFighter(f, { isMain: p2Main === f.name })).join("");
    document.querySelectorAll(`[data-elf-pick]`).forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.getAttribute("data-elf-pick") || "";
        const [pid, idxStr] = raw.split(":");
        const idx = Number(idxStr);
        const player = state.players?.[pid];
        const oppId = pid === "p1" ? "p2" : "p1";
        const elf = player?.fighters?.find?.((x) => x?.name === "精灵族");
        if (!elf || !elf.elf) return;
        const dead = Array.isArray(elf.elf.dead) ? elf.elf.dead : [false, false, false];
        if (!Number.isFinite(idx) || idx < 0 || idx > 2) return;
        const pendingKoIndex = Number.isFinite(elf.elf.pendingKoIndex) ? Number(elf.elf.pendingKoIndex) : null;
        if (dead[idx] === true) return;
        if (pendingKoIndex === idx) return;
        const wasKoPick = pendingKoIndex != null;
        if (pendingKoIndex != null) {
          dead[pendingKoIndex] = true;
          elf.elf.pendingKoIndex = null;
        }
        const spirit = elf.elf.spirits?.[idx];
        const maxHp = Number(spirit?.maxHp) || 0;
        if (maxHp <= 0) return;
        elf.elf.dead = dead;
        elf.elf.active = idx;
        elf.elf.pendingPick = false;
        elf.hp = maxHp;
        elf.maxHp = maxHp;
        elf.hpRules = Array.isArray(spirit?.hpRules) ? spirit.hpRules : [];
        state.pendingElfPickByPlayer[pid] = false;
        pushLog(`灵：${pid.toUpperCase()} 选择灵${idx + 1}（HP=${maxHp}，魂=${Number(elf.elf.soul) || 0}）`);
        const enterEffects = (elf.hpRules ?? []).filter((r) => r?.hp === elf.hp && r.stop !== true).flatMap((r) => r.effects ?? []);
        if (enterEffects.length) {
          const other = player.fighters.find((x) => x.id !== elf.id);
          const opp = state.players[oppId];
          const oppMain = opp?.fighters?.[0];
          const oppSup = opp?.fighters?.[1];
          const startPower = new Map();
          for (const f of [...player.fighters, ...opp.fighters]) startPower.set(f.id, Number(f.power) || 0);
          const ctx = {
            kind: "battle",
            my: { playerId: pid, mainId: elf.id, supportId: other?.id, bothIds: [elf.id, other?.id].filter(Boolean) },
            opp: { playerId: oppId, mainId: oppMain?.id, supportId: oppSup?.id, bothIds: [oppMain?.id, oppSup?.id].filter(Boolean) },
            startPower,
          };
          const settlement = settleEffects({
            ctx,
            myCard: { fighterName: "精灵族", text: "", id: "elf-enter" },
            oppCard: { fighterName: "对手", text: "", id: "elf-enter-opp" },
            myEffects: enterEffects,
            oppEffects: [],
            myPlayer: player,
            oppPlayer: opp,
          });
          const beforeSnapshot = snapshotFighters();
          applyDeltas(state, settlement.hpDelta, settlement.powerDelta, beforeSnapshot, null, null, null);
        }
        if (wasKoPick) {
          state.lastRound = null;
          state.lastIntermissionEffect = null;
          state.compareHold = false;
          state.lastFlip = null;
          render();
          battleTurn();
          return;
        }
        render();
      });
    });

    els.p1BattleCount.textContent = `战斗牌库: ${p1.battleDeck.length}`;
    els.p1ConstructCount.textContent = `构筑牌库: ${p1.constructionDeck.length}`;
    els.p1ResolvedCount.textContent = `已结算: ${p1.resolvedPile.length}`;
    els.p2BattleCount.textContent = `战斗牌库: ${p2.battleDeck.length}`;
    els.p2ConstructCount.textContent = `构筑牌库: ${p2.constructionDeck.length}`;
    els.p2ResolvedCount.textContent = `已结算: ${p2.resolvedPile.length}`;

    els.p1Decks.innerHTML =
      renderDeckList("战斗牌库（从上到下）", p1.battleDeck) +
      renderDeckList("构筑牌库（从上到下）", p1.constructionDeck) +
      renderDeckList("已结算（从上到下）", p1.resolvedPile);
    els.p2Decks.innerHTML =
      renderDeckList("战斗牌库（从上到下）", p2.battleDeck) +
      renderDeckList("构筑牌库（从上到下）", p2.constructionDeck) +
      renderDeckList("已结算（从上到下）", p2.resolvedPile);

    els.p1Decks.classList.toggle("hidden", !state.showDecks);
    els.p2Decks.classList.toggle("hidden", !state.showDecks);
    syncRevelationSizing();
    requestAnimationFrame(() => requestAnimationFrame(positionHpArrows));
  }

  function positionHpArrows() {
    const arrows = document.querySelectorAll(".hp-grid .hp-arrow");
    for (const arrow of arrows) {
      const grid = arrow.parentElement;
      if (!grid) continue;
      const from = grid.querySelector('.hp-cell[data-hp="bonus"]');
      const to = grid.querySelector('.hp-cell[data-hp="4"]');
      if (!from || !to) continue;
      const gridRect = grid.getBoundingClientRect();
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const x1 = fromRect.left - gridRect.left + fromRect.width / 2;
      const x2 = toRect.left - gridRect.left + toRect.width / 2;
      const y = toRect.top - gridRect.top + toRect.height / 2 - 1;
      const left = Math.min(x1, x2);
      const width = Math.abs(x2 - x1);
      const tip = 6;
      arrow.style.setProperty("--arrow-tip", `${tip}px`);
      arrow.style.left = `${left}px`;
      arrow.style.width = `${Math.max(0, width - tip)}px`;
      arrow.style.top = `${y}px`;
    }

    const jumps = document.querySelectorAll(".hp-grid .hp-jump");
    for (const jump of jumps) {
      const grid = jump.parentElement;
      if (!grid) continue;
      const fromKey = jump.getAttribute("data-from");
      const toKey = jump.getAttribute("data-to");
      if (!fromKey || !toKey) continue;
      const from = grid.querySelector(`.hp-cell[data-hp="${fromKey}"]`);
      const to = grid.querySelector(`.hp-cell[data-hp="${toKey}"]`);
      if (!from || !to) continue;
      const gridRect = grid.getBoundingClientRect();
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const x1 = fromRect.left - gridRect.left + fromRect.width / 2;
      const x2 = toRect.left - gridRect.left + toRect.width / 2;
      const left = Math.min(x1, x2);
      const width = Math.abs(x2 - x1);
      const tip = 6;
      const baseY = fromRect.top - gridRect.top + fromRect.height + 4;
      const y = jump.classList.contains("hp-jump-right") ? baseY + 4 : baseY;
      jump.style.setProperty("--arrow-tip", `${tip}px`);
      jump.style.left = `${left}px`;
      jump.style.width = `${Math.max(0, width - tip)}px`;
      jump.style.top = `${y}px`;
    }
  }

  function renderBattleReveal() {
    if (!els.battleReveal) return;
    if (state.phase !== PHASE.BATTLE) {
      els.battleReveal.innerHTML = "";
      return;
    }
    const last = state.lastFlip;
    if (!last) {
      els.battleReveal.innerHTML = `
        <div class="battle-reveal-inner">
          <div class="battle-hint">点击“翻牌并结算”开始本轮次第 ${state.turn} 回合</div>
        </div>
      `;
      return;
    }
    const { p1Card, p2Card, round, turn } = last;
    const planEvents =
      state.lastRound && state.lastRound.round === round && state.lastRound.turn === turn ? state.lastRound.planEvents ?? [] : [];
    const planHtml = (side) => {
      const pid = side === "P2" ? "p2" : "p1";
      const list = planEvents.filter((e) => e?.playerId === pid && e?.kind === "execute");
      if (list.length === 0) return "";
      const items = list
        .map((e) => {
          const source = e.source === "hpRule" ? `HP${e.triggerHp ?? ""}` : "卡";
          const title = `${source}实施`;
          const body = e.result === "empty" ? "无可实施" : String(e.planText ?? "").trim();
          return `<div class="plan-mini"><div class="plan-mini-title">${escapeHtml(title)}</div><div class="plan-mini-body">${escapeHtml(body || "-")}</div></div>`;
        })
        .join("");
      return `<div class="battle-card-plans">${items}</div>`;
    };
    const cardHtml = (side, card) => `
      <div class="battle-card" data-side="${side}">
        <div class="battle-card-top">
          <div class="battle-card-side">${side}</div>
          <div class="battle-card-title">${cardTitleHtml(card)}</div>
        </div>
        <div class="battle-card-body">${displayCardText(card)}</div>
        ${planHtml(side)}
      </div>
    `;
    els.battleReveal.innerHTML = `
      <div class="battle-reveal-inner">
        <div class="battle-round">轮次 ${round} · 回合 ${turn} 翻牌</div>
        <div class="battle-cards">
          ${cardHtml("P1", p1Card)}
          ${cardHtml("P2", p2Card)}
        </div>
      </div>
    `;
  }

  function renderConstruction() {
    els.constructionPanel.innerHTML = "";
    if (state.phase === PHASE.SETUP) {
      const pool = new Map(data.fighterDefs.map((f) => [f.name, f]));
      const names = [...data.fighterDefs]
        .slice()
        .sort((a, b) => (Number(a.code) || 0) - (Number(b.code) || 0))
        .map((f) => f.name);
      if (names.length < 2) {
        els.constructionPanel.innerHTML = `<div class="construction-card">战士库不足，无法开始游戏</div>`;
        return;
      }
      const setup = state.setup ?? { step: "pick", p1a: null, p1b: null, p2a: null, p2b: null, p1Built: [], p2Built: [] };
      state.setup = setup;
      if (!setup.step) setup.step = "pick";

      const cardText = (fighterName) => {
        if (fighterName === "郑一嫂") return "船0~7攻击；8~15回复2；20群伤至1；战船+1";
        if (fighterName === "派克帮") return "警在己方：攻击&交警；警在对方：获得警&力量同时+1";
        return pool.get(fighterName)?.deckTextByNo?.get(1) ?? "";
      };
      const cardName1 = (fighterName) => pool.get(fighterName)?.deckNameByNo?.get(1) ?? "";
      const setupCardHtml = (playerId, fighterName, variant) => {
        const text = cardText(fighterName);
        const n1 = cardName1(fighterName);
        return `
          <div class="insert-card ${variant}" draggable="false" data-setup="true" data-player="${playerId}" data-name="${fighterName}">
            <div class="insert-title">${fighterName}${n1 ? ` · ${n1}` : "#1"}</div>
            <div class="insert-text">${text}</div>
          </div>
        `;
      };

      const setupBoardHtml = (playerId, built) => {
        let html = "";
        const arr = Array.isArray(built) ? built : [];
        html += `<div class="setup-board-slot" data-setup-slot="top" data-player="${playerId}">放到顶</div>`;
        if (arr.length === 0) {
          html += `<div class="setup-board-empty">（空）</div>`;
        } else {
          for (let i = 0; i < arr.length; i++) {
            const name = arr[i];
            const n1 = cardName1(name);
            html += `
              <div class="deck-card setup-built" draggable="false" data-setup="true" data-player="${playerId}" data-name="${name}">
                <div class="deck-title">${i === 0 ? "顶" : "底"}：${name}${n1 ? ` · ${n1}` : "#1"}</div>
                <div class="deck-text">${cardText(name)}</div>
              </div>
            `;
          }
        }
        html += `<div class="setup-board-slot" data-setup-slot="bottom" data-player="${playerId}">放到底</div>`;
        return html;
      };

      if (setup.step === "pick") {
        const slotLabel = (v, fallback) =>
          v
            ? `<div class="setup-picked" draggable="true" data-setup-pick="picked" data-name="${escapeHtml(v)}">${headshotImgHtml(
                v,
                "setup-headshot"
              )}<div class="setup-fighter-name">${escapeHtml(v)}</div></div>`
            : `<div class="setup-slot-placeholder">${fallback}</div>`;

        const pickedByP1 = new Set([setup.p1a, setup.p1b].filter(Boolean));
        const pickedByP2 = new Set([setup.p2a, setup.p2b].filter(Boolean));
        const gridNames = names.slice(0, 12);
        const poolCells = [];
        for (let i = 0; i < 12; i++) {
          const n = gridNames[i] ?? null;
          if (!n) {
            poolCells.push(`<div class="setup-fighter placeholder"></div>`);
            continue;
          }
          const takenBy = pickedByP1.has(n) ? "p1" : pickedByP2.has(n) ? "p2" : null;
          const disabled = takenBy != null;
          const title = takenBy === "p1" ? "已被P1选择" : takenBy === "p2" ? "已被P2选择" : "";
          poolCells.push(
            `<div class="setup-fighter${disabled ? " disabled" : ""}" ${title ? `title="${title}"` : ""} draggable="${
              disabled ? "false" : "true"
            }" data-setup-pick="fighter" data-name="${escapeHtml(n)}">${headshotImgHtml(
              n,
              "setup-headshot"
            )}<div class="setup-fighter-name">${escapeHtml(n)}</div></div>`
          );
        }

        els.constructionPanel.innerHTML = `
          <div class="construction-card">
            <div><strong>初始化</strong>：拖拽选择双方各 2 位战士</div>
            <div class="setup-pick-grid">
              <div class="setup-side" data-player="p1">
                <div class="setup-side-title"><strong>P1</strong></div>
                <div class="setup-slots">
                  <div class="setup-slot" data-setup-pick="slot" data-player="p1" data-slot="a">${slotLabel(setup.p1a, "空槽1")}</div>
                  <div class="setup-slot" data-setup-pick="slot" data-player="p1" data-slot="b">${slotLabel(setup.p1b, "空槽2")}</div>
                </div>
              </div>
              <div class="setup-pool setup-pool-grid" data-player="pool">
                ${poolCells.join("")}
              </div>
              <div class="setup-side" data-player="p2">
                <div class="setup-side-title"><strong>P2</strong></div>
                <div class="setup-slots">
                  <div class="setup-slot" data-setup-pick="slot" data-player="p2" data-slot="a">${slotLabel(setup.p2a, "空槽1")}</div>
                  <div class="setup-slot" data-setup-pick="slot" data-player="p2" data-slot="b">${slotLabel(setup.p2b, "空槽2")}</div>
                </div>
              </div>
            </div>
            <div class="construction-row">
              <button type="button" id="setup-clear">清空</button>
              <div class="spacer"></div>
              <button type="button" id="setup-confirm">确认开始</button>
            </div>
          </div>
        `;

        const setSlot = (pid, slot, name) => {
          const oppPicked = pid === "p1" ? new Set([setup.p2a, setup.p2b].filter(Boolean)) : new Set([setup.p1a, setup.p1b].filter(Boolean));
          if (oppPicked.has(name)) return false;
          const key = pid === "p1" ? (slot === "a" ? "p1a" : "p1b") : slot === "a" ? "p2a" : "p2b";
          const otherKey = pid === "p1" ? (slot === "a" ? "p1b" : "p1a") : slot === "a" ? "p2b" : "p2a";
          const cur = setup[key] ?? null;
          const other = setup[otherKey] ?? null;
          if (other === name) {
            setup[otherKey] = cur;
          }
          setup[key] = name;
          return true;
        };

        const slots = els.constructionPanel.querySelectorAll(`[data-setup-pick="slot"]`);
        slots.forEach((el) => {
          el.addEventListener("dragover", (ev) => {
            ev.preventDefault();
            el.classList.add("active");
            ev.dataTransfer.dropEffect = "copy";
          });
          el.addEventListener("dragleave", () => el.classList.remove("active"));
          el.addEventListener("drop", (ev) => {
            ev.preventDefault();
            el.classList.remove("active");
            const raw = ev.dataTransfer.getData("text/plain");
            const pid = el.getAttribute("data-player");
            const slot = el.getAttribute("data-slot");
            if (!pid || !slot) return;
            if (raw.startsWith("pick:")) {
              const name = raw.slice("pick:".length);
              const ok = setSlot(pid, slot, name);
              if (!ok) {
                window.alert("对手已选择该战士");
                render();
                return;
              }
              render();
              return;
            }
            if (raw.startsWith("slot:")) {
              const parts = raw.split(":");
              if (parts.length !== 4) return;
              const fromPid = parts[1];
              const fromSlot = parts[2];
              const name = parts[3];
              if (fromPid !== pid) return;
              setSlot(pid, slot, name);
              const fromKey = pid === "p1" ? (fromSlot === "a" ? "p1a" : "p1b") : fromSlot === "a" ? "p2a" : "p2b";
              if (fromSlot !== slot) setup[fromKey] = null;
              render();
            }
          });
        });

        els.constructionPanel.querySelectorAll(`[data-setup-pick="fighter"]`).forEach((el) => {
          el.addEventListener("dragstart", (ev) => {
            if (el.classList.contains("disabled") || el.classList.contains("placeholder")) {
              ev.preventDefault();
              return;
            }
            const name = el.getAttribute("data-name");
            ev.dataTransfer.setData("text/plain", `pick:${name}`);
            ev.dataTransfer.effectAllowed = "copy";
            el.classList.add("dragging");
          });
          el.addEventListener("dragend", () => el.classList.remove("dragging"));
        });

        els.constructionPanel.querySelectorAll(`[data-setup-pick="picked"]`).forEach((el) => {
          el.addEventListener("dragstart", (ev) => {
            const name = el.getAttribute("data-name");
            const parent = el.closest(`[data-setup-pick="slot"]`);
            const pid = parent?.getAttribute("data-player");
            const slot = parent?.getAttribute("data-slot");
            if (!pid || !slot || !name) return;
            ev.dataTransfer.setData("text/plain", `slot:${pid}:${slot}:${name}`);
            ev.dataTransfer.effectAllowed = "move";
            el.classList.add("dragging");
          });
          el.addEventListener("dragend", () => el.classList.remove("dragging"));
        });

        els.constructionPanel.querySelectorAll(`.setup-pool`).forEach((poolEl) => {
          poolEl.addEventListener("dragover", (ev) => {
            ev.preventDefault();
            poolEl.classList.add("active");
            ev.dataTransfer.dropEffect = "move";
          });
          poolEl.addEventListener("dragleave", () => poolEl.classList.remove("active"));
          poolEl.addEventListener("drop", (ev) => {
            ev.preventDefault();
            poolEl.classList.remove("active");
            const raw = ev.dataTransfer.getData("text/plain");
            if (!raw.startsWith("slot:")) return;
            const parts = raw.split(":");
            if (parts.length !== 4) return;
            const pid = parts[1];
            const slot = parts[2];
            const key = pid === "p1" ? (slot === "a" ? "p1a" : "p1b") : slot === "a" ? "p2a" : "p2b";
            setup[key] = null;
            render();
          });
        });

        const confirm = document.getElementById("setup-confirm");
        confirm.disabled = !(setup.p1a && setup.p1b && setup.p2a && setup.p2b);
        confirm.addEventListener("click", () => {
          if (!(setup.p1a && setup.p1b && setup.p2a && setup.p2b)) return;
          setup.step = "build";
          setup.p1Built = [setup.p1a, setup.p1b].filter(Boolean);
          setup.p2Built = [setup.p2a, setup.p2b].filter(Boolean);
          render();
        });

        document.getElementById("setup-clear").addEventListener("click", () => {
          setup.p1a = null;
          setup.p1b = null;
          setup.p2a = null;
          setup.p2b = null;
          render();
        });
        return;
      }

      els.constructionPanel.innerHTML = `
        <div class="construction-card setup-start">
          <div><strong>初始化</strong>：构筑双方起手战斗牌堆（每方 2 张 #1）</div>
          <div class="construction-row" style="gap:16px;">
            <div style="min-width:420px;">
              <div style="margin-top:10px;"><strong>P1</strong>：${escapeHtml(setup.p1a)} / ${escapeHtml(setup.p1b)}</div>
              <div class="construction-row" style="align-items:flex-start;">
                <div style="min-width:110px;">构筑起手牌堆</div>
                <div class="insert-area">
                  <div class="insert-outside" id="setup-pending-p1"></div>
                  <div class="insert-board" id="setup-board-p1"></div>
                </div>
              </div>
            </div>
            <div style="min-width:420px;">
              <div style="margin-top:10px;"><strong>P2</strong>：${escapeHtml(setup.p2a)} / ${escapeHtml(setup.p2b)}</div>
              <div class="construction-row" style="align-items:flex-start;">
                <div style="min-width:110px;">构筑起手牌堆</div>
                <div class="insert-area">
                  <div class="insert-outside" id="setup-pending-p2"></div>
                  <div class="insert-board" id="setup-board-p2"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="construction-row">
            <button type="button" id="setup-back">返回选人</button>
            <div class="spacer"></div>
            <button type="button" id="setup-start">开始对局</button>
          </div>
        </div>
      `;

      const p1All = [setup.p1a, setup.p1b];
      const p2All = [setup.p2a, setup.p2b];
      const p1Pending = p1All.filter((n) => !setup.p1Built.includes(n));
      const p2Pending = p2All.filter((n) => !setup.p2Built.includes(n));

      const pendingP1 = document.getElementById("setup-pending-p1");
      const boardP1 = document.getElementById("setup-board-p1");
      const pendingP2 = document.getElementById("setup-pending-p2");
      const boardP2 = document.getElementById("setup-board-p2");

      pendingP1.innerHTML = `<div style="opacity:0.8;margin-bottom:8px;">本轮待插入（可拖动）</div>` + p1Pending.map((n) => setupCardHtml("p1", n, "outside setup")).join("");
      pendingP2.innerHTML = `<div style="opacity:0.8;margin-bottom:8px;">本轮待插入（可拖动）</div>` + p2Pending.map((n) => setupCardHtml("p2", n, "outside setup")).join("");
      boardP1.innerHTML = `<div style="opacity:0.8;margin-bottom:8px;">战斗牌堆（从上到下）</div>` + setupBoardHtml("p1", setup.p1Built);
      boardP2.innerHTML = `<div style="opacity:0.8;margin-bottom:8px;">战斗牌堆（从上到下）</div>` + setupBoardHtml("p2", setup.p2Built);

      const setupDragCardSelector = `.insert-card[data-setup="true"], .deck-card[data-setup="true"]`;
      const mkTag = (el) => {
        if (!el) return "null";
        const tn = String(el.tagName || "").toLowerCase();
        const cls = (el.className || "").toString().split(/\s+/).filter(Boolean).join(".");
        const id = el.id ? `#${el.id}` : "";
        return `${tn}${id}${cls ? "." + cls : ""}`;
      };
      const logDbg = (s) => {
        if ((window.__setupDragDbgCount ?? 0) >= 80) return;
        window.__setupDragDbgCount = (window.__setupDragDbgCount ?? 0) + 1;
        pushLog(`[DBG-SETUP-DRAG] ${s}`);
      };

      const cleanupDrag = () => {
        const ghost = document.getElementById("setup-drag-ghost");
        if (ghost) ghost.remove();
        document.body.classList.remove("setup-dragging");
        boardP1.classList.remove("setup-drop-active");
        boardP2.classList.remove("setup-drop-active");
        pendingP1.classList.remove("setup-drop-active");
        pendingP2.classList.remove("setup-drop-active");
      };

      const applyDrop = (pid, name, over) => {
        if (!pid || !name || !over) return false;
        const key = pid === "p1" ? "p1Built" : "p2Built";
        const arr = [...setup[key]];
        const fromIdx = arr.indexOf(name);
        if (over.kind === "pending") {
          if (fromIdx < 0) return false;
          arr.splice(fromIdx, 1);
          setup[key] = arr;
          return true;
        }
        if (over.kind === "board") {
          const insertPos = Number(over.insertPos);
          if (!Number.isFinite(insertPos)) return false;
          if (fromIdx >= 0) arr.splice(fromIdx, 1);
          if (!arr.includes(name)) {
            const pos = Math.max(0, Math.min(insertPos, arr.length));
            arr.splice(pos, 0, name);
          }
          setup[key] = arr.slice(0, 2);
          return true;
        }
        return false;
      };

      const computeOver = (pid, x, y) => {
        const pt = document.elementFromPoint(x, y);
        if (!pt) return null;
        const slotEl = pt.closest(`.setup-board-slot[data-player="${pid}"]`);
        if (slotEl) {
          const where = slotEl.getAttribute("data-setup-slot");
          const key = pid === "p1" ? "p1Built" : "p2Built";
          const count = Array.isArray(setup[key]) ? setup[key].length : 0;
          return { kind: "board", insertPos: where === "top" ? 0 : count };
        }
        const pendingEl = pt.closest(`#setup-pending-${pid}`);
        if (pendingEl) return { kind: "pending" };
        const boardEl = pt.closest(`#setup-board-${pid}`);
        if (boardEl) {
          const cards = [...boardEl.querySelectorAll(`${setupDragCardSelector}[data-player="${pid}"]`)];
          if (!cards.length) return { kind: "board", insertPos: 0 };
          for (let i = 0; i < cards.length; i++) {
            const r = cards[i].getBoundingClientRect();
            const mid = r.top + r.height / 2;
            if (y < mid) return { kind: "board", insertPos: i };
          }
          return { kind: "board", insertPos: cards.length };
        }
        return null;
      };

      const attachPointerDrag = (el) => {
        el.addEventListener("pointerdown", (ev) => {
          if (ev.button != null && ev.button !== 0) return;
          const cardEl = ev.target?.closest?.(setupDragCardSelector);
          if (!cardEl) return;
          const pid = cardEl.getAttribute("data-player");
          const name = cardEl.getAttribute("data-name");
          if (!pid || !name) return;
          ev.preventDefault();
          try {
            cardEl.setPointerCapture(ev.pointerId);
          } catch {}

          cleanupDrag();
          document.body.classList.add("setup-dragging");

          const rect = cardEl.getBoundingClientRect();
          const ghost = cardEl.cloneNode(true);
          ghost.id = "setup-drag-ghost";
          ghost.style.width = `${Math.max(160, rect.width)}px`;
          ghost.style.left = `${rect.left}px`;
          ghost.style.top = `${rect.top}px`;
          ghost.style.position = "fixed";
          ghost.style.zIndex = "9999";
          ghost.style.pointerEvents = "none";
          ghost.style.opacity = "0.92";
          ghost.style.transform = "scale(1.02)";
          document.body.appendChild(ghost);

          const drag = {
            pid,
            name,
            pointerId: ev.pointerId,
            offX: ev.clientX - rect.left,
            offY: ev.clientY - rect.top,
            over: null,
            moved: false,
          };
          window.__setupPointerDrag = drag;
          logDbg(`PTR start pid=${pid} name=${name} target=${mkTag(ev.target)} card=${mkTag(cardEl)}`);

          const move = (e) => {
            if (!window.__setupPointerDrag || window.__setupPointerDrag.pointerId !== e.pointerId) return;
            const d = window.__setupPointerDrag;
            d.moved = true;
            const nx = e.clientX - d.offX;
            const ny = e.clientY - d.offY;
            ghost.style.left = `${nx}px`;
            ghost.style.top = `${ny}px`;
            const over = computeOver(d.pid, e.clientX, e.clientY);
            d.over = over;
            boardP1.classList.toggle("setup-drop-active", d.pid === "p1" && over?.kind === "board");
            boardP2.classList.toggle("setup-drop-active", d.pid === "p2" && over?.kind === "board");
            pendingP1.classList.toggle("setup-drop-active", d.pid === "p1" && over?.kind === "pending");
            pendingP2.classList.toggle("setup-drop-active", d.pid === "p2" && over?.kind === "pending");
            document.querySelectorAll(`.setup-board-slot[data-player="${d.pid}"]`).forEach((x) => x.classList.remove("active"));
            if (over?.kind === "board") {
              const key = d.pid === "p1" ? "p1Built" : "p2Built";
              const count = Array.isArray(setup[key]) ? setup[key].length : 0;
              const which = Number(over.insertPos) === 0 ? "top" : Number(over.insertPos) >= count ? "bottom" : null;
              if (which) {
                const slot = document.querySelector(`.setup-board-slot[data-player="${d.pid}"][data-setup-slot="${which}"]`);
                if (slot) slot.classList.add("active");
              }
            }
          };
          const up = (e) => {
            if (!window.__setupPointerDrag || window.__setupPointerDrag.pointerId !== e.pointerId) return;
            const d = window.__setupPointerDrag;
            window.__setupPointerDrag = null;
            const ok = applyDrop(d.pid, d.name, d.over);
            logDbg(`PTR end pid=${d.pid} name=${d.name} over=${d.over?.kind ?? "null"} ok=${ok ? "1" : "0"}`);
            cleanupDrag();
            if (ok) render();
          };
          const cancel = (e) => {
            if (!window.__setupPointerDrag || window.__setupPointerDrag.pointerId !== e.pointerId) return;
            window.__setupPointerDrag = null;
            cleanupDrag();
            logDbg(`PTR cancel pid=${pid} name=${name}`);
          };

          cardEl.addEventListener("pointermove", move);
          cardEl.addEventListener(
            "pointerup",
            (e) => {
              cardEl.removeEventListener("pointermove", move);
              up(e);
            },
            { once: true }
          );
          cardEl.addEventListener(
            "pointercancel",
            (e) => {
              cardEl.removeEventListener("pointermove", move);
              cancel(e);
            },
            { once: true }
          );
        });
      };

      els.constructionPanel.querySelectorAll(setupDragCardSelector).forEach((el) => attachPointerDrag(el));

      const startBtn = document.getElementById("setup-start");
      startBtn.disabled = setup.p1Built.length !== 2 || setup.p2Built.length !== 2;

      document.getElementById("setup-back").addEventListener("click", () => {
        setup.step = "pick";
        setup.p1Built = [];
        setup.p2Built = [];
        render();
      });

      document.getElementById("setup-start").addEventListener("click", () => {
        const picksByPlayer = { p1: [setup.p1a, setup.p1b], p2: [setup.p2a, setup.p2b] };
        const startTopByPlayer = { p1: setup.p1Built[0], p2: setup.p2Built[0] };
        state = createInitialState(pool, picksByPlayer, startTopByPlayer);
        clearLog();
        pushLog(`新开一局：P1 ${picksByPlayer.p1.join(" / ")}；P2 ${picksByPlayer.p2.join(" / ")}`);
        pushLog(`起手顺序：P1 顶为 ${formatCardLabel(state.players.p1.battleDeck[0])}；P2 顶为 ${formatCardLabel(state.players.p2.battleDeck[0])}`);
        render();
      });
      return;
    }

    if (state.phase !== PHASE.CONSTRUCTION) return;
    const p1Choice = state.construction.p1;
    const p2Choice = state.construction.p2;

    function renderChoice(playerId, choice) {
      const player = state.players[playerId];
      const drawnBoxes = choice.drawn
        .map((c, idx) => {
          const selected = idx === choice.insertIndex ? " selected" : "";
          return `
            <div class="construction-choice selectable${selected}" data-drawn-idx="${idx}" data-player="${playerId}">
              <div class="choice-title">${cardTitleHtml(c)}</div>
              <pre>${displayCardText(c)}</pre>
            </div>
          `;
        })
        .join("");

      const insertCard = choice.drawn[choice.insertIndex];
      const placed = Number.isFinite(choice.insertPos);
      const dragging = choice.dragging === true;
      const previewPos = Number.isFinite(choice.previewPos) ? choice.previewPos : null;
      const deck = player.battleDeck;

      let board = "";
      for (let i = 0; i <= deck.length; i++) {
        const active = dragging && previewPos === i;
        board += `<div class="dropzone${active ? " active" : ""}" data-player="${playerId}" data-pos="${i}"></div>`;
        if (!dragging && placed && i === choice.insertPos) {
          board += `
            <div class="insert-card in-board placed" draggable="true" data-player="${playerId}">
              <div class="insert-title">已放置：${cardTitleHtml(insertCard)}</div>
              <div class="insert-text">${displayCardText(insertCard)}</div>
            </div>
          `;
        }
        if (i < deck.length) {
          const c = deck[i];
          board += `
            <div class="deck-card" data-index="${i}">
              <div class="deck-title">${cardTitleHtml(c)}</div>
              <div class="deck-text">${displayCardText(c)}</div>
            </div>
          `;
        }
      }

      const order01 = choice.bottomOrder === "01" ? "selected" : "";
      const order10 = choice.bottomOrder === "10" ? "selected" : "";

      const rest = choice.drawn.filter((_, idx) => idx !== choice.insertIndex);
      const restLabel =
        rest.length === 2 ? `${rest[0].fighterName}#${rest[0].cardNo} / ${rest[1].fighterName}#${rest[1].cardNo}` : "-";

      const canApply = placed ? "" : "disabled";

      return `
        <div class="construction-card" data-player="${playerId}">
          <div><strong>${playerId.toUpperCase()}</strong> 构筑：从构筑牌库顶抽 3 张，选 1 张入战斗牌库</div>
          <div class="construction-row">${drawnBoxes}</div>
          <div class="construction-row" style="align-items:flex-start;">
            <div style="min-width:110px;">插入位置</div>
            <div class="insert-area">
              <div class="insert-outside" data-player="${playerId}">
                <div class="insert-card outside" draggable="true" data-player="${playerId}">
                  <div class="insert-title">待插入：${cardTitleHtml(insertCard)}</div>
                  <div class="insert-text">${displayCardText(insertCard)}</div>
                </div>
                <div class="insert-outside-hint">${placed ? "已放置，可拖回撤销/改位置" : "拖动到右侧牌堆插入位置"}</div>
              </div>
              <div class="insert-board${dragging ? " dragging" : ""}" data-player="${playerId}">
                ${board}
              </div>
            </div>
          </div>
          <div class="construction-row">
            <div>剩余 2 张入底顺序</div>
            <select data-field="bottomOrder">
              <option value="01" ${order01}>按剩余显示顺序</option>
              <option value="10" ${order10}>交换顺序</option>
            </select>
            <div style="opacity:0.8;">剩余：${restLabel}</div>
            <div class="spacer"></div>
            <button type="button" data-action="apply" ${canApply}>确认该方构筑</button>
          </div>
        </div>
      `;
    }

    function renderDone(playerId) {
      return `
        <div class="construction-card" data-player="${playerId}">
          <div><strong>${playerId.toUpperCase()}</strong> 构筑：已确认，等待另一方</div>
        </div>
      `;
    }

    const panels = [];
    panels.push(p1Choice ? renderChoice("p1", p1Choice) : renderDone("p1"));
    panels.push(p2Choice ? renderChoice("p2", p2Choice) : renderDone("p2"));
    els.constructionPanel.innerHTML = panels.join("");

    els.constructionPanel.querySelectorAll(".construction-card").forEach((card) => {
      const playerId = card.getAttribute("data-player");
      const choice = state.construction[playerId];
      if (!choice) return;

      const boardEl = card.querySelector(`.insert-board[data-player="${playerId}"]`);
      const computePos = (ev) => {
        const targetCard = ev.target?.closest?.(`.deck-card[data-index]`);
        if (targetCard) {
          const idx = Number(targetCard.getAttribute("data-index"));
          if (Number.isFinite(idx)) {
            const rect = targetCard.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            return ev.clientY < mid ? idx : idx + 1;
          }
        }
        const cards = Array.from(boardEl.querySelectorAll(`.deck-card[data-index]`));
        if (cards.length === 0) return 0;
        for (const el of cards) {
          const idx = Number(el.getAttribute("data-index"));
          if (!Number.isFinite(idx)) continue;
          const rect = el.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (ev.clientY < mid) return idx;
        }
        const lastIdx = Number(cards[cards.length - 1].getAttribute("data-index"));
        return Number.isFinite(lastIdx) ? lastIdx + 1 : cards.length;
      };
      const computePosByX = (ev) => {
        const rect = boardEl.getBoundingClientRect();
        const x = ev.clientX;
        const y = ev.clientY;
        if (!(x >= rect.left && x <= rect.right)) return null;
        const cards = Array.from(boardEl.querySelectorAll(`.deck-card[data-index]`));
        const endPos = cards.length;
        if (y < rect.top) return 0;
        if (y > rect.bottom) return endPos;
        return computePos(ev);
      };
      card.querySelectorAll(`.construction-choice.selectable[data-player="${playerId}"]`).forEach((el) => {
        el.addEventListener("click", () => {
          const nextIdx = Number(el.getAttribute("data-drawn-idx"));
          if (!Number.isFinite(nextIdx)) return;
          if (choice.insertIndex !== nextIdx) {
            choice.insertIndex = nextIdx;
            choice.insertPos = null;
            choice.previewPos = null;
            choice.dragging = false;
          }
          render();
        });
      });

      const dragSelector = `.insert-card[data-player="${playerId}"]`;
      card.querySelectorAll(dragSelector).forEach((el) => {
        el.addEventListener("dragstart", (ev) => {
          ev.dataTransfer.setData("text/plain", `insert:${playerId}`);
          ev.dataTransfer.effectAllowed = "move";
          el.classList.add("dragging");
          choice.dragging = true;
          activeInsertDrag = playerId;
          if (!choice._globalInsertDragHandlers) {
            const computePosByXNow = (ev) => {
              const boardNow = els.constructionPanel.querySelector(
                `.construction-card[data-player="${playerId}"] .insert-board[data-player="${playerId}"]`
              );
              if (!boardNow) return { pos: null, reason: "no-board", rect: null };
              const rect = boardNow.getBoundingClientRect();
              const x = ev.clientX;
              const y = ev.clientY;
              const inX = x >= rect.left && x <= rect.right;
              if (!inX) return { pos: null, reason: "x-out", rect, x, y };
              const cards = Array.from(boardNow.querySelectorAll(`.deck-card[data-index]`));
              const endPos = cards.length;
              if (y < rect.top) return { pos: 0, reason: "above", rect, x, y, endPos };
              if (y > rect.bottom) return { pos: endPos, reason: "below", rect, x, y, endPos };
              if (cards.length === 0) return { pos: 0, reason: "empty", rect, x, y, endPos };
              for (const el of cards) {
                const idx = Number(el.getAttribute("data-index"));
                if (!Number.isFinite(idx)) continue;
                const r = el.getBoundingClientRect();
                const mid = r.top + r.height / 2;
                if (y < mid) return { pos: idx, reason: "mid", rect, x, y, endPos };
              }
              const lastIdx = Number(cards[cards.length - 1].getAttribute("data-index"));
              const pos = Number.isFinite(lastIdx) ? lastIdx + 1 : endPos;
              return { pos, reason: "after-last", rect, x, y, endPos };
            };
            const onOver = (e) => {
              if (activeInsertDrag !== playerId) return;
              const r = computePosByXNow(e);
              if (r.pos == null) {
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (choice.previewPos !== r.pos) {
                choice.previewPos = r.pos;
                choice.dragging = true;
                scheduleRender();
              }
            };
            const onDrop = (e) => {
              if (activeInsertDrag !== playerId) return;
              const r = computePosByXNow(e);
              if (r.pos == null) {
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              const oldEl = card.querySelector(dragSelector);
              const oldRect = oldEl ? oldEl.getBoundingClientRect() : null;
              choice.insertPos = r.pos;
              choice.previewPos = null;
              choice.dragging = false;
              activeInsertDrag = null;
              render();
              if (oldRect) {
                const newEl = els.constructionPanel.querySelector(`.construction-card[data-player="${playerId}"] ${dragSelector}`);
                if (newEl) {
                  const newRect = newEl.getBoundingClientRect();
                  const dx = oldRect.left - newRect.left;
                  const dy = oldRect.top - newRect.top;
                  newEl.style.transition = "transform 0s";
                  newEl.style.transform = `translate(${dx}px, ${dy}px)`;
                  requestAnimationFrame(() => {
                    newEl.style.transition = "transform 160ms ease";
                    newEl.style.transform = "translate(0px, 0px)";
                  });
                  const onEnd = () => {
                    newEl.style.transition = "";
                    newEl.style.transform = "";
                    newEl.removeEventListener("transitionend", onEnd);
                  };
                  newEl.addEventListener("transitionend", onEnd);
                }
              }
            };
            choice._globalInsertDragHandlers = { onOver, onDrop };
            document.addEventListener("dragover", onOver, true);
            document.addEventListener("drop", onDrop, true);
          }
          choice.previewPos = Number.isFinite(choice.insertPos) ? choice.insertPos : 0;
          scheduleRender();
        });
        el.addEventListener("dragend", () => {
          el.classList.remove("dragging");
          choice.dragging = false;
          choice.previewPos = null;
          activeInsertDrag = null;
          if (choice._globalInsertDragHandlers) {
            document.removeEventListener("dragover", choice._globalInsertDragHandlers.onOver, true);
            document.removeEventListener("drop", choice._globalInsertDragHandlers.onDrop, true);
            choice._globalInsertDragHandlers = null;
          }
          scheduleRender();
        });
      });

      const zoneSelector = `.dropzone[data-player="${playerId}"]`;
      card.querySelectorAll(zoneSelector).forEach((zone) => {
        zone.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
          const pos = Number(zone.getAttribute("data-pos"));
          if (!Number.isFinite(pos)) return;
          if (choice.previewPos !== pos) {
            choice.previewPos = pos;
            choice.dragging = true;
            scheduleRender();
          }
        });
        zone.addEventListener("drop", (ev) => {
          ev.preventDefault();
          const raw = ev.dataTransfer.getData("text/plain");
          if (raw !== `insert:${playerId}`) return;
          const oldEl = card.querySelector(dragSelector);
          const oldRect = oldEl ? oldEl.getBoundingClientRect() : null;
          const pos = Number(zone.getAttribute("data-pos"));
          if (!Number.isFinite(pos)) return;
          choice.insertPos = pos;
          choice.previewPos = null;
          choice.dragging = false;
          render();
          if (oldRect) {
            const newEl = els.constructionPanel.querySelector(`.construction-card[data-player="${playerId}"] ${dragSelector}`);
            if (newEl) {
              const newRect = newEl.getBoundingClientRect();
              const dx = oldRect.left - newRect.left;
              const dy = oldRect.top - newRect.top;
              newEl.style.transition = "transform 0s";
              newEl.style.transform = `translate(${dx}px, ${dy}px)`;
              requestAnimationFrame(() => {
                newEl.style.transition = "transform 160ms ease";
                newEl.style.transform = "translate(0px, 0px)";
              });
              const onEnd = () => {
                newEl.style.transition = "";
                newEl.style.transform = "";
                newEl.removeEventListener("transitionend", onEnd);
              };
              newEl.addEventListener("transitionend", onEnd);
            }
          }
        });
      });

      boardEl.addEventListener(
        "dragover",
        (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
          const raw = ev.dataTransfer.getData("text/plain");
          if (raw !== `insert:${playerId}`) return;
          const pos = computePos(ev);
          if (choice.previewPos !== pos) {
            choice.previewPos = pos;
            choice.dragging = true;
            scheduleRender();
          }
        },
        true
      );

      const insertAreaEl = card.querySelector(`.insert-area`);
      if (insertAreaEl) {
        insertAreaEl.addEventListener(
          "dragover",
          (ev) => {
            const raw = ev.dataTransfer.getData("text/plain");
            if (raw !== `insert:${playerId}`) return;
            const pos = computePosByX(ev);
            if (pos == null) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = "move";
            if (choice.previewPos !== pos) {
              choice.previewPos = pos;
              choice.dragging = true;
              scheduleRender();
            }
          },
          true
        );

        insertAreaEl.addEventListener(
          "drop",
          (ev) => {
            const raw = ev.dataTransfer.getData("text/plain");
            if (raw !== `insert:${playerId}`) return;
            const pos = computePosByX(ev);
            if (pos == null) return;
            ev.preventDefault();
            ev.stopPropagation();
            const oldEl = card.querySelector(dragSelector);
            const oldRect = oldEl ? oldEl.getBoundingClientRect() : null;
            choice.insertPos = pos;
            choice.previewPos = null;
            choice.dragging = false;
            render();
            if (oldRect) {
              const newEl = els.constructionPanel.querySelector(`.construction-card[data-player="${playerId}"] ${dragSelector}`);
              if (newEl) {
                const newRect = newEl.getBoundingClientRect();
                const dx = oldRect.left - newRect.left;
                const dy = oldRect.top - newRect.top;
                newEl.style.transition = "transform 0s";
                newEl.style.transform = `translate(${dx}px, ${dy}px)`;
                requestAnimationFrame(() => {
                  newEl.style.transition = "transform 160ms ease";
                  newEl.style.transform = "translate(0px, 0px)";
                });
                const onEnd = () => {
                  newEl.style.transition = "";
                  newEl.style.transform = "";
                  newEl.removeEventListener("transitionend", onEnd);
                };
                newEl.addEventListener("transitionend", onEnd);
              }
            }
          },
          true
        );
      }

      boardEl.addEventListener(
        "drop",
        (ev) => {
          ev.preventDefault();
          const raw = ev.dataTransfer.getData("text/plain");
          if (raw !== `insert:${playerId}`) return;
          const oldEl = card.querySelector(dragSelector);
          const oldRect = oldEl ? oldEl.getBoundingClientRect() : null;
          const pos = Number.isFinite(choice.previewPos) ? choice.previewPos : computePos(ev);
          choice.insertPos = pos;
          choice.previewPos = null;
          choice.dragging = false;
          render();
          if (oldRect) {
            const newEl = els.constructionPanel.querySelector(`.construction-card[data-player="${playerId}"] ${dragSelector}`);
            if (newEl) {
              const newRect = newEl.getBoundingClientRect();
              const dx = oldRect.left - newRect.left;
              const dy = oldRect.top - newRect.top;
              newEl.style.transition = "transform 0s";
              newEl.style.transform = `translate(${dx}px, ${dy}px)`;
              requestAnimationFrame(() => {
                newEl.style.transition = "transform 160ms ease";
                newEl.style.transform = "translate(0px, 0px)";
              });
              const onEnd = () => {
                newEl.style.transition = "";
                newEl.style.transform = "";
                newEl.removeEventListener("transitionend", onEnd);
              };
              newEl.addEventListener("transitionend", onEnd);
            }
          }
        },
        true
      );

      const outside = card.querySelector(`.insert-outside[data-player="${playerId}"]`);
      outside.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        outside.classList.add("active");
        ev.dataTransfer.dropEffect = "move";
        if (choice.previewPos !== null) {
          choice.previewPos = null;
          scheduleRender();
        }
      });
      outside.addEventListener("dragleave", () => {
        outside.classList.remove("active");
      });
      outside.addEventListener("drop", (ev) => {
        ev.preventDefault();
        outside.classList.remove("active");
        const raw = ev.dataTransfer.getData("text/plain");
        if (raw !== `insert:${playerId}`) return;
        choice.insertPos = null;
        choice.previewPos = null;
        choice.dragging = false;
        render();
      });

      const orderEl = card.querySelector(`select[data-field="bottomOrder"]`);
      orderEl.addEventListener("change", () => {
        choice.bottomOrder = orderEl.value;
        render();
      });
      card.querySelector(`button[data-action="apply"]`).addEventListener("click", () => {
        if (!Number.isFinite(choice.insertPos)) return;
        const beforeSnapshot = snapshotFighters();
        applyConstructionChoice(state, playerId, pushLog);
        const afterSnapshot = snapshotFighters();
        let changed = false;
        for (const [id, a] of afterSnapshot.entries()) {
          const b = beforeSnapshot.get(id);
          if (!b) continue;
          if ((a.hp ?? 0) !== (b.hp ?? 0) || (a.power ?? 0) !== (b.power ?? 0)) {
            changed = true;
            break;
          }
        }
        if (changed) state.lastIntermissionEffect = { before: beforeSnapshot, after: afterSnapshot };
        const w = checkWinner(state);
        if (w) {
          state.phase = PHASE.GAME_OVER;
          state.winner = w;
          const isKoNow = (f) => {
            if (f?.koByFlame === true) return true;
            if (f?.name === "精灵族") return f?.elf?.gameKo === true;
            return Array.isArray(f.koLines) && f.koLines.length > 0 ? f.koLines.includes(Number(f.hp) || 0) : Number(f.hp) <= Number(f.koLine);
          };
          const p1KO = state.players.p1.fighters.some(isKoNow);
          const p2KO = state.players.p2.fighters.some(isKoNow);
          const resLine = w === "draw" ? `平局` : w === "p1" ? `P1 胜 / P2 败` : `P2 胜 / P1 败`;
          pushLog(`游戏结束：${resLine}（P1 ${p1KO ? "KO" : "未KO"}，P2 ${p2KO ? "KO" : "未KO"}）`);
        } else if (!state.construction.p1 && !state.construction.p2) {
          state.phase = PHASE.BATTLE;
          state.awaitingConstruction = false;
          state.round += 1;
          state.turn = 1;
          state.lastFlip = null;
          state.lastRound = null;
          state.compareHold = false;
          pushLog(`构筑完成：回到战斗阶段`);
        }
        render();
      });
    });
  }

  function renderControls() {
    els.phase.textContent = phaseLabel();
    const awaiting = state.phase === PHASE.BATTLE && state.awaitingConstruction === true;
    const pendingEnd = state.phase === PHASE.BATTLE && state.pendingGameOver;
    const pendingElfPick = state.phase === PHASE.BATTLE && (state.pendingElfPickByPlayer?.p1 || state.pendingElfPickByPlayer?.p2);
    if (state.phase === PHASE.BATTLE && Array.isArray(state.pendingDoubleQueue) && state.pendingDoubleQueue.length > 0) {
      els.btnNextBattle.textContent = "结算第二次";
    } else {
      els.btnNextBattle.textContent = "翻牌并结算";
    }
    els.btnNextBattle.disabled = state.phase !== PHASE.BATTLE || awaiting || pendingEnd || pendingElfPick;
    els.btnEnterConstruction.disabled = !awaiting || pendingEnd || pendingElfPick;
    els.btnCompare.disabled = !(state.phase === PHASE.BATTLE && state.lastRound);
    els.btnConfirmEnd.disabled = !pendingEnd;
  }

  function render() {
    renderControls();
    renderBattleReveal();
    renderPlayers();
    renderConstruction();
  }

  function battleTurn() {
    if (state.phase !== PHASE.BATTLE) return;
    if (state.awaitingConstruction) return;
    if (state.pendingGameOver) return;
    const p1 = state.players.p1;
    const p2 = state.players.p2;
    if (Array.isArray(state.pendingDoubleQueue) && state.pendingDoubleQueue.length > 0) {
      const pid = state.pendingDoubleQueue.shift();
      const lf = state.lastFlip;
      const p1Card = lf?.p1Card;
      const p2Card = lf?.p2Card;
      if (!pid || !p1Card || !p2Card) {
        state.pendingDoubleQueue = [];
        render();
        return;
      }
      state.lastIntermissionEffect = null;
      const beforeSnapshot = snapshotFighters();
      pushLog(`土偶重生：结算第二次（${pid.toUpperCase()} ${formatCardLabel(pid === "p1" ? p1Card : p2Card)}）`);
      const ctx = buildContextForBattle(p1, p2, p1Card, p2Card);
      for (const f of [...p1.fighters, ...p2.fighters]) f.snakeFlipMark = null;
      const p1Effects = ensureCardCompiled(p1Card);
      const p2Effects = ensureCardCompiled(p2Card);
      const settlement = settleEffects({
        ctx,
        myCard: p1Card,
        oppCard: p2Card,
        myEffects: p1Effects,
        oppEffects: p2Effects,
        myPlayer: p1,
        oppPlayer: p2,
        onlySide: pid,
        guardAtStartById: lf?.guardAtStartById,
      });
      for (const line of settlement.log) pushLog(line);
      if (settlement?.golemRebirthByPlayerId?.size) {
        for (const x of settlement.golemRebirthByPlayerId) state.doubleNextByPlayer[x] = true;
      }
      const applied = applyDeltas(
        state,
        settlement.hpDelta,
        settlement.powerDelta,
        beforeSnapshot,
        lf?.guardAtStartById,
        settlement?.blockActiveByPlayerId ?? null,
        settlement?.blockInnerByPlayerId ?? null
      );
      for (const line of applied?.log ?? []) pushLog(line);
      const hpTraceById = applied?.hpTraceById ?? new Map();
      const planEvents = [...(settlement.planEvents ?? []), ...(applied?.planEvents ?? [])];
      if (settlement?.removeBothCardsFromGame === true) {
        pushLog(`移除游戏：P1 ${formatCardLabel(p1Card)} / P2 ${formatCardLabel(p2Card)}`);
        p1.resolvedPile = p1.resolvedPile.filter((c) => c !== p1Card);
        p2.resolvedPile = p2.resolvedPile.filter((c) => c !== p2Card);
      }
      const afterSnapshot = snapshotFighters();
      const guardBlocked = new Set([...(settlement?.guardBlockedByPlayerId ?? []), ...(applied?.guardBlockedByPlayerId ?? [])]);
      const flipTriggered = settlement?.flipTriggeredByCardId && typeof settlement.flipTriggeredByCardId[Symbol.iterator] === "function" ? new Set(settlement.flipTriggeredByCardId) : new Set();
      state.lastRound = { round: state.round, turn: state.turn, before: beforeSnapshot, after: afterSnapshot, hpTraceById, planEvents, guardBlockedByPlayerId: guardBlocked, flipTriggeredByCardId: flipTriggered };
      for (const [id, a] of afterSnapshot.entries()) {
        const b = beforeSnapshot.get(id);
        if (!b) continue;
        const dh = (a.hp ?? 0) - (b.hp ?? 0);
        const dp = (a.power ?? 0) - (b.power ?? 0);
        if (dh === 0 && dp === 0) continue;
        const f = [...state.players.p1.fighters, ...state.players.p2.fighters].find((x) => x.id === id);
        const name = f?.name ?? id;
        const pid2 = String(id).split(":")[0];
        const who = pid2 === "p2" ? "P2" : "P1";
        const parts = [];
        if (dh !== 0) parts.push(`HP ${dh > 0 ? "+" : ""}${dh}`);
        if (dp !== 0) parts.push(`力量 ${dp > 0 ? "+" : ""}${dp}`);
        pushLog(`结算变化：${who} ${name}（${parts.join("，")}）`);
      }

      if (!state.pendingDoubleQueue.length) {
        const processElfRoundEnd = (playerId) => {
          const player = state.players[playerId];
          const elf = player?.fighters?.find?.((f) => f?.name === "精灵族");
          if (!elf || !elf.elf) return;
          if (elf.elf.gameKo === true) return;
          const active = elf.elf.active;
          const dead = Array.isArray(elf.elf.dead) ? elf.elf.dead : [false, false, false];
          elf.elf.dead = dead;
          if (active == null) {
            state.pendingElfPickByPlayer[playerId] = dead.some((x) => x === false);
            return;
          }
          if (dead[active] === true) return;
          if (Number(elf.hp) > Number(elf.koLine)) return;
          const alreadyPending = Number.isFinite(elf.elf.pendingKoIndex) && elf.elf.pendingKoIndex !== null;
          if (alreadyPending) return;
          elf.elf.pendingKoIndex = active;
          elf.elf.soul = (Number(elf.elf.soul) || 0) + 1;
          const hasAlive = dead.some((x, i) => i !== active && x === false);
          if (hasAlive) {
            state.pendingElfPickByPlayer[playerId] = true;
            pushLog(`灵：${playerId.toUpperCase()} 灵${active + 1} 被KO（魂=${elf.elf.soul}），请选择下一位灵`);
          } else {
            dead[active] = true;
            elf.elf.dead = dead;
            elf.elf.pendingKoIndex = null;
            elf.elf.active = null;
            elf.elf.pendingPick = false;
            elf.hp = 0;
            elf.maxHp = 0;
            elf.hpRules = [];
            state.pendingElfPickByPlayer[playerId] = false;
            pushLog(`灵：${playerId.toUpperCase()} 无存活灵，精灵族进入沉寂（不再受伤/回复）`);
          }
        };
        if (state.pendingElfPickByPlayer) {
          processElfRoundEnd("p1");
          processElfRoundEnd("p2");
        }
      }

      function isKoNow(fx) {
        if (fx?.koByFlame === true) return true;
        if (fx?.name === "精灵族") return fx?.elf?.gameKo === true;
        if (Array.isArray(fx.koLines) && fx.koLines.length > 0) {
          return fx.koLines.includes(Number(fx.hp) || 0);
        }
        return Number(fx.hp) <= Number(fx.koLine);
      }
      const p1KO = state.players.p1.fighters.some(isKoNow);
      const p2KO = state.players.p2.fighters.some(isKoNow);
      const flameKoP1 = settlement?.flameKoByPlayerId?.has?.("p1") === true;
      const flameKoP2 = settlement?.flameKoByPlayerId?.has?.("p2") === true;
      const winOnSelfKoP1 = settlement?.winOnSelfKoByPlayer?.get?.("p1") === true;
      const winOnSelfKoP2 = settlement?.winOnSelfKoByPlayer?.get?.("p2") === true;
      const p1ClaimWin = winOnSelfKoP1 && p1KO;
      const p2ClaimWin = winOnSelfKoP2 && p2KO;

      let w = checkWinner(state);
      if (p1ClaimWin || p2ClaimWin) {
        if (p1ClaimWin && p2ClaimWin) {
          w = "draw";
          pushLog(`特殊胜负：双方被KO且均触发“被KO则胜利”，最终为平局`);
        } else if (p1ClaimWin) {
          w = "p1";
          pushLog(`特殊胜负：P1 被KO且触发“被KO则胜利”，最终 P1 获胜`);
        } else {
          w = "p2";
          pushLog(`特殊胜负：P2 被KO且触发“被KO则胜利”，最终 P2 获胜`);
        }
      } else if ((flameKoP1 && !flameKoP2) || (flameKoP2 && !flameKoP1)) {
        w = flameKoP1 ? "p2" : "p1";
        pushLog(`特殊胜负：焰=5 判KO，忽略对方本回合KO判定，最终 ${w.toUpperCase()} 获胜`);
      }
      if (w) {
        state.pendingGameOver = w;
        const koP1 = p1KO ? "KO" : "未KO";
        const koP2 = p2KO ? "KO" : "未KO";
        const resLine = w === "draw" ? `平局` : w === "p1" ? `P1 胜 / P2 败` : `P2 胜 / P1 败`;
        pushLog(`游戏结束！${resLine}（P1 ${koP1}，P2 ${koP2}；点击“确认结束”进入结束结算）`);
        render();
        return;
      }

      if (!state.pendingDoubleQueue.length) {
        if (p1.battleDeck.length === 0 && p2.battleDeck.length === 0) {
          state.awaitingConstruction = true;
          pushLog(`战斗牌库结算完：点击“进入构筑”进入构筑阶段`);
          render();
          return;
        }
        state.turn += 1;
      }
      render();
      return;
    }

    if (state.pendingElfPickByPlayer?.p1 || state.pendingElfPickByPlayer?.p2) return;
    if (p1.battleDeck.length === 0 || p2.battleDeck.length === 0) return;
    const plannedDoubleQueue = [];
    if (state.doubleNextByPlayer?.p1 === true) {
      plannedDoubleQueue.push("p1");
      state.doubleNextByPlayer.p1 = false;
    }
    if (state.doubleNextByPlayer?.p2 === true) {
      plannedDoubleQueue.push("p2");
      state.doubleNextByPlayer.p2 = false;
    }

    state.lastIntermissionEffect = null;
    const beforeSnapshot = snapshotFighters();
    const p1Card = p1.battleDeck.shift();
    const p2Card = p2.battleDeck.shift();
    state.lastFlip = {
      round: state.round,
      turn: state.turn,
      p1Card,
      p2Card,
      p1FlippedAtStart: p1Card?.flipped === true,
      p2FlippedAtStart: p2Card?.flipped === true,
    };
    renderBattleReveal();
    pushLog(`翻牌（轮次${state.round}回合${state.turn}）：P1 ${formatCardLabel(p1Card)} / P2 ${formatCardLabel(p2Card)}`);

    const ctx = buildContextForBattle(p1, p2, p1Card, p2Card);
    state.lastFlip.guardAtStartById = new Map([...p1.fighters, ...p2.fighters].map((f) => [f.id, f?.guard === true]));
    for (const f of [...p1.fighters, ...p2.fighters]) f.snakeFlipMark = null;
    const p1Effects = ensureCardCompiled(p1Card);
    const p2Effects = ensureCardCompiled(p2Card);

    const settlement = settleEffects({
      ctx,
      myCard: p1Card,
      oppCard: p2Card,
      myEffects: p1Effects,
      oppEffects: p2Effects,
      myPlayer: p1,
      oppPlayer: p2,
      guardAtStartById: state.lastFlip.guardAtStartById,
    });

    for (const line of settlement.log) pushLog(line);
    if (settlement?.golemRebirthByPlayerId?.size) {
      for (const x of settlement.golemRebirthByPlayerId) state.doubleNextByPlayer[x] = true;
    }

    const applied = applyDeltas(
      state,
      settlement.hpDelta,
      settlement.powerDelta,
      beforeSnapshot,
      state.lastFlip.guardAtStartById,
      settlement?.blockActiveByPlayerId ?? null,
      settlement?.blockInnerByPlayerId ?? null
    );
    for (const line of applied?.log ?? []) pushLog(line);
    const hpTraceById = applied?.hpTraceById ?? new Map();
    const planEvents = [...(settlement.planEvents ?? []), ...(applied?.planEvents ?? [])];

    if (settlement?.removeBothCardsFromGame === true) {
      pushLog(`移除游戏：P1 ${formatCardLabel(p1Card)} / P2 ${formatCardLabel(p2Card)}`);
    } else {
      p1.resolvedPile.unshift(p1Card);
      p2.resolvedPile.unshift(p2Card);
    }
    const afterSnapshot = snapshotFighters();
    const guardBlocked = new Set([...(settlement?.guardBlockedByPlayerId ?? []), ...(applied?.guardBlockedByPlayerId ?? [])]);
    const flipTriggered = settlement?.flipTriggeredByCardId && typeof settlement.flipTriggeredByCardId[Symbol.iterator] === "function" ? new Set(settlement.flipTriggeredByCardId) : new Set();
    state.lastRound = { round: state.round, turn: state.turn, before: beforeSnapshot, after: afterSnapshot, hpTraceById, planEvents, guardBlockedByPlayerId: guardBlocked, flipTriggeredByCardId: flipTriggered };
    for (const [id, a] of afterSnapshot.entries()) {
      const b = beforeSnapshot.get(id);
      if (!b) continue;
      const dh = (a.hp ?? 0) - (b.hp ?? 0);
      const dp = (a.power ?? 0) - (b.power ?? 0);
      if (dh === 0 && dp === 0) continue;
      const f = [...state.players.p1.fighters, ...state.players.p2.fighters].find((x) => x.id === id);
      const name = f?.name ?? id;
      const pid = String(id).split(":")[0];
      const who = pid === "p2" ? "P2" : "P1";
      const parts = [];
      if (dh !== 0) parts.push(`HP ${dh > 0 ? "+" : ""}${dh}`);
      if (dp !== 0) parts.push(`力量 ${dp > 0 ? "+" : ""}${dp}`);
      pushLog(`结算变化：${who} ${name}（${parts.join("，")}）`);
    }

    if (plannedDoubleQueue.length) {
      state.pendingDoubleQueue = plannedDoubleQueue;
      render();
      return;
    }

    const processElfRoundEnd = (playerId) => {
      const player = state.players[playerId];
      const elf = player?.fighters?.find?.((f) => f?.name === "精灵族");
      if (!elf || !elf.elf) return;
      if (elf.elf.gameKo === true) return;
      const active = elf.elf.active;
      const dead = Array.isArray(elf.elf.dead) ? elf.elf.dead : [false, false, false];
      elf.elf.dead = dead;
      if (active == null) {
        state.pendingElfPickByPlayer[playerId] = dead.some((x) => x === false);
        return;
      }
      if (dead[active] === true) return;
      if (Number(elf.hp) > Number(elf.koLine)) return;
      const alreadyPending = Number.isFinite(elf.elf.pendingKoIndex) && elf.elf.pendingKoIndex !== null;
      if (alreadyPending) return;
      elf.elf.pendingKoIndex = active;
      elf.elf.soul = (Number(elf.elf.soul) || 0) + 1;
      const hasAlive = dead.some((x, i) => i !== active && x === false);
      if (hasAlive) {
        state.pendingElfPickByPlayer[playerId] = true;
        pushLog(`灵：${playerId.toUpperCase()} 灵${active + 1} 被KO（魂=${elf.elf.soul}），请选择下一位灵`);
      } else {
        dead[active] = true;
        elf.elf.dead = dead;
        elf.elf.pendingKoIndex = null;
        elf.elf.active = null;
        elf.elf.pendingPick = false;
        elf.hp = 0;
        elf.maxHp = 0;
        elf.hpRules = [];
        state.pendingElfPickByPlayer[playerId] = false;
        pushLog(`灵：${playerId.toUpperCase()} 无存活灵，精灵族进入沉寂（不再受伤/回复）`);
      }
    };
    if (state.pendingElfPickByPlayer) {
      processElfRoundEnd("p1");
      processElfRoundEnd("p2");
    }

    function isKoNow(fx) {
      if (fx?.koByFlame === true) return true;
      if (fx?.name === "精灵族") return fx?.elf?.gameKo === true;
      if (Array.isArray(fx.koLines) && fx.koLines.length > 0) {
        return fx.koLines.includes(Number(fx.hp) || 0);
      }
      return Number(fx.hp) <= Number(fx.koLine);
    }
    const p1KO = state.players.p1.fighters.some(isKoNow);
    const p2KO = state.players.p2.fighters.some(isKoNow);
    const flameKoP1 = settlement?.flameKoByPlayerId?.has?.("p1") === true;
    const flameKoP2 = settlement?.flameKoByPlayerId?.has?.("p2") === true;
    const winOnSelfKoP1 = settlement?.winOnSelfKoByPlayer?.get?.("p1") === true;
    const winOnSelfKoP2 = settlement?.winOnSelfKoByPlayer?.get?.("p2") === true;
    const p1ClaimWin = winOnSelfKoP1 && p1KO;
    const p2ClaimWin = winOnSelfKoP2 && p2KO;

    let w = checkWinner(state);
    if (p1ClaimWin || p2ClaimWin) {
      if (p1ClaimWin && p2ClaimWin) {
        w = "draw";
        pushLog(`特殊胜负：双方被KO且均触发“被KO则胜利”，最终为平局`);
      } else if (p1ClaimWin) {
        w = "p1";
        pushLog(`特殊胜负：P1 被KO且触发“被KO则胜利”，最终 P1 获胜`);
      } else {
        w = "p2";
        pushLog(`特殊胜负：P2 被KO且触发“被KO则胜利”，最终 P2 获胜`);
      }
    } else if ((flameKoP1 && !flameKoP2) || (flameKoP2 && !flameKoP1)) {
      w = flameKoP1 ? "p2" : "p1";
      pushLog(`特殊胜负：焰=5 判KO，忽略对方本回合KO判定，最终 ${w.toUpperCase()} 获胜`);
    }
    if (w) {
      state.pendingGameOver = w;
      const koP1 = p1KO ? "KO" : "未KO";
      const koP2 = p2KO ? "KO" : "未KO";
      const resLine =
        w === "draw" ? `平局` : w === "p1" ? `P1 胜 / P2 败` : `P2 胜 / P1 败`;
      pushLog(`游戏结束！${resLine}（P1 ${koP1}，P2 ${koP2}；点击“确认结束”进入结束结算）`);
      render();
      return;
    }

    if (p1.battleDeck.length === 0 && p2.battleDeck.length === 0) {
      state.awaitingConstruction = true;
      pushLog(`战斗牌库结算完：点击“进入构筑”进入构筑阶段`);
      render();
      return;
    }

    state.turn += 1;
    render();
  }

  function enterConstructionNow() {
    if (state.phase !== PHASE.BATTLE) return;
    if (!state.awaitingConstruction) return;
    if (state.pendingGameOver) return;
    const entered = enterConstructionIfNeeded(state, pushLog);
    state.awaitingConstruction = false;
    if (entered) beginNextConstructionStep(state, pushLog);
    render();
  }

  function confirmEndNow() {
    if (state.phase !== PHASE.BATTLE) return;
    if (!state.pendingGameOver) return;
    state.phase = PHASE.GAME_OVER;
    state.winner = state.pendingGameOver;
    state.pendingGameOver = null;
    render();
  }

  function newGame() {
    if (data.fighterDefs.length < 2) return;
    const names = data.fighterDefs.map((f) => f.name);
    state = {
      phase: PHASE.SETUP,
      showDecks: false,
      setup: { step: "pick", p1a: null, p1b: null, p2a: null, p2b: null, p1Built: [], p2Built: [] },
      lastFlip: null,
      lastRound: null,
      awaitingConstruction: false,
      pendingGameOver: null,
      compareHold: false,
    };
    clearLog();
    pushLog(`新开一局：进入初始化选择`);
    render();
  }

  async function loadText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch failed: ${url}`);
    return await res.text();
  }

  function wireRulesDialog() {
    const tabs = els.rulesDialog.querySelectorAll("button[data-tab]");
    function setTab(tab) {
      if (tab === "rules") els.rulesText.textContent = data.rulesTxt;
      if (tab === "fighters") els.rulesText.textContent = data.fightersTxt;
      if (tab === "cards") els.rulesText.textContent = data.cardsTxt;
      if (tab === "settlement") els.rulesText.textContent = data.settlementTxt;
    }
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        setTab(btn.getAttribute("data-tab"));
      });
    });
    setTab("rules");
  }

  async function init() {
    state = { phase: PHASE.LOADING };
    render();
    data.rulesTxt = await loadText("/规则.txt");
    data.fightersTxt = await loadText("/战士库.txt");
    data.cardsTxt = await loadText("/卡牌词条.txt");
    data.settlementTxt = await loadText("/结算过程与示例.txt");
    data.fighterDefs = parseFighters(data.fightersTxt);
    for (const w of selfTestFighters(data.fighterDefs)) pushLog(`[自检] ${w}`);
    wireRulesDialog();
    newGame();
  }

  els.btnNewGame.addEventListener("click", () => {
    const running =
      state?.phase &&
      state.phase !== PHASE.LOADING &&
      state.phase !== PHASE.SETUP &&
      state.phase !== PHASE.GAME_OVER;
    if (running) {
      const ok = window.confirm("游戏正在进行，是否中断并重开？");
      if (!ok) return;
    }
    newGame();
  });
  els.btnToggleDecks.addEventListener("click", () => {
    state.showDecks = !state.showDecks;
    render();
  });
  els.btnOpenRules.addEventListener("click", () => {
    els.rulesDialog.showModal();
  });
  els.btnOpenLog.addEventListener("click", () => {
    els.logDialog.showModal();
  });
  els.btnNextBattle.addEventListener("click", battleTurn);
  els.btnEnterConstruction.addEventListener("click", enterConstructionNow);
  els.btnConfirmEnd.addEventListener("click", confirmEndNow);
  els.btnCompare.addEventListener("pointerdown", (e) => {
    if (els.btnCompare.disabled) return;
    state.compareHold = true;
    try {
      els.btnCompare.setPointerCapture(e.pointerId);
    } catch {}
    renderPlayers();
  });
  els.btnCompare.addEventListener("pointerup", () => {
    if (!state.compareHold) return;
    state.compareHold = false;
    renderPlayers();
  });
  els.btnCompare.addEventListener("pointercancel", () => {
    if (!state.compareHold) return;
    state.compareHold = false;
    renderPlayers();
  });
  window.addEventListener("resize", () => requestAnimationFrame(() => requestAnimationFrame(positionHpArrows)));
  els.btnClearLog.addEventListener("click", (e) => {
    e.preventDefault();
    clearLog();
  });

  init().catch((e) => {
    state.phase = PHASE.SETUP;
    render();
    pushLog(`初始化失败：${e?.message ?? String(e)}`);
  });
}

createApp();
