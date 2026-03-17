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

  function commit() {
    if (!cur) return;
    const deck = deckTextLines.map((t) => t.trim()).filter(Boolean);
    const names = deckNameLines.map((t) => t.trim()).filter(Boolean);
    cur.deckTextByNo = new Map(deck.map((t, idx) => [idx + 1, t]));
    cur.deckNameByNo = new Map(names.map((t, idx) => [idx + 1, t]));
    cur.deckSize = deck.length;
    fighters.push(cur);
    cur = null;
    inDeck = false;
    deckMode = null;
    deckTextLines = [];
    deckNameLines = [];
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
      };
      continue;
    }
    if (!cur) continue;

    if (line.startsWith("Deck No.")) {
      deckMode = "text";
      continue;
    }
    if (line.startsWith("DeckName No.")) {
      deckMode = "name";
      continue;
    }

    if (line.startsWith("{")) {
      inDeck = true;
      const rest = line.slice(1).trim();
      if (rest) {
        if (deckMode === "name") deckNameLines.push(rest);
        else deckTextLines.push(rest);
      }
      continue;
    }
    if (line.endsWith("}")) {
      const inside = line.slice(0, -1).trim();
      if (inside) {
        if (deckMode === "name") deckNameLines.push(inside);
        else deckTextLines.push(inside);
      }
      inDeck = false;
      continue;
    }
    if (inDeck) {
      if (deckMode === "name") deckNameLines.push(line);
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
    if (line.startsWith("HP规则：")) cur.hpRules = parseHpRules(line.slice("HP规则：".length).trim());
    if (line.startsWith("Special system:"))
      cur.special = line.slice("Special system:".length).trim();
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
    if (e.type === "linked" || e.type === "conditional" || e.type === "block" || e.type === "onInsert") {
      for (const x of e.inner ?? []) if (walk(x)) return true;
    }
    return false;
  };
  for (const e of effects ?? []) if (walk(e)) return true;
  return false;
}

function ensureCardCompiled(card) {
  if (!card) return [];
  const eff = card.getEffects ? card.getEffects() : [];
  if (!hasUnknownEffect(eff)) return eff;
  const text = card.text ?? "";
  const next = parseCardEffects(text);
  const onInsert = next.filter((e) => e.type === "onInsert").flatMap((e) => e.inner);
  card.getEffects = () => next;
  card.getOnInsertEffects = () => onInsert;
  return next;
}

function buildPlayerDeck(playerId, fighterDefs) {
  let serial = 1;
  const cards = [];
  for (const f of fighterDefs) {
    for (let no = 1; no <= f.deckSize; no++) {
      const text = f.deckTextByNo.get(no) ?? "";
      const effects = parseCardEffects(text);
      const onInsertEffects = effects.filter((e) => e.type === "onInsert").flatMap((e) => e.inner);
      cards.push({
        id: cardId(playerId, f.name, no, serial++),
        fighterName: f.name,
        fighterAlias: f.id,
        fighterCode: f.code,
        cardNo: no,
        cardName: f.deckNameByNo?.get(no) ?? "",
        text,
        getEffects: () => effects,
        getOnInsertEffects: () => onInsertEffects,
      });
    }
  }
  return cards;
}

