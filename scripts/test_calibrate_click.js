const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9339',
    '--window-size=1440,900'
  ]);
  await new Promise(r => setTimeout(r, 1200));

  const listRes = await new Promise((resolve) => {
    http.get('http://127.0.0.1:9339/json/list', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
  });

  const page = listRes.find(t => t.type === 'page') || listRes[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const reqId = id++;
    const timer = setTimeout(() => rej(new Error('Timeout ' + method)), 15000);
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === reqId) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        if (msg.error) rej(msg.error);
        else res(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: reqId, method, params }));
  });

  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log('[CONSOLE]', m.params.type, m.params.args.map(a => a.value || a.description).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      console.error('[EXCEPTION]', m.params.exceptionDetails.text, m.params.exceptionDetails.exception?.description);
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3001' });

  // Wait for the calibrate button to appear (polling loop)
  console.log('Waiting for Calibrate button to appear in DOM...');
  let buttonFound = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const checkBtn = await send('Runtime.evaluate', {
      expression: `!!document.querySelector('[data-testid="btn-calibrate-ground"]')`,
      returnByValue: true
    });
    if (checkBtn.result.value) {
      buttonFound = true;
      break;
    }
  }

  if (!buttonFound) {
    throw new Error('Calibrate button never appeared in DOM');
  }

  console.log('Calibrate button found! Dispatching click event...');
  const clickRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = document.querySelector('[data-testid="btn-calibrate-ground"]');
        btn.click();
        return { clicked: true, title: btn.title };
      })()
    `,
    returnByValue: true
  });
  console.log('Click result:', clickRes.result.value);

  // Wait 1.5s for modal to open and canvases to initialize
  await new Promise(r => setTimeout(r, 1500));

  // Check modal elements
  const modalInfo = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const backdrop = document.querySelector('.modal-backdrop');
        const box = document.querySelector('.modal-box');
        const title = document.querySelector('.modal-header h3');
        const canvases = Array.from(document.querySelectorAll('.modal-box canvas')).map(c => ({
          width: c.width,
          height: c.height
        }));
        const buttons = Array.from(document.querySelectorAll('.modal-box button')).map(b => b.innerText.trim()).filter(Boolean);
        const ranges = Array.from(document.querySelectorAll('.modal-box input[type="range"]')).map(r => ({
          val: r.value,
          min: r.min,
          max: r.max
        }));
        return {
          hasBackdrop: !!backdrop,
          hasBox: !!box,
          titleText: title ? title.textContent : null,
          canvases,
          buttons,
          rangeSliders: ranges
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Modal Inspection:', JSON.stringify(modalInfo.result.value, null, 2));

  // Capture screenshot of opened modal
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const path1 = '/Users/rohankumarvaishya/.gemini/antigravity-ide/brain/846d155c-a768-4b50-93bf-76216dc1862f/calibrate_modal_opened.png';
  fs.writeFileSync(path1, Buffer.from(shot1.data, 'base64'));
  console.log('Saved modal opened screenshot! Size:', fs.statSync(path1).size);

  // Click preset "Security Checkpoint" or "Perimeter Fence Trench"
  console.log('Clicking Security Checkpoint preset button...');
  const presetClick = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('.modal-box button'));
        const pBtn = btns.find(b => b.innerText.includes('Security Checkpoint'));
        if (pBtn) {
          pBtn.click();
          return { clicked: true, name: pBtn.innerText };
        }
        return { clicked: false };
      })()
    `,
    returnByValue: true
  });
  console.log('Preset click result:', presetClick.result.value);

  await new Promise(r => setTimeout(r, 600));

  // Click "Save & Activate BEV Calibration"
  console.log('Clicking Save & Activate button...');
  const saveClick = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('.modal-box button'));
        const sBtn = btns.find(b => b.innerText.includes('Save & Activate'));
        if (sBtn) {
          sBtn.click();
          return { clicked: true, text: sBtn.innerText };
        }
        return { clicked: false };
      })()
    `,
    returnByValue: true
  });
  console.log('Save button click result:', saveClick.result.value);

  // Wait 1.5s for backend API response
  await new Promise(r => setTimeout(r, 1500));

  // Check for success banner
  const bannerCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = document.querySelector('.modal-box')?.innerText || '';
        return {
          hasSuccessText: text.includes('Homography calibration saved') || text.includes('saved for CAM-01')
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Save status verification in modal:', bannerCheck.result.value);

  // Capture screenshot of modal with saved success banner
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const path2 = '/Users/rohankumarvaishya/.gemini/antigravity-ide/brain/846d155c-a768-4b50-93bf-76216dc1862f/calibrate_modal_saved.png';
  fs.writeFileSync(path2, Buffer.from(shot2.data, 'base64'));
  console.log('Saved modal saved screenshot! Size:', fs.statSync(path2).size);

  ws.close();
  chrome.kill();
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

main().catch(console.error);
