#!/usr/bin/env node
/**
 * Guard: React event-object use after `await` in the same handler.
 *
 * Why this exists
 * ---------------
 * `Connections.tsx` shipped an async `onSubmit` that awaited
 * `requireDualControl()` *before* calling `new FormData(e.currentTarget)`.
 * React nulls `e.currentTarget` once the handler yields, so the constructor
 * threw:
 *
 *   Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'
 *
 * That silently blocked saving database connections. The same trap applies to
 * `e.target`, `e.dataTransfer`, `e.target.files`, `e.preventDefault()` etc.
 *
 * How it works
 * ------------
 * For every event read (`e.currentTarget`, `e.target`, `FormData(e.*)`, …) it
 * finds the nearest enclosing handler that binds that *same* event variable and
 * flags the use if an `await` sits between the handler start and the use. This
 * matches the handler's own parameter, so inline handlers such as
 * `onChange={e => setX(e.target.value)}` are not false-flagged.
 *
 * Usage
 * -----
 *   node scripts/check-event-after-await.mjs [dir-or-file ...]   # default: src
 *   node scripts/check-event-after-await.mjs --self-test
 *
 * Exits non-zero when a suspicious use is found.
 */
import fs from "node:fs";
import path from "node:path";

const EXTS = new Set([".tsx", ".ts", ".jsx", ".js"]);
const SKIP = new Set([
  "node_modules", "dist", "build", ".next", ".git",
  "coverage", "out", ".vercel", "public",
]);
const VARS = ["e", "ev", "event", "evt"];

const EVENT_USE = new RegExp(
  "\\b(e|ev|event|evt)\\.(currentTarget|target|persist|preventDefault|stopPropagation" +
    "|nativeEvent|dataTransfer|clipboardData|relatedTarget)\\b" +
    "|new\\s+FormData\\s*\\(\\s*(e|ev|event|evt)\\b",
  "g",
);
const AWAIT = /\bawait\b/g;
const PAREN_PARAM = new RegExp("\\(\\s*(" + VARS.join("|") + ")\\s*[,:)]", "g");
const ARROW_PARAM = /(?<![.\w])(e|ev|event|evt)\s*=>/g;

/** Index where `v` is bound as a handler parameter on `line`, or null. */
function paramDeclPos(line, v) {
  let best = null;
  for (const re of [PAREN_PARAM, ARROW_PARAM]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      if (m[1] === v) best = best === null ? m.index : Math.min(best, m.index);
    }
  }
  return best;
}

/** Scan an array of source lines; returns [{line, start, text}]. */
function scanLines(lines) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    EVENT_USE.lastIndex = 0;
    let m;
    while ((m = EVENT_USE.exec(line))) {
      const v = m[1] || m[3];
      const usePos = m.index;

      let awaiting = false;
      AWAIT.lastIndex = 0;
      let a;
      while ((a = AWAIT.exec(line))) if (a.index < usePos) awaiting = true;

      let start = null;
      const sameLine = paramDeclPos(line, v);
      if (sameLine !== null && sameLine < usePos) {
        start = i; // handler declared earlier on this same line
      } else {
        for (let j = i - 1; j >= 0 && j > i - 80; j--) {
          if (/\bawait\b/.test(lines[j])) awaiting = true;
          if (paramDeclPos(lines[j], v) !== null) {
            start = j;
            break;
          }
        }
      }

      if (awaiting && start !== null) {
        hits.push({ line: i + 1, start: start + 1, text: line.trim() });
      }
    }
  }
  return hits;
}

function collect(target, out) {
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    return;
  }
  if (st.isFile()) {
    if (EXTS.has(path.extname(target))) out.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
      collect(path.join(target, entry.name), out);
    } else if (EXTS.has(path.extname(entry.name))) {
      out.push(path.join(target, entry.name));
    }
  }
}

function selfTest() {
  const bad = [
    "const onSubmit = async (e) => {",
    "  e.preventDefault();",
    "  await requireDualControl();",
    "  const f = new FormData(e.currentTarget);",
    "};",
  ];
  const good = [
    "const onSubmit = async (e) => {",
    "  const form = e.currentTarget;",
    "  await requireDualControl();",
    "  const f = new FormData(form);",
    "};",
    "const onChange = (e) => setX(e.target.value);",
  ];
  const expected = 1;
  const got = scanLines(bad).length;
  const clean = scanLines(good).length;
  const ok = got === expected && clean === 0;
  console.log(`self-test: buggy=${got} (want ${expected}), clean=${clean} (want 0) -> ${ok ? "PASS" : "FAIL"}`);
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    process.exit(selfTest() ? 0 : 1);
  }
  const roots = argv.filter((a) => !a.startsWith("-"));
  const targets = roots.length ? roots : ["src"];

  const files = [];
  for (const t of targets) collect(t, files);

  const allHits = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const hits = scanLines(text.split(/\r?\n/));
    for (const h of hits) allHits.push({ file, ...h });
  }

  if (allHits.length === 0) {
    console.log(`event-after-await guard: OK (${files.length} file(s) scanned)`);
    return;
  }

  console.error(`event-after-await guard: ${allHits.length} issue(s) found\n`);
  for (const h of allHits) {
    console.error(`  ${h.file}:${h.line}  (handler starts line ${h.start})`);
    console.error(`      ${h.text}`);
  }
  console.error(
    "\nCapture the event value BEFORE the first await, e.g.:\n" +
      "  const form = e.currentTarget;   // then await ...; new FormData(form)\n",
  );
  process.exit(1);
}

main();
