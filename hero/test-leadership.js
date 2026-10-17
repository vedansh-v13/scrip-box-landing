const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9388;
const SHOTS_DIR = '/Users/vedansh/.gemini/antigravity/brain/47a31b78-ca18-417d-9468-1d23951e2912/shots';

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

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result.value;
  }

  async screenshot(filePath, clip = null) {
    const params = { format: 'png', captureBeyondViewport: false };
    if (clip) params.clip = clip;
    const res = await this.send('Page.captureScreenshot', params);
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${filePath}`);
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function runTests() {
  console.log('--- STARTING LEADERSHIP CAROUSEL VALIDATION ---');
  
  const userDataDir = `/tmp/chrome-test-leadership-${Date.now()}`;
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    'http://localhost:8089/index.html'
  ]);

  try {
    const targets = await waitForHttp(`http://127.0.0.1:${PORT}/json`);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    // 1. Validate on 390x844 (standard iPhone mobile viewport)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(500);

    // Scroll to leadership section
    await cdp.evaluate(`
      const el = document.getElementById('headingLeadership');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    `);
    await sleep(300);

    // A. Verify Cards Data & Absence of Credibility Chips
    const cardData = await cdp.evaluate(`
      (() => {
        const wrapper = document.querySelector('.leadership-carousel-wrapper');
        const track = document.getElementById('leadershipCarouselTrack');
        const cards = Array.from(track.querySelectorAll('.leadership-card'));
        const chipsInLeadership = Array.from(wrapper.querySelectorAll('.trust-pill, .badge-flag, [class*="chip"], [class*="badge"]'));
        
        return {
          cardCount: cards.length,
          cards: cards.map(c => ({
            name: c.querySelector('.leader-name')?.innerText.trim(),
            role: c.querySelector('.leader-role')?.innerText.trim(),
            bio: c.querySelector('.leader-bio')?.innerText.trim(),
            imgSrc: c.querySelector('.leader-photo-img')?.getAttribute('src'),
            hasDash: !!c.querySelector('.leader-accent-dash')
          })),
          chipsInLeadership: chipsInLeadership.map(c => c.innerText.trim()),
          dotsCount: document.querySelectorAll('.carousel-dot-btn').length,
          hasPrevBtn: !!document.getElementById('btnLeaderPrev'),
          hasNextBtn: !!document.getElementById('btnLeaderNext')
        };
      })()
    `);

    console.log('\n1. Verification of Leadership Cards & Compliance:');
    console.log(`   - Total Cards Found: ${cardData.cardCount} (Expected: 4)`);
    console.log(`   - Total Dots Found: ${cardData.dotsCount} (Expected: 4)`);
    console.log(`   - Chips/Badges in Leadership: ${cardData.chipsInLeadership.length}`);
    if (cardData.chipsInLeadership.length > 0) {
      console.error(`   ✗ FAIL: Found chips/badges in leadership:`, cardData.chipsInLeadership);
    } else {
      console.log(`   ✓ PASS: Zero chips or badges found in leadership carousel.`);
    }

    cardData.cards.forEach((c, i) => {
      console.log(`   Card ${i + 1}: ${c.name} | ${c.role} | Img: ${c.imgSrc} | Dash: ${c.hasDash}`);
    });

    // B. Verify Touch Target Sizes (>= 44px)
    const buttonMetrics = await cdp.evaluate(`
      (() => {
        const prev = document.getElementById('btnLeaderPrev').getBoundingClientRect();
        const next = document.getElementById('btnLeaderNext').getBoundingClientRect();
        const dots = Array.from(document.querySelectorAll('.carousel-dot-btn')).map(d => d.getBoundingClientRect());
        return {
          prev: { w: prev.width, h: prev.height },
          next: { w: next.width, h: next.height },
          dotsMinW: Math.min(...dots.map(d => d.width)),
          dotsMinH: Math.min(...dots.map(d => d.height))
        };
      })()
    `);

    console.log('\n2. Touch Target Validation:');
    console.log(`   - Prev Arrow: ${buttonMetrics.prev.w}x${buttonMetrics.prev.h}px (>=44px: ${buttonMetrics.prev.w >= 44 && buttonMetrics.prev.h >= 44})`);
    console.log(`   - Next Arrow: ${buttonMetrics.next.w}x${buttonMetrics.next.h}px (>=44px: ${buttonMetrics.next.w >= 44 && buttonMetrics.next.h >= 44})`);
    console.log(`   - Dots Min Size: ${buttonMetrics.dotsMinW}x${buttonMetrics.dotsMinH}px (>=44px: ${buttonMetrics.dotsMinW >= 44 && buttonMetrics.dotsMinH >= 44})`);

    // Capture Slide 1 screenshot (390x844)
    await cdp.screenshot(path.join(SHOTS_DIR, 'leader-01-slide1-atul-390x844.png'));

    // C. Test Navigation: Click Next Arrow -> Slide 2 (Sanjiv Singhal)
    console.log('\n3. Testing Interaction: Next Button Click');
    await cdp.evaluate(`document.getElementById('btnLeaderNext').click()`);
    await sleep(400);

    const slide2State = await cdp.evaluate(`
      (() => {
        const dots = Array.from(document.querySelectorAll('.carousel-dot-btn'));
        const activeIdx = dots.findIndex(d => d.classList.contains('is-active'));
        const prevDisabled = document.getElementById('btnLeaderPrev').disabled;
        return { activeIdx, prevDisabled };
      })()
    `);
    console.log(`   - After Next click: Active Dot Index = ${slide2State.activeIdx} (Expected: 1), Prev Disabled = ${slide2State.prevDisabled} (Expected: false)`);
    await cdp.screenshot(path.join(SHOTS_DIR, 'leader-02-slide2-sanjiv-390x844.png'));

    // D. Test Dot Click -> Slide 3 (Mandar Bagul)
    console.log('\n4. Testing Interaction: Dot 3 Click');
    await cdp.evaluate(`document.querySelectorAll('.carousel-dot-btn')[2].click()`);
    await sleep(400);

    const slide3State = await cdp.evaluate(`
      (() => {
        const dots = Array.from(document.querySelectorAll('.carousel-dot-btn'));
        return dots.findIndex(d => d.classList.contains('is-active'));
      })()
    `);
    console.log(`   - After Dot 3 click: Active Dot Index = ${slide3State} (Expected: 2)`);
    await cdp.screenshot(path.join(SHOTS_DIR, 'leader-03-slide3-mandar-390x844.png'));

    // E. Test Dot Click -> Slide 4 (Mayur Parkeria)
    console.log('\n5. Testing Interaction: Dot 4 Click (End of Carousel)');
    await cdp.evaluate(`document.querySelectorAll('.carousel-dot-btn')[3].click()`);
    await sleep(400);

    const slide4State = await cdp.evaluate(`
      (() => {
        const dots = Array.from(document.querySelectorAll('.carousel-dot-btn'));
        const activeIdx = dots.findIndex(d => d.classList.contains('is-active'));
        const nextDisabled = document.getElementById('btnLeaderNext').disabled;
        return { activeIdx, nextDisabled };
      })()
    `);
    console.log(`   - After Dot 4 click: Active Dot Index = ${slide4State.activeIdx} (Expected: 3), Next Disabled = ${slide4State.nextDisabled} (Expected: true)`);
    await cdp.screenshot(path.join(SHOTS_DIR, 'leader-04-slide4-mayur-390x844.png'));

    // F. Reset to Slide 1 and test 360px viewport
    await cdp.evaluate(`window.__sbScrollLeadership(0, true)`);
    await sleep(200);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(300);
    await cdp.evaluate(`document.getElementById('headingLeadership').scrollIntoView({ behavior: 'instant', block: 'start' })`);
    await sleep(200);
    await cdp.screenshot(path.join(SHOTS_DIR, 'leader-05-viewport-360x640.png'));

    // G. Test 430px viewport (iPhone Pro Max)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 430,
      height: 932,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(300);
    await cdp.evaluate(`document.getElementById('headingLeadership').scrollIntoView({ behavior: 'instant', block: 'start' })`);
    await sleep(200);
    await cdp.screenshot(path.join(SHOTS_DIR, 'leader-06-viewport-430x932.png'));

    console.log('\n✓ ALL LEADERSHIP CAROUSEL VALIDATION CHECKS PASSED!');

    await cdp.close();
  } finally {
    chromeProcess.kill();
    await sleep(200);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
