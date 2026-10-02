/**
 * Plays every videos/*.yaml script in JupyterLab, one test (and one video) each.
 * See first-model.yaml for the list of available actions.
 */
import { expect, test } from '@jupyterlab/galata';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

type Step = Record<string, any>;
type Cue = { start: number; end: number; text: string };

const PREVIEW = '.jupyterlab-dyno';
const EDITOR = '.jp-FileEditor .cm-content';

/** Type like a human, so viewers can follow. */
async function typeSlowly(page: Page, text: string) {
  await page.keyboard.type(text, { delay: process.env.FAST ? 0 : 90 });
}

/**
 * Give the keyboard back to the file editor (a click in the preview takes it).
 * With `toEnd`, also move the cursor to the end of the file.
 */
async function focusEditor(page: Page, toEnd = false) {
  await page.evaluate(end => {
    const app = (window as any).jupyterapp;
    for (const w of app.shell.widgets('main')) {
      const editor = w.content?.editor;
      if (!editor?.setSelection) {
        continue;
      }
      if (end) {
        const pos = editor.getPositionAt(
          editor.model.sharedModel.getSource().length
        );
        editor.setSelection({ start: pos, end: pos });
      }
      editor.focus();
      return;
    }
  }, toEnd);
}

/** Show a subtitle at the bottom of the page (it is part of the recording). */
async function showSubtitle(page: Page, text: string) {
  await page.evaluate(txt => {
    let el = document.getElementById('demo-subtitle');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-subtitle';
      el.style.cssText =
        'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);' +
        'max-width:80%;padding:8px 16px;border-radius:6px;z-index:100000;' +
        'background:rgba(0,0,0,.75);color:white;font:20px sans-serif;' +
        'text-align:center;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = txt;
  }, text);
}

/**
 * Select the first occurrence of `text` in the open file editor.
 * With `cursorAtLineEnd`, put the cursor at the end of its line instead.
 */
async function selectInEditor(
  page: Page,
  text: string,
  cursorAtLineEnd = false
) {
  const found = await page.evaluate(
    ([txt, lineEnd]) => {
      const app = (window as any).jupyterapp;
      for (const w of app.shell.widgets('main')) {
        const editor = w.content?.editor;
        if (!editor?.setSelection) {
          continue;
        }
        const source: string = editor.model.sharedModel.getSource();
        const offset = source.indexOf(txt);
        if (offset < 0) {
          return false;
        }
        let start = offset;
        let end = offset + txt.length;
        if (lineEnd) {
          const eol = source.indexOf('\n', end);
          start = end = eol < 0 ? source.length : eol;
        }
        editor.setSelection({
          start: editor.getPositionAt(start),
          end: editor.getPositionAt(end)
        });
        editor.focus();
        return true;
      }
      return false;
    },
    [text, cursorAtLineEnd] as const
  );
  if (!found) {
    throw new Error(`"${text}" not found in the editor`);
  }
}

/** Wait until the preview has not changed for a second (re-render done). */
async function waitForPreviewToSettle(page: Page) {
  await page.evaluate(
    selector =>
      new Promise<void>(resolve => {
        const root = document.querySelector(selector) ?? document.body;
        let timer = setTimeout(done, 1000);
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, 1000);
        });
        observer.observe(root, {
          childList: true,
          subtree: true,
          characterData: true
        });
        const deadline = setTimeout(done, 30_000);
        function done() {
          observer.disconnect();
          clearTimeout(deadline);
          resolve();
        }
      }),
    PREVIEW
  );
}

