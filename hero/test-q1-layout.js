const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9433;
const URL = 'http://localhost:8089/index.html';
const SHOTS_DIR = '/Users/vedansh/.gemini/antigravity/brain/47a31b78-ca18-417d-9468-1d23951e2912/shots';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function http(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {}
    await sleep(100);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async ev(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  }
  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${filePath}`);
  }
}

(async () => {
  const user = `/tmp/chrome-q1-${Date.now()}`;
  const ch = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${user}`,
    URL
  ]);

  try {
    const targets = await http(`http://127.0.0.1:${PORT}/json`);
    const pageTarget = targets.find(t => t.type === 'page');
    const cdp = new CDP(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    const viewports = [
      { w: 360, h: 640, label: '360x640' },
      { w: 390, h: 844, label: '390x844' },
      { w: 430, h: 932, label: '430x932' }
    ];

    for (const vp of viewports) {
      console.log(`\n--- Validating Viewport: ${vp.label} ---`);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 2,
        mobile: true
      });
      await cdp.send('Page.navigate', { url: URL });
      await sleep(1000);

      // Open Modal at Step 1 (Q1)
      await cdp.ev(`window.__sbGoToStep('q1')`);
      await sleep(400);

      const metrics = await cdp.ev(`
        (() => {
          const cards = Array.from(document.querySelectorAll('.objective-card'));
          return cards.map((card, idx) => {
            const cardRect = card.getBoundingClientRect();
            const content = card.querySelector('.objective-card-content');
            const contentRect = content.getBoundingClientRect();
            const icon = card.querySelector('.objective-icon-wrap');
            const iconRect = icon.getBoundingClientRect();
            const textStack = card.querySelector('.objective-text-stack');
            const textRect = textStack.getBoundingClientRect();
            const status = card.querySelector('.option-status');
            const statusRect = status.getBoundingClientRect();
            const arrow = card.querySelector('.option-arrow');
            const arrowRect = arrow.getBoundingClientRect();

            // Vertical alignment delta between card center and status center
            const cardCenterY = cardRect.top + cardRect.height / 2;
            const statusCenterY = statusRect.top + statusRect.height / 2;
            const arrowCenterY = arrowRect.top + arrowRect.height / 2;

            return {
              cardIdx: idx + 1,
              title: card.querySelector('.objective-title')?.textContent.trim(),
              cardWidth: Math.round(cardRect.width),
              cardHeight: Math.round(cardRect.height),
              contentRight: Math.round(contentRect.right),
              statusLeft: Math.round(statusRect.left),
              statusRight: Math.round(statusRect.right),
              isTrailingAtRight: statusRect.left >= contentRect.right,
              distanceFromRightEdge: Math.round(cardRect.right - statusRect.right),
              verticallyCenteredCard: Math.abs(cardCenterY - statusCenterY) < 4,
              statusCenterY: Math.round(statusCenterY),
              cardCenterY: Math.round(cardCenterY)
            };
          });
        })()
      `);

      console.log(JSON.stringify(metrics, null, 2));

      // Capture screenshot
      const shotPath = path.join(SHOTS_DIR, `q1-fixed-${vp.label}.png`);
      await cdp.screenshot(shotPath);
    }

    console.log('\nValidation complete!');
    cdp.ws.close();
  } finally {
    ch.kill();
    await sleep(300);
    try { fs.rmSync(user, { recursive: true, force: true }); } catch (e) {}
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
