const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SHOTS_DIR = '/Users/vedansh/.gemini/antigravity/brain/47a31b78-ca18-417d-9468-1d23951e2912/shots/leadership-redesign';
if (!fs.existsSync(SHOTS_DIR)) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendCDP(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const msg = JSON.stringify({ id, method, params });
    const handler = (event) => {
      try {
        const res = JSON.parse(event.data);
        if (res.id === id) {
          ws.removeEventListener('message', handler);
          if (res.error) reject(res.error);
          else resolve(res.result);
        }
      } catch (e) {}
    };
    ws.addEventListener('message', handler);
    ws.send(msg);
  });
}

async function run() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-translate',
    '--disable-extensions'
  ]);

  console.log('--- Launching Chrome for Leadership & Governance Mobile Redesign Testing ---');
  await sleep(1500);

  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9229/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const pageTarget = targets.find(t => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(res => ws.addEventListener('open', res));

  await sendCDP(ws, 'Page.enable');
  await sendCDP(ws, 'DOM.enable');
  await sendCDP(ws, 'CSS.enable');
  await sendCDP(ws, 'Runtime.enable');

  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    if (condition) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Load Page at 390x844 (standard modern mobile)
  await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  await sendCDP(ws, 'Page.navigate', { url: 'http://localhost:8089/index.html' });
  await sleep(1500);

  console.log('\n=== Test Suite 1: Leadership Hierarchy & Large Focal Portraits ===');
  const sectionData = await sendCDP(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const sec = document.getElementById("sec-leadership");
      const title = document.getElementById("headingLeadership")?.textContent.trim();
      const badge = sec?.querySelector(".btf-badge")?.textContent.trim();
      const cards = Array.from(sec.querySelectorAll(".leadership-card"));
      const heritageBlock = sec.querySelector(".leadership-heritage");
      const footerText = document.querySelector(".btf-footer")?.textContent || '';

      const cardDetails = cards.map(c => {
        const frame = c.querySelector(".leader-portrait-frame");
        const img = c.querySelector(".leader-portrait-img");
        const name = c.querySelector(".leader-name")?.textContent.trim();
        const role = c.querySelector(".leader-role")?.textContent.trim();
        const bio = c.querySelector(".leader-bio")?.textContent.trim();

        const frameRect = frame ? frame.getBoundingClientRect() : null;
        const nameRect = c.querySelector(".leader-name")?.getBoundingClientRect();
        const roleRect = c.querySelector(".leader-role")?.getBoundingClientRect();
        const bioRect = c.querySelector(".leader-bio")?.getBoundingClientRect();

        const nStyle = window.getComputedStyle(c.querySelector(".leader-name"));
        const rStyle = window.getComputedStyle(c.querySelector(".leader-role"));

        return {
          name, role, bio,
          imgSrc: img?.getAttribute("src"),
          frameW: frameRect?.width,
          frameH: frameRect?.height,
          hierarchyCorrect: (frameRect && nameRect && roleRect && bioRect) ?
            (frameRect.top < nameRect.top && nameRect.top < roleRect.top && roleRect.top < bioRect.top) : false,
          nameFontSize: parseFloat(nStyle.fontSize),
          roleFontSize: parseFloat(rStyle.fontSize)
        };
      });

      return {
        title, badge,
        cardCount: cards.length,
        hasHeritageBlock: !!heritageBlock,
        footerPreservesReg: footerText.includes("INP000001660") &&
                            footerText.includes("Wealth Managers (India) Private Limited") &&
                            footerText.includes("Bharat Phatak and Ajit Khasnis"),
        cardDetails
      };
    })()`,
    returnByValue: true
  });

  const { title, badge, cardCount, hasHeritageBlock, footerPreservesReg, cardDetails } = sectionData.result.value;

  assert(title === 'Experienced leadership at the helm', 'Section title preserved verbatim');
  assert(badge === 'Leadership & Governance', 'Section eyebrow badge matches "Leadership & Governance"');
  assert(cardCount === 4, 'Exactly 4 leadership profiles present in carousel');
  assert(!hasHeritageBlock, 'Institutional Heritage block completely removed from leadership section');
  assert(footerPreservesReg, 'All regulatory entities, SEBI reg and founding heritage safely preserved in footer');

  // Verify Card 1: Atul Shinghal
  const c1 = cardDetails[0];
  assert(c1.name === 'Atul Shinghal', 'Leader 1 name is Atul Shinghal');
  assert(c1.role === 'Founder of Scripbox', 'Leader 1 role correct');
  assert(c1.bio === 'Over two decades championing scientific capital allocation, fiduciary discipline, and investor-first alignment.', 'Leader 1 bio preserved verbatim');
  assert(c1.frameW >= 250 && c1.frameH >= 250, `Leader 1 has large prominent portrait frame (${Math.round(c1.frameW)}x${Math.round(c1.frameH)}px, not a thumbnail)`);
  assert(c1.hierarchyCorrect, 'Leader 1 follows deliberate hierarchy: Portrait -> Name -> Role -> Bio');
  assert(c1.nameFontSize >= 21, `Leader 1 name has strong editorial prominence (${c1.nameFontSize}px)`);

  // Verify Card 2: Sanjiv Singhal
  const c2 = cardDetails[1];
  assert(c2.name === 'Sanjiv Singhal', 'Leader 2 name is Sanjiv Singhal');
  assert(c2.role.includes('Co-founder'), 'Leader 2 role correct');
  assert(c2.bio === 'Product and technology pioneer guiding institutional research frameworks, quantitative models, and risk systems.', 'Leader 2 bio preserved verbatim');
  assert(c2.frameW >= 250 && c2.frameH >= 250, `Leader 2 has large prominent portrait frame (${Math.round(c2.frameW)}x${Math.round(c2.frameH)}px)`);

  // Verify Card 3: Mandar Bagul
  const c3 = cardDetails[2];
  assert(c3.name === 'Mandar Bagul', 'Leader 3 name is Mandar Bagul');
  assert(c3.role.includes('Director') && c3.role.includes('Advisory'), 'Leader 3 role correct');
  assert(c3.bio === '24+ years in multi-factor active portfolio construction across fundamental, macro, and quantitative equity disciplines.', 'Leader 3 bio preserved verbatim');
  assert(c3.frameW >= 250 && c3.frameH >= 250, `Leader 3 has large prominent portrait frame (${Math.round(c3.frameW)}x${Math.round(c3.frameH)}px)`);

  // Verify Card 4: Mayur Parkeria
  const c4 = cardDetails[3];
  assert(c4.name === 'Mayur Parkeria', 'Leader 4 name is Mayur Parkeria');
  assert(c4.role === 'Equity Fund Manager', 'Leader 4 role correct');
  assert(c4.bio === '20+ years of equity research experience, managing high-conviction portfolios focused on durable economic moats.', 'Leader 4 bio preserved verbatim');
  assert(c4.frameW >= 250 && c4.frameH >= 250, `Leader 4 has large prominent portrait frame (${Math.round(c4.frameW)}x${Math.round(c4.frameH)}px)`);

  console.log('\n=== Test Suite 2: Track Geometry & Discoverability Peek ===');
  const trackData = await sendCDP(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const track = document.getElementById("leadershipCarouselTrack");
      const cards = track.querySelectorAll(".leadership-card");
      const c1Rect = cards[0].getBoundingClientRect();
      const c2Rect = cards[1].getBoundingClientRect();
      const tStyle = window.getComputedStyle(track);
      const vWidth = window.innerWidth;
      const card2PeekVisible = vWidth - c2Rect.left;
      return {
        snapType: tStyle.scrollSnapType,
        overflowX: tStyle.overflowX,
        cardW: c1Rect.width,
        card2PeekVisible
      };
    })()`,
    returnByValue: true
  });

  assert(trackData.result.value.snapType.includes('mandatory'), 'Carousel uses CSS scroll snapping (scroll-snap-type: x mandatory)');
  assert(trackData.result.value.overflowX === 'auto', 'Carousel track uses native touch scrolling (overflow-x: auto)');
  assert(trackData.result.value.card2PeekVisible >= 24 && trackData.result.value.card2PeekVisible <= 65,
    `Portion of next card is visible on mobile for discoverability (${Math.round(trackData.result.value.card2PeekVisible)}px peek visible)`);

  console.log('\n=== Test Suite 3: Interactive Carousel Controls & Touch Targets ===');
  // Initial state check
  const initControls = await sendCDP(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const prevDisabled = document.getElementById("btnLeaderPrev")?.disabled;
      const nextDisabled = document.getElementById("btnLeaderNext")?.disabled;
      const dots = Array.from(document.querySelectorAll(".carousel-dot-btn"));
      const activeDotIdx = dots.findIndex(d => d.classList.contains("is-active"));
      const liveStatus = document.getElementById("leaderLiveStatus")?.textContent.trim();

      const prevRect = document.getElementById("btnLeaderPrev")?.getBoundingClientRect();
      const nextRect = document.getElementById("btnLeaderNext")?.getBoundingClientRect();
      const dotRectsValid = dots.every(d => {
        const r = d.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44;
      });

      return {
        prevDisabled, nextDisabled, activeDotIdx, liveStatus,
        touchTargetsValid: prevRect.width >= 44 && prevRect.height >= 44 &&
                           nextRect.width >= 44 && nextRect.height >= 44 && dotRectsValid
      };
    })()`,
    returnByValue: true
  });

  assert(initControls.result.value.prevDisabled === true, 'Previous button initially disabled at slide 1');
  assert(initControls.result.value.nextDisabled === false, 'Next button enabled at slide 1');
  assert(initControls.result.value.activeDotIdx === 0, 'Dot 0 is marked active');
  assert(initControls.result.value.touchTargetsValid === true, 'All navigation buttons and dot controls meet >= 44x44px touch target guidelines');

  // Navigate to Slide 2 via Next Button
  await sendCDP(ws, 'Runtime.evaluate', {
    expression: 'document.getElementById("btnLeaderNext").click()'
  });
  await sleep(400);

  const slide2Controls = await sendCDP(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const prevDisabled = document.getElementById("btnLeaderPrev")?.disabled;
      const nextDisabled = document.getElementById("btnLeaderNext")?.disabled;
      const dots = Array.from(document.querySelectorAll(".carousel-dot-btn"));
      const activeDotIdx = dots.findIndex(d => d.classList.contains("is-active"));
      return { prevDisabled, nextDisabled, activeDotIdx };
    })()`,
    returnByValue: true
  });

  assert(slide2Controls.result.value.activeDotIdx === 1, 'Clicking Next advances active dot indicator to slide 2');
  assert(slide2Controls.result.value.prevDisabled === false && slide2Controls.result.value.nextDisabled === false, 'Both Prev and Next enabled at slide 2');

  // Navigate to Slide 4 via Dot 3 click
  await sendCDP(ws, 'Runtime.evaluate', {
    expression: 'document.querySelectorAll(".carousel-dot-btn")[3].click()'
  });
  await sleep(400);

  const slide4Controls = await sendCDP(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const prevDisabled = document.getElementById("btnLeaderPrev")?.disabled;
      const nextDisabled = document.getElementById("btnLeaderNext")?.disabled;
      const dots = Array.from(document.querySelectorAll(".carousel-dot-btn"));
      const activeDotIdx = dots.findIndex(d => d.classList.contains("is-active"));
      return { prevDisabled, nextDisabled, activeDotIdx };
    })()`,
    returnByValue: true
  });

  assert(slide4Controls.result.value.activeDotIdx === 3, 'Clicking Dot 4 navigates directly to slide 4 (Mayur Parkeria)');
  assert(slide4Controls.result.value.nextDisabled === true, 'Next button disabled at end of carousel');

  // Reset to Slide 1
  await sendCDP(ws, 'Runtime.evaluate', {
    expression: 'document.querySelectorAll(".carousel-dot-btn")[0].click()'
  });
  await sleep(400);

  console.log('\n=== Test Suite 4: Responsive Viewport Overflow Tests ===');
  for (const w of [320, 360, 375, 390, 430]) {
    await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
      width: w,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(200);

    const overflowCheck = await sendCDP(ws, 'Runtime.evaluate', {
      expression: 'document.documentElement.scrollWidth <= window.innerWidth',
      returnByValue: true
    });
    assert(overflowCheck.result.value === true, `Zero page horizontal overflow at ${w}px width`);
  }

  console.log('\n=== Capturing High-DPI Screenshots ===');
  // 1. Full section at 390px (Slide 1 Active)
  await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sendCDP(ws, 'Runtime.evaluate', {
    expression: 'document.getElementById("sec-leadership").scrollIntoView({ block: "start", behavior: "instant" });'
  });
  await sleep(400);

  const rect390 = await sendCDP(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const el = document.getElementById('sec-leadership');
      const r = el.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
    })()`,
    returnByValue: true
  });

  const shotSection390 = await sendCDP(ws, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: {
      x: rect390.result.value.x,
      y: rect390.result.value.y,
      width: rect390.result.value.width,
      height: rect390.result.value.height,
      scale: 1
    }
  });
  fs.writeFileSync(path.join(SHOTS_DIR, '01-leadership-section-390px.png'), Buffer.from(shotSection390.data, 'base64'));
  console.log('  ✓ Captured: 01-leadership-section-390px.png');

  // 2. Full section at 375px
  await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sendCDP(ws, 'Runtime.evaluate', {
    expression: 'document.getElementById("sec-leadership").scrollIntoView({ block: "start", behavior: "instant" });'
  });
  await sleep(400);

  const rect375 = await sendCDP(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const el = document.getElementById('sec-leadership');
      const r = el.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
    })()`,
    returnByValue: true
  });

  const shotSection375 = await sendCDP(ws, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: {
      x: rect375.result.value.x,
      y: rect375.result.value.y,
      width: rect375.result.value.width,
      height: rect375.result.value.height,
      scale: 1
    }
  });
  fs.writeFileSync(path.join(SHOTS_DIR, '02-leadership-section-375px.png'), Buffer.from(shotSection375.data, 'base64'));
  console.log('  ✓ Captured: 02-leadership-section-375px.png');

  // 3. Viewport shots of each slide at 390px
  await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  const leaderFiles = [
    '03-leader-slide1-atul-390px.png',
    '04-leader-slide2-sanjiv-390px.png',
    '05-leader-slide3-mandar-390px.png',
    '06-leader-slide4-mayur-390px.png'
  ];

  for (let idx = 0; idx < 4; idx++) {
    await sendCDP(ws, 'Runtime.evaluate', {
      expression: `(() => {
        document.querySelectorAll(".carousel-dot-btn")[${idx}].click();
        document.getElementById("sec-leadership").scrollIntoView({ block: "start", behavior: "instant" });
      })()`
    });
    await sleep(350);

    const shotSlide = await sendCDP(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS_DIR, leaderFiles[idx]), Buffer.from(shotSlide.data, 'base64'));
    console.log(`  ✓ Captured: ${leaderFiles[idx]}`);
  }

  console.log(`\n=========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed.`);
  console.log(`=========================================`);

  chromeProcess.kill();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
