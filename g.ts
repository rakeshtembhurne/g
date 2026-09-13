#!/usr/bin/env bun
/**
 * g — ask Google AI Mode and print the answer in your terminal.
 *
 * It opens the AI Mode page in your browser, waits until the answer finishes
 * streaming, clicks the page's own "Copy text" button, then reads the answer
 * off the clipboard. Zero dependencies beyond Bun + macOS AppleScript.
 *
 * Usage:
 *   g what is the capital of France
 *   g -k explain rust lifetimes          # keep the tab open (default: close it)
 *   g -r how do generators work          # raw markdown (for piping/redirects)
 *   g -b brave why is the sky blue       # drive Brave instead of Safari
 *
 * Env:
 *   G_BROWSER=safari|brave     default browser (default: safari)
 */

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

type Args = {
  query: string;
  browser: "safari" | "brave";
  keep: boolean;
  raw: boolean;
  timeout: number;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    query: "",
    browser: (process.env.G_BROWSER as Args["browser"]) || "safari",
    keep: false,
    raw: false,
    timeout: 60,
    help: false,
  };
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "-k" || a === "--keep") out.keep = true;
    else if (a === "-r" || a === "--raw") out.raw = true;
    else if (a === "-b" || a === "--browser") out.browser = (argv[++i] as Args["browser"]) ?? "safari";
    else if (a === "-t" || a === "--timeout") out.timeout = Number(argv[++i]) || 60;
    else words.push(a);
  }
  out.query = words.join(" ").trim();
  if (out.browser !== "safari" && out.browser !== "brave") out.browser = "safari";
  return out;
}

const USAGE = `g — ask Google AI Mode from your terminal

Usage:
  g [options] <question>

Options:
  -b, --browser <safari|brave>  Which browser to drive (default: $G_BROWSER or safari)
  -k, --keep                    Keep the tab open (default: the tab is closed)
  -r, --raw                     Print raw markdown (auto when piping/redirecting)
  -t, --timeout <seconds>       How long to wait for the answer (default: 60)
  -h, --help                    Show this help

Examples:
  g what is the capital of France
  g -k explain rust lifetimes
  g -r summarize this article | pbcopy
`;

// ---------------------------------------------------------------------------
// ANSI + markdown rendering
// ---------------------------------------------------------------------------

const tty = !!process.stdout.isTTY;
const color = tty && !process.env.NO_COLOR;
const sgr = (n: string, s: string) => (color ? `\x1b[${n}m${s}\x1b[0m` : s);

const bold = (s: string) => sgr("1", s);
const dim = (s: string) => sgr("2", s);
const italic = (s: string) => sgr("3", s);
const uline = (s: string) => sgr("4", s);
const cyan = (s: string) => sgr("36", s);
const green = (s: string) => sgr("32", s);
const magenta = (s: string) => sgr("35", s);
const yellow = (s: string) => sgr("33", s);
const strike = (s: string) => sgr("9", s);

// OSC-8 clickable links (Ghostty, iTerm2, WezTerm, Kitty, VS Code…)
const osc8 = color && !["Apple_Terminal"].includes(process.env.TERM_PROGRAM || "");
const link = (text: string, url: string) =>
  osc8 ? `\x1b]8;;${url}\x1b\\${uline(cyan(text))}\x1b]8;;\x1b\\` : uline(cyan(text));

function inline(s: string): string {
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, t: string) => {
    codes.push(t);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => (t ? link(t, u) : ""));
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, t: string) => bold(t));
  s = s.replace(/__([^_]+)__/g, (_m, t: string) => bold(t));
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_m, p: string, t: string) => p + italic(t));
  s = s.replace(/~~([^~]+)~~/g, (_m, t: string) => strike(t));
  s = s.replace(/\[(\d+)\]/g, (_m, n: string) => dim(`[${n}]`));
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => yellow(codes[+i] ?? ""));
  return s;
}

function renderTable(rows: string[]): string[] {
  const parse = (l: string) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());
  const isSep = (l: string) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l);
  // Width is measured on the *displayed* text, not the raw markdown.
  const disp = (s: string) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "");
  const hasHeader = rows.length >= 2 && isSep(rows[1]);
  const header = hasHeader ? parse(rows[0]) : null;
  const body = (hasHeader ? rows.slice(2) : rows).map(parse);
  const cols = Math.max(header?.length ?? 0, ...body.map((r) => r.length), 1);
  const width = Array.from({ length: cols }, (_, c) =>
    Math.max(disp(header?.[c] ?? "").length, ...body.map((r) => disp(r[c] ?? "").length)),
  );
  const fmt = (r: string[], head: boolean) =>
    dim("│ ") +
    Array.from({ length: cols }, (_, c) => {
      const t = r[c] ?? "";
      const pad = " ".repeat(Math.max(0, width[c] - disp(t).length));
      return (head ? bold(disp(t)) : inline(t)) + pad;
    }).join(dim(" │ ")) +
    dim(" │");
  const out: string[] = [];
  if (header) {
    out.push(fmt(header, true));
    out.push(dim("├" + width.map((w) => "─".repeat(w + 2)).join("┼") + "┤"));
  }
  for (const r of body) out.push(fmt(r, false));
  return out;
}

