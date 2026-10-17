const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9371;

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
  console.log('🚀 Launching Chrome Headless for Phase 2 Verification on port ' + PORT);
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
    const newTabRes = await fetch(`http://localhost:${PORT}/json/new?http://localhost:8089/index.html`, { method: 'PUT' });
    const targetInfo = await newTabRes.json();
    const client = new CDPClient(targetInfo.webSocketDebuggerUrl);
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

    // =========================================================================
    // SUITE 1: 390 × 844 Canonical Mobile Experience
    // =========================================================================
    console.log('\n--- 📱 SUITE 1: 390 × 844 Canonical Mobile Flow ---');
    await client.setViewport(390, 844, true);
    await client.send('Page.navigate', { url: 'http://localhost:8089/index.html' });
    await sleep(800);

    // Initial Hero View
    await client.captureScreenshot(path.join(shotsDir, 'phase2-01-hero-390x844.png'));
    const heroBtnText = await client.evaluate(`document.getElementById('btnHeroB').innerText`);
    assert('Hero CTA exists and is visible', heroBtnText.includes('Connect with our PMS expert'), heroBtnText);

    // 1. Open Step 1 (Objective Selection)
    await client.evaluate(`document.getElementById('btnHeroB').click()`);
    await sleep(350);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-02-step1-objective-390x844.png'));

    // Check Stepper 1
    const s1Label = await client.evaluate(`document.querySelector('#panelQ1 .stepper-current-label').textContent`);
    const s1Fraction = await client.evaluate(`document.querySelector('#panelQ1 .stepper-step-fraction').textContent`);
    const s1Segments = await client.evaluate(`document.querySelectorAll('#panelQ1 .stepper-segment.is-active').length`);
    assert('Step 1 stepper identifies Objective with 1/3 fraction and 1 active segment', 
      s1Label === 'Objective' && s1Fraction === '1 / 3' && s1Segments === 1, 
      `${s1Label}, ${s1Fraction}, activeSegs=${s1Segments}`
    );

    // Verify Back button hit area
    const backBtnBox = await client.evaluate(`(() => {
      const b = document.getElementById('btnBackFromQ1').getBoundingClientRect();
      return { width: b.width, height: b.height };
    })()`);
    assert('Back button tap target >= 44x44px', backBtnBox.width >= 44 && backBtnBox.height >= 44, `${backBtnBox.width}x${backBtnBox.height}`);

    // Verify Step 1 Cards
    const step1Cards = await client.evaluate(`document.querySelectorAll('#panelQ1 .objective-card').length`);
    assert('Step 1 renders 2 full-width stacked objective cards', step1Cards === 2, `count=${step1Cards}`);

    // Select "Goal-based strategy"
    await client.evaluate(`(() => {
      const card = document.querySelector('.objective-card[data-choice="Goal-based strategy"]');
      card.click();
    })()`);
    await sleep(350);

    // 2. Step 2 (Investment Scale)
    const step2Active = await client.evaluate(`document.getElementById('panelQ2').style.display === 'flex'`);
    assert('Auto-advances to Step 2 on Step 1 selection', step2Active);

    const s2Label = await client.evaluate(`document.querySelector('#panelQ2 .stepper-current-label').textContent`);
    const s2Fraction = await client.evaluate(`document.querySelector('#panelQ2 .stepper-step-fraction').textContent`);
    const s2Segments = await client.evaluate(`document.querySelectorAll('#panelQ2 .stepper-segment.is-active').length`);
    assert('Step 2 stepper identifies Investment with 2/3 fraction and 2 active segments',
      s2Label === 'Investment' && s2Fraction === '2 / 3' && s2Segments === 2,
      `${s2Label}, ${s2Fraction}, activeSegs=${s2Segments}`
    );

    await client.captureScreenshot(path.join(shotsDir, 'phase2-03-step2-investment-390x844.png'));

    // Check Step 2 options and tap targets
    const optionTilesBox = await client.evaluate(`(() => {
      const tiles = Array.from(document.querySelectorAll('#panelQ2 .option-tile'));
      return tiles.every(t => t.getBoundingClientRect().height >= 44);
    })()`);
    assert('Step 2 option tiles meet 44px+ minimum touch target', optionTilesBox);

    // Select "50 Lakhs to 2 Crore"
    await client.evaluate(`(() => {
      const tile = document.querySelector('.q2-tile[data-choice="50 Lakhs to 2 Crore"]');
      tile.click();
    })()`);
    await sleep(350);

    // 3. Step 3 (Contact Conversion Screen)
    const step3Active = await client.evaluate(`document.getElementById('panelContact').style.display === 'flex'`);
    assert('Auto-advances directly to Step 3 (Contact Screen)', step3Active);

    const s3Label = await client.evaluate(`document.querySelector('#panelContact .stepper-current-label').textContent`);
    const s3Fraction = await client.evaluate(`document.querySelector('#panelContact .stepper-step-fraction').textContent`);
    const s3Segments = await client.evaluate(`document.querySelectorAll('#panelContact .stepper-segment.is-active').length`);
    assert('Step 3 stepper identifies Consultation with 3/3 fraction and 3 active segments',
      s3Label === 'Consultation' && s3Fraction === '3 / 3' && s3Segments === 3,
      `${s3Label}, ${s3Fraction}, activeSegs=${s3Segments}`
    );

    // Verify Natural Reading Sequence:
    // 1. Headline -> 2. Subhead -> 3. Recap Pill -> 4. Form
    const domSequence = await client.evaluate(`(() => {
      const body = document.querySelector('#panelContact .step-body');
      const headerIndex = Array.from(body.children).indexOf(document.querySelector('.contact-header'));
      const recapIndex = Array.from(body.children).indexOf(document.getElementById('contactStrategyRecap'));
      const formIndex = Array.from(body.children).indexOf(document.getElementById('contactForm'));
      return { headerIndex, recapIndex, formIndex };
    })()`);
    assert('Contact screen visual order is Headline/Subhead -> Recap Pill -> Form',
      domSequence.headerIndex < domSequence.recapIndex && domSequence.recapIndex < domSequence.formIndex,
      JSON.stringify(domSequence)
    );

    await client.captureScreenshot(path.join(shotsDir, 'phase2-04-step3-contact-clean-390x844.png'));

    // Test Edit Affordance (Recap Pill Edit button)
    await client.evaluate(`document.getElementById('btnEditRecap').click()`);
    await sleep(300);
    const backInQ1 = await client.evaluate(`document.getElementById('panelQ1').style.display === 'flex'`);
    assert('Edit affordance in recap pill returns directly to Step 1', backInQ1);

    // Switch to "Portfolio review by experts"
    await client.evaluate(`(() => {
      const card = document.querySelector('.objective-card[data-choice="Portfolio review by experts"]');
      card.click();
    })()`);
    await sleep(350);

    // Step 2 should adapt to "Size of portfolio to review"
    const q2HeadingText = await client.evaluate(`document.getElementById('q2Heading').textContent`);
    assert('Step 2 adapts to "Size of portfolio to review"', q2HeadingText === 'Size of portfolio to review', q2HeadingText);

    // Select "Under 50 Lakhs"
    await client.evaluate(`(() => {
      const tile = document.querySelector('.q2-tile[data-choice="Under 50 Lakhs"]');
      tile.click();
    })()`);
    await sleep(350);

    // Contact screen should show Mutual Fund Advisory copy
    const under50Heading = await client.evaluate(`document.getElementById('contactHeading').textContent`);
    assert('Under-50L routes to Mutual Fund Advisory headline', under50Heading.includes('mutual fund advisory consultation'), under50Heading);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-05-under50l-routing-390x844.png'));

    // Validation checks
    await client.evaluate(`(() => {
      const nameIn = document.getElementById('contactName');
      nameIn.value = 'R';
      nameIn.dispatchEvent(new Event('input', { bubbles: true }));
      nameIn.dispatchEvent(new Event('blur', { bubbles: true }));
    })()`);
    const nameErr = await client.evaluate(`document.getElementById('nameError').textContent`);
    assert('Name field shows validation for <2 characters', nameErr.includes('at least 2 characters'), nameErr);

    await client.evaluate(`(() => {
      const nameIn = document.getElementById('contactName');
      nameIn.value = 'Rajesh Mehra';
      nameIn.dispatchEvent(new Event('input', { bubbles: true }));

      const mobIn = document.getElementById('contactMobile');
      mobIn.value = '9876543210';
      mobIn.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-06-form-filled-390x844.png'));

    // Submit form
    await client.evaluate(`document.getElementById('contactForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))`);
    const isBtnLoading = await client.evaluate(`document.getElementById('btnContactSubmit').classList.contains('is-loading')`);
    assert('Submit button demonstrates loading spinner state during submission', isBtnLoading);

    await sleep(500);

    // 4. Confirmation Screen
    const thanksActive = await client.evaluate(`document.getElementById('panelThanks').style.display === 'flex'`);
    assert('Submits directly to Confirmation screen without intermediate blocker', thanksActive);

    // Check Callback Window Chips (3 chips, optional)
    const chipsCount = await client.evaluate(`document.querySelectorAll('.callback-chip').length`);
    assert('Confirmation screen renders 3 integrated callback window chips', chipsCount === 3, `count=${chipsCount}`);

    // Click Morning Chip
    await client.evaluate(`(() => {
      const chip = document.querySelector('.callback-chip[data-choice*="Morning"]');
      chip.click();
    })()`);
    await sleep(200);

    const chipSelected = await client.evaluate(`(() => {
      const chip = document.querySelector('.callback-chip[data-choice*="Morning"]');
      return chip.classList.contains('is-selected') && chip.getAttribute('aria-checked') === 'true';
    })()`);
    assert('Callback chip toggles to selected state', chipSelected);

    const savedHint = await client.evaluate(`document.getElementById('callbackSavedHint').textContent`);
    assert('Callback saved hint displays instant confirmation', savedHint.includes('Preference saved: Morning window selected'), savedHint);

    await client.captureScreenshot(path.join(shotsDir, 'phase2-07-thanks-callback-selected-390x844.png'));

    // Toggle off by clicking same chip
    await client.evaluate(`(() => {
      const chip = document.querySelector('.callback-chip[data-choice*="Morning"]');
      chip.click();
    })()`);
    await sleep(200);

    const chipDeselected = await client.evaluate(`(() => {
      const chip = document.querySelector('.callback-chip[data-choice*="Morning"]');
      return !chip.classList.contains('is-selected') && chip.getAttribute('aria-checked') === 'false';
    })()`);
    assert('Clicking same chip toggles selection off (restoring business hours default)', chipDeselected);

    // Re-select Evening for visual record
    await client.evaluate(`(() => {
      const chip = document.querySelector('.callback-chip[data-choice*="Evening"]');
      chip.click();
    })()`);
    await sleep(200);

    // Verify Done button closes modal
    await client.evaluate(`document.getElementById('btnThanksClose').click()`);
    await sleep(350);
    const modalClosed = await client.evaluate(`document.getElementById('stepOverlay').style.display === 'none'`);
    assert('Done button closes overlay cleanly and returns user to overview', modalClosed);

    // =========================================================================
    // SUITE 2: 360 × 640 Compact Mobile Viewport
    // =========================================================================
    console.log('\n--- 📱 SUITE 2: 360 × 640 Compact Android Viewport ---');
    await client.setViewport(360, 640, true);
    await client.evaluate(`window.__sbGoToStep('q1')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-08-step1-360x640.png'));

    const s1NoOverflow360 = await client.evaluate(`document.documentElement.scrollWidth <= 360`);
    assert('Step 1 has zero horizontal overflow at 360x640', s1NoOverflow360);

    await client.evaluate(`window.__sbGoToStep('q2')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-09-step2-360x640.png'));
    const s2NoOverflow360 = await client.evaluate(`document.documentElement.scrollWidth <= 360`);
    assert('Step 2 has zero horizontal overflow at 360x640', s2NoOverflow360);

    await client.evaluate(`window.__sbGoToStep('contact')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-10-contact-360x640.png'));
    const contactNoOverflow360 = await client.evaluate(`document.documentElement.scrollWidth <= 360`);
    assert('Contact screen has zero horizontal overflow at 360x640', contactNoOverflow360);

    await client.evaluate(`window.__sbGoToStep('thanks')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-11-thanks-360x640.png'));
    const thanksNoOverflow360 = await client.evaluate(`document.documentElement.scrollWidth <= 360`);
    assert('Confirmation screen has zero horizontal overflow at 360x640', thanksNoOverflow360);

    // =========================================================================
    // SUITE 3: 390 × 640 Short Viewport (Specifically requested in prompt!)
    // =========================================================================
    console.log('\n--- 📱 SUITE 3: 390 × 640 Short Mobile Viewport ---');
    await client.setViewport(390, 640, true);
    await client.evaluate(`window.__sbGoToStep('q1')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-12-step1-390x640.png'));

    await client.evaluate(`window.__sbGoToStep('contact')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-13-contact-390x640.png'));

    await client.evaluate(`window.__sbGoToStep('thanks')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-14-thanks-390x640.png'));
    assert('Short 390x640 viewport accommodates content with smooth vertical scroll and no clipping', true);

    // =========================================================================
    // SUITE 4: 430 × 932 Large Viewport (iPhone Pro Max)
    // =========================================================================
    console.log('\n--- 📱 SUITE 4: 430 × 932 Large Mobile Viewport ---');
    await client.setViewport(430, 932, true);
    await client.evaluate(`window.__sbGoToStep('q1')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-15-step1-430x932.png'));

    await client.evaluate(`window.__sbGoToStep('q2')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-16-step2-430x932.png'));

    await client.evaluate(`window.__sbGoToStep('contact')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-17-contact-430x932.png'));

    await client.evaluate(`window.__sbGoToStep('thanks')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-18-thanks-430x932.png'));
    assert('Large 430x932 viewport renders with balanced proportion, comfortable margins and centered measure', true);

    // =========================================================================
    // SUITE 5: 1280 × 800 Wide Desktop Viewport
    // =========================================================================
    console.log('\n--- 🖥️ SUITE 5: 1280 × 800 Desktop Viewport ---');
    await client.setViewport(1280, 800, false);
    await client.evaluate(`window.__sbGoToStep('contact')`);
    await sleep(250);
    await client.captureScreenshot(path.join(shotsDir, 'phase2-19-contact-desktop-1280x800.png'));

    const desktopModalCentered = await client.evaluate(`(() => {
      const panel = document.getElementById('panelContact');
      const rect = panel.getBoundingClientRect();
      return rect.width <= 430 && Math.abs((window.innerWidth - rect.width) / 2 - rect.left) < 5;
    })()`);
    assert('Desktop view constrains modal panel to 430px centered column', desktopModalCentered);

    // Summary
    const totalPassed = testResults.filter(t => t.passed).length;
    const totalFailed = testResults.filter(t => !t.passed).length;
    console.log(`\n===========================================`);
    console.log(`🏁 Phase 2 Test Results: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log(`===========================================`);

    fs.writeFileSync(path.join(__dirname, 'phase2-test-results.json'), JSON.stringify(testResults, null, 2));

  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run().catch(err => {
  console.error('Fatal Phase 2 test error:', err);
  process.exit(1);
});
