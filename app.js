(function () {
  var L = window.EiseiLogic;
  var BANK = window.EISEI_QUESTIONS || [];
  var STORE = "eisei-records-v1";
  var LAST = "eisei-last-v1";
  var SESSION = "eisei-session-v1";
  var MARKS = ["1", "2", "3", "4", "5"];
  var CAT = {
    law_h: "関係法令（有害業務）",
    health_h: "労働衛生（有害業務）",
    law_g: "関係法令（有害業務以外）",
    health_g: "労働衛生（有害業務以外）",
    phys: "労働生理"
  };
  var MODE = {
    exam: { title: "実試験", detail: "44問・3時間・400点満点。一問ごとに正誤と解説を出し、最後に合格判定をします。" },
    exempt: { title: "労働生理の免除", detail: "34問・2時間15分・300点満点。一問ごとに正誤と解説を出し、最後に合格判定をします。" },
    special: { title: "特例第一種", detail: "有害業務の法令と労働衛生のみ20問・2時間・160点満点。一問ごとに正誤と解説を出します。" },
    practice: { title: "一問一答", detail: "選んだ直後に正誤と解説を出します。" },
    retry: { title: "間違えた問題", detail: "直近の解答が不正解の問題だけを、解説つきでやり直します。" },
    stats: { title: "項目別の成績", detail: "解いた問題を項目ごとに集計します。" }
  };

  var state = {
    view: "home",
    mode: null,
    paper: [],
    index: 0,
    picks: {},
    revealed: {},
    flags: {},
    scored: false,
    endsAt: null,
    filter: "all",
    limit: 10,
    issues: [],
    notice: "",
    dialog: null,
    records: {},
    lastExam: null
  };
  var timerId = 0;
  var app = document.getElementById("app");

  function loadJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function loadRecords() {
    var data = loadJson(STORE);
    state.records = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    state.lastExam = loadJson(LAST);
  }

  function saveRecords() {
    localStorage.setItem(STORE, JSON.stringify(state.records));
  }

  function saveSession() {
    if (state.view !== "quiz" && state.view !== "result") {
      sessionStorage.removeItem(SESSION);
      return;
    }
    sessionStorage.setItem(SESSION, JSON.stringify({
      view: state.view,
      mode: state.mode,
      paper: state.paper,
      index: state.index,
      picks: state.picks,
      revealed: state.revealed,
      flags: state.flags,
      scored: state.scored,
      endsAt: state.endsAt
    }));
  }

  function restoreSession() {
    try {
      var raw = sessionStorage.getItem(SESSION);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || !saved.paper || !saved.paper.length || !MODE[saved.mode]) return;
      var known = {};
      BANK.forEach(function (q) { known[q.id] = true; });
      if (saved.paper.some(function (id) { return !known[id]; })) return;
      ["view", "mode", "paper", "index", "picks", "revealed", "flags", "scored", "endsAt"].forEach(function (key) {
        if (saved[key] !== undefined) state[key] = saved[key];
      });
      state.picks = state.picks || {};
      state.revealed = state.revealed || {};
      state.flags = state.flags || {};
    } catch (err) {
      sessionStorage.removeItem(SESSION);
    }
  }

  function qById(id) {
    for (var i = 0; i < BANK.length; i++) if (BANK[i].id === id) return BANK[i];
    return null;
  }

  function paperQuestions() {
    return state.paper.map(qById).filter(Boolean);
  }

  function isExamMode() {
    return state.mode === "exam" || state.mode === "exempt" || state.mode === "special";
  }

  function record(id, ok) {
    if (!state.records[id]) state.records[id] = { attempts: [] };
    state.records[id].attempts.push({ ok: !!ok, at: Date.now(), mode: state.mode });
    saveRecords();
  }

  function pendingIds() {
    return L.pendingWrongIds(BANK, state.records);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = 0;
  }

  function formatLeft(ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = (m < 10 ? "0" : "") + m;
    var ss = (s < 10 ? "0" : "") + s;
    return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  function armTimer() {
    stopTimer();
    if (state.view !== "quiz" || !state.endsAt || state.scored) return;
    timerId = setInterval(function () {
      var el = document.querySelector("[data-timer]");
      if (!el || !state.endsAt || state.scored) return;
      var left = state.endsAt - Date.now();
      el.textContent = formatLeft(left);
      el.classList.toggle("warn", left < 10 * 60 * 1000);
      if (left <= 0) finishPaper(true);
    }, 250);
  }

  function pct(rate) {
    return Math.round(rate * 1000) / 10 + "%";
  }

  function render() {
    stopTimer();
    app.innerHTML = shell(viewHtml()) + dialogHtml();
    bind();
    armTimer();
    saveSession();
  }

  function shell(inner) {
    var issue = "";
    if (state.issues.length) {
      issue = '<div class="warn-list"><strong>問題データの点検で異常があります。</strong><ul>' +
        state.issues.slice(0, 8).map(function (x) { return "<li>" + L.escapeHtml(x) + "</li>"; }).join("") +
        "</ul></div>";
    }
    return '<header class="topbar"><a class="brand" href="#home" data-go="home"><span class="seal">衛</span><span><small>第一種衛生管理者</small><strong>試験練習</strong></span></a>' +
      '<button class="ghost" type="button" data-go="stats">項目別の成績</button></header>' +
      issue + '<main id="main" class="layout">' + inner + "</main>" +
      '<footer class="footer">1000問は、労働安全衛生法・関係省令と労働生理の基本から作った五肢択一です。安全衛生技術試験協会の試験問題は転載していません。合格判定は、各出題範囲が配点の40%以上、かつ合計が満点の60%以上です。改正があり得る数値は、受験案内と最新の法令で確認してください。</footer>';
  }

  function dialogHtml() {
    if (!state.dialog) return "";
    return '<div class="modal-back"><div class="modal" role="dialog" aria-modal="true"><p>' +
      L.escapeHtml(state.dialog.text) + '</p><div class="nav"><button class="ghost" type="button" data-no>戻る</button><button class="solid" type="button" data-yes>' +
      L.escapeHtml(state.dialog.yes) + "</button></div></div></div>";
  }

  function viewHtml() {
    if (state.view === "quiz") return quizHtml();
    if (state.view === "result") return resultHtml();
    if (state.view === "stats") return statsHtml();
    return homeHtml();
  }

  function homeHtml() {
    var wrong = pendingIds().length;
    var sum = L.summarize(BANK, state.records);
    var notice = state.notice ? '<p class="warn-list">' + L.escapeHtml(state.notice) + "</p>" : "";
    state.notice = "";
    var last = "";
    if (state.lastExam && state.lastExam.earned != null) {
      last = '<p class="lede">前回の' + L.escapeHtml(MODE[state.lastExam.mode].title) + "は " +
        state.lastExam.earned + " / " + state.lastExam.max + " 点で、" +
        (state.lastExam.pass ? "合格ラインに達しています。" : "合格ラインには達していません。") + "</p>";
    }
    return notice + '<section class="hero"><div><p class="kicker">五肢択一・44問・3時間・400点満点</p><h1>一問ずつ確かめて、<br>本番の時間で解く。</h1><p class="lede">1000問から出題します。一問一答も実試験も、選んだ直後に正誤と解説を出します。実試験は制限時間つきで、最後に各範囲40%・合計60%の合格判定をします。間違えた問題だけをやり直し、解いた問題は項目別に残します。</p>' +
      last + "</div>" +
      '<aside class="note"><strong>合格の線</strong><br>関係法令（有害）10問80点、労働衛生（有害）10問80点、関係法令（有害以外）7問70点、労働衛生（有害以外）7問70点、労働生理10問100点。各範囲40%以上、合計240点以上です。7問の範囲は3問以上、10問の範囲は4問以上が40%の線です。</aside></section>' +
      '<h2 class="section-title">受け方を選ぶ</h2><div class="modes">' +
      modeBtn("exam") + modeBtn("exempt") + modeBtn("special") +
      modeBtn("practice", sum.total.taken ? "これまでに " + sum.total.taken + " 問を解いています。" : "分野と問数を選んで始めます。") +
      modeBtn("retry", wrong ? wrong + " 問がやり直し待ちです。" : "やり直し待ちはまだありません。") +
      modeBtn("stats", sum.total.taken ? "のべ正答率 " + pct(sum.total.rate) + "。" : "まだ記録がありません。") +
      "</div>" + practicePicker();
  }

  function modeBtn(mode, extra) {
    var meta = MODE[mode];
    return '<button class="mode" type="button" data-mode="' + mode + '"><strong>' + meta.title +
      "</strong><span>" + L.escapeHtml(extra || meta.detail) + "</span></button>";
  }

  function practicePicker() {
    var topics = [];
    var seen = {};
    BANK.forEach(function (q) {
      var key = q.category + "\n" + q.topic;
      if (seen[key]) return;
      seen[key] = true;
      topics.push(q);
    });
    var chips = '<button type="button" class="mini" data-filter="all" aria-pressed="' + (state.filter === "all") + '">すべて</button>' +
      L.CATEGORIES.map(function (c) {
        return '<button type="button" class="mini" data-filter="' + c + '" aria-pressed="' + (state.filter === c) + '">' + CAT[c] + "</button>";
      }).join("");
    var limits = [10, 20, 30, 50].map(function (n) {
      return '<button type="button" class="mini" data-limit="' + n + '" aria-pressed="' + (state.limit === n) + '">' + n + "問</button>";
    }).join("");
    var list = topics.filter(function (q) {
      return state.filter === "all" || q.category === state.filter;
    }).map(function (q) {
      var n = BANK.filter(function (item) { return item.topic === q.topic && item.category === q.category; }).length;
      return '<button class="topic-row" type="button" data-topic="' + L.escapeHtml(q.topic) + '" data-category="' + q.category + '"><span><em class="kicker">' +
        CAT[q.category] + "</em><br><strong>" + L.escapeHtml(q.topic) + "</strong></span><span>" + n + "問</span></button>";
    }).join("");
    return '<h2 class="section-title">一問一答の項目</h2><div class="filters" aria-label="分野と問数">' + chips + limits +
      '</div><div class="topics">' + list + "</div>";
  }

  function startPaper(mode, questions, minutes) {
    state.mode = mode;
    state.paper = questions.map(function (q) { return q.id; });
    state.index = 0;
    state.picks = {};
    state.revealed = {};
    state.flags = {};
    state.scored = false;
    state.endsAt = minutes ? Date.now() + minutes * 60 * 1000 : null;
    state.dialog = null;
    state.view = "quiz";
    if (!state.paper.length) {
      state.view = "home";
      state.mode = null;
      state.notice = mode === "retry" ? "やり直し待ちの問題はありません。不正解が残ると、ここに並びます。" : "この条件の問題がありません。";
    }
    render();
  }

  function quizHtml() {
    var q = qById(state.paper[state.index]);
    if (!q) return '<p class="empty">問題を表示できません。</p>';
    var exam = isExamMode();
    var shown = !!state.revealed[q.id];
    var choices = q.choices.map(function (choice, i) {
      var cls = "choice";
      if (state.picks[q.id] === i) cls += " selected";
      if (shown && i === q.answer) cls += " good";
      if (shown && state.picks[q.id] === i && i !== q.answer) cls += " bad";
      return '<button class="' + cls + '" type="button" data-pick="' + i + '"' + (shown ? " disabled" : "") +
        '><span class="mark">' + MARKS[i] + "</span><span>" + L.escapeHtml(choice) + "</span></button>";
    }).join("");
    var explain = "";
    if (shown) {
      var ok = state.picks[q.id] === q.answer;
      explain = '<div class="verdict ' + (ok ? "good" : "bad") + '" role="status"><strong>' +
        (ok ? "正解です。" : "不正解です。") + "</strong> 正解は " + MARKS[q.answer] + " です。</div>" +
        '<div class="explain">' + L.escapeHtml(q.explain) + "</div>";
    }
    var left = state.endsAt ? '<div class="timer" data-timer>' + formatLeft(state.endsAt - Date.now()) + "</div>" : "<div></div>";
    var dots = state.paper.map(function (id, i) {
      var cls = i === state.index ? "on" : "";
      var item = qById(id);
      if (state.revealed[id]) cls += state.picks[id] === item.answer ? " hit" : " miss";
      else if (state.picks[id] != null) cls += " filled";
      if (state.flags[id]) cls += " flag";
      return '<button type="button" data-jump="' + i + '" class="' + cls + '">' + (i + 1) + "</button>";
    }).join("");
    var answered = state.paper.filter(function (id) { return state.picks[id] != null; }).length;
    var onLast = state.index + 1 === state.paper.length;
    var allShown = state.paper.every(function (id) { return state.revealed[id]; });
    var primaryLabel = !shown ? "選択肢を選ぶと判定します" : (onLast ? (allShown ? "結果を見る" : "未解答へ") : "次の問題");
    var primary = '<button class="solid" type="button" data-next' + (shown ? "" : " disabled") + ">" + primaryLabel + "</button>";
    if (exam) primary = '<button class="ghost" type="button" data-submit>ここで採点する</button>' + primary;
    var tools = exam
      ? '<button class="ghost" type="button" data-flag>' + (state.flags[q.id] ? "見直しを外す" : "見直し") +
        '</button><button class="ghost" type="button" data-blank>未解答へ</button>'
      : "";
    return '<div class="quiz-head"><div><p class="kicker">' + L.escapeHtml(MODE[state.mode].title) + "</p><strong>" +
      CAT[q.category] + "・" + L.escapeHtml(q.topic) + "</strong></div>" + left + "</div>" +
      '<div class="progress"><span style="width:' + ((state.index + 1) / state.paper.length * 100) + '%"></span></div>' +
      '<p class="sub">' + (state.index + 1) + " / " + state.paper.length + "　解答済み " + answered +
      "　選ぶとすぐに正誤と解説を出します。</p>" +
      '<h2 class="stem' + (L.asksForWrong(q) ? " invert" : "") + '">' + L.escapeHtml(q.text) + "</h2>" +
      '<div class="choices">' + choices + "</div>" + explain +
      '<div class="dots" aria-label="問題番号">' + dots + "</div>" +
      '<div class="nav"><div class="cluster"><button class="ghost" type="button" data-prev' + (state.index === 0 ? " disabled" : "") +
      ">前へ</button>" + tools + '<button class="ghost" type="button" data-abort>中断</button></div>' + primary + "</div>";
  }

  function resultHtml() {
    var questions = paperQuestions();
    var exam = isExamMode();
    var head = "";
    if (exam) {
      var score = L.scorePaper(questions, state.picks);
      var reason = score.pass
        ? "合格ラインです。合計が60%以上で、各範囲も40%以上です。"
        : (!score.totalOk && !score.floorOk
          ? "不合格です。合計が60%未満で、40%未満の範囲もあります。"
          : (!score.totalOk ? "不合格です。合計が満点の60%に届いていません。" : "不合格です。40%未満の範囲があります。"));
      var rows = score.rows.map(function (row) {
        return "<tr><td>" + CAT[row.category] + "</td><td>" + row.correct + " / " + row.total + "</td><td>" +
          row.earned + " / " + row.max + "</td><td>" + row.floor + "点</td><td class=\"" + (row.floorOk ? "" : "unmet") + "\">" +
          (row.floorOk ? "達している" : "未満") + "</td></tr>";
      }).join("");
      head = '<p class="kicker">採点結果</p><div class="score"><b class="' + (score.pass ? "pass" : "fail") + '">' +
        score.earned + '</b><span>/ ' + score.max + "点　" + (score.pass ? "合格" : "不合格") + "</span></div>" +
        '<p class="lede">' + reason + " 60%の線は " + score.line + " 点です。</p>" +
        '<div class="panel"><table><thead><tr><th>範囲</th><th>正解</th><th>得点</th><th>40%の線</th><th>判定</th></tr></thead><tbody>' +
        rows + "</tbody></table></div>";
    } else {
      var correct = L.countCorrect(questions, state.picks);
      head = '<p class="kicker">結果</p><div class="score"><b>' + correct + "</b><span>/ " + questions.length +
        "　正答率 " + pct(questions.length ? correct / questions.length : 0) + "</span></div>";
    }
    var review = questions.map(function (q, i) {
      var pick = state.picks[q.id];
      var ok = pick === q.answer;
      var choiceHtml = q.choices.map(function (choice, idx) {
        var tag = "";
        if (idx === q.answer && pick === idx) tag = "あなたの解答・正解";
        else if (idx === q.answer) tag = "正解";
        else if (pick === idx) tag = "あなたの解答";
        return "<li>" + MARKS[idx] + " " + L.escapeHtml(choice) + (tag ? "（" + tag + "）" : "") + "</li>";
      }).join("");
      return '<article class="panel"><p class="kicker">' + (i + 1) + " ・ " + CAT[q.category] + "・" + L.escapeHtml(q.topic) +
        (ok ? " ・ 正解" : " ・ 不正解") + "</p><h3>" + L.escapeHtml(q.text) + "</h3><ul>" + choiceHtml +
        "</ul><p>" + L.escapeHtml(q.explain) + "</p></article>";
    }).join("");
    return head + '<div class="nav"><button class="solid" type="button" data-mode="retry">間違えた問題をやり直す</button>' +
      '<button class="ghost" type="button" data-go="stats">項目別の成績</button><button class="ghost" type="button" data-go="home">メニューへ</button></div>' +
      review;
  }

  function statsHtml() {
    var sum = L.summarize(BANK, state.records);
    if (!sum.total.taken) {
      return '<h1>項目別の成績</h1><p class="empty">まだ解いた問題がありません。</p><button class="ghost" type="button" data-go="home">戻る</button>';
    }
    var cats = sum.byCategory.map(function (row) {
      return '<div class="bar-row"><span>' + CAT[row.key] + '</span><div class="bar' + (row.rate < 0.6 ? " bad" : "") +
        '"><span style="width:' + Math.round(row.rate * 100) + '%"></span></div><strong>' + pct(row.rate) + "</strong></div>";
    }).join("");
    var topics = sum.byTopic.map(function (row) {
      return "<tr><td>" + CAT[row.category] + "</td><td>" + L.escapeHtml(row.key) + "</td><td>" + row.taken + "</td><td>" +
        row.attempts + "</td><td>" + row.correct + "</td><td>" + row.wrong + "</td><td>" + row.latestCorrect + "</td><td>" +
        pct(row.rate) + "</td><td>" + row.pending + '</td><td><button class="mini" type="button" data-topic="' +
        L.escapeHtml(row.key) + '" data-category="' + row.category + '">演習</button></td></tr>';
    }).join("");
    return '<h1>項目別の成績</h1><p class="lede">解いた問題 ' + sum.total.taken + "、のべ解答 " + sum.total.attempts +
      "、正解 " + sum.total.correct + "、不正解 " + sum.total.wrong + "、のべ正答率 " + pct(sum.total.rate) +
      "、やり直し待ち " + sum.total.pending + "問。同じ問題を重ねて解くと、のべ解答に加算されます。</p>" +
      '<div class="panel">' + cats + "</div>" +
      '<div class="panel"><table><thead><tr><th>分野</th><th>項目</th><th>解いた問題</th><th>のべ解答</th><th>正解</th><th>不正解</th><th>直近が正解</th><th>正答率</th><th>直し待ち</th><th></th></tr></thead><tbody>' +
      topics + "</tbody></table></div>" +
      '<div class="nav"><button class="solid" type="button" data-export>成績を書き出す</button><button class="ghost danger" type="button" data-reset>記録を消す</button><button class="ghost" type="button" data-go="home">戻る</button></div>';
  }

  function finishPaper(fromTimer) {
    if (state.scored) return;
    stopTimer();
    state.scored = true;
    state.paper.forEach(function (id) {
      if (state.revealed[id]) return;
      var q = qById(id);
      if (!q) return;
      state.revealed[id] = true;
      record(id, false);
    });
    if (isExamMode()) {
      var score = L.scorePaper(paperQuestions(), state.picks);
      state.lastExam = { mode: state.mode, earned: score.earned, max: score.max, pass: score.pass, at: Date.now() };
      localStorage.setItem(LAST, JSON.stringify(state.lastExam));
    }
    state.endsAt = null;
    state.dialog = null;
    state.view = "result";
    if (fromTimer) state.notice = "";
    render();
  }

  function revealCurrent() {
    var id = state.paper[state.index];
    var q = qById(id);
    if (!q || state.picks[id] == null || state.revealed[id]) return;
    state.revealed[id] = true;
    record(id, state.picks[id] === q.answer);
    render();
  }

  function openDialog(text, yes, action) {
    state.dialog = { text: text, yes: yes, action: action };
    render();
  }

  function bind() {
    app.onclick = function (event) {
      var el = event.target.closest("[data-mode],[data-go],[data-pick],[data-next],[data-prev],[data-jump],[data-submit],[data-filter],[data-limit],[data-topic],[data-export],[data-reset],[data-flag],[data-blank],[data-abort],[data-yes],[data-no]");
      if (!el) return;
      if (state.dialog && !el.hasAttribute("data-yes") && !el.hasAttribute("data-no")) return;
      if (el.hasAttribute("data-no")) {
        state.dialog = null;
        render();
        return;
      }
      if (el.hasAttribute("data-yes")) {
        var action = state.dialog && state.dialog.action;
        state.dialog = null;
        if (action === "submit") finishPaper(false);
        else if (action === "abort" || action === "stats") {
          state.view = action === "stats" ? "stats" : "home";
          state.mode = null;
          state.paper = [];
          state.endsAt = null;
          render();
        } else if (action === "reset") {
          state.records = {};
          state.lastExam = null;
          localStorage.removeItem(STORE);
          localStorage.removeItem(LAST);
          render();
        } else if (action === "home") {
          state.view = "home";
          state.mode = null;
          render();
        }
        return;
      }
      if (el.dataset.go) {
        if (state.view === "quiz" && !state.scored && (el.dataset.go === "home" || el.dataset.go === "stats")) {
          openDialog("中断します。判定済みの問題は成績に残ります。未解答は成績に入りません。",
            "中断する", el.dataset.go === "stats" ? "stats" : "abort");
          return;
        }
        state.view = el.dataset.go === "stats" ? "stats" : "home";
        if (state.view === "home") state.mode = null;
        render();
        return;
      }
      if (el.dataset.filter) {
        state.filter = el.dataset.filter;
        render();
        return;
      }
      if (el.dataset.limit) {
        state.limit = Number(el.dataset.limit);
        render();
        return;
      }
      if (el.dataset.topic) {
        var drawn = L.drawPractice(BANK, {
          category: el.dataset.category,
          topic: el.dataset.topic,
          limit: state.limit,
          seed: Date.now() % 100000
        });
        startPaper("practice", drawn, 0);
        return;
      }
      if (el.dataset.mode) {
        var mode = el.dataset.mode;
        var seed = Date.now() % 100000;
        if (mode === "stats") { state.view = "stats"; render(); return; }
        try {
          if (mode === "exam" || mode === "exempt" || mode === "special") {
            startPaper(mode, L.drawByPlan(BANK, L.PLANS[mode], seed), L.MINUTES[mode]);
            return;
          }
          if (mode === "retry") {
            startPaper("retry", L.drawPractice(BANK, { ids: pendingIds(), seed: seed }), 0);
            return;
          }
          if (mode === "practice") {
            startPaper("practice", L.drawPractice(BANK, {
              limit: state.limit,
              seed: seed,
              category: state.filter === "all" ? "" : state.filter
            }), 0);
            return;
          }
        } catch (err) {
          state.notice = err.message || String(err);
          state.view = "home";
          render();
        }
        return;
      }
      if (el.dataset.pick != null && !state.revealed[state.paper[state.index]]) {
        state.picks[state.paper[state.index]] = Number(el.dataset.pick);
        revealCurrent();
        return;
      }
      if (el.dataset.prev != null) {
        state.index = Math.max(0, state.index - 1);
        render();
        return;
      }
      if (el.dataset.jump != null) {
        state.index = Number(el.dataset.jump);
        render();
        return;
      }
      if (el.dataset.flag != null) {
        var fid = state.paper[state.index];
        if (state.flags[fid]) delete state.flags[fid];
        else state.flags[fid] = true;
        render();
        return;
      }
      if (el.dataset.blank != null) {
        for (var b = 1; b <= state.paper.length; b++) {
          var bi = (state.index + b) % state.paper.length;
          if (state.picks[state.paper[bi]] == null) {
            state.index = bi;
            break;
          }
        }
        render();
        return;
      }
      if (el.dataset.abort != null) {
        openDialog("中断します。判定済みの問題は成績に残ります。未解答は成績に入りません。", "中断する", "abort");
        return;
      }
      if (el.dataset.submit != null) {
        var left = state.paper.filter(function (id) { return state.picks[id] == null; }).length;
        var text = left
          ? "未解答が " + left + " 問あります。未解答は不正解として採点します。"
          : "この内容で採点します。採点後は答えを変更できません。";
        openDialog(text, "採点する", "submit");
        return;
      }
      if (el.dataset.next != null) {
        if (!state.revealed[state.paper[state.index]]) return;
        if (state.index + 1 === state.paper.length) {
          var missing = -1;
          for (var mi = 0; mi < state.paper.length; mi++) {
            if (!state.revealed[state.paper[mi]]) { missing = mi; break; }
          }
          if (missing === -1) finishPaper(false);
          else { state.index = missing; render(); }
          return;
        }
        state.index = Math.min(state.paper.length - 1, state.index + 1);
        render();
        return;
      }
      if (el.dataset.export != null) exportStats();
      if (el.dataset.reset != null) openDialog("このブラウザに保存した解答記録と、前回の試験結果を消します。", "記録を消す", "reset");
    };
  }

  function exportStats() {
    var payload = {
      exportedAt: new Date().toISOString(),
      summary: L.summarize(BANK, state.records),
      lastExam: state.lastExam,
      records: state.records
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "eisei-records.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  document.addEventListener("keydown", function (event) {
    if (state.view !== "quiz" || state.dialog) return;
    if (event.target && event.target.closest && event.target.closest("input, textarea")) return;
    var n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4 }[event.code];
    if (n != null && !state.revealed[state.paper[state.index]]) {
      state.picks[state.paper[state.index]] = n;
      revealCurrent();
      return;
    }
    if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
      event.preventDefault();
      state.index = event.code === "ArrowRight"
        ? Math.min(state.paper.length - 1, state.index + 1)
        : Math.max(0, state.index - 1);
      render();
    }
  });

  loadRecords();
  state.issues = L.validateBank(BANK);
  restoreSession();
  render();
})();