function createInitialState(fighterPoolByName, picksByPlayer, startTopByPlayer) {
  function initPlayer(playerId) {
    const pickedNames = picksByPlayer[playerId] ?? [];
    const fighterDefs = pickedNames.map((n) => fighterPoolByName.get(n)).filter(Boolean);
    const fighters = fighterDefs.map((f) => ({
      id: `${playerId}:${f.name}`,
      name: f.name,
      alias: f.id,
      code: f.code,
      hp: f.beginHp,
      maxHp: f.beginHp,
      power: f.beginPower,
      revelation: 0,
      battleship: 0,
      snake: f.name === "靡菲斯特" ? (Math.random() < 0.5 ? 0 : 1) : 0,
      snakeFlipMark: null,
      flame: {},
      police: false,
      koLine: f.koLine,
      koLines: Array.isArray(f.koLines) ? [...f.koLines] : null,
      hpRules: f.hpRules,
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
  if (s0.startsWith("警在己方：") || s0.startsWith("警在己方:")) {
    const rest = s0.slice(s0.indexOf("：") >= 0 ? "警在己方：".length : "警在己方:".length).trim();
    return parseEffect(`如果警在己方，${rest}`);
  }
  if (s0.startsWith("警在对方：") || s0.startsWith("警在对方:")) {
    const rest = s0.slice(s0.indexOf("：") >= 0 ? "警在对方：".length : "警在对方:".length).trim();
    return parseEffect(`如果警在对方，${rest}`);
  }
  const sKeyAll = s0
    .replace(/\s+/g, "")
    .replaceAll("＋", "+")
    .replaceAll("－", "-")
    .replaceAll("，", "")
    .replaceAll(",", "");

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

  if (s0.startsWith("如果") && !s0.includes("则") && (s0.includes("，") || s0.includes(","))) {
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

  const shipDelta = /^战船\+(\d+)$/.exec(headKey);
  if (shipDelta) return { type: "battleship", raw: s0, delta: Number(shipDelta[1]) };

  if (headKey === "战船数归零") return { type: "battleship", raw: s0, setTo: 0 };

  const shipUltimate = /^对2位对手战士分别造成其现有HP-1的直接伤害且本回合2位对手战士无视其他HP伤害或回复效果且战船数归零$/.exec(sKeyAll);
  if (shipUltimate) return { type: "battleshipUltimate", raw: s0 };

  if (headKey === "格挡") return { type: "block", raw: s0, inner };

  if (headKey === "雷击") return { type: "linked", raw: s0, inner };

  if (headKey.startsWith("攻击焰") || headKey.startsWith("攻击") || headKey.startsWith("双战攻击")) {
    const flame = headKey.startsWith("攻击焰");
    const attackerMode = headKey.includes("己方辅助") ? "support" : headKey.startsWith("双战") ? "double" : "single";
    const defenderMode = headKey.includes("攻击双战") || headKey.includes("焰双战") || headKey.endsWith("双战") ? "double" : "single";
    const target = headKey.includes("对方辅助") ? "enemySupport" : "enemyMain";
    return { type: "attack", raw: s0, attackerMode, defenderMode, target, inner, flame };
  }

  const healSupport = /^辅助回复(\d+)$/.exec(headKey);
  if (healSupport) return { type: "heal", raw: s0, target: "allySupport", amount: Number(healSupport[1]) };

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

function parseCardEffects(cardText) {
  const s = String(cardText ?? "").trim();
  if (!s) return [];
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
    if (e.type === "attack") return true;
    if (e.type === "block") {
      if (effectsMayContainAttack(e.inner)) return true;
    }
    if (e.type === "conditional") {
      if (effectsMayContainAttack(e.inner)) return true;
    }
  }
  return false;
}

function hasAutoAttack(effects, ctx, runtime) {
  for (const e of effects ?? []) {
    if (!e) continue;
    if (e.type === "attack") return true;
    if (e.type === "block") continue;
    if (e.type === "conditional") {
      if (condOk(e, ctx, runtime)) {
        if (hasAutoAttack(e.inner, ctx, runtime)) return true;
      }
    }
  }
  return false;
}

function hasAttackForBlock(effects, ctx, runtime) {
  for (const e of effects) {
    if (!e) continue;
    if (e.type === "attack") return true;
    if (e.type === "conditional") {
      if (condOk(e, ctx, runtime)) {
        if (hasAttackForBlock(e.inner, ctx, runtime)) return true;
      }
    }
    if (e.type === "linked") {
      if (hasAttackForBlock(e.inner, ctx, runtime)) return true;
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
}) {
  const log = [];
  const hpDelta = new Map();
  const powerDelta = new Map();
  const fighterById = new Map(
    [...myPlayer.fighters, ...oppPlayer.fighters].map((f) => [f.id, f])
  );
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
      myCanceled: true,
      oppCanceled: true,
      myBlockSuccess: false,
      oppBlockSuccess: false,
      winOnSelfKoByPlayer,
    };
  }

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
  const p1BlockSuccess = p1HasBlock && p2Attacking;
  const p2BlockSuccess = p2HasBlock && p1Attacking;
  const deferredAfterOppP1 = [];
  const deferredAfterOppP2 = [];
  const cancelHealByPlayerId = new Map();
  const mapFor = (playerId) => (playerId === myPlayer.id ? myPlayer.fightersByName : oppPlayer.fightersByName);

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

  function addHp(id, delta, opts) {
    const force = opts?.force === true;
    if (!force && hpShield.has(id)) return;
    const d = Number(delta) || 0;
    if (!d) return;
    hpDelta.set(id, (hpDelta.get(id) ?? 0) + d);
  }

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
        const curHp = (main.hp ?? 0) + (hpDelta.get(mainId) ?? 0);
        const koFloor = getKoFloor(main);
        if (curHp > koFloor) addHp(mainId, koFloor - curHp, { force: true });
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
    if (effect.type === "block") {
      if (blockSuccess && effect.inner.length) {
        for (const inner of effect.inner)
          applyAtomicEffect(sideCtx, inner, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, linkId);
      }
      return;
    }
    if (effect.type === "attack") {
      if (opponentBlockSuccess) return;
      const base = computeAttackDamage(sideCtx, effect);
      const prefix = runtime?.prefix ?? "";
      const atkLabel = effect.flame ? "攻击焰" : "攻击";
      if (effect.defenderMode === "double") {
        const id1 = sideCtx.opp.bothIds[0];
        const id2 = sideCtx.opp.bothIds[1];
        const d1 = base + (effect.flame ? flameCountByOwner(fighterById.get(id1), sideCtx.my.playerId) : 0);
        const d2 = base + (effect.flame ? flameCountByOwner(fighterById.get(id2), sideCtx.my.playerId) : 0);
        addHp(id1, -d1);
        addHp(id2, -d2);
        const n1 = fighterById.get(sideCtx.opp.bothIds[0])?.name ?? sideCtx.opp.bothIds[0];
        const n2 = fighterById.get(sideCtx.opp.bothIds[1])?.name ?? sideCtx.opp.bothIds[1];
        const dmgText = d1 === d2 ? `${d1}` : `${d1}/${d2}`;
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} ${atkLabel}：对 ${n1}/${n2} 造成 ${dmgText}`);
      } else if (effect.target === "enemySupport") {
        const id = sideCtx.opp.supportId;
        const dmg = base + (effect.flame ? flameCountByOwner(fighterById.get(id), sideCtx.my.playerId) : 0);
        addHp(id, -dmg);
        const n = fighterById.get(sideCtx.opp.supportId)?.name ?? sideCtx.opp.supportId;
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} ${atkLabel}：对 ${n} 造成 ${dmg}`);
      } else {
        const id = sideCtx.opp.mainId;
        const dmg = base + (effect.flame ? flameCountByOwner(fighterById.get(id), sideCtx.my.playerId) : 0);
        addHp(id, -dmg);
        const n = fighterById.get(sideCtx.opp.mainId)?.name ?? sideCtx.opp.mainId;
        log.push(`${prefix}${runtime?.card?.fighterName ?? "?"} ${atkLabel}：对 ${n} 造成 ${dmg}`);
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
    queuePower,
    runtime,
    deferredAfterOpp,
  }) {
    if (canceledSelf) {
      log.push(`${prefix}${card.fighterName} 打出的卡被取消：效果不结算`);
      return;
    }
    if (opponentBlockSuccess && attackingForBlock) {
      log.push(`${prefix}${card.fighterName} 的攻击被对方格挡：本回合所有攻击词条失败`);
    }
    const hasBlock = effects.some((e) => e.type === "block");
    if (hasBlock && blockSuccess) log.push(`${prefix}${card.fighterName} 格挡成功`);
    if (hasBlock && !blockSuccess) log.push(`${prefix}${card.fighterName} 格挡失败`);

    for (const e of effects) {
      if (e.type === "onInsert") continue;
      if (e.type === "afterOppExecuteLowHp") {
        deferredAfterOpp.push({ sideCtx, effect: e, prefix });
        continue;
      }
      applyAtomicEffect(sideCtx, e, canceledSelf, opponentBlockSuccess, blockSuccess, playerMap, queuePower, runtime, null);
    }
  }

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
    queuePower: (id, amount, linkId) => {
      powerOpsP1.push({ id, amount, linkId });
    },
    runtime: { myEffects, oppEffects, fighterById, prefix: "P1: ", card: myCard, oppCard, startPoliceOwnerPlayerId, startPoliceOwnerFighterId },
    deferredAfterOpp: deferredAfterOppP1,
  });
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
    queuePower: (id, amount, linkId) => {
      powerOpsP2.push({ id, amount, linkId });
    },
    runtime: {
      myEffects: oppEffects,
      oppEffects: myEffects,
      fighterById,
      prefix: "P2: ",
      card: oppCard,
      oppCard: myCard,
      startPoliceOwnerPlayerId,
      startPoliceOwnerFighterId,
    },
    deferredAfterOpp: deferredAfterOppP2,
  });

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

  const hpAt = (id) => {
    const base = fighterById.get(id)?.hp ?? 0;
    return base + (hpDelta.get(id) ?? 0);
  };

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

  return {
    log,
    hpDelta,
    powerDelta,
    myCanceled: p1Canceled,
    oppCanceled: p2Canceled,
    myBlockSuccess: p1BlockSuccess,
    oppBlockSuccess: p2BlockSuccess,
    winOnSelfKoByPlayer,
  };
}

