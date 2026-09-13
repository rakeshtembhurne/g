# g — ask Google AI Mode from your terminal

`g` turns your terminal into a thin client for Google's AI Mode. Type a question and it:

1. opens the AI Mode page in a browser tab,
2. waits for the answer to finish streaming,
3. clicks the page's own **Copy text** button,
4. prints the answer — formatted — in your terminal.

The answer also stays on your clipboard, ready to paste.

No API keys. No headless browser. No automation framework. It drives Safari (or Brave)
through macOS AppleScript, using the Google session you are already logged into.

```
$ g what is the capital of France
→ Google AI Mode · what is the capital of France
✓ answer in 5.3s · copied to clipboard

The capital of France is Paris. It is the country's largest city and its political,
economic, and cultural centre, with an estimated city population of 2.04 million.
```

## Requirements

- **macOS** (drives Safari/Brave via AppleScript — there is no Linux/Windows path)
- **[Bun](https://bun.sh) ≥ 1.0**
- **Safari or [Brave](https://brave.com)** (Chrome works too — see Troubleshooting)
- A **Google account** logged into that browser
- **"Allow JavaScript from Apple Events" enabled:**
  - **Safari** → *Settings ▸ Advanced* → tick **Show features for web developers**, then **Develop ▸ Allow JavaScript from Apple Events**
  - **Brave** → **View ▸ Developer ▸ Allow JavaScript from Apple Events**, then **fully quit and reopen Brave** (Chromium only reads this setting at launch)

## Install

### From a clone (recommended)

```sh
git clone git@github.com:rakeshtembhurne/g.git
cd g
./install.sh
```

`install.sh` symlinks `g.ts` into `~/.local/bin` (it will back up anything already
sitting at that path rather than overwrite it), and warns you if that directory isn't
on your `PATH`.

Other options:

```sh
./install.sh --copy              # copy instead of symlink
./install.sh --dir ~/bin         # install somewhere else
./install.sh --zsh-history       # also keep `g ...` out of your shell history (see below)
./install.sh --help
```

### As a Bun global package

```sh
bun install -g .
```

### Manual

Put `g.ts` anywhere on your `PATH`, name it `g`, and make it executable:

```sh
cp g.ts ~/.local/bin/g && chmod +x ~/.local/bin/g
```

## Usage

```
g [options] <question>
```

| Flag | Description |
| --- | --- |
| `-b, --browser <safari\|brave>` | Which browser to drive (default: `$G_BROWSER`, else `safari`) |
| `-c, --close` | Close the tab once the answer is captured |
| `-r, --raw` | Print raw markdown (automatic when piping or redirecting) |
| `-t, --timeout <seconds>` | How long to wait for the answer (default: `60`) |
| `-h, --help` | Show help |

```sh
g explain rust lifetimes in one paragraph
g -c what is 2+2                                 # close the tab when done
g -b brave why is the sky blue                   # drive Brave
g -r "summarize this" > answer.md                # raw markdown to a file
g "give me a git cheat sheet" | pbcopy           # into the clipboard
g                                                # bare `g` just opens AI Mode
```

Output is colourised and formatted (headings, bullets, tables, clickable links) on a
terminal. When stdout is *not* a terminal — a pipe or a redirect — `g` automatically
emits raw markdown instead, so it stays scriptable.

## Keeping queries out of your shell history

Your questions can be personal. `zsh-history.zsh` defines the `zshaddhistory` hook so
that `g`, `g ...`, and `google_ai_search ...` are never written to history.

Install it with:

```sh
./install.sh --zsh-history
```

This appends it to `~/.zshrc` (with a `.bak` backup). To do it yourself instead:

```zsh
source /path/to/g/zsh-history.zsh
```

> If you already define your own `zshaddhistory`, merge the `case` block into it —
> sourcing this file would otherwise replace your version.

## How it works

- Builds `https://www.google.com/search?aep=11&udm=50&q=<encoded question>`.
- `osascript` opens it and captures a reference to the new **tab**. A tab reference
  (unlike a document reference) survives page navigation and is unaffected by you
  switching tabs while the answer streams.
- A loop injects a tiny JS probe each second. The probe looks for a button with
  `aria-label="Copy text"` and reports the answer element's `innerText` length. The
  loop exits once two consecutive reads are identical — i.e. the answer has stopped
  streaming.
- It clicks that button, writes a clipboard sentinel first, then reads the clipboard
  with `pbpaste`. If the clipboard didn't change, it falls back to the answer text
  scraped straight from the page.
- Prints Google's exact markdown. Because the page's own copy button is the source of
  truth, links and citations survive — a DOM scrape would lose them.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `JavaScript from Apple Events is disabled` | Enable it (see Requirements). **Restart Brave** after enabling. |
| `macOS blocked AppleScript control of your browser` | System Settings ▸ Privacy & Security ▸ **Automation** → allow your terminal to control Safari/Brave. |
| `No answer within Ns` | AI Mode may be unavailable for the account/region, or the page is slow. Raise `-t 120`. |
| `no "Copy text" button was found` | Google changed its UI. Please open an issue with the page you saw. |
| Nothing copied, `scraped from page` shown | The copy button was clicked but the clipboard didn't change; the fallback scrape was used instead. Usually harmless. |
| Want Chrome | Change `Brave Browser` to `Google Chrome` in `g.ts` (`buildScript` + the `app` constant), or open an issue. |

## Limitations

- **macOS only.**
- Depends on Google's AI Mode DOM — specifically a `button[aria-label="Copy text"]`.
  If Google renames it, `g` needs an update.
- It drives a **real, visible browser tab**; the browser must be able to run
  `osascript` JavaScript (see Requirements).
- Not affiliated with Google. Heavy use may hit Google's rate limits — be reasonable.

## Development

Everything lives in one file, `g.ts` (~400 lines). Run it straight from the repo:

```sh
bun run g.ts "hello"
```

No dependencies, no build step. The only external contracts are AppleScript and the
AI Mode copy button.

## License

MIT © 2026 Rakesh Tembhurne — see [LICENSE](LICENSE).
