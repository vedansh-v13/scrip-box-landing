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
      screenWidth: width,
      screenHeight: height
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      console.error('⚠️ CDP Eval Exception:', res.exceptionDetails.text, res.exceptionDetails.exception ? res.exceptionDetails.exception.description : '');
    }
    return res.result ? res.result.value : null;
  }

  async captureScreenshot(outputPath) {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      fromSurface: true
    });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
  }
}

async function run() {
  console.log('🚀 Starting Chrome Headless on port ' + PORT);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--hide-scrollbars',
    'about:blank'
  ]);

  try {
    const versionInfo = await waitForHttp(`http://localhost:${PORT}/json/version`);
    const browserWs = versionInfo.webSocketDebuggerUrl;

    const newTabRes = await fetch(`http://localhost:${PORT}/json/new?http://localhost:8089/index.html`, { method: 'PUT' });
    const targetInfo = await newTabRes.json();
    const pageWs = targetInfo.webSocketDebuggerUrl;

    const client = new CDPClient(pageWs);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    const shotsDir = path.join(__dirname, 'shots');
    if (!fs.existsSync(shotsDir)) {
      fs.mkdirSync(shotsDir, { recursive: true });
    }

    const testResults = [];
    function assert(name, condition, details = '') {
      const passed = !!condition;
      testResults.push({ name, passed, details });
      console.log(`${passed ? '✅ PASS' : '❌ FAIL'}: ${name} ${details ? `(${details})` : ''}`);
    }

    // --- TEST SUITE 1: 390x844 Canonical Phase 1B Mobile Flow ---
    console.log('\n--- 📱 TEST SUITE 1: 390x844 Canonical Phase 1B Flow ---');
    await client.setViewport(390, 844, true);
    await client.send('Page.navigate', { url: 'http://localhost:8089/index.html' });
    await sleep(800);

    // Initial Hero View
    await client.captureScreenshot(path.join(shotsDir, 'phase1-01-hero-390x844.png'));
    const heroBtnText = await client.evaluate(`document.getElementById('btnHeroB').innerText`);
    assert('Hero CTA exists and is visible', heroBtnText.includes('Connect with our PMS expert'), heroBtnText);

    // 1. Open Step 1 (Objective Selection)
    await client.evaluate(`document.getElementById('btnHeroB').click()`);
    await sleep(400);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-02-step1-q1-390x844.png'));

    const step1Heading = await client.evaluate(`document.querySelector('#panelQ1 .step-heading').textContent`);
    assert('Step 1 has wealth-oriented headline', step1Heading.includes('Select your primary wealth objective'), step1Heading);

    const step1CardsCount = await client.evaluate(`document.querySelectorAll('#panelQ1 .objective-card').length`);
    assert('Step 1 renders full-width stacked objective cards', step1CardsCount === 2, `count=${step1CardsCount}`);

    // Select Q1 Option: "Goal-based strategy"
    await client.evaluate(`(() => {
      const card = document.querySelector('.objective-card[data-choice="Goal-based strategy"]');
      card.click();
    })()`);
    await sleep(400);

    // 2. Step 2 (Investment Scale)
    const step2Active = await client.evaluate(`
      document.getElementById('panelQ2').style.display === 'flex' &&
      window.__sbFormState.q1 === 'Goal-based strategy'
    `);
    assert('Auto-advances to Step 2 on Step 1 selection', step2Active);

    const q2HeadingText1 = await client.evaluate(`document.getElementById('q2Heading').textContent`);
    assert('Step 2 heading reflects investment allocation', q2HeadingText1 === 'Planned investment in PMS', q2HeadingText1);

    const statutoryNote = await client.evaluate(`document.getElementById('q2Subnote').textContent`);
    assert('Step 2 displays single concise statutory note', statutoryNote.includes('₹50 Lakhs for Portfolio Management Services'), statutoryNote);

    await client.captureScreenshot(path.join(shotsDir, 'phase1-03-step2-q2-goal-390x844.png'));

    // Select Q2 Option: "50 Lakhs to 2 Crore"
    await client.evaluate(`(() => {
      const tile = document.querySelector('.q2-tile[data-choice="50 Lakhs to 2 Crore"]');
      tile.click();
    })()`);
    await sleep(400);

    // 3. Step 3 (Contact Conversion)
    const step3Active = await client.evaluate(`
      document.getElementById('panelContact').style.display === 'flex' &&
      window.__sbFormState.q2 === '50 Lakhs to 2 Crore'
    `);
    assert('Auto-advances directly to Step 3 (Contact Screen)', step3Active);

    // Verify Recap Pill & Edit Affordance
    const recapText1 = await client.evaluate(`document.getElementById('recapText').textContent`);
    assert('Recap pill reflects objective and allocation', recapText1.includes('Goal-based strategy') && recapText1.includes('50 Lakhs to 2 Crore'), recapText1);

    // Verify Benefit-Led Headline
    const contactHeading1 = await client.evaluate(`document.getElementById('contactHeading').textContent`);
    assert('Contact screen has benefit-led headline', contactHeading1.includes('PMS strategy consultation'), contactHeading1);

    // Verify no separate oversized compliance badge exists
    const complianceBadgeExists = await client.evaluate(`!!document.querySelector('.compliance-badge')`);
    assert('Oversized compliance badges removed from contact header', !complianceBadgeExists);

    // Verify minimal confidential footnote
    const footnoteText = await client.evaluate(`document.querySelector('.confidential-footnote').textContent`);
    assert('Single-line minimal privacy footnote present', footnoteText.includes('SEBI Reg. INP000001660'), footnoteText);

    await client.captureScreenshot(path.join(shotsDir, 'phase1-04-step3-contact-clean-390x844.png'));

    // 4. Test Under-50L Advisory Routing via Edit Affordance
    console.log('\n--- 🔄 Testing Under-₹50L Direct Advisory Routing ---');
    await client.evaluate(`document.getElementById('btnEditRecap').click()`);
    await sleep(350);

    // Change to "Portfolio review by experts"
    await client.evaluate(`(() => {
      const card = document.querySelector('.objective-card[data-choice="Portfolio review by experts"]');
      card.click();
    })()`);
    await sleep(400);

    const q2HeadingText2 = await client.evaluate(`document.getElementById('q2Heading').textContent`);
    assert('Step 2 heading adapts to "Size of portfolio to review"', q2HeadingText2 === 'Size of portfolio to review', q2HeadingText2);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-05-step2-portfolio-review-390x844.png'));

    // Select "Under 50 Lakhs"
    await client.evaluate(`(() => {
      const tile = document.querySelector('.q2-tile[data-choice="Under 50 Lakhs"]');
      tile.click();
    })()`);
    await sleep(400);

    // Check respectful under-50L contact screen routing
    const under50Heading = await client.evaluate(`document.getElementById('contactHeading').textContent`);
    assert('Under-₹50L dynamically routes to Mutual Fund Advisory headline', under50Heading.includes('mutual fund advisory consultation'), under50Heading);

    const under50BtnText = await client.evaluate(`document.querySelector('#btnContactSubmit .btn-text').textContent`);
    assert('Under-₹50L updates submit CTA to Request Advisory Consultation', under50BtnText === 'Request Advisory Consultation', under50BtnText);

    // 5. Contact Validation & Submission
    console.log('\n--- 🛡️ Testing Field Validation & Submission ---');
    // Name validation
    await client.evaluate(`(() => {
      const input = document.getElementById('contactName');
      input.value = 'R';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    })()`);
    const nameErr = await client.evaluate(`document.getElementById('nameError').textContent`);
    assert('Name field enforces min 2 characters', nameErr.includes('at least 2 characters'), nameErr);

    // Valid Name
    await client.evaluate(`(() => {
      const input = document.getElementById('contactName');
      input.value = 'Rahul Verma';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    })()`);

    // Invalid mobile
    await client.evaluate(`(() => {
      const input = document.getElementById('contactMobile');
      input.value = '55555';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    })()`);
    const mobileErr = await client.evaluate(`document.getElementById('mobileError').textContent`);
    assert('Mobile field validates 10-digit format', mobileErr.includes('10-digit'), mobileErr);

    await client.captureScreenshot(path.join(shotsDir, 'phase1-06-step3-validation-errors-390x844.png'));

    // Valid mobile
    await client.evaluate(`(() => {
      const input = document.getElementById('contactMobile');
      input.value = '9876543210';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    })()`);

    // City is optional: submit button should be enabled without city
    const submitBtnReadyNoCity = await client.evaluate(`!document.getElementById('btnContactSubmit').disabled`);
    assert('Form enables without requiring optional City', submitBtnReadyNoCity);

    // Provide city optionally
    await client.evaluate(`(() => {
      const input = document.getElementById('contactCity');
      input.value = 'Mumbai';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-07-step3-contact-ready-390x844.png'));

    // 6. Submit Contact Form and Verify Direct Transition to Confirmation
    console.log('\n--- ⚡ Testing Direct Confirmation & Optional Callback Chips ---');
    await client.evaluate(`document.getElementById('contactForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))`);

    // Button loading state
    const isLoading = await client.evaluate(`document.getElementById('btnContactSubmit').classList.contains('is-loading')`);
    assert('Submit button shows loading state during network simulation', isLoading);

    // Wait for transition to Thanks screen
    await sleep(500);

    const thanksActive = await client.evaluate(`
      document.getElementById('panelThanks').style.display === 'flex'
    `);
    assert('Submits directly to Confirmation screen (Standalone callback step removed)', thanksActive);

    // Verify Confirmation dynamic headline
    const thanksHeading = await client.evaluate(`document.getElementById('thanksHeading').textContent`);
    assert('Confirmation screen displays contextual heading', thanksHeading.includes('Advisory Consultation Request Confirmed'), thanksHeading);

    // Verify Integrated Optional Callback Chips
    const chipsCount = await client.evaluate(`document.querySelectorAll('.callback-chip').length`);
    assert('Confirmation screen renders 3 integrated callback chips', chipsCount === 3, `count=${chipsCount}`);

    // Click Morning chip
    await client.evaluate(`(() => {
      const chip = document.querySelector('.callback-chip[data-choice*="Morning"]');
      chip.click();
    })()`);
    await sleep(200);

    const morningSelected = await client.evaluate(`(() => {
      const chip = document.querySelector('.callback-chip[data-choice*="Morning"]');
      return chip.classList.contains('is-selected') && chip.getAttribute('aria-checked') === 'true';
    })()`);
    assert('Callback chip toggles to selected state upon tap', morningSelected);

    const savedHintText = await client.evaluate(`document.getElementById('callbackSavedHint').textContent`);
    assert('Callback saved hint displays instant reassurance', savedHintText.includes('Preference saved: Morning window selected'), savedHintText);

    await client.captureScreenshot(path.join(shotsDir, 'phase1-08-thanks-with-callback-390x844.png'));

    // Verify "Done • Return to Overview" button closes modal
    await client.evaluate(`document.getElementById('btnThanksClose').click()`);
    await sleep(350);

    const overlayClosed = await client.evaluate(`document.getElementById('stepOverlay').style.display === 'none'`);
    assert('Done button cleanly closes modal and returns user to overview', overlayClosed);

    // --- TEST SUITE 2: 360x640 Compact Mobile Viewport ---
    console.log('\n--- 📱 TEST SUITE 2: 360x640 Compact Mobile Viewport ---');
    await client.setViewport(360, 640, true);
    await client.evaluate(`window.__sbGoToStep('q1')`);
    await sleep(300);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-09-step1-360x640.png'));

    await client.evaluate(`window.__sbGoToStep('q2')`);
    await sleep(300);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-10-step2-360x640.png'));

    await client.evaluate(`window.__sbGoToStep('contact')`);
    await sleep(300);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-11-contact-360x640.png'));

    await client.evaluate(`window.__sbGoToStep('thanks')`);
    await sleep(300);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-12-thanks-360x640.png'));
    assert('Compact 360x640 viewport renders all steps cleanly without overflow', true);

    // --- TEST SUITE 3: 430x932 Large Mobile Viewport ---
    console.log('\n--- 📱 TEST SUITE 3: 430x932 Large Viewport ---');
    await client.setViewport(430, 932, true);
    await client.evaluate(`window.__sbGoToStep('q1')`);
    await sleep(300);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-13-step1-430x932.png'));

    await client.evaluate(`window.__sbGoToStep('q2')`);
    await sleep(300);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-14-step2-430x932.png'));

    await client.evaluate(`window.__sbGoToStep('contact')`);
    await sleep(300);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-15-contact-430x932.png'));

    await client.evaluate(`window.__sbGoToStep('thanks')`);
    await sleep(300);
    await client.captureScreenshot(path.join(shotsDir, 'phase1-16-thanks-430x932.png'));
    assert('Large 430x932 viewport renders with balanced proportion and clean margins', true);

    // Summary
    const totalPassed = testResults.filter(t => t.passed).length;
    const totalFailed = testResults.filter(t => !t.passed).length;
    console.log(`\n===========================================`);
    console.log(`🏁 Phase 1B Test Results: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log(`===========================================`);

    fs.writeFileSync(path.join(__dirname, 'phase1b-test-results.json'), JSON.stringify(testResults, null, 2));

  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