function applyDeltas(state, hpDelta, powerDelta) {
  const fighters = [...state.players.p1.fighters, ...state.players.p2.fighters];
  const fighterById = new Map(fighters.map((f) => [f.id, f]));
  const hpTraceById = new Map();

  for (const [id, d] of powerDelta.entries()) {
    const f = fighterById.get(id);
    if (!f) continue;
    f.power = Math.max(0, f.power + d);
  }

  function stepHpChange(f, d0, trace) {
    let remaining = Number(d0) || 0;
    if (!remaining) return;
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
          const walk = (e) => {
            if (!e) return;
            if (e.type === "linked") {
              for (const x of e.inner) walk(x);
              return;
            }
            if (e.type === "conditional") return;
            if (e.type === "power") {
              f.power = Math.max(0, (Number(f.power) || 0) + (Number(e.amount) || 0));
              return;
            }
            if (e.type === "heal") {
              stepHpChange(f, Number(e.amount) || 0, trace);
              return;
            }
            if (e.type === "direct") {
              stepHpChange(f, -(Number(e.amount) || 0), trace);
              return;
            }
            if (e.type === "snakeFlip") {
              const beforeSnake = Number(f.snake) || 0;
              const nextSnake = beforeSnake === 1 ? 0 : 1;
              f.snake = nextSnake;
              if (Array.isArray(f.snakeFlipMark)) {
                const last = f.snakeFlipMark[f.snakeFlipMark.length - 1];
                if (last !== beforeSnake) f.snakeFlipMark.push(beforeSnake);
                f.snakeFlipMark.push(nextSnake);
              } else {
                f.snakeFlipMark = [beforeSnake, nextSnake];
              }
            }
          };
          for (const e of hpRuleEffects) walk(e);
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
  return hpTraceById;
}

function snapshotFightersState(state) {
  const fighters = [...state.players.p1.fighters, ...state.players.p2.fighters];
  const m = new Map();
  for (const x of fighters) m.set(x.id, { hp: x.hp, power: x.power });
  return m;
}

function checkWinner(state) {
  const isKoNow = (f) => (Array.isArray(f.koLines) && f.koLines.length > 0 ? f.koLines.includes(Number(f.hp) || 0) : Number(f.hp) <= Number(f.koLine));
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
  applyDeltas(state, settlement.hpDelta, settlement.powerDelta);
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
      const isKoNow = (f) => (Array.isArray(f.koLines) && f.koLines.length > 0 ? f.koLines.includes(Number(f.hp) || 0) : Number(f.hp) <= Number(f.koLine));
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

  function cardLabel(card) {
    if (!card) return "-";
    const n = card.cardName ? String(card.cardName).trim() : "";
    return n ? `${card.fighterName}·${n}` : `${card.fighterName}#${card.cardNo}`;
  }

  function displayCardText(card) {
    if (!card) return "-";
    if (card.fighterName === "郑一嫂" && Number(card.cardNo) === 1)
      return "船0~7攻击；8~15回复2；20群伤至1；战船+1";
    if (card.fighterName === "派克帮" && Number(card.cardNo) === 1)
      return "警在己方：攻击&交警；警在对方：获得警&力量同时+1";
    return card.text || "-";
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

  function renderHpGrid(f, overlay) {
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
    const currentIdx = Math.max(1, Math.min(maxIdx, idxForHp(hp)));
    const oldIdxRaw = overlay?.oldHp ?? null;
    const oldIdx =
      oldIdxRaw == null ? null : Math.max(1, Math.min(maxIdx, idxForHp(Number(oldIdxRaw))));
    const hpDelta = Number(overlay?.hpDelta) || 0;
    const hpPath = Array.isArray(overlay?.hpPath) ? overlay.hpPath : null;
    const hasPath = Boolean(hpPath && hpPath.length >= 2);
    const showHpDelta =
      Boolean(overlay?.showHpDelta) &&
      oldIdx != null &&
      ((oldIdx !== currentIdx && (hpDelta !== 0 || hasPath)) || (hasPath && hpPath.includes(-2)));
    const hpMoveLabel = showHpDelta ? (hpPath && hpPath.length >= 2 ? hpPath.join("→") : `${hpDelta > 0 ? "→" : "←"}${Math.abs(hpDelta)}`) : "";
    let cells = "";
    const slots = 30;
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
    return `
      <div class="hp-wrap">
        <div class="hp-label">HP</div>
        <div class="hp-grid" style="--hp-cells:30">
          ${cells}
          ${arrowHtml}
          ${jumpHtml}
        </div>
        <div class="hp-num">${hp}/${maxHp}</div>
      </div>
    `;
  }

  function renderFighter(f, opts) {
    const isMain = opts?.isMain === true;
    function isKoNow(fx) {
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
    const snakeIsBlack = (Number(f.snake) || 0) === 1;
    const snakeFlipMark = f?.snakeFlipMark ?? null;
    const snakeMarkText =
      Array.isArray(snakeFlipMark) && snakeFlipMark.length >= 2
        ? snakeFlipMark.map((v) => (Number(v) === 1 ? "黑" : "白")).join("→")
        : "";
    const snakeBar =
      f.name === "靡菲斯特"
        ? `
          <div class="snake-wrap">
            <div class="snake-label">蛇</div>
            <div class="snake-cell${snakeIsBlack ? " black" : " white"}">${snakeMarkText}</div>
          </div>
        `
        : "";
    const lastRound = state.lastRound;
    const comparing = state.compareHold === true && lastRound?.before?.has(f.id);
    const base = comparing ? lastRound.before.get(f.id) : null;
    const shownHp = base ? base.hp : f.hp;
    const shownPower = base ? base.power : f.power;
    const pText = `${shownPower}`;

    let powerDeltaHtml = "";
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
      if (dp !== 0) {
        powerDeltaHtml = `<span class="delta-power ${dp > 0 ? "delta-up" : "delta-down"}">${dp > 0 ? "↑" : "↓"}${Math.abs(dp)}</span>`;
      }
      const hpPath = overlay?.hpTraceById?.get?.(f.id) ?? null;
      hpOverlay = { oldHp: b.hp, hpDelta: dh, showHpDelta: true, hpPath };
    }
    return `
      <div class="fighter${isMain ? " fighter-main" : ""}">
        ${policeMark}
        ${flameMark}
        <div class="fighter-top">
          <div class="fighter-name">${f.name}</div>
          ${isKo ? `<div class="ko-badge">KO!</div>` : ""}
        </div>
        ${renderHpGrid({ ...f, hp: shownHp }, hpOverlay)}
        ${revBar}
        ${shipBar}
        ${snakeBar}
        <div class="fighter-stats">
          <div class="stat stat-power">力量: <span class="power-value">${pText}</span>${powerDeltaHtml}</div>
        </div>
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
    const cardHtml = (side, card) => `
      <div class="battle-card" data-side="${side}">
        <div class="battle-card-top">
          <div class="battle-card-side">${side}</div>
          <div class="battle-card-title">${cardTitleHtml(card)}</div>
        </div>
        <div class="battle-card-body">${displayCardText(card)}</div>
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
      const names = data.fighterDefs.map((f) => f.name);
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
          <div class="insert-card ${variant}" draggable="true" data-setup="true" data-player="${playerId}" data-name="${fighterName}">
            <div class="insert-title">${fighterName}${n1 ? ` · ${n1}` : "#1"}</div>
            <div class="insert-text">${text}</div>
          </div>
        `;
      };

      const setupBoardHtml = (playerId, built) => {
        let html = "";
        for (let i = 0; i <= built.length; i++) {
          html += `<div class="dropzone" data-setup-zone="true" data-player="${playerId}" data-pos="${i}">放这里</div>`;
          if (i < built.length) {
            const name = built[i];
            const n1 = cardName1(name);
            html += `
              <div class="deck-card setup-built" draggable="true" data-setup="true" data-player="${playerId}" data-name="${name}">
                <div class="deck-title">${i === 0 ? "顶" : "底"}：${name}${n1 ? ` · ${n1}` : "#1"}</div>
                <div class="deck-text">${cardText(name)}</div>
              </div>
            `;
          }
        }
        return html;
      };

      if (setup.step === "pick") {
        const slotLabel = (v, fallback) =>
          v
            ? `<div class="setup-picked" draggable="true" data-setup-pick="picked" data-name="${escapeHtml(v)}">${escapeHtml(v)}</div>`
            : `<div class="setup-slot-placeholder">${fallback}</div>`;

        els.constructionPanel.innerHTML = `
          <div class="construction-card">
            <div><strong>初始化</strong>：拖拽选择双方各 2 位战士</div>
            <div class="setup-pick-grid">
              <div class="setup-side" data-player="p1">
                <div class="setup-side-title"><strong>P1</strong></div>
                <div class="setup-pool" data-player="p1">
                  ${names.map((n) => `<div class="setup-fighter" draggable="true" data-setup-pick="fighter" data-name="${escapeHtml(n)}">${escapeHtml(n)}</div>`).join("")}
                </div>
                <div class="setup-slots">
                  <div class="setup-slot" data-setup-pick="slot" data-player="p1" data-slot="a">${slotLabel(setup.p1a, "空槽1")}</div>
                  <div class="setup-slot" data-setup-pick="slot" data-player="p1" data-slot="b">${slotLabel(setup.p1b, "空槽2")}</div>
                </div>
              </div>
              <div class="setup-side" data-player="p2">
                <div class="setup-side-title"><strong>P2</strong></div>
                <div class="setup-pool" data-player="p2">
                  ${names.map((n) => `<div class="setup-fighter" draggable="true" data-setup-pick="fighter" data-name="${escapeHtml(n)}">${escapeHtml(n)}</div>`).join("")}
                </div>
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
          const key = pid === "p1" ? (slot === "a" ? "p1a" : "p1b") : slot === "a" ? "p2a" : "p2b";
          const otherKey = pid === "p1" ? (slot === "a" ? "p1b" : "p1a") : slot === "a" ? "p2b" : "p2a";
          const cur = setup[key] ?? null;
          const other = setup[otherKey] ?? null;
          if (other === name) {
            setup[otherKey] = cur;
          }
          setup[key] = name;
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
              setSlot(pid, slot, name);
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

      const setupDragSelector = `.insert-card[data-setup="true"], .deck-card[data-setup="true"]`;
      els.constructionPanel.querySelectorAll(setupDragSelector).forEach((el) => {
        el.addEventListener("dragstart", (ev) => {
          const pid = el.getAttribute("data-player");
          const name = el.getAttribute("data-name");
          ev.dataTransfer.setData("text/plain", `setup:${pid}:${name}`);
          ev.dataTransfer.effectAllowed = "move";
          el.classList.add("dragging");
          if (pid === "p1") boardP1.classList.add("dragging");
          if (pid === "p2") boardP2.classList.add("dragging");
        });
        el.addEventListener("dragend", () => {
          el.classList.remove("dragging");
          boardP1.classList.remove("dragging");
          boardP2.classList.remove("dragging");
        });
      });

      els.constructionPanel.querySelectorAll(`.dropzone[data-setup-zone="true"]`).forEach((zone) => {
        zone.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          zone.classList.add("active");
          ev.dataTransfer.dropEffect = "move";
        });
        zone.addEventListener("dragleave", () => {
          zone.classList.remove("active");
        });
        zone.addEventListener("drop", (ev) => {
          ev.preventDefault();
          zone.classList.remove("active");
          const raw = ev.dataTransfer.getData("text/plain");
          const parts = raw.split(":");
          if (parts.length !== 3 || parts[0] !== "setup") return;
          const pid = parts[1];
          const name = parts[2];
          const playerId = zone.getAttribute("data-player");
          if (pid !== playerId) return;
          const pos = Number(zone.getAttribute("data-pos"));
          if (!Number.isFinite(pos)) return;
          const oldEl = els.constructionPanel.querySelector(`${setupDragSelector}[data-player="${pid}"][data-name="${name}"]`);
          const oldRect = oldEl ? oldEl.getBoundingClientRect() : null;
          const key = pid === "p1" ? "p1Built" : "p2Built";
          const arr = [...setup[key]];
          const idx = arr.indexOf(name);
          if (idx >= 0) arr.splice(idx, 1);
          arr.splice(Math.max(0, Math.min(pos, arr.length)), 0, name);
          setup[key] = arr.slice(0, 2);
          render();
          if (oldRect) {
            const newEl = els.constructionPanel.querySelector(`${setupDragSelector}[data-player="${pid}"][data-name="${name}"]`);
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
          choice.previewPos = Number.isFinite(choice.insertPos) ? choice.insertPos : 0;
          scheduleRender();
        });
        el.addEventListener("dragend", () => {
          el.classList.remove("dragging");
          choice.dragging = false;
          choice.previewPos = null;
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
          const isKoNow = (f) => (Array.isArray(f.koLines) && f.koLines.length > 0 ? f.koLines.includes(Number(f.hp) || 0) : Number(f.hp) <= Number(f.koLine));
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
    els.btnNextBattle.disabled = state.phase !== PHASE.BATTLE || awaiting || pendingEnd;
    els.btnEnterConstruction.disabled = !awaiting || pendingEnd;
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
    if (p1.battleDeck.length === 0 || p2.battleDeck.length === 0) return;

    state.lastIntermissionEffect = null;
    const beforeSnapshot = snapshotFighters();
    const p1Card = p1.battleDeck.shift();
    const p2Card = p2.battleDeck.shift();
    state.lastFlip = { round: state.round, turn: state.turn, p1Card, p2Card };
    renderBattleReveal();
    pushLog(`翻牌（轮次${state.round}回合${state.turn}）：P1 ${formatCardLabel(p1Card)} / P2 ${formatCardLabel(p2Card)}`);

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
    });

    for (const line of settlement.log) pushLog(line);

    const hpTraceById = applyDeltas(state, settlement.hpDelta, settlement.powerDelta);

    p1.resolvedPile.unshift(p1Card);
    p2.resolvedPile.unshift(p2Card);
    const afterSnapshot = snapshotFighters();
    state.lastRound = { round: state.round, turn: state.turn, before: beforeSnapshot, after: afterSnapshot, hpTraceById };
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

    function isKoNow(fx) {
      if (Array.isArray(fx.koLines) && fx.koLines.length > 0) {
        return fx.koLines.includes(Number(fx.hp) || 0);
      }
      return Number(fx.hp) <= Number(fx.koLine);
    }
    const p1KO = state.players.p1.fighters.some(isKoNow);
    const p2KO = state.players.p2.fighters.some(isKoNow);
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

  els.btnNewGame.addEventListener("click", newGame);
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
