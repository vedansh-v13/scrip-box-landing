/**
 * Scripbox PMS - Variant A Validation and Measurement Suite
 * Connects directly to headless Chrome via CDP.
 * Performs element-by-element bottom edge measurement, tap target checks,
 * font-size floor scans, interaction validation, and screenshot capture.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9345;

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
  console.log('=== STARTING VARIANT A VALIDATION SUITE ===\n');

  // Payload measurement
  console.log('--- 1. CRITICAL PAYLOAD MEASUREMENT ---');
  const files = ['index.html', 'style.css', 'app.js'];
  let totalRaw = 0;
  let totalGzip = 0;
  files.forEach(f => {
    const content = fs.readFileSync(path.join(__dirname, f));
    const gz = zlib.gzipSync(content);
    totalRaw += content.length;
    totalGzip += gz.length;
    console.log(`  ${f.padEnd(12)}: raw ${(content.length / 1024).toFixed(2)} KB | gzip ${(gz.length / 1024).toFixed(2)} KB`);
  });
  console.log(`  TOTAL RAW : ${(totalRaw / 1024).toFixed(2)} KB`);
  console.log(`  TOTAL GZIP: ${(totalGzip / 1024).toFixed(2)} KB`);
  console.log(`  Status    : ${(totalRaw / 1024) <= 100 ? 'PASS (<= 100 KB)' : 'FAIL'}\n`);

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--window-size=390,640',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--user-data-dir=/tmp/chrome-refine-' + Date.now()
  ]);

  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
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

    const validationReport = {
      payload: {
        rawKB: (totalRaw / 1024).toFixed(2),
        gzipKB: (totalGzip / 1024).toFixed(2)
      },
      viewports: []
    };

    for (const vp of viewports) {
      console.log(`--- 2. TESTING VIEWPORT ${vp.w}x${vp.h} ---`);
      await cdp.send('Page.navigate', { url: 'http://localhost:8089/?v=a' });
      await sleep(500);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 2,
        mobile: true
      });
      await sleep(300);

      // Measure elements
      const report = await cdp.evaluate(`(() => {
        const getBox = idOrClass => {
          const el = document.querySelector(idOrClass);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            name: idOrClass,
            top: Math.round(r.top * 10) / 10,
            bottom: Math.round(r.bottom * 10) / 10,
            height: Math.round(r.height * 10) / 10,
            width: Math.round(r.width * 10) / 10
          };
        };

        const elements = [
          getBox('.brand-bar'),
          getBox('.hero-headline'),
          getBox('.hero-subhead'),
          getBox('#q1Prompt'),
          getBox('.tiles-grid button:nth-child(1)'),
          getBox('.tiles-grid button:nth-child(2)'),
          getBox('#trustStrip'),
          getBox('#feeLine')
        ];

        // Horizontal overflow check
        const docW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        const hasHScroll = docW > winW;

        // Interactive tap targets
        const tapTargets = [];
        document.querySelectorAll('.q1-card-tile, .q1-tile, .sticky-cta-btn').forEach(el => {
          const r = el.getBoundingClientRect();
          tapTargets.push({
            name: el.className,
            text: el.textContent.trim().replace(/\s+/g, ' '),
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            pass: r.width >= 44 && r.height >= 44
          });
        });

        // Font size check
        const fontCheck = [];
        const heroNodes = document.querySelectorAll('.hero-section *');
        heroNodes.forEach(node => {
          if (node.children.length === 0 && node.textContent.trim()) {
            const fs = parseFloat(window.getComputedStyle(node).fontSize);
            if (fs < 12) {
              fontCheck.push({ text: node.textContent.trim(), size: fs });
            }
          }
        });

        return {
          windowSize: { w: winW, h: window.innerHeight },
          hasHorizontalScroll: hasHScroll,
          elements,
          tapTargets,
          sub12pxViolations: fontCheck,
          feeLineBottom: getBox('#feeLine').bottom
        };
      })()`);

      console.log(`  Window inner size: ${report.windowSize.w}x${report.windowSize.h}`);
      console.log(`  Horizontal scroll: ${report.hasHorizontalScroll ? 'FAIL (overflow)' : 'PASS (0px overflow)'}`);
      console.log(`  Sub-12px violations: ${report.sub12pxViolations.length} found`);
      console.log(`  Element positions:`);
      report.elements.forEach(e => {
        const inFold = e.bottom <= vp.h;
        console.log(`    ${e.name.padEnd(35)}: top=${e.top}px, bottom=${e.bottom}px (${inFold ? 'PASS <= ' + vp.h : 'FAIL'})`);
      });
      console.log(`  Fee line bottom: ${report.feeLineBottom}px (Fold limit: ${vp.h}px -> ${report.feeLineBottom <= vp.h ? 'PASS' : 'FAIL'})`);

      // Screenshot of hero
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: vp.w, height: vp.h, scale: 2 }
      });
      const shotPath = path.join(__dirname, 'shots', `a-${vp.w}x${vp.h}.png`);
      fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
      console.log(`  Saved screenshot: shots/a-${vp.w}x${vp.h}.png\n`);

      validationReport.viewports.push({
        viewport: `${vp.w}x${vp.h}`,
        feeLineBottom: report.feeLineBottom,
        foldPass: report.feeLineBottom <= vp.h,
        hScrollPass: !report.hasHorizontalScroll,
        tapTargetsPass: report.tapTargets.every(t => t.pass),
        sub12pxCount: report.sub12pxViolations.length
      });
    }

    // 3. Interaction Validation (390x640)
    console.log('--- 3. INTERACTION VALIDATION (390x640) ---');
    await cdp.send('Page.navigate', { url: 'http://localhost:8089/?v=a' });
    await sleep(500);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(200);

    // Initial state: sticky CTA should be hidden
    const initialStickyState = await cdp.evaluate(`(() => {
      const bar = document.getElementById('stickyCtaBar');
      return {
        hasIsVisible: bar.classList.contains('is-visible'),
        hasInert: bar.hasAttribute('inert'),
        ariaHidden: bar.getAttribute('aria-hidden'),
        visibility: window.getComputedStyle(bar).visibility
      };
    })()`);
    console.log('  Initial Sticky CTA hidden:', !initialStickyState.hasIsVisible && initialStickyState.visibility === 'hidden' ? 'PASS' : 'FAIL');

    // Click Tile 1
    console.log('  Testing Tile 1 Click...');
    await cdp.evaluate(`document.querySelectorAll('.q1-card-tile, .q1-tile')[0].click()`);
    await sleep(50); // Immediate selection check

    const tile1Selected = await cdp.evaluate(`(() => {
      const t = document.querySelectorAll('.q1-card-tile, .q1-tile')[0];
      return t.classList.contains('is-selected') && t.getAttribute('aria-pressed') === 'true';
    })()`);
    console.log('  Tile 1 marked selected immediately:', tile1Selected ? 'PASS' : 'FAIL');

    // Capture screenshot of selected state before modal opens
    let shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 390, height: 640, scale: 2 }
    });
    fs.writeFileSync(path.join(__dirname, 'shots', 'a-selected-tile-390x640.png'), Buffer.from(shot.data, 'base64'));
    console.log('  Saved shots/a-selected-tile-390x640.png');

    // Wait for stub transition (180ms in app.js)
    await sleep(300);

    const q2StubCheck = await cdp.evaluate(`(() => {
      const overlay = document.getElementById('stepOverlay');
      const q2 = document.getElementById('panelQ2');
      const heading = q2.querySelector('.step-heading').textContent.trim();
      const counter = q2.querySelector('.step-counter').textContent.trim();
      const back = document.getElementById('btnBackFromQ2');
      const backRect = back.getBoundingClientRect();
      return {
        overlayVisible: overlay.style.display !== 'none',
        q2Visible: q2.style.display !== 'none',
        heading,
        headingPass: heading === 'Q2, unchanged from the current flow',
        counter,
        counterPass: counter === '1 of 4',
        backTargetPass: backRect.width >= 44 && backRect.height >= 44
      };
    })()`);
    console.log('  Q2 stub overlay opened:', q2StubCheck.q2Visible ? 'PASS' : 'FAIL');
    console.log('  Q2 heading exact match ("Q2, unchanged from the current flow"):', q2StubCheck.headingPass ? 'PASS' : 'FAIL');
    console.log('  Progress label exact match ("1 of 4"):', q2StubCheck.counterPass ? 'PASS' : 'FAIL');
    console.log('  Back button tap target >= 44px:', q2StubCheck.backTargetPass ? 'PASS' : 'FAIL');

    // Screenshot of Q2 stub
    shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 390, height: 640, scale: 2 }
    });
    fs.writeFileSync(path.join(__dirname, 'shots', 'a-step-q2-stub-390x640.png'), Buffer.from(shot.data, 'base64'));
    console.log('  Saved shots/a-step-q2-stub-390x640.png');

    // Click Back
    console.log('  Clicking Back from Q2 stub...');
    await cdp.evaluate(`document.getElementById('btnBackFromQ2').click()`);
    await sleep(300);

    const backHeroState = await cdp.evaluate(`(() => {
      const overlay = document.getElementById('stepOverlay');
      const tile1 = document.querySelectorAll('.q1-card-tile, .q1-tile')[0];
      return {
        overlayClosed: overlay.style.display === 'none',
        tileStillSelected: tile1.classList.contains('is-selected') && tile1.getAttribute('aria-pressed') === 'true'
      };
    })()`);
    console.log('  Overlay closed after Back:', backHeroState.overlayClosed ? 'PASS' : 'FAIL');
    console.log('  Tile 1 remains selected on Hero (visual confirmation):', backHeroState.tileStillSelected ? 'PASS' : 'FAIL');

    // Test Sticky CTA scroll
    console.log('  Testing Sticky CTA scroll behavior...');
    await cdp.evaluate(`window.scrollTo(0, 600); window.dispatchEvent(new Event('scroll'));`);
    await sleep(400);

    const scrolledStickyState = await cdp.evaluate(`(() => {
      const bar = document.getElementById('stickyCtaBar');
      const btn = document.getElementById('stickyCtaBtn');
      const r = btn.getBoundingClientRect();
      return {
        hasIsVisible: bar.classList.contains('is-visible'),
        hasInert: bar.hasAttribute('inert'),
        ariaHidden: bar.getAttribute('aria-hidden'),
        visibility: window.getComputedStyle(bar).visibility,
        btnTapTargetPass: r.width >= 44 && r.height >= 44
      };
    })()`);
    console.log('  Sticky CTA visible when scrolled past hero:', scrolledStickyState.hasIsVisible && scrolledStickyState.visibility === 'visible' ? 'PASS' : 'FAIL');
    console.log('  Inert removed when visible:', !scrolledStickyState.hasInert ? 'PASS' : 'FAIL');
    console.log('  Sticky button tap target >= 44px:', scrolledStickyState.btnTapTargetPass ? 'PASS' : 'FAIL');

    shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    fs.writeFileSync(path.join(__dirname, 'shots', 'a-sticky-cta-scrolled-390x640.png'), Buffer.from(shot.data, 'base64'));
    console.log('  Saved shots/a-sticky-cta-scrolled-390x640.png');

    // Click Sticky CTA -> Should return to Q1
    console.log('  Clicking Sticky CTA...');
    await cdp.evaluate(`document.getElementById('stickyCtaBtn').click()`);
    await sleep(400);

    const afterStickyClick = await cdp.evaluate(`(() => {
      const q1Rect = document.getElementById('variantASection').getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        q1Top: q1Rect.top,
        q1Visible: q1Rect.top >= 0 && q1Rect.top < window.innerHeight
      };
    })()`);
    console.log('  Sticky CTA returned viewport to Q1:', afterStickyClick.q1Visible ? 'PASS' : 'FAIL');

    // Save test results JSON
    fs.writeFileSync(path.join(__dirname, 'validation-results.json'), JSON.stringify(validationReport, null, 2));
    console.log('\n=== ALL VALIDATION TESTS COMPLETED SUCCESSFULLY ===');

    cdp.close();
  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
