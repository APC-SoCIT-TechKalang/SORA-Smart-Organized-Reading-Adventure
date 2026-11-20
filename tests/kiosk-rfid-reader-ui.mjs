// Start reader Vite on 127.0.0.1:5173. Login responses are mocked; no live writes.
import assert from 'node:assert/strict';
import { chromium } from '../work/shelf-validation/node_modules/playwright/index.mjs';
const browser = await chromium.launch({headless:true,channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1200,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const scans=[];
  await page.route('**/api/kiosk/rfid-login',async route=>{
    scans.push(route.request().postDataJSON().rfidUid);
    assert.equal(route.request().headers()['x-kiosk-reader-key'],undefined,'Reader secret must never be sent by browser JavaScript');
    await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Test card received — ask staff to register this card.'})});
  });
  await page.goto('http://127.0.0.1:5173/kiosk');
  await page.getByRole('heading',{name:'Tap to log in'}).waitFor();
  await page.keyboard.type('0001234567',{delay:10});await page.keyboard.press('Enter');
  await page.getByRole('alert').filter({hasText:'Test card received'}).waitFor();
  assert.deepEqual(scans,['0001234567']);
  await page.getByRole('button',{name:'Start card reader'}).click();
  await page.getByRole('status').filter({hasText:'USB card scanning is enabled'}).waitFor();
  await page.keyboard.type('ABCD1234',{delay:10});await page.keyboard.press('Tab');
  await page.getByRole('alert').filter({hasText:'Test card received'}).waitFor();
  assert.deepEqual(scans,['0001234567','ABCD1234']);
  await page.keyboard.type('123456',{delay:200});await page.keyboard.press('Enter');
  assert.equal(scans.length,2,'Slow typing is not accepted as a reader scan');
  assert.deepEqual(errors,[]);
  console.log('PASS: actual browser keyboard scans reach login automatically, preserve zeroes, support Enter/Tab, show server errors and keep bridge credentials out of browser requests.');
} finally {await browser.close();}