function render(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let fence = false;
  let table: string[] = [];
  const flushTable = () => {
    if (table.length) {
      out.push(...renderTable(table));
      table = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    const f = line.match(/^\s*```+\s*([\w+-]*)\s*$/);
    if (f) {
      flushTable();
      if (!fence) {
        fence = true;
        out.push(dim("  ┌" + (f[1] ? ` ${f[1]}` : "")));
      } else {
        fence = false;
        out.push(dim("  └"));
      }
      continue;
    }
    if (fence) {
      out.push(dim("  │ ") + green(raw));
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      table.push(line);
      continue;
    }
    flushTable();

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const t = inline(h[2]);
      out.push("");
      out.push(h[1].length <= 2 ? bold(magenta(t)) : bold(cyan(t)));
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push(dim("─".repeat(Math.min(process.stdout.columns || 80, 80))));
      continue;
    }

    // Google emits stray empty list markers; drop them.
    if (/^\s*[-*+]\s*$/.test(line)) continue;

    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      out.push(dim("│ ") + italic(inline(bq[1])));
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      out.push("  ".repeat(Math.floor(bullet[1].length / 2)) + cyan("•") + " " + inline(bullet[2]));
      continue;
    }

    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      out.push("  ".repeat(Math.floor(ordered[1].length / 2)) + cyan(ordered[2] + ".") + " " + inline(ordered[3]));
      continue;
    }

    out.push(inline(line));
  }
  flushTable();
  if (fence) out.push(dim("  └"));
  return out.join("\n").trim();
}

// ---------------------------------------------------------------------------
// AppleScript bridge
// ---------------------------------------------------------------------------

// JS payloads: deliberately single-line, no double quotes and no backslashes so
// they embed safely inside an AppleScript string literal.
const PROBE_JS =
  "(function(){var bs=[].slice.call(document.querySelectorAll('button'));var c=null;" +
  "for(var i=0;i<bs.length;i++){var a=bs[i].getAttribute('aria-label')||'';" +
  "if(a==='Copy text'&&!bs[i].disabled){c=bs[i];break;}}var busy=document.querySelector('[aria-busy=true]')?1:0;" +
  "if(!c)return 'WAIT:'+busy;var el=c;for(var j=0;j<9;j++){if(el.parentElement)el=el.parentElement;}" +
  "var t=el?el.innerText:'';return 'READY:'+t.length;})()";

const CLICK_JS =
  "(function(){var bs=[].slice.call(document.querySelectorAll('button'));" +
  "for(var i=0;i<bs.length;i++){var a=bs[i].getAttribute('aria-label')||'';" +
  "if(a==='Copy text'&&!bs[i].disabled){bs[i].click();return 'CLICKED';}}return 'NO_BTN';})()";

const EXTRACT_JS =
  "(function(){var bs=[].slice.call(document.querySelectorAll('button'));var c=null;" +
  "for(var i=0;i<bs.length;i++){var a=bs[i].getAttribute('aria-label')||'';" +
  "if(a==='Copy text'){c=bs[i];break;}}if(!c)return '';var el=c;" +
  "for(var j=0;j<10;j++){if(el.parentElement)el=el.parentElement;}return el?el.innerText:'';})()";

function buildScript(browser: Args["browser"], url: string, timeout: number, doClose: boolean): string {
  // Capture a *tab* reference once: unlike a document reference it survives the
  // page navigating, and unlike "front document" it can't be affected by the
  // user switching tabs while the answer streams.
  const exec =
    browser === "safari"
      ? (js: string) => `do JavaScript "${js}" in theTab`
      : (js: string) => `execute theTab javascript "${js}"`;
  const app = browser === "safari" ? "Safari" : "Brave Browser";
  const open =
    browser === "safari"
      ? `  open location "${url}"\n  set theTab to current tab of front window`
      : `  if (count of windows) is 0 then make new window\n  open location "${url}"\n  delay 1\n  set theTab to active tab of front window`;
  const closeLine = doClose ? "\n  close theTab" : "";

  return `tell application "${app}"
  activate
${open}
  set readySeen to 0
  set prev to ""
  repeat ${Math.max(5, Math.ceil(timeout))} times
    set s to ${exec(PROBE_JS)}
    if s starts with "READY" then
      if s is prev then set readySeen to readySeen + 1
      set prev to s
      if readySeen is greater than or equal to 1 then exit repeat
    else
      set prev to s
    end if
    delay 1
  end repeat
  if prev does not start with "READY" then return "TIMEOUT"
  set cr to ${exec(CLICK_JS)}
  if cr is not "CLICKED" then return "NO_BTN"
  delay 1
  set domText to ${exec(EXTRACT_JS)}${closeLine}
  return "COPIED" & linefeed & domText
end tell`;
}

async function runOsa(src: string, spinner: boolean): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["osascript", "-e", src], { stdout: "pipe", stderr: "pipe" });
  let tick = 0;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const timer = spinner
    ? setInterval(() => process.stderr.write(`\r${dim(frames[tick++ % frames.length])} waiting for the answer…`), 90)
    : null;
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (timer) {
    clearInterval(timer);
    process.stderr.write("\r" + " ".repeat(34) + "\r");
  }
  return { code, out: out.replace(/\n$/, ""), err: err.trim() };
}

function appleScriptHelp(err: string): string | null {
  if (/turned off|Allow JavaScript from Apple Events/i.test(err)) {
    return `${yellow("JavaScript from Apple Events is disabled.")}

  Brave:  View ▸ Developer ▸ Allow JavaScript from Apple Events   (then restart Brave)
  Safari: Settings ▸ Advanced ▸ “Show features for web developers”,
          then Develop ▸ Allow JavaScript from Apple Events`;
  }
  if (/-1743|Not authorized|not allowed to send Apple events/i.test(err)) {
    return `${yellow("macOS blocked AppleScript control of your browser.")}

  Open System Settings ▸ Privacy & Security ▸ Automation and allow your
  terminal app to control Safari / Brave Browser.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const app = args.browser === "safari" ? "Safari" : "Brave Browser";

if (args.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

// Bare `g` just opens AI Mode, exactly like the old shortcut did.
if (!args.query) {
  const home = "https://www.google.com/search?aep=11&udm=50";
  await runOsa(`tell application "${app}"\n  activate\n  open location "${home}"\nend tell`, false);
  process.stderr.write(`${dim("→")} opened Google AI Mode in ${app}\n`);
  process.exit(0);
}

const url = `https://www.google.com/search?aep=11&udm=50&q=${encodeURIComponent(args.query)}`;
const started = Date.now();

// Plant a sentinel BEFORE the page's copy button fires, so afterwards we can tell
// whether the real answer landed on the clipboard.
const sentinel = `G_SENTINEL_${Date.now()}_${Math.random().toString(36).slice(2)}`;
Bun.spawnSync(["pbcopy"], { stdin: new TextEncoder().encode(sentinel) });

process.stderr.write(`${dim("→")} Google AI Mode ${dim("·")} ${bold(args.query)}\n`);

const res = await runOsa(buildScript(args.browser, url, args.timeout, !args.keep), true);

if (res.code !== 0) {
  const help = appleScriptHelp(res.err);
  process.stderr.write(`${yellow("✗")} ${help ?? (res.err || "osascript failed")}\n`);
  process.exit(1);
}

if (res.out === "TIMEOUT") {
  process.stderr.write(`${yellow("✗")} No answer within ${args.timeout}s. The page may still be loading, or AI Mode isn't available in ${args.browser}.\n`);
  process.exit(1);
}
if (res.out === "NO_BTN") {
  process.stderr.write(`${yellow("✗")} Answer looked ready but no “Copy text” button was found (Google may have changed the UI).\n`);
  process.exit(1);
}

const [status, ...domParts] = res.out.split("\n");
const domText = domParts.join("\n");
if (status !== "COPIED") {
  process.stderr.write(`${yellow("✗")} Unexpected result: ${res.out.slice(0, 120)}\n`);
  process.exit(1);
}

// Pull the real markdown off the clipboard; fall back to scraped page text.
let clip = "";
for (let i = 0; i < 12; i++) {
  clip = new TextDecoder().decode(Bun.spawnSync(["pbpaste"]).stdout).trim();
  if (clip && clip !== sentinel) break;
  await Bun.sleep(300);
}

const fromClipboard = clip !== sentinel && clip.length > 0;
const answer = fromClipboard ? clip : domText.trim();

if (!answer) {
  process.stderr.write(`${yellow("✗")} Captured nothing. The copy button may not have worked.\n`);
  process.exit(1);
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
process.stderr.write(
  `${green("✓")} answer in ${secs}s ${dim("·")} ${fromClipboard ? "copied to clipboard" : "scraped from page"}\n\n`,
);

process.stdout.write((args.raw || !tty ? answer : render(answer)) + "\n");
