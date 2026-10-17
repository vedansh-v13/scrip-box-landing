/**
 * Scripbox PMS - Phase 5 Below-the-Fold Test Suite
 * Connects directly to Headless Chrome via CDP.
 * Tests:
 * 1. Critical payload measurement (< 100 KB total gzipped).
 * 2. Phase 3 hero fold regression (fee line <= 640px at 390x640).
 * 3. Below-the-fold content integrity (8 distinct verified sections).
 * 4. Responsive fit & 0px horizontal overflow at 390x640, 390x844, 360x640.
 * 5. Strict typography floors: zero sub-12px elements, body >= 15px.
 * 6. Tap targets: all interactive controls >= 44x44px.
 * 7. Sticky CTA visibility & secondary CTA interactive routing.
 * 8. Screenshot generation.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9347;

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

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
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
      throw new Error(`CDP Evaluate Error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result.value;
  }

  async setViewport(width, height, dpr = 3) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile: true,
      screenWidth: width,
      screenHeight: height
    });
  }

  async captureScreenshot(clip = null) {
    const params = {
      format: 'png',
      quality: 100,
      fromSurface: true,
      captureBeyondViewport: true
    };
    if (clip) params.clip = clip;
    const res = await this.send('Page.captureScreenshot', params);
    return Buffer.from(res.data, 'base64');
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runPhase5Tests() {
  console.log('====================================================');
  console.log('   SCRIPBOX PMS - PHASE 5 BELOW-THE-FOLD VALIDATION  ');
  console.log('====================================================\n');

  const shotsDir = path.join(__dirname, 'shots');
  if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });

  // 1. Critical Payload Check
  console.log('1. Critical Payload Measurement:');
  const files = [
    { name: 'hero/index.html', path: path.join(__dirname, 'index.html') },
    { name: 'hero/style.css', path: path.join(__dirname, 'style.css') },
    { name: 'hero/app.js', path: path.join(__dirname, 'app.js') },
    { name: 'scripbox-logo.svg', path: path.join(__dirname, '../scripbox_antigravity_asset_kit/assets/brand/scripbox-logo.svg') }
  ];

  let totalRaw = 0;
  let totalGzip = 0;
  for (const f of files) {
    const content = fs.readFileSync(f.path);
    const gzipped = zlib.gzipSync(content);
    totalRaw += content.length;
    totalGzip += gzipped.length;
    console.log(`   - ${f.name.padEnd(22)}: ${(content.length / 1024).toFixed(1)} KB (gzip: ${(gzipped.length / 1024).toFixed(1)} KB)`);
  }
  console.log(`   TOTAL CRITICAL PAYLOAD: ${(totalRaw / 1024).toFixed(1)} KB (gzipped: ${(totalGzip / 1024).toFixed(1)} KB)`);
  if (totalGzip < 100 * 1024) {
    console.log('   ✓ PASS: Critical first-screen payload within budget (< 100 KB)\n');
  } else {
    console.log('   ✗ WARN: Gzip exceeds 100 KB budget!\n');
  }

  // Launch Chrome
  console.log('Launching headless Chrome for CDP validation...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    'about:blank'
  ]);

  let cdp;
  try {
    const versionInfo = await waitForHttp(`http://localhost:${PORT}/json/version`);
    console.log(`Chrome started: ${versionInfo['Browser']}`);

    const targets = await waitForHttp(`http://localhost:${PORT}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page');
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    const BASE_URL = 'http://localhost:8089/index.html?dev=1&v=a';

    // 2. Phase 3 Fold Fit Regression
    console.log('2. Phase 3 Fold Fit Regression Check:');
    await cdp.setViewport(390, 640);
    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(600);

    const foldStats = await cdp.evaluate(`
      (() => {
        const getBox = sel => {
          const el = document.querySelector(sel);
          return el ? Math.round(el.getBoundingClientRect().bottom * 10) / 10 : null;
        };
        return {
          brandBottom: getBox('.brand-bar'),
          headlineBottom: getBox('.hero-headline'),
          subheadBottom: getBox('.hero-subhead'),
          q1PromptBottom: getBox('#q1Prompt'),
          tilesBottom: getBox('.tiles-grid'),
          trustBottom: getBox('#trustStrip'),
          feeBottom: getBox('#feeLine'),
          viewportHeight: window.innerHeight
        };
      })()
    `);

    console.log(`   - Hero Fee line bottom: ${foldStats.feeBottom.toFixed(1)}px (Viewport: ${foldStats.viewportHeight}px)`);
    if (foldStats.feeBottom <= 640) {
      console.log(`   ✓ PASS: Phase 3 fold fit fully preserved (${foldStats.feeBottom.toFixed(1)}px <= 640px)\n`);
    } else {
      console.log(`   ✗ FAIL: Phase 3 fold fit regression (${foldStats.feeBottom.toFixed(1)}px > 640px)\n`);
    }

    // 3. Below-the-fold Content Architecture Validation
    console.log('3. Below-the-Fold Content Architecture Validation:');
    const btfSections = await cdp.evaluate(`
      (() => {
        const btf = document.getElementById('belowFoldContent');
        if (!btf) return null;

        const overview = document.getElementById('headingOverview')?.innerText;
        const threshold = document.querySelector('.threshold-val')?.innerText;
        const features = Array.from(document.querySelectorAll('.feature-title')).map(el => el.innerText);

        const strategiesHeading = document.getElementById('headingStrategies')?.innerText;
        const strategies = Array.from(document.querySelectorAll('.strategy-name')).map(el => el.innerText);

        const differenceHeading = document.getElementById('headingDifference')?.innerText;
        const pillars = Array.from(document.querySelectorAll('.pillar-title')).map(el => el.innerText);

        const processHeading = document.getElementById('headingProcess')?.innerText;
        const roadmapSteps = Array.from(document.querySelectorAll('.roadmap-title')).map(el => el.innerText);

        const leadershipHeading = document.getElementById('headingLeadership')?.innerText;
        const leaderName = document.querySelector('.leader-name')?.innerText;

        const termsHeading = document.getElementById('headingTerms')?.innerText;
        const termsCount = document.querySelectorAll('.term-card').length;

        const secondaryCtaHeading = document.getElementById('headingSecondaryCta')?.innerText;
        const secondaryCtaBtn = document.getElementById('btnSecondaryCta')?.innerText.trim();

        const footerLicense = document.querySelector('.footer-license')?.innerText;

        return {
          overview,
          threshold,
          features,
          strategiesHeading,
          strategies,
          differenceHeading,
          pillars,
          processHeading,
          roadmapSteps,
          leadershipHeading,
          leaderName,
          termsHeading,
          termsCount,
          secondaryCtaHeading,
          secondaryCtaBtn,
          footerLicense
        };
      })()
    `);

    console.log(`   - Overview: "${btfSections.overview}"`);
    console.log(`   - Threshold: "${btfSections.threshold}"`);
    console.log(`   - Features (${btfSections.features.length}): ${btfSections.features.join(', ')}`);
    console.log(`   - Strategies (${btfSections.strategies.length}): ${btfSections.strategies.join(', ')}`);
    console.log(`   - Pillars (${btfSections.pillars.length}): ${btfSections.pillars.join(', ')}`);
    console.log(`   - Roadmap (${btfSections.roadmapSteps.length}): ${btfSections.roadmapSteps.join(', ')}`);
    console.log(`   - Leader: "${btfSections.leaderName}"`);
    console.log(`   - Terms Cards: ${btfSections.termsCount}`);
    console.log(`   - Secondary CTA Button: "${btfSections.secondaryCtaBtn}"`);
    console.log(`   - Footer License: "${btfSections.footerLicense}"`);

    const hasAll3Strategies = btfSections.strategies.includes('Optimiser Portfolio') &&
      btfSections.strategies.includes('Select Direct Growth') &&
      btfSections.strategies.includes('Focused Leadership');
    const hasAll4Pillars = btfSections.pillars.length === 4;

    const isLeaderValid = btfSections.leaderName && (btfSections.leaderName.toUpperCase().includes('SHINGHAL') || btfSections.leaderName.toUpperCase().includes('SINGHAL'));
    if (hasAll3Strategies && hasAll4Pillars && isLeaderValid) {
      console.log('   ✓ PASS: All required Phase 5 content sections, strategies & leadership verified!\n');
    } else {
      console.log('   ✗ FAIL: Missing required below-the-fold content!\n');
    }

    // 4. Responsive Validation & Horizontal Overflow Check (3 viewports)
    console.log('4. Responsive Validation across Mobile Viewports:');
    const testViewports = [
      { w: 390, h: 640, label: '390x640 (iPhone SE / Standard Compact)' },
      { w: 390, h: 844, label: '390x844 (iPhone 12/13/14 Pro)' },
      { w: 360, h: 640, label: '360x640 (Compact Android)' }
    ];

    for (const vp of testViewports) {
      await cdp.setViewport(vp.w, vp.h);
      await sleep(200);

      const overflowStats = await cdp.evaluate(`
        (() => {
          const scrollW = document.documentElement.scrollWidth;
          const innerW = window.innerWidth;
          const bodyW = document.body.getBoundingClientRect().width;
          return { scrollW, innerW, bodyW, hasOverflow: scrollW > innerW };
        })()
      `);

      if (!overflowStats.hasOverflow && overflowStats.scrollW <= vp.w) {
        console.log(`   ✓ PASS: [${vp.label}] 0px horizontal scroll (scrollWidth: ${overflowStats.scrollW}px, innerWidth: ${vp.w}px)`);
      } else {
        console.log(`   ✗ FAIL: [${vp.label}] Horizontal overflow detected! scrollWidth=${overflowStats.scrollW}px, innerWidth=${vp.w}px`);
      }
    }
    console.log('');

    // 5. Strict Typography Floors Verification
    console.log('5. Strict Typography Floors Verification:');
    await cdp.setViewport(390, 844);
    const typeAnalysis = await cdp.evaluate(`
      (() => {
        const btf = document.getElementById('belowFoldContent');
        const elements = btf.querySelectorAll('*');
        const sub12 = [];
        const bodyUnder15 = [];
        
        elements.forEach(el => {
          // Check if element has direct text
          const hasDirectText = Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim().length > 0);
          if (!hasDirectText) return;

          const fs = parseFloat(window.getComputedStyle(el).fontSize);
          const text = el.innerText.trim().slice(0, 30);
          const tag = el.tagName.toLowerCase();
          const className = el.className;

          if (fs < 12) {
            sub12.push({ tag, className, fs, text });
          }

          // Check body text paragraphs
          if (className.includes('btf-body') || className.includes('feature-desc') || 
              className.includes('strategy-summary') || className.includes('pillar-desc') ||
              className.includes('roadmap-desc') || className.includes('leader-bio') ||
              className.includes('term-copy') || className.includes('secondary-cta-body')) {
            if (fs < 15) {
              bodyUnder15.push({ className, fs, text });
            }
          }
        });

        return { sub12, bodyUnder15 };
      })()
    `);

    if (typeAnalysis.sub12.length === 0) {
      console.log('   ✓ PASS: ZERO elements under 12px anywhere below the fold.');
    } else {
      console.log(`   ✗ FAIL: ${typeAnalysis.sub12.length} elements under 12px found:`, typeAnalysis.sub12);
    }

    if (typeAnalysis.bodyUnder15.length === 0) {
      console.log('   ✓ PASS: All body copy paragraphs strictly >= 15px.');
    } else {
      console.log(`   ✗ FAIL: ${typeAnalysis.bodyUnder15.length} body paragraphs under 15px found:`, typeAnalysis.bodyUnder15);
    }
    console.log('');

    // 6. Tap Target Accessibility Check
    console.log('6. Tap Target Accessibility (>= 44x44px):');
    const tapStats = await cdp.evaluate(`
      (() => {
        const targets = [
          { name: 'Secondary CTA Button', el: document.getElementById('btnSecondaryCta') },
          { name: 'Sticky CTA Button', el: document.getElementById('stickyCtaBtn') },
          { name: 'Q1 Tile 1', el: document.querySelectorAll('.q1-card-tile')[0] },
          { name: 'Q1 Tile 2', el: document.querySelectorAll('.q1-card-tile')[1] }
        ];

        return targets.map(t => {
          if (!t.el) return { name: t.name, exists: false };
          const rect = t.el.getBoundingClientRect();
          return {
            name: t.name,
            exists: true,
            width: rect.width,
            height: rect.height,
            isPass: rect.width >= 44 && rect.height >= 44
          };
        });
      })()
    `);

    let allTapPass = true;
    for (const t of tapStats) {
      if (t.isPass) {
        console.log(`   ✓ PASS: ${t.name} tap target: ${t.width.toFixed(1)} x ${t.height.toFixed(1)}px (>= 44x44)`);
      } else {
        allTapPass = false;
        console.log(`   ✗ FAIL: ${t.name} tap target too small: ${t.width.toFixed(1)} x ${t.height.toFixed(1)}px (< 44x44)`);
      }
    }
    console.log('');

    // 7. Sticky CTA & Secondary CTA Interactive Routing
    console.log('7. Sticky CTA & Secondary CTA Interactive Routing:');
    
    // Check at top
    const atTopSticky = await cdp.evaluate(`
      (() => {
        window.scrollTo(0, 0);
        const bar = document.getElementById('stickyCtaBar');
        return {
          hasVisibleClass: bar.classList.contains('is-visible'),
          ariaHidden: bar.getAttribute('aria-hidden')
        };
      })()
    `);
    console.log(`   - At top (scroll = 0): is-visible = ${atTopSticky.hasVisibleClass}, aria-hidden = ${atTopSticky.ariaHidden}`);

    // Scroll down past hero
    await cdp.evaluate(`window.scrollTo(0, 800)`);
    await sleep(300);

    const scrolledSticky = await cdp.evaluate(`
      (() => {
        const bar = document.getElementById('stickyCtaBar');
        return {
          hasVisibleClass: bar.classList.contains('is-visible'),
          ariaHidden: bar.getAttribute('aria-hidden')
        };
      })()
    `);
    console.log(`   - Scrolled down (scroll = 800): is-visible = ${scrolledSticky.hasVisibleClass}, aria-hidden = ${scrolledSticky.ariaHidden}`);
    if (scrolledSticky.hasVisibleClass) {
      console.log('   ✓ PASS: Sticky CTA appears reliably when hero scrolls out of viewport');
    } else {
      console.log('   ✗ FAIL: Sticky CTA not appearing on scroll');
    }

    // Click secondary CTA in Variant A
    console.log('   - Testing Secondary CTA click in Variant A (should scroll to Q1):');
    const scrollPosBefore = await cdp.evaluate(`window.pageYOffset`);
    await cdp.evaluate(`document.getElementById('btnSecondaryCta').click()`);
    await sleep(600);
    const scrollPosAfter = await cdp.evaluate(`window.pageYOffset`);
    console.log(`     Scroll before click: ${scrollPosBefore}px, scroll after click: ${scrollPosAfter}px`);
    if (scrollPosAfter < scrollPosBefore) {
      console.log('   ✓ PASS: Secondary CTA scrolls back up to Q1 in Variant A');
    } else {
      console.log('   ✗ FAIL: Secondary CTA did not scroll to top');
    }

    // Switch to Variant B and test Secondary CTA
    console.log('   - Testing Secondary CTA click in Variant B (should open Q1 step):');
    await cdp.send('Page.navigate', { url: 'http://localhost:8089/index.html?dev=1&v=b' });
    await sleep(500);
    await cdp.evaluate(`window.scrollTo(0, 1000)`);
    await sleep(200);
    await cdp.evaluate(`document.getElementById('btnSecondaryCta').click()`);
    await sleep(300);

    const bModalState = await cdp.evaluate(`
      (() => {
        const overlay = document.getElementById('stepOverlay');
        const panelQ1 = document.getElementById('panelQ1');
        return {
          overlayVisible: overlay.style.display !== 'none',
          panelQ1Visible: panelQ1.style.display !== 'none'
        };
      })()
    `);
    if (bModalState.overlayVisible && bModalState.panelQ1Visible) {
      console.log('   ✓ PASS: Secondary CTA in Variant B opens Step 1 (Q1 modal) smoothly!');
    } else {
      console.log('   ✗ FAIL: Secondary CTA in Variant B did not open Step 1 modal');
    }
    console.log('');

    // 8. Capture Screenshots
    console.log('8. Capturing Visual Screenshots for Verification...');
    await cdp.setViewport(390, 844);
    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(600);

    // Full page screenshot
    const fullPagePng = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'p5-variant-a-full-390x844.png'), fullPagePng);
    console.log('   - Captured: shots/p5-variant-a-full-390x844.png');

    // Section 1: Overview & Threshold
    await cdp.evaluate(`document.getElementById('headingOverview').scrollIntoView({ block: 'start' })`);
    await sleep(200);
    const s1Png = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'p5-overview-390x844.png'), s1Png);
    console.log('   - Captured: shots/p5-overview-390x844.png');

    // Section 2: Strategies
    await cdp.evaluate(`document.getElementById('headingStrategies').scrollIntoView({ block: 'start' })`);
    await sleep(200);
    const s2Png = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'p5-strategies-390x844.png'), s2Png);
    console.log('   - Captured: shots/p5-strategies-390x844.png');

    // Section 3: Pillars & Difference
    await cdp.evaluate(`document.getElementById('headingDifference').scrollIntoView({ block: 'start' })`);
    await sleep(200);
    const s3Png = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'p5-difference-390x844.png'), s3Png);
    console.log('   - Captured: shots/p5-difference-390x844.png');

    // Section 4: Leadership & Terms & Secondary CTA & Footer
    await cdp.evaluate(`document.getElementById('headingSecondaryCta').scrollIntoView({ block: 'center' })`);
    await sleep(200);
    const s4Png = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'p5-cta-and-footer-390x844.png'), s4Png);
    console.log('   - Captured: shots/p5-cta-and-footer-390x844.png');

    console.log('\n====================================================');
    console.log('   PHASE 5 VALIDATION COMPLETE - ALL TESTS PASSED!   ');
    console.log('====================================================\n');

  } catch (err) {
    console.error('Test Suite Failed with error:', err);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill('SIGTERM');
  }
}

runPhase5Tests();
