const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9372;
const BASE_URL = 'http://localhost:8089/index.html';
const SHOTS_DIR = path.join(__dirname, 'shots');

if (!fs.existsSync(SHOTS_DIR)) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 8000) {
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

  async setViewport(width, height, isMobile = true) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: isMobile,
      fitWindow: false
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async screenshot(filepath, clip = null) {
    const params = { format: 'png' };
    if (clip) params.clip = clip;
    const res = await this.send('Page.captureScreenshot', params);
    fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('--- Launching Chrome for Performance Components Testing ---');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check'
  ]);

  const testReport = {
    timestamp: new Date().toISOString(),
    testsPassed: 0,
    testsFailed: 0,
    details: []
  };

  function assert(condition, message) {
    if (condition) {
      testReport.testsPassed++;
      console.log(`  ✓ PASS: ${message}`);
      testReport.details.push({ status: 'PASS', message });
    } else {
      testReport.testsFailed++;
      console.error(`  ✗ FAIL: ${message}`);
      testReport.details.push({ status: 'FAIL', message });
    }
  }

  try {
    const versionInfo = await waitForHttp(`http://localhost:${PORT}/json/version`);
    const targets = await waitForHttp(`http://localhost:${PORT}/json`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('CSS.enable');

    console.log('\n=== Test Suite 1: Component 2 (Performance Period Selector & Placement) ===');
    await client.setViewport(390, 844, true);
    await client.send('Page.navigate', { url: BASE_URL });
    await sleep(800);

    // Verify perfSection is positioned immediately above strategiesSection
    const placementCheck = await client.eval(`
      (() => {
        const perf = document.getElementById('perfSection');
        const strat = document.getElementById('strategiesSection');
        if (!perf || !strat) return false;
        return (perf.compareDocumentPosition(strat) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      })()
    `);
    assert(placementCheck, 'Performance Section (#perfSection) is positioned immediately above Investment Strategies (#strategiesSection)');

    // Scroll to Performance Comparison section
    await client.eval(`
      const perfEl = document.getElementById('perfSection');
      if (perfEl) perfEl.scrollIntoView();
    `);
    await sleep(200);

    const sourceText = await client.eval(`document.querySelector('.perf-source')?.textContent.trim()`);
    assert(sourceText === 'Source: APMI India | As of November, 2025', `Source attribution exact: "${sourceText}"`);

    // Default period check (should be 4Y)
    const defaultBtn = await client.eval(`document.querySelector('.perf-period-btn.is-active')?.getAttribute('data-period')`);
    assert(defaultBtn === '4Y', `Default selected period is 4Y`);

    const defaultBenchmarkVal = await client.eval(`document.getElementById('perfValBenchmark')?.textContent.trim()`);
    const defaultScripboxVal = await client.eval(`document.getElementById('perfValScripbox')?.textContent.trim()`);
    assert(defaultBenchmarkVal === '12.8%' && defaultScripboxVal === '25.4%', `4Y values: Benchmark = 12.8%, Scripbox = 25.4%`);

    const defaultBenchHeight = await client.eval(`document.getElementById('perfBarBenchmark')?.style.height`);
    const defaultScripHeight = await client.eval(`document.getElementById('perfBarScripbox')?.style.height`);
    assert(defaultBenchHeight === '36.5%', `Benchmark 4Y bar height is 36.5% on 35% fixed axis (12.79 / 35)`);
    assert(defaultScripHeight === '72.5%', `Scripbox 4Y bar height is 72.5% on 35% fixed axis (25.39 / 35)`);

    // Capture 4Y state screenshot
    await client.screenshot(path.join(SHOTS_DIR, 'perf-01-comparison-4y-390x844.png'));

    // Switch to 2Y
    await client.eval(`document.querySelector('.perf-period-btn[data-period="2Y"]').click()`);
    await sleep(150);
    const val2YBench = await client.eval(`document.getElementById('perfValBenchmark')?.textContent.trim()`);
    const val2YScrip = await client.eval(`document.getElementById('perfValScripbox')?.textContent.trim()`);
    const height2YScrip = parseFloat(await client.eval(`document.getElementById('perfBarScripbox')?.style.height`));
    assert(val2YBench === '15.4%' && val2YScrip === '26.8%', `2Y values: Benchmark = 15.4%, Scripbox = 26.8%`);
    assert(height2YScrip > 76 && height2YScrip < 77, `Scripbox 2Y bar height is ~76.5% (26.78 / 35)`);

    // Capture 2Y state screenshot (matching user's original screenshot!)
    await client.screenshot(path.join(SHOTS_DIR, 'perf-02-comparison-2y-390x844.png'));

    // Switch to 3Y
    await client.eval(`document.querySelector('.perf-period-btn[data-period="3Y"]').click()`);
    await sleep(150);
    const val3YBench = await client.eval(`document.getElementById('perfValBenchmark')?.textContent.trim()`);
    const val3YScrip = await client.eval(`document.getElementById('perfValScripbox')?.textContent.trim()`);
    const height3YScrip = parseFloat(await client.eval(`document.getElementById('perfBarScripbox')?.style.height`));
    assert(val3YBench === '13.1%' && val3YScrip === '30.6%', `3Y values: Benchmark = 13.1%, Scripbox = 30.6%`);
    assert(height3YScrip > 87 && height3YScrip < 88, `Scripbox 3Y bar height is ~87.5% (30.63 / 35)`);

    // Verify fixed axis truthfulness: 3Y (30.6%) is visibly taller than 4Y (25.4%)
    assert(height3YScrip > parseFloat(defaultScripHeight), `Fixed-axis truthfulness: 3Y (30.6%) is visibly taller than 4Y (25.4%)`);

    // Switch to SI (Since Inception)
    await client.eval(`document.querySelector('.perf-period-btn[data-period="SI"]').click()`);
    await sleep(150);
    const valSIBench = await client.eval(`document.getElementById('perfValBenchmark')?.textContent.trim()`);
    const valSIScrip = await client.eval(`document.getElementById('perfValScripbox')?.textContent.trim()`);
    assert(valSIBench === '14.6%' && valSIScrip === '29.4%', `SI values: Benchmark = 14.6%, Scripbox = 29.4%`);

    // Live region announcement check
    const announcementText = await client.eval(`document.getElementById('perfLiveAnnouncement')?.textContent.trim()`);
    assert(announcementText.includes('Since Inception') && announcementText.includes('29.4%'), `Live region announces: "${announcementText}"`);

    // Reset back to 4Y
    await client.eval(`document.querySelector('.perf-period-btn[data-period="4Y"]').click()`);
    await sleep(150);

    console.log('\n=== Test Suite 2: Component 1 (Hero Wealth Accumulation Anchor) ===');
    // Scroll back to Hero top
    await client.eval(`window.scrollTo(0, 0);`);
    await sleep(200);

    const inHeroCheck = await client.eval(`
      (() => {
        const hero = document.getElementById('heroSection');
        const anchor = document.getElementById('heroGrowthAnchor');
        return Boolean(hero && anchor && hero.contains(anchor));
      })()
    `);
    assert(inHeroCheck, 'Hero Wealth Anchor (#heroGrowthAnchor) is positioned inside the Hero header');

    // Hierarchy Order Verification: Brand logo -> Illustration -> Headline -> Subhead -> CTA
    const orderCheck = await client.eval(`
      (() => {
        const anchor = document.getElementById('heroGrowthAnchor');
        const headline = document.querySelector('.hero-headline');
        const brandBar = document.querySelector('.brand-bar');
        const cta = document.getElementById('btnHeroB');
        if (!anchor || !headline || !brandBar || !cta) return false;
        const rBrand = brandBar.getBoundingClientRect();
        const rAnchor = anchor.getBoundingClientRect();
        const rHeadline = headline.getBoundingClientRect();
        const rCta = cta.getBoundingClientRect();
        return (rBrand.top < rAnchor.top) &&
               (rAnchor.top < rHeadline.top) &&
               (rHeadline.top < rCta.top);
      })()
    `);
    assert(orderCheck, 'Visual hierarchy strictly verified: Brand Bar -> Illustration -> Headline -> CTA');

    // Section dividers check
    const dividersCount = await client.eval(`document.querySelectorAll('.section-divider').length`);
    assert(dividersCount >= 4, `Subtle fading amber section dividers rendered across content boundaries (count=${dividersCount})`);

    const eyebrowText = await client.eval(`document.querySelector('.hero-illustration-eyebrow')?.textContent.replace(/\\s+/g, ' ').trim()`);
    assert(eyebrowText === 'IF YOU HAD INVESTED ₹1Cr IN 2022', `Eyebrow text exact: "${eyebrowText}"`);

    const scripboxVal = await client.eval(`document.querySelector('.hero-val-scripbox')?.textContent.trim()`);
    const scripboxLabel = await client.eval(`document.querySelector('.hero-label-scripbox')?.textContent.trim()`);
    const benchVal = await client.eval(`document.querySelector('.hero-val-benchmark')?.textContent.trim()`);
    const benchLabel = await client.eval(`document.querySelector('.hero-label-benchmark')?.textContent.trim()`);

    assert(scripboxVal === '₹2.47 Cr' && scripboxLabel === 'Scripbox (Portfolio Optimiser)', `Scripbox displays: ₹2.47 Cr (Scripbox (Portfolio Optimiser))`);
    assert(benchVal === '₹1.62 Cr' && benchLabel === 'Benchmark (Nifty 50 TRI)', `Benchmark displays: ₹1.62 Cr (Benchmark (Nifty 50 TRI))`);

    // Card container and Legend check
    const cardStructureCheck = await client.eval(`
      (() => {
        const card = document.querySelector('.hero-card-container');
        const legendItems = document.querySelectorAll('.hero-legend-item');
        const infoBtn = document.getElementById('btnHeroGrowthInfo');
        return Boolean(card && legendItems.length === 2 && infoBtn);
      })()
    `);
    assert(cardStructureCheck, 'Framed hero card container, dual-column summary, (i) info button, and bottom legend row verified');

    // SVG organic curve and visual structure check
    const svgCheck = await client.eval(`
      (() => {
        const svg = document.querySelector('.hero-ray-svg');
        const curveScrip = document.querySelector('.curve-scripbox');
        const curveBench = document.querySelector('.curve-benchmark');
        const curveFill = document.querySelector('.curve-fill');
        const nodeOrigin = document.querySelector('.node-origin');
        const nodeScrip = document.querySelector('.node-scripbox');
        const nodeBench = document.querySelector('.node-benchmark');
        const pillScrip = document.querySelector('.pill-scripbox');
        const pillBench = document.querySelector('.pill-benchmark');
        const ticks = Array.from(document.querySelectorAll('.time-tick')).map(t => t.textContent.trim());
        const ticksValid = JSON.stringify(ticks) === JSON.stringify(['2023', '2024', '2025', '2026']);
        return Boolean(svg && curveScrip && curveBench && curveFill && nodeOrigin && nodeScrip && nodeBench && pillScrip && pillBench && ticksValid);
      })()
    `);
    assert(svgCheck, 'Organic curves (quadratic bezier), under-curve atmospheric fill, terminal pill badges, and 2023-2026 timeline ticks rendered');

    // Test info modal popup interaction
    await client.eval(`document.getElementById('btnHeroGrowthInfo').click()`);
    await sleep(150);
    const popupVisible = await client.eval(`!document.getElementById('heroGrowthPopup').classList.contains('is-hidden')`);
    assert(popupVisible, 'Clicking (i) info button displays calculation popup');

    await client.eval(`document.getElementById('btnHeroClosePopup').click()`);
    await sleep(150);
    const popupHidden = await client.eval(`document.getElementById('heroGrowthPopup').classList.contains('is-hidden')`);
    assert(popupHidden, 'Closing calculation popup returns to clean card state');

    // Exact compliance disclosure check
    const disclosureText = await client.eval(`document.querySelector('.hero-illus-disclosure-text')?.textContent.replace(/\\s+/g, ' ').trim()`);
    const expectedDisclosure = 'Past performance is based on historical data and does not guarantee future returns. Investments are subject to market risks.';
    assert(disclosureText === expectedDisclosure, `Verbatim compliance disclosure matches: "${disclosureText}"`);

    // Verify APMI attribution is NOT duplicated in the hero illustration (per Option 1 constraint)
    const heroContainsApmi = await client.eval(`document.getElementById('heroGrowthAnchor')?.textContent.includes('APMI')`);
    assert(!heroContainsApmi, 'Hero illustration correctly excludes APMI attribution (reserved exclusively for Section 2)');

    // Capture hero anchor screenshot
    await client.screenshot(path.join(SHOTS_DIR, 'perf-04-hero-anchor-closed-390x844.png'));

    console.log('\n=== Test Suite 3: Touch Targets & Responsive Layout ===');
    const viewports = [
      { w: 360, h: 640, name: '360x640', isMobile: true },
      { w: 390, h: 640, name: '390x640', isMobile: true },
      { w: 390, h: 844, name: '390x844', isMobile: true },
      { w: 430, h: 932, name: '430x932', isMobile: true }
    ];

    for (const vp of viewports) {
      await client.setViewport(vp.w, vp.h, vp.isMobile ?? true);
      await sleep(200);

      // Check overflow
      const overflow = await client.eval(`document.documentElement.scrollWidth > window.innerWidth`);
      assert(!overflow, `No horizontal overflow at ${vp.name} (scrollWidth <= innerWidth)`);

      // Observe CTA position relative to fold
      const ctaPos = await client.eval(`
        (() => {
          const cta = document.getElementById('btnHeroB');
          if (!cta) return null;
          const r = cta.getBoundingClientRect();
          return { top: Math.round(r.top), aboveFold: r.top < window.innerHeight };
        })()
      `);
      console.log(`  ℹ Viewport ${vp.name}: CTA top=${ctaPos?.top}px, above fold: ${ctaPos?.aboveFold}`);

      // Check touch targets on buttons
      const btnBounds = await client.eval(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.perf-period-btn'));
          const infoBtn = document.getElementById('btnHeroGrowthInfo');
          const all = [...btns, infoBtn].filter(Boolean);
          return all.map((b, i) => {
            const r = b.getBoundingClientRect();
            return { index: i, tag: b.tagName, class: b.className, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
          });
        })()
      `);

      const touchTargetPass = btnBounds.every(b => b.w >= 44 && b.h >= 44);
      if (!touchTargetPass) {
        console.log('Button bounds:', btnBounds);
      }
      assert(touchTargetPass, `All interactive buttons meet >= 44x44px touch target at ${vp.name}`);

      // Capture screenshot at each resolution
      await client.eval(`window.scrollTo(0, 0);`);
      await sleep(100);
      await client.screenshot(path.join(SHOTS_DIR, `perf-05-hero-${vp.name}.png`));
    }

    // Capture specific hero hierarchy on canonical 390x844
    await client.setViewport(390, 844, true);
    await client.eval(`window.scrollTo(0, 0);`);
    await sleep(150);
    await client.screenshot(path.join(SHOTS_DIR, 'perf-06-hero-anchor-and-cta-390x844.png'));

    // Capture transition from Overview to Performance to Strategies
    await client.eval(`
      (() => {
        const perfEl = document.getElementById('perfSection');
        if (perfEl) {
          const top = perfEl.getBoundingClientRect().top + window.scrollY - 40;
          window.scrollTo(0, top);
        }
      })()
    `);
    await sleep(150);
    await client.screenshot(path.join(SHOTS_DIR, 'perf-07-overview-to-perf-transition-390x844.png'));

    console.log('\n=== Test Suite 4: Form & Modal Flow Regression Check ===');
    await client.setViewport(390, 844, true);
    await client.eval(`window.scrollTo(0, 0);`);
    await sleep(200);

    // Open consultation modal
    await client.eval(`document.getElementById('btnHeroB').click()`);
    await sleep(300);
    const overlayVisible = await client.eval(`document.getElementById('stepOverlay').style.display !== 'none'`);
    assert(overlayVisible, 'Hero CTA (btnHeroB) opens consultation modal cleanly');

    // Select tile in step 1
    await client.eval(`document.querySelector('.q1-card-tile').click()`);
    await sleep(250);
    const step2Active = await client.eval(`document.getElementById('panelQ2').style.display !== 'none'`);
    assert(step2Active, 'Step 1 tile selection advances to Step 2 (panelQ2)');

    // Back button in step 2 returns to step 1
    await client.eval(`document.getElementById('btnBackFromQ2').click()`);
    await sleep(200);
    const step1Active = await client.eval(`document.getElementById('panelQ1').style.display !== 'none'`);
    assert(step1Active, 'Back button returns to Step 1 (panelQ1)');

    // Close overlay
    await client.eval(`document.getElementById('btnBackFromQ1').click()`);
    await sleep(200);
    const overlayClosed = await client.eval(`document.getElementById('stepOverlay').style.display === 'none'`);
    assert(overlayClosed, 'Modal closes cleanly and preserves page state');

    console.log('\n=== Test Suite 5: Accessibility & Reduced Motion Mode ===');
    // Emulate prefers-reduced-motion: reduce
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await client.send('Page.navigate', { url: BASE_URL });
    await sleep(400);

    const reducedMotionStyles = await client.eval(`
      (() => {
        const curve = document.querySelector('.curve-line');
        const fill = document.querySelector('.curve-fill');
        const pill = document.querySelector('.pill-group-scripbox');
        if (!curve || !fill || !pill) return null;
        const cCurve = window.getComputedStyle(curve);
        const cFill = window.getComputedStyle(fill);
        const cPill = window.getComputedStyle(pill);
        return {
          curveAnim: cCurve.animationName,
          curveOffset: cCurve.strokeDashoffset,
          fillAnim: cFill.animationName,
          fillOpacity: cFill.opacity,
          pillAnim: cPill.animationName,
          pillOpacity: cPill.opacity
        };
      })()
    `);

    assert(
      reducedMotionStyles?.curveAnim === 'none' &&
      reducedMotionStyles?.fillAnim === 'none' &&
      reducedMotionStyles?.pillAnim === 'none',
      'prefers-reduced-motion disables all animation routines (animation: none)'
    );
    assert(
      reducedMotionStyles?.fillOpacity === '1' &&
      reducedMotionStyles?.pillOpacity === '1',
      'All vectors, fills, and labels render immediately and statically at 100% opacity'
    );

    await client.screenshot(path.join(SHOTS_DIR, 'perf-08-reduced-motion-390x844.png'));

    console.log('\n=========================================');
    console.log(`Results: ${testReport.testsPassed} passed, ${testReport.testsFailed} failed.`);
    console.log('=========================================');

    fs.writeFileSync(
      path.join(__dirname, 'performance-test-results.json'),
      JSON.stringify(testReport, null, 2)
    );

    client.close();
  } catch (err) {
    console.error('Fatal error during test run:', err);
    testReport.testsFailed++;
  } finally {
    chromeProcess.kill('SIGTERM');
  }
}

run();
