const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9370;

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

  async evaluate(expression) {
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

  async captureScreenshot(clip = null) {
    const params = { format: 'png' };
    if (clip) params.clip = clip;
    const res = await this.send('Page.captureScreenshot', params);
    return Buffer.from(res.data, 'base64');
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('=== SCRIPBOX PMS STRATEGY SELECTOR INTERACTION VALIDATION ===\n');

  const shotsDir = path.join(__dirname, 'shots');
  if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check'
  ]);

  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await waitForHttp(`http://127.0.0.1:${PORT}/json`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    const BASE_URL = 'http://localhost:8089/index.html';

    // 1. Mobile Tests on Canonical 390x844
    console.log('--- 1. Testing Mobile Viewport (390x844) ---');
    await cdp.setViewport(390, 844, true);
    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(700);

    // Verify 3 tabs exist in selector
    const tabsInfo = await cdp.evaluate(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('.strat-tab-btn'));
        return tabs.map(t => ({
          id: t.id,
          strat: t.getAttribute('data-strat'),
          label: t.querySelector('.strat-tab-label')?.textContent?.trim(),
          hasIcon: !!t.querySelector('.strat-tab-icon'),
          isActive: t.classList.contains('is-active'),
          ariaSelected: t.getAttribute('aria-selected')
        }));
      })()
    `);
    console.log('   Selector tabs:', JSON.stringify(tabsInfo, null, 2));

    if (tabsInfo.length !== 3) throw new Error(`Expected 3 strategy tabs, got ${tabsInfo.length}`);
    if (!tabsInfo[0].isActive || tabsInfo[0].ariaSelected !== 'true') throw new Error('Optimiser tab is not active by default');

    // Verify ONLY 1 strategy card is visible initially
    const visibleCardsInit = await cdp.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.strategy-card'));
        const visible = cards.filter(c => window.getComputedStyle(c).display !== 'none');
        return visible.map(c => ({ id: c.id, strat: c.getAttribute('data-strategy') }));
      })()
    `);
    console.log('   Initial visible cards:', visibleCardsInit);
    if (visibleCardsInit.length !== 1 || visibleCardsInit[0].id !== 'strat-optimiser') {
      throw new Error(`Expected exactly 1 visible card (#strat-optimiser), got: ${JSON.stringify(visibleCardsInit)}`);
    }

    // Measure new section height vs baseline
    const sectionMeasurements = await cdp.evaluate(`
      (() => {
        const sec = document.getElementById('strategiesSection');
        const rect = sec.getBoundingClientRect();
        return {
          sectionHeight: Math.round(rect.height)
        };
      })()
    `);
    console.log(`   Initial section height: ${sectionMeasurements.sectionHeight}px (Baseline was 5,046px -> ~${Math.round((1 - sectionMeasurements.sectionHeight / 5046) * 100)}% height reduction!)`);

    // Scroll to strategies section and capture initial Optimiser view
    await cdp.evaluate(`document.getElementById('strategiesSection').scrollIntoView({ behavior: 'instant', block: 'start' });`);
    await sleep(250);
    const ssOpt = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'strat-01-tab-optimiser-390x844.png'), ssOpt);
    console.log('   Captured: strat-01-tab-optimiser-390x844.png');

    // 2. Switch to Tab 2: Growth (Select Direct Growth Portfolio)
    console.log('\n--- 2. Switching to Growth (Select Direct Growth) ---');
    await cdp.evaluate(`document.getElementById('tab-direct-growth').click()`);
    await sleep(250);

    const visibleAfterGrowth = await cdp.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.strategy-card'));
        const visible = cards.filter(c => window.getComputedStyle(c).display !== 'none');
        const tabActive = document.getElementById('tab-direct-growth').classList.contains('is-active');
        const tabAria = document.getElementById('tab-direct-growth').getAttribute('aria-selected');
        return {
          count: visible.length,
          activeId: visible[0]?.id,
          tabActive,
          tabAria,
          hasBlueprint: !!document.querySelector('#strat-direct-growth .alloc-track-bar')
        };
      })()
    `);
    console.log('   State after selecting Growth:', visibleAfterGrowth);
    if (visibleAfterGrowth.count !== 1 || visibleAfterGrowth.activeId !== 'strat-direct-growth') {
      throw new Error(`Growth tab selection failed, visible: ${JSON.stringify(visibleAfterGrowth)}`);
    }

    const ssGrowth = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'strat-02-tab-growth-390x844.png'), ssGrowth);
    console.log('   Captured: strat-02-tab-growth-390x844.png');

    // 3. Switch to Tab 3: Leadership (Focused Leadership Portfolio)
    console.log('\n--- 3. Switching to Leadership (Focused Leadership) ---');
    await cdp.evaluate(`document.getElementById('tab-focused').click()`);
    await sleep(250);

    const visibleAfterLead = await cdp.evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('.strategy-card'));
        const visible = cards.filter(c => window.getComputedStyle(c).display !== 'none');
        const tabActive = document.getElementById('tab-focused').classList.contains('is-active');
        return {
          count: visible.length,
          activeId: visible[0]?.id,
          tabActive,
          hasMoatCards: !!document.querySelector('#strat-focused .focus-metric-grid')
        };
      })()
    `);
    console.log('   State after selecting Leadership:', visibleAfterLead);
    if (visibleAfterLead.count !== 1 || visibleAfterLead.activeId !== 'strat-focused') {
      throw new Error(`Leadership tab selection failed, visible: ${JSON.stringify(visibleAfterLead)}`);
    }

    const ssLead = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'strat-03-tab-leadership-390x844.png'), ssLead);
    console.log('   Captured: strat-03-tab-leadership-390x844.png');

    // 4. Return to Optimiser and Expand Drawer (Progressive Disclosure)
    console.log('\n--- 4. Expanding Drawer in Active Card ---');
    await cdp.evaluate(`document.getElementById('tab-optimiser').click()`);
    await sleep(200);

    await cdp.evaluate(`
      const btn = document.querySelector('#strat-optimiser .strat-drawer-btn');
      btn.click();
    `);
    await sleep(250);

    const drawerCheck = await cdp.evaluate(`
      (() => {
        const drawer = document.getElementById('drawer-optimiser');
        const btn = document.querySelector('#strat-optimiser .strat-drawer-btn');
        return {
          drawerHidden: drawer?.hidden,
          expanded: btn?.getAttribute('aria-expanded'),
          btnText: btn?.querySelector('.drawer-btn-text')?.textContent?.trim(),
          hasFramework: !!drawer?.querySelector('.drawer-pillars-list'),
          hasMechanics: !!drawer?.querySelector('.drawer-specs-grid')
        };
      })()
    `);
    console.log('   Drawer expansion state:', drawerCheck);
    if (drawerCheck.drawerHidden !== false || drawerCheck.expanded !== 'true') {
      throw new Error(`Drawer failed to open: ${JSON.stringify(drawerCheck)}`);
    }

    const ssDrawerOpen = await cdp.captureScreenshot();
    fs.writeFileSync(path.join(shotsDir, 'strat-04-optimiser-drawer-open-390x844.png'), ssDrawerOpen);
    console.log('   Captured: strat-04-optimiser-drawer-open-390x844.png');

    // 5. Multi-Viewport Responsive Validation (360, 390x640, 430)
    console.log('\n--- 5. Multi-Viewport & Touch Targets Validation ---');
    const viewports = [
      { w: 360, h: 640, name: '360x640' },
      { w: 390, h: 640, name: '390x640' },
      { w: 430, h: 932, name: '430x932' }
    ];

    for (const vp of viewports) {
      await cdp.setViewport(vp.w, vp.h, true);
      await sleep(200);

      const vpMetrics = await cdp.evaluate(`
        (() => {
          const docW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const tabs = Array.from(document.querySelectorAll('.strat-tab-btn')).map(t => {
            const r = t.getBoundingClientRect();
            return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
          });
          const allTabs44 = tabs.every(t => t.w >= 44 && t.h >= 44);
          return {
            hasOverflow: docW > winW,
            docW,
            winW,
            allTabs44,
            tabs
          };
        })()
      `);

      console.log(`   Viewport ${vp.name}: hasOverflow=${vpMetrics.hasOverflow}, allTabs>=44px=${vpMetrics.allTabs44}`);
      if (vpMetrics.hasOverflow) throw new Error(`Horizontal overflow detected at ${vp.name}`);
      if (!vpMetrics.allTabs44) throw new Error(`Tabs below 44px touch target at ${vp.name}: ${JSON.stringify(vpMetrics.tabs)}`);

      await cdp.evaluate(`document.getElementById('strategiesSection').scrollIntoView({ behavior: 'instant', block: 'start' });`);
      await sleep(200);
      const ssVp = await cdp.captureScreenshot();
      fs.writeFileSync(path.join(shotsDir, `strat-05-section-${vp.name}.png`), ssVp);
      console.log(`   Captured: strat-05-section-${vp.name}.png`);
    }

    console.log('\n======================================================');
    console.log('✅ ALL STRATEGY SELECTOR INTERACTION TESTS PASSED!');
    console.log('======================================================\n');
    cdp.close();
  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('Fatal error during strategy selector testing:', err);
  process.exit(1);
});
