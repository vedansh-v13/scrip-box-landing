const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9355;

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
    const WebSocket = global.WebSocket || require('ws');
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
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

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/chrome-test-ref-optimiser'
  ]);

  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await waitForHttp(`http://127.0.0.1:${PORT}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    // 1. Mobile viewport 390x844
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await client.send('Page.navigate', { url: 'http://localhost:8089/' });
    await sleep(800);

    // Scroll to Optimiser card
    await client.send('Runtime.evaluate', {
      expression: `
        const opt = document.getElementById('strat-optimiser');
        if (opt) opt.scrollIntoView({ behavior: 'instant', block: 'center' });
      `
    });
    await sleep(300);

    // Screenshot closed state
    const ssClosed = await client.send('Page.captureScreenshot', { format: 'png' });
    const shotsDir = path.join(__dirname, 'shots');
    if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });
    
    fs.writeFileSync(path.join(shotsDir, 'ref-optimiser-closed-390x844.png'), Buffer.from(ssClosed.data, 'base64'));
    console.log('Saved: ref-optimiser-closed-390x844.png');

    // Open drawer
    await client.send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('#strat-optimiser .strat-drawer-btn');
        if (btn) btn.click();
      `
    });
    await sleep(300);

    // Scroll so drawer is centered
    await client.send('Runtime.evaluate', {
      expression: `
        const drawer = document.getElementById('drawer-optimiser');
        if (drawer) drawer.scrollIntoView({ behavior: 'instant', block: 'center' });
      `
    });
    await sleep(300);

    const ssDrawer = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shotsDir, 'ref-optimiser-drawer-content-390x844.png'), Buffer.from(ssDrawer.data, 'base64'));
    console.log('Saved: ref-optimiser-drawer-content-390x844.png');

    client.close();
  } finally {
    chromeProcess.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
