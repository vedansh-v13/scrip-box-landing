/**
 * Automated test runner using Chrome DevTools Protocol (CDP)
 * Measures viewports, bounding rects, tap targets, and takes exact screenshots.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

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
  console.log('Launching headless Chrome with CDP on port', PORT);
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--user-data-dir=/tmp/chrome-test-profile-' + Date.now()
  ]);

  try {
    const versionInfo = await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
    console.log('Chrome version:', versionInfo.Browser);

    const targets = await waitForHttp(`http://127.0.0.1:${PORT}/json/list`);
    const target = targets.find(t => t.type === 'page') || targets[0];
    const cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const viewports = [
      { w: 390, h: 640 },
      { w: 390, h: 844 },
      { w: 360, h: 640 }
    ];

    const variants = ['a', 'b'];
    const results = [];

    for (const v of variants) {
      for (const vp of viewports) {
        console.log(`\nTesting Variant ${v.toUpperCase()} at ${vp.w}x${vp.h}...`);
        
        // Navigate
        await cdp.send('Page.navigate', { url: `http://localhost:8089/?v=${v}` });
        await sleep(500);

        // Set device metrics
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.w,
          height: vp.h,
          deviceScaleFactor: 2,
          mobile: true
        });
        await sleep(300);

        // Run measurements
        const measurements = await cdp.evaluate(`(() => {
          const trustStrip = document.getElementById('trustStrip');
          const heroSection = document.getElementById('heroSection');
          const trustRect = trustStrip.getBoundingClientRect();
          const heroRect = heroSection.getBoundingClientRect();
          const docW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const docH = document.documentElement.scrollHeight;
          const winH = window.innerHeight;

          // Tap targets
          const targets = [];
          const interactiveElems = document.querySelectorAll('.q1-tile:not(.modal-tile), .cta-button, .back-link, .sticky-cta-btn');
          interactiveElems.forEach(el => {
            if (el.offsetParent !== null) { // visible
              const r = el.getBoundingClientRect();
              targets.push({
                selector: el.className,
                text: el.textContent.trim().replace(/\\s+/g, ' '),
                w: Math.round(r.width * 10) / 10,
                h: Math.round(r.height * 10) / 10
              });
            }
          });

          return {
            windowInnerWidth: winW,
            windowInnerHeight: winH,
            scrollWidth: docW,
            hasHorizontalScroll: docW > winW,
            heroBottom: Math.round(heroRect.bottom * 10) / 10,
            trustStripBottom: Math.round(trustRect.bottom * 10) / 10,
            trustStripTop: Math.round(trustRect.top * 10) / 10,
            tapTargets: targets
          };
        })()`);

        console.log(`  Window: ${measurements.windowInnerWidth}x${measurements.windowInnerHeight}`);
        console.log(`  Horizontal scroll: ${measurements.hasHorizontalScroll ? 'FAIL (overflowing)' : 'PASS (clean)'} (docW=${measurements.scrollWidth})`);
        console.log(`  Trust strip bottom edge: ${measurements.trustStripBottom}px (Limit <= ${vp.h}px -> ${measurements.trustStripBottom <= vp.h ? 'PASS' : 'FAIL'})`);
        console.log(`  Tap targets count: ${measurements.tapTargets.length}`);
        measurements.tapTargets.forEach(t => {
          const pass = t.w >= 44 && t.h >= 44;
          console.log(`    - [${pass ? 'PASS' : 'FAIL'}] ${t.text.slice(0, 30)}: ${t.w}x${t.h}px`);
        });

        // Screenshot
        const screenshotData = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          clip: {
            x: 0,
            y: 0,
            width: vp.w,
            height: vp.h,
            scale: 2
          }
        });

        const shotPath = path.join(__dirname, 'shots', `${v}-${vp.w}x${vp.h}.png`);
        fs.writeFileSync(shotPath, Buffer.from(screenshotData.data, 'base64'));
        console.log(`  Saved screenshot: shots/${v}-${vp.w}x${vp.h}.png`);

        results.push({
          variant: v,
          viewport: `${vp.w}x${vp.h}`,
          ...measurements
        });
      }
    }

    // Save measurement report JSON
    fs.writeFileSync(path.join(__dirname, 'measurements.json'), JSON.stringify(results, null, 2));
    console.log('\nAll tests complete! Results saved to measurements.json');

    cdp.close();
  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
