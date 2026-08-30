/**
 * One place to get a Chromium for the offline scripts (sprite bake, dev harness).
 *
 * `puppeteer.launch` cannot drive Edge 151 on Windows: its launcher process
 * **detaches** — it exits 0 immediately while the real browser keeps starting —
 * so puppeteer sees a dead child and throws "Failed to launch the browser
 * process: Code: 0" before the DevTools endpoint ever appears. So we spawn the
 * browser ourselves, wait for it to write DevToolsActivePort into the profile
 * dir, and attach with `puppeteer.connect`.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';

/** A Chromium the machine already has; puppeteer-core ships no browser. */
export function findBrowser() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find(existsSync);
  if (!found) throw new Error('No Chromium browser found. Set PUPPETEER_EXECUTABLE_PATH.');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Spawn a headless Chromium and connect to it.
 * @param {{ args?: string[], timeout?: number }} [opts]
 * @returns {Promise<import('puppeteer-core').Browser>} closing it also kills the
 *   process and removes its throwaway profile.
 */
export async function launchBrowser(opts = {}) {
  const { args = [], timeout = 30000 } = opts;
  const profile = mkdtempSync(join(tmpdir(), 'osrs-td-browser-'));
  const child = spawn(findBrowser(), [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    ...args,
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  const portFile = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + timeout;
  let port = null;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (first) { port = first; break; }
    }
    await sleep(100);
  }
  if (!port) {
    try { process.kill(child.pid); } catch { /* already gone */ }
    throw new Error(`Browser never opened a debugging port (waited ${timeout}ms).`);
  }

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    protocolTimeout: 180000,
  });
  const close = browser.close.bind(browser);
  browser.close = async () => {
    try { await close(); } catch { /* the process may already be down */ }
    try { process.kill(child.pid); } catch { /* already gone */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked; the OS cleans tmp */ }
  };
  return browser;
}
