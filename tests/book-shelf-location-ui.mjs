// Start Vite on 5174 with the dummy settings described in DEPLOYMENT.md.
import assert from 'node:assert/strict';
import { chromium } from '../work/shelf-validation/node_modules/playwright/index.mjs';
const browser = await chromium.launch({headless:true,channel:'chrome'});
try {
  for (const width of [1440,375]) {
    const context = await browser.newContext({viewport:{width,height:1100}});
    const user = {id:'00000000-0000-4000-8000-000000000001',email:'reader@example.test',app_metadata:{},user_metadata:{}};
    const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.mock`;
    await context.addInitScript(({user,token}) => localStorage.setItem('sb-demo-auth-token',JSON.stringify({access_token:token,refresh_token:'mock',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,token});
    let status = 'In-Shelf', shelf = 'Shelf A2';
    await context.route('https://demo.supabase.co/**', async route => {
      const table = new URL(route.request().url()).pathname.split('/').at(-1);
      let data = [];
      if (route.request().url().includes('/auth/')) data=user;
      else if(table==='is_librarian') data=false;
      else if(table==='current_user_id') data=user.id;
      else if(table==='points_balance') data=0;
      else if(table==='books') data=[{book_id:1,title:'Shelf Test Book',authors:{author_firstname:'A',author_lastname:'Writer'},book_genre:'Manga',book_copies:[{copy_id:1,copy_status:status,shelf_location:shelf}]}];
      else if(table==='users') data={...user,first_name:'A',last_name:'Reader',is_active:true};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for (const [nextStatus,nextShelf,message,map] of [
      ['In-Shelf','Shelf A2','Main Reading Hall — Shelf A2',true],
      ['With Reader','Shelf A2','Currently With Reader (Not on shelf)',false],
      ['On Hold','Shelf A2','Reserved — Located at the Hold Shelf (Ask Staff)',false],
      ['In-Shelf',null,'Shelf location data missing — Please ask library staff for assistance.',false],
      ['In Return Cart','Shelf A2','Return Cart — Awaiting staff inspection (Not on shelf)',false],
      ['Damaged','Shelf A2','Damaged — Removed from circulation (Ask Staff)',false],
    ]) {
      status=nextStatus;shelf=nextShelf;
      await page.goto('http://127.0.0.1:5174');
      await page.getByRole('button',{name:/Browse Books|Catalog/i}).first().click();
      await page.getByRole('button').filter({hasText:'Shelf Test Book'}).first().click();
      const dialog=page.getByRole('dialog');
      await dialog.getByText(message,{exact:true}).waitFor();
      assert.equal(await dialog.getByRole('img',{name:/Main Reading Hall:/}).count(),map?1:0);
      assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Modal must not overflow horizontally');
      if(map) await page.screenshot({path:`work/shelf-validation/reader-${width}.png`,fullPage:true});
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('PASS: all six shelf states on desktop and mobile, conditional map, no horizontal modal overflow or browser errors.');
} finally { await browser.close(); }