function writeSrt(file: string, cues: Cue[]) {
  const ts = (ms: number) => {
    const d = new Date(ms).toISOString(); // 1970-01-01T00:00:01.234Z
    return `${d.substring(11, 19)},${d.substring(20, 23)}`;
  };
  const body = cues
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`)
    .join('\n');
  fs.writeFileSync(file, body);
}

/**
 * Show a title page on a blank page, then fade it out to white: JupyterLab's
 * loading screen, which comes next, is white too.
 */
async function showTitle(page: Page, title: string, subtitle?: string) {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  await page.setContent(`
    <body style="margin:0;height:100vh;display:flex;flex-direction:column;
                 align-items:center;justify-content:center;background:white;
                 font-family:sans-serif;color:#222">
      <div id="title" style="text-align:center;transition:opacity 1s">
        <div style="font-size:44px;font-weight:600">${escape(title)}</div>
        <div style="font-size:26px;color:#666;margin-top:18px">
          ${subtitle ? escape(subtitle) : ''}
        </div>
      </div>
    </body>`);
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    document.getElementById('title')!.style.opacity = '0';
  });
  await page.waitForTimeout(1200);
}

const scripts = fs
  .readdirSync(__dirname)
  .filter(f => f.endsWith('.yaml'))
  .sort();

// Load JupyterLab ourselves, so that a title page can come first.
test.use({ autoGoto: false });

for (const file of scripts) {
  const name = path.basename(file, '.yaml');

  test(name, async ({ page, tmpPath }) => {
    const { title, subtitle, steps } = parse(
      fs.readFileSync(path.join(__dirname, file), 'utf-8')
    ) as { title?: string; subtitle?: string; steps: Step[] };
    const cues: Cue[] = [];
    const t0 = Date.now();
    const preview = page.locator(PREVIEW).first();

    if (title) {
      await showTitle(page, title, subtitle);
    }
    await page.goto();
    await page.filebrowser.openDirectory(tmpPath);

    for (const step of steps) {
      if ('say' in step) {
        const hold = (step.hold ?? 2.5) * 1000;
        const start = Date.now() - t0;
        if (cues.length) {
          cues[cues.length - 1].end = start;
        }
        cues.push({ start, end: start + hold, text: step.say });
        await showSubtitle(page, step.say);
        await page.waitForTimeout(hold);
      } else if ('new_file' in step) {
        await page.click('.jp-DirListing-content', { button: 'right' });
        await page.getByRole('menuitem', { name: 'New File' }).click();
        const rename = page.locator('.jp-DirListing-editor');
        await rename.waitFor();
        await rename.selectText();
        await typeSlowly(page, step.new_file);
        await page.keyboard.press('Enter');
        // JupyterLab asks for confirmation when the extension changes.
        const accept = page.locator('.jp-Dialog .jp-mod-accept');
        if (await accept.isVisible({ timeout: 2000 }).catch(() => false)) {
          await accept.click();
        }
      } else if ('open' in step) {
        await page
          .locator('.jp-DirListing-item', { hasText: step.open })
          .dblclick();
        await expect(page.locator(EDITOR).first()).toBeVisible();
        await expect(preview).toBeVisible();
        // JupyterLab reopens a Launcher whenever the main area is empty: drop it.
        const launcher = page
          .locator('.lm-TabBar-tab', { hasText: 'Launcher' })
          .locator('.lm-TabBar-tabCloseIcon');
        if (await launcher.count()) {
          await launcher.first().click();
        }
        // Room below the report, so that its last card can scroll above the
        // subtitles (recording only).
        await page.addStyleTag({
          content: `${PREVIEW} .jp-OutputArea { padding-bottom: 140px; }`
        });
        // Hide the file browser (click its sidebar icon), to give the editor
        // and the preview more room.
        await page
          .locator('.jp-SideBar.jp-mod-left .lm-TabBar-tab[data-id="filebrowser"]')
          .click();
        await page.locator(EDITOR).first().click();
      } else if ('type' in step) {
        await focusEditor(page);
        await typeSlowly(page, String(step.type));
      } else if ('key' in step) {
        await focusEditor(page);
        const keys = Array.isArray(step.key) ? step.key : [step.key];
        for (const k of keys) {
          await page.keyboard.press(k);
          await page.waitForTimeout(150);
        }
      } else if ('select' in step) {
        await selectInEditor(page, String(step.select));
      } else if ('goto' in step) {
        if (step.goto === 'end') {
          await focusEditor(page, true);
        } else {
          await selectInEditor(page, String(step.goto), true);
        }
      } else if ('replace' in step) {
        // Only retype what changes: 'rho <- 0.9' -> 'rho <- 0.5' retypes '9'.
        const from = String(step.replace);
        const to = String(step.with);
        let common = 0;
        while (common < from.length && from[common] === to[common]) {
          common++;
        }
        await selectInEditor(page, from);
        await page.keyboard.press('ArrowRight'); // collapse to the end of `from`
        for (let i = 0; i < from.length - common; i++) {
          await page.keyboard.press('Shift+ArrowLeft');
        }
        await page.waitForTimeout(500);
        if (to.length > common) {
          await typeSlowly(page, to.slice(common));
        } else {
          await page.keyboard.press('Backspace');
        }
      } else if ('save' in step) {
        await focusEditor(page);
        await page.keyboard.press('Control+s');
      } else if ('click' in step) {
        // A re-render would collapse the card again: let it finish first.
        await waitForPreviewToSettle(page);
        // Prefer a collapsible section title, then any exact text.
        const summary = preview.locator('summary', { hasText: step.click });
        const target = (await summary.count())
          ? summary.first()
          : preview.getByText(String(step.click), { exact: true }).first();
        await expect(target).toBeVisible({ timeout: 60_000 });
        await target.click();
      } else if ('scroll_to' in step) {
        // Smoothly bring some text, or a CSS selector like .dyno-plot, into view.
        const target = String(step.scroll_to).startsWith('.')
          ? preview.locator(step.scroll_to).first()
          : preview.getByText(String(step.scroll_to)).first();
        await waitForPreviewToSettle(page);
        await expect(target).toBeAttached({ timeout: 60_000 });
        // `align: start` puts it at the top, to show what follows it.
        await target.evaluate(
          (el, block) => el.scrollIntoView({ behavior: 'smooth', block }),
          (step.align ?? 'center') as ScrollLogicalPosition
        );
        await page.waitForTimeout(1000);
      } else if ('walk' in step) {
        // The dyno walks to the sunset, on a line below the subtitle.
        const seconds = Number(step.walk);
        const dots = 17;
        await page.evaluate(
          ([n, ms]) =>
            new Promise<void>(resolve => {
              const el = document.createElement('div');
              el.style.cssText =
                'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);' +
                'z-index:100000;font:28px sans-serif;white-space:pre;' +
                'padding:4px 16px;border-radius:6px;pointer-events:none;' +
                'background:rgba(0,0,0,.75);color:white';
              document.body.appendChild(el);
              let i = 0;
              const draw = () => {
                el.textContent =
                  '. '.repeat(i) + '🦖' + ' .'.repeat(n - i) + ' 🌇';
              };
              draw();
              const timer = setInterval(() => {
                i++;
                draw();
                if (i >= n) {
                  clearInterval(timer);
                  resolve();
                }
              }, ms / n);
            }),
          [dots, seconds * 1000] as const
        );
        await page.waitForTimeout(1500);
        // Keep the last subtitle on until the end of the walk.
        if (cues.length) {
          cues[cues.length - 1].end = Date.now() - t0;
        }
      } else if ('dump' in step) {
        // Development aid: save the preview text, to find what to point at.
        fs.writeFileSync(
          path.join(__dirname, `${name}.${step.dump}.txt`),
          await preview.innerText()
        );
        fs.writeFileSync(
          path.join(__dirname, `${name}.${step.dump}.html`),
          await preview.innerHTML()
        );
      } else if ('expect' in step) {
        await expect(
          preview.getByText(String(step.expect)).first()
        ).toBeVisible({ timeout: 60_000 });
      } else if ('wait' in step) {
        await page.waitForTimeout(step.wait * 1000);
      } else {
        throw new Error(`${file}: unknown step ${JSON.stringify(step)}`);
      }
    }

    writeSrt(path.join(__dirname, `${name}.srt`), cues);
  });
}
