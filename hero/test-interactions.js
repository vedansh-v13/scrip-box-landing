const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 5000) {
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

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('Testing interactive flows and modal screens...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--window-size=390,640',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now()
  ]);

  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await waitForHttp(`http://127.0.0.1:${PORT}/json/list`);
    const target = targets.find(t => t.type === 'page') || targets[0];
    const cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // 1. Test Variant B click -> opens full-screen Q1
    await cdp.send('Page.navigate', { url: 'http://localhost:8089/?v=b' });
    await sleep(500);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(200);

    // Click CTA button
    await cdp.evaluate(`document.getElementById('btnHeroB').click()`);
    await sleep(300);

    const q1Visible = await cdp.evaluate(`document.getElementById('panelQ1').style.display !== 'none'`);
    console.log('Variant B CTA button click opens Q1 modal:', q1Visible ? 'PASS' : 'FAIL');

    // Capture Q1 modal screenshot
    let shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 390, height: 640, scale: 2 }
    });
    fs.writeFileSync(path.join(__dirname, 'shots', 'b-step-q1-390x640.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved shots/b-step-q1-390x640.png');

    // Click a tile in Q1 -> opens Q2 stub
    await cdp.evaluate(`document.querySelectorAll('.modal-tile')[0].click()`);
    await sleep(400);

    const q2Visible = await cdp.evaluate(`document.getElementById('panelQ2').style.display !== 'none'`);
    console.log('Tile click in Q1 opens Q2 stub:', q2Visible ? 'PASS' : 'FAIL');

    // Capture Q2 stub screenshot
    shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 390, height: 640, scale: 2 }
    });
    fs.writeFileSync(path.join(__dirname, 'shots', 'step-q2-stub-390x640.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved shots/step-q2-stub-390x640.png');

    // 2. Test Sticky CTA on scroll
    await cdp.send('Page.navigate', { url: 'http://localhost:8089/?v=a' });
    await sleep(500);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(200);

    // Scroll down 600px
    await cdp.evaluate(`window.scrollTo(0, 600)`);
    await sleep(400);

    const stickyVisible = await cdp.evaluate(`document.getElementById('stickyCtaBar').classList.contains('is-visible')`);
    console.log('Sticky CTA appears after scrolling down:', stickyVisible ? 'PASS' : 'FAIL');

    shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 390, height: 640, scale: 2 }
    });
    fs.writeFileSync(path.join(__dirname, 'shots', 'a-sticky-cta-scrolled-390x640.png'), Buffer.from(shot.data, 'base64'));
    console.log('Saved shots/a-sticky-cta-scrolled-390x640.png');

    cdp.close();
  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
