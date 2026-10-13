var assert;
var L;
var questions;
if (typeof require === "function") {
  assert = require("assert");
  L = require("./logic.js");
  questions = require("./questions.js");
} else {
  assert = {
    strictEqual: function (a, b) {
      if (a !== b) throw new Error(String(a) + " !== " + String(b));
    },
    deepStrictEqual: function (a, b, msg) {
      if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg || "deep equal failed");
    },
    notDeepStrictEqual: function (a, b) {
      if (JSON.stringify(a) === JSON.stringify(b)) throw new Error("expected different values");
    },
    ok: function (v) {
      if (!v) throw new Error("expected truthy");
    }
  };
  L = window.EiseiLogic;
  questions = window.EISEI_QUESTIONS;
}

const issues = L.validateBank(questions);
assert.deepStrictEqual(issues, [], issues.join("\n"));

function paperWith(counts, seed) {
  const paper = L.drawByPlan(questions, L.PLANS.exam, seed || 3);
  const picks = {};
  const seen = { law_h: 0, health_h: 0, law_g: 0, health_g: 0, phys: 0 };
  paper.forEach((q) => {
    seen[q.category] += 1;
    picks[q.id] = seen[q.category] <= counts[q.category] ? q.answer : (q.answer + 1) % 5;
  });
  return { paper, picks };
}

const all = paperWith({ law_h: 10, health_h: 10, law_g: 7, health_g: 7, phys: 10 });
let score = L.scorePaper(all.paper, all.picks);
assert.strictEqual(score.earned, 400);
assert.strictEqual(score.pass, true);

const floorsOnly = paperWith({ law_h: 4, health_h: 4, law_g: 3, health_g: 3, phys: 4 });
score = L.scorePaper(floorsOnly.paper, floorsOnly.picks);
assert.strictEqual(score.earned, 164);
assert.strictEqual(score.floorOk, true);
assert.strictEqual(score.totalOk, false);
assert.strictEqual(score.pass, false);

const underLine = paperWith({ law_h: 6, health_h: 6, law_g: 4, health_g: 4, phys: 6 });
score = L.scorePaper(underLine.paper, underLine.picks);
assert.strictEqual(score.earned, 236);
assert.strictEqual(score.pass, false);

const justOver = paperWith({ law_h: 6, health_h: 6, law_g: 4, health_g: 4, phys: 7 });
score = L.scorePaper(justOver.paper, justOver.picks);
assert.strictEqual(score.earned, 246);
assert.strictEqual(score.pass, true);

const oneFloor = paperWith({ law_h: 10, health_h: 10, law_g: 2, health_g: 7, phys: 10 });
score = L.scorePaper(oneFloor.paper, oneFloor.picks);
assert.strictEqual(score.totalOk, true);
assert.strictEqual(score.floorOk, false);
assert.strictEqual(score.pass, false);
assert.strictEqual(score.rows.find((r) => r.category === "law_g").floorOk, false);

const threeOfSeven = paperWith({ law_h: 4, health_h: 4, law_g: 3, health_g: 3, phys: 4 });
assert.strictEqual(L.scorePaper(threeOfSeven.paper, threeOfSeven.picks).rows.find((r) => r.category === "law_g").floorOk, true);

const special = L.drawByPlan(questions, L.PLANS.special, 8);
assert.strictEqual(special.length, 20);
const spPicks = {};
const spSeen = { law_h: 0, health_h: 0 };
special.forEach((q) => {
  spSeen[q.category] += 1;
  const need = q.category === "law_h" ? 8 : 4;
  spPicks[q.id] = spSeen[q.category] <= need ? q.answer : (q.answer + 1) % 5;
});
score = L.scorePaper(special, spPicks);
assert.strictEqual(score.earned, 96);
assert.strictEqual(score.max, 160);
assert.strictEqual(score.pass, true);

const exempt = L.drawByPlan(questions, L.PLANS.exempt, 4);
assert.strictEqual(exempt.length, 34);
assert.ok(exempt.every((q) => q.category !== "phys"));
const exPicks = {};
exempt.forEach((q) => { exPicks[q.id] = q.answer; });
score = L.scorePaper(exempt, exPicks);
assert.strictEqual(score.max, 300);
assert.strictEqual(score.earned, 300);
assert.strictEqual(score.pass, true);

const again = L.drawByPlan(questions, L.PLANS.exam, 99);
const once = L.drawByPlan(questions, L.PLANS.exam, 99);
assert.deepStrictEqual(again.map((q) => q.id), once.map((q) => q.id));
const other = L.drawByPlan(questions, L.PLANS.exam, 100);
assert.notDeepStrictEqual(other.map((q) => q.id), once.map((q) => q.id));

const sample = questions[0];
const otherQ = questions.find((q) => q.id !== sample.id && q.topic === sample.topic);
const records = {};
records[sample.id] = { attempts: [{ ok: false, at: 1 }] };
records[otherQ.id] = { attempts: [{ ok: false, at: 1 }, { ok: true, at: 2 }] };
let pending = L.pendingWrongIds(questions, records);
assert.ok(pending.includes(sample.id));
assert.ok(!pending.includes(otherQ.id));

const sum = L.summarize(questions, records);
assert.strictEqual(sum.total.taken, 2);
assert.strictEqual(sum.total.attempts, 3);
assert.strictEqual(sum.total.correct, 1);
assert.strictEqual(sum.total.wrong, 2);
assert.strictEqual(sum.total.pending, 1);
assert.ok(sum.byTopic.some((row) => row.key === sample.topic && row.taken === 2));

const none = L.summarize(questions, {});
assert.strictEqual(none.total.taken, 0);
assert.strictEqual(none.byTopic.length, 0);

const practice = L.drawPractice(questions, { category: "phys", topic: "血液", limit: 10, seed: 5 });
assert.strictEqual(practice.length, 10);
assert.ok(practice.every((q) => q.topic === "血液" && q.category === "phys"));
assert.strictEqual(L.escapeHtml(`<b class="x">`), "&lt;b class=&quot;x&quot;&gt;");
assert.strictEqual(L.countCorrect(practice, { [practice[0].id]: practice[0].answer }), 1);

if (typeof document !== "undefined") {
  document.body.textContent = "logic tests ok";
} else {
  console.log("logic tests ok");
}
