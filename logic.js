(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EiseiLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CATEGORIES = ["law_h", "health_h", "law_g", "health_g", "phys"];
  var POINTS = { law_h: 8, health_h: 8, law_g: 10, health_g: 10, phys: 10 };
  var PLANS = {
    exam: { law_h: 10, health_h: 10, law_g: 7, health_g: 7, phys: 10 },
    exempt: { law_h: 10, health_h: 10, law_g: 7, health_g: 7 },
    special: { law_h: 10, health_h: 10 }
  };
  var MINUTES = { exam: 180, exempt: 135, special: 120 };

  function poolFor(questions, category) {
    return questions.filter(function (q) { return q.category === category; });
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function sample(list, n, rand) {
    if (list.length < n) {
      throw new Error("プールが足りません: 必要 " + n + " / 実際 " + list.length);
    }
    return shuffle(list, rand).slice(0, n);
  }

  function drawByPlan(questions, plan, seed) {
    var rand = mulberry32(seed >>> 0);
    var picked = [];
    CATEGORIES.forEach(function (category) {
      if (!plan[category]) return;
      picked = picked.concat(sample(poolFor(questions, category), plan[category], rand));
    });
    return picked;
  }

  function drawPractice(questions, options) {
    var opts = options || {};
    var rand = mulberry32((opts.seed || 1) >>> 0);
    var list = questions.filter(function (q) {
      if (opts.category && q.category !== opts.category) return false;
      if (opts.topic && q.topic !== opts.topic) return false;
      if (opts.ids && opts.ids.indexOf(q.id) === -1) return false;
      return true;
    });
    list = shuffle(list, rand);
    if (opts.limit && opts.limit > 0 && opts.limit < list.length) list = list.slice(0, opts.limit);
    return list;
  }

  function meets(earned, max, num, den) {
    return max > 0 && earned * den >= max * num;
  }

  function scorePaper(questions, picks) {
    var earned = 0;
    var max = 0;
    var rows = [];
    CATEGORIES.forEach(function (category) {
      var list = questions.filter(function (q) { return q.category === category; });
      if (!list.length) return;
      var correct = 0;
      list.forEach(function (q) {
        if (picks[q.id] === q.answer) correct += 1;
      });
      var points = POINTS[category];
      var row = {
        category: category,
        correct: correct,
        total: list.length,
        pointsEach: points,
        earned: correct * points,
        max: list.length * points
      };
      row.floor = row.max * 2 / 5;
      row.floorOk = meets(row.earned, row.max, 2, 5);
      earned += row.earned;
      max += row.max;
      rows.push(row);
    });
    var totalOk = meets(earned, max, 3, 5);
    var floorOk = rows.length > 0 && rows.every(function (row) { return row.floorOk; });
    return {
      earned: earned,
      max: max,
      line: max * 3 / 5,
      pass: floorOk && totalOk,
      floorOk: floorOk,
      totalOk: totalOk,
      rows: rows
    };
  }

  function lastAttempt(record) {
    if (!record || !record.attempts || !record.attempts.length) return null;
    return record.attempts[record.attempts.length - 1];
  }

  function pendingWrongIds(questions, records) {
    return questions.filter(function (q) {
      var last = lastAttempt(records[q.id]);
      return !!(last && last.ok === false);
    }).map(function (q) { return q.id; });
  }

  function summarize(questions, records) {
    var byTopic = {};
    var byCategory = {};
    function bucket(map, key) {
      if (!map[key]) {
        map[key] = {
          key: key,
          taken: 0,
          attempts: 0,
          correct: 0,
          wrong: 0,
          latestCorrect: 0,
          pending: 0
        };
      }
      return map[key];
    }
    questions.forEach(function (q) {
      var rec = records[q.id];
      var attempts = rec && rec.attempts ? rec.attempts : [];
      if (!attempts.length) return;
      var topic = bucket(byTopic, q.topic);
      var cat = bucket(byCategory, q.category);
      topic.category = q.category;
      [topic, cat].forEach(function (row) {
        row.taken += 1;
        row.attempts += attempts.length;
        attempts.forEach(function (a) {
          if (a.ok) row.correct += 1;
          else row.wrong += 1;
        });
        if (attempts[attempts.length - 1].ok) row.latestCorrect += 1;
        else row.pending += 1;
      });
    });
    function finalize(map) {
      return Object.keys(map).map(function (key) {
        var row = map[key];
        row.rate = row.attempts ? row.correct / row.attempts : 0;
        return row;
      }).sort(function (a, b) {
        if (a.category && b.category && a.category !== b.category) {
          return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
        }
        return a.rate - b.rate;
      });
    }
    var topics = finalize(byTopic);
    var categories = finalize(byCategory);
    var total = { taken: 0, attempts: 0, correct: 0, wrong: 0, pending: 0, rate: 0 };
    categories.forEach(function (row) {
      total.taken += row.taken;
      total.attempts += row.attempts;
      total.correct += row.correct;
      total.wrong += row.wrong;
      total.pending += row.pending;
    });
    total.rate = total.attempts ? total.correct / total.attempts : 0;
    return { byTopic: topics, byCategory: categories, total: total };
  }

  function countCorrect(questions, picks) {
    var n = 0;
    questions.forEach(function (q) {
      if (picks[q.id] === q.answer) n += 1;
    });
    return n;
  }

  function validateBank(questions) {
    var issues = [];
    if (!questions || questions.length !== 1000) {
      issues.push("問題数が1000ではありません: " + (questions ? questions.length : 0));
    }
    var ids = {};
    var texts = {};
    (questions || []).forEach(function (q, index) {
      if (!q.id || ids[q.id]) issues.push("idが空か重複: " + q.id + " @" + index);
      ids[q.id] = true;
      var key = q.text + "\n" + (q.choices || []).join("|");
      if (!q.text || texts[key]) issues.push("設問と選択肢の組が重複: " + q.id);
      texts[key] = true;
      if (!q.choices || q.choices.length !== 5) issues.push("選択肢が5つでない: " + q.id);
      else {
        var set = {};
        q.choices.forEach(function (c) {
          if (!c || !String(c).trim()) issues.push("空の選択肢: " + q.id);
          if (set[c]) issues.push("選択肢の重複: " + q.id);
          set[c] = true;
        });
      }
      if ([0, 1, 2, 3, 4].indexOf(q.answer) === -1) issues.push("正解番号が不正: " + q.id);
      if (!q.explain || String(q.explain).trim().length < 12) issues.push("解説が空: " + q.id);
      if (CATEGORIES.indexOf(q.category) === -1) issues.push("分野が不正: " + q.id);
      if (!q.topic) issues.push("項目が空: " + q.id);
    });
    if (!issues.length) {
      Object.keys(PLANS).forEach(function (name) {
        try {
          var paper = drawByPlan(questions, PLANS[name], 11);
          var expect = 0;
          Object.keys(PLANS[name]).forEach(function (cat) { expect += PLANS[name][cat]; });
          if (paper.length !== expect) issues.push(name + " の問数が " + paper.length);
          var seen = {};
          var cursor = 0;
          CATEGORIES.forEach(function (cat) {
            var n = PLANS[name][cat] || 0;
            for (var i = 0; i < n; i++) {
              var q = paper[cursor + i];
              if (!q || q.category !== cat) issues.push(name + " の並びが崩れています");
              if (q && seen[q.id]) issues.push(name + " で問題が重複");
              if (q) seen[q.id] = true;
            }
            cursor += n;
          });
        } catch (err) {
          issues.push(name + ": " + err.message);
        }
      });
    }
    return issues;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function asksForWrong(q) {
    return q.text.indexOf("誤っている") !== -1 || q.text.indexOf("適切でない") !== -1;
  }

  return {
    CATEGORIES: CATEGORIES,
    POINTS: POINTS,
    PLANS: PLANS,
    MINUTES: MINUTES,
    poolFor: poolFor,
    drawByPlan: drawByPlan,
    drawPractice: drawPractice,
    scorePaper: scorePaper,
    lastAttempt: lastAttempt,
    pendingWrongIds: pendingWrongIds,
    summarize: summarize,
    countCorrect: countCorrect,
    validateBank: validateBank,
    escapeHtml: escapeHtml,
    asksForWrong: asksForWrong
  };
});
