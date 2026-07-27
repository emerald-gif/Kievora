// ecosystem-sections-extra.js — Category-specific section library extension
// Loaded alongside ecosystem-sections.js to add per-category unique designs

(function(){
'use strict';

const EXTRA_SECTIONS = [
{
  id:'rest-hero', name:'Restaurant Hero', icon:'🍽️',
  category:['restaurant'],
  tags:['hero','restaurant','food','dark'],
  fields:[
    {k:'[data-f="badge"]',t:'text',l:'Top Badge'},
    {k:'[data-f="headline"]',t:'text',l:'Restaurant Name'},
    {k:'[data-f="tagline"]',t:'text',l:'Tagline'},
    {k:'[data-f="cta-text"]',t:'text',l:'Order Button'},
    {k:'[data-f="wa-number"]',t:'link',l:'WhatsApp Link'},
    {k:'[data-f="image"]',t:'image',l:'Food Photo'},
    {k:'[data-f="hours"]',t:'text',l:'Opening Hours'},
  ],
  html:`
<section data-sid="rest-hero" style="background:#0D0D0D;min-height:420px;display:flex;align-items:center;overflow:hidden;position:relative;">
  <div style="max-width:1200px;margin:0 auto;padding:60px 40px;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;width:100%;">
    <div style="z-index:1;">
      <div data-f="badge" contenteditable="false" style="display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:50px;background:rgba(249,115,22,.15);border:1px solid rgba(249,115,22,.3);color:#F97316;font-size:12px;font-weight:800;margin-bottom:22px;letter-spacing:.5px;font-family:var(--BF,'Inter'),sans-serif;">🔥 Order Now • Free Delivery Over ₦5,000</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(38px,5vw,68px);font-weight:900;color:#fff;line-height:1.05;letter-spacing:-2.5px;margin-bottom:14px;">Mama's Kitchen<br><span style="color:var(--S2,#F97316);">Tastes Like Home</span></h1>
      <p data-f="tagline" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:17px;color:rgba(255,255,255,.6);line-height:1.7;margin-bottom:32px;max-width:400px;">Authentic Nigerian flavours cooked fresh daily. Every plate tells a story.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:28px;">
        <a data-f="wa-number" href="https://wa.me/" style="text-decoration:none;">
          <button data-f="cta-text" contenteditable="false" style="padding:16px 32px;border-radius:50px;background:var(--S2,#F97316);color:#fff;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:800;border:none;cursor:pointer;box-shadow:0 8px 28px rgba(249,115,22,.4);">📱 Order on WhatsApp</button>
        </a>
        <a href="#menu" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;color:rgba(255,255,255,.7);text-decoration:none;">View Menu →</a>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="color:#FBBF24;font-size:14px;">★★★★★</div>
        <span style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.5);margin-left:4px;">4.9 • 1,200+ orders</span>
        <span style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.3);display:inline-block;margin:0 6px;"></span>
        <span data-f="hours" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.5);">Open 11am – 10pm</span>
      </div>
    </div>
    <div style="position:relative;">
      <div style="position:absolute;inset:-20px;background:radial-gradient(circle at center,rgba(249,115,22,.2),transparent 70%);"></div>
      <img data-f="image" src="https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=600&q=80" style="width:100%;border-radius:20px;box-shadow:0 30px 80px rgba(0,0,0,.6);aspect-ratio:4/3;object-fit:cover;position:relative;z-index:1;"/>
      <div style="position:absolute;bottom:-16px;left:-16px;background:#1a1a1a;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 18px;z-index:2;box-shadow:0 8px 32px rgba(0,0,0,.4);">
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:20px;font-weight:900;color:#F97316;">30 min</div>
        <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;color:rgba(255,255,255,.5);font-weight:600;">Avg delivery</div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="rest-hero"]>div{grid-template-columns:1fr!important;padding:40px 20px!important;gap:32px!important;}[data-sid="rest-hero"] h1{font-size:38px!important;}}</style>
</section>`
},
{
  id:'fashion-hero', name:'Fashion Editorial Hero', icon:'👗',
  category:['fashion_store'],
  tags:['hero','fashion','editorial','dark'],
  fields:[
    {k:'[data-f="label"]',t:'text',l:'Collection Label'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="image1"]',t:'image',l:'Image 1 (large)'},
    {k:'[data-f="image2"]',t:'image',l:'Image 2 (small)'},
  ],
  html:`
<section data-sid="fashion-hero" style="background:#080808;min-height:440px;display:flex;align-items:center;overflow:hidden;">
  <div style="max-width:1200px;margin:0 auto;padding:60px 40px;display:grid;grid-template-columns:1fr 1.1fr;gap:60px;align-items:center;width:100%;">
    <div>
      <div data-f="label" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;font-weight:800;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:4px;margin-bottom:20px;">New Collection · 2025</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(40px,5.5vw,72px);font-weight:900;color:#fff;line-height:1.0;letter-spacing:-3px;margin-bottom:20px;">Style That<br>Defines You<span style="color:var(--S2,#EC4899);">.</span></h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;color:rgba(255,255,255,.55);line-height:1.75;margin-bottom:36px;max-width:380px;">Curated fashion for the bold, the confident, and the unapologetically stylish.</p>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        <a data-f="cta-link" href="#shop" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:15px 32px;border-radius:4px;background:#fff;color:#080808;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:900;border:none;cursor:pointer;letter-spacing:.3px;">SHOP THE COLLECTION</button></a>
        <a href="https://wa.me/" style="display:flex;align-items:center;gap:8px;padding:15px 20px;border-radius:4px;border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.8);text-decoration:none;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13px;font-weight:700;">📱 WhatsApp Order</a>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <img data-f="image1" src="https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400&q=80" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:4px;grid-row:1/3;"/>
      <img data-f="image2" src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;"/>
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:4px;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;"><div><div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;color:#fff;">200+</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;color:rgba(255,255,255,.4);letter-spacing:1px;text-transform:uppercase;">Styles</div></div></div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="fashion-hero"]>div{grid-template-columns:1fr!important;padding:40px 20px!important;gap:32px!important;}[data-sid="fashion-hero"] h1{font-size:42px!important;}}</style>
</section>`
},
{
  id:'realestate-hero', name:'Real Estate Search Hero', icon:'🏠',
  category:['real_estate'],
  tags:['hero','real estate','search','properties'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="stat1-n"]',t:'text',l:'Stat 1 Number'},
    {k:'[data-f="stat1-l"]',t:'text',l:'Stat 1 Label'},
    {k:'[data-f="stat2-n"]',t:'text',l:'Stat 2 Number'},
    {k:'[data-f="stat2-l"]',t:'text',l:'Stat 2 Label'},
    {k:'[data-f="stat3-n"]',t:'text',l:'Stat 3 Number'},
    {k:'[data-f="stat3-l"]',t:'text',l:'Stat 3 Label'},
    {k:'[data-f="bg-image"]',t:'image',l:'Background Image'},
    {k:'[data-f="wa-number"]',t:'link',l:'WhatsApp Link'},
  ],
  html:`
<section data-sid="realestate-hero" style="position:relative;min-height:420px;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;">
  <img data-f="bg-image" src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1400&q=80" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;"/>
  <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(10,20,40,.95) 0%,rgba(10,20,40,.6) 50%,rgba(10,20,40,.3) 100%);z-index:1;"></div>
  <div style="position:relative;z-index:2;max-width:1200px;margin:0 auto;padding:48px 40px;width:100%;">
    <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(30px,4.5vw,58px);font-weight:900;color:#fff;letter-spacing:-2px;margin-bottom:10px;line-height:1.1;">Find Your Perfect Property<br>in Nigeria</h1>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;color:rgba(255,255,255,.75);margin-bottom:28px;">Verified listings. Trusted agents. Your dream home is one click away.</p>
    <div style="background:rgba(255,255,255,.95);backdrop-filter:blur(12px);border-radius:16px;padding:18px 20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:32px;max-width:720px;">
      <div style="flex:1;min-width:140px;"><label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Location</label><input placeholder="Lagos, Abuja..." style="width:100%;border:none;outline:none;font-size:14px;font-weight:600;color:#0f0f0f;background:transparent;font-family:var(--BF,'Inter'),sans-serif;" /></div>
      <div style="width:1px;height:36px;background:#e5e7eb;"></div>
      <div style="flex:1;min-width:120px;"><label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Type</label><select style="width:100%;border:none;outline:none;font-size:14px;font-weight:600;color:#0f0f0f;background:transparent;font-family:var(--BF,'Inter'),sans-serif;"><option>For Rent</option><option>For Sale</option><option>Shortlet</option></select></div>
      <div style="width:1px;height:36px;background:#e5e7eb;"></div>
      <div style="flex:1;min-width:120px;"><label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;">Budget</label><select style="width:100%;border:none;outline:none;font-size:14px;font-weight:600;color:#0f0f0f;background:transparent;font-family:var(--BF,'Inter'),sans-serif;"><option>Any Budget</option><option>Under ₦500k</option><option>₦500k–₦2M</option><option>₦2M+</option></select></div>
      <a data-f="wa-number" href="https://wa.me/" style="text-decoration:none;"><button style="padding:13px 24px;border-radius:10px;background:var(--S2,#0EA5E9);color:#fff;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:800;border:none;cursor:pointer;white-space:nowrap;">Search →</button></a>
    </div>
    <div style="display:flex;gap:32px;flex-wrap:wrap;">
      <div><div data-f="stat1-n" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;color:#fff;">500+</div><div data-f="stat1-l" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.55);margin-top:2px;">Verified Listings</div></div>
      <div><div data-f="stat2-n" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;color:#fff;">50+</div><div data-f="stat2-l" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.55);margin-top:2px;">Trusted Agents</div></div>
      <div><div data-f="stat3-n" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;color:#fff;">1,000+</div><div data-f="stat3-l" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.55);margin-top:2px;">Happy Families</div></div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="realestate-hero"]{padding:0;}[data-sid="realestate-hero"]>div:last-child{padding:32px 20px!important;}[data-sid="realestate-hero"] h1{font-size:30px!important;}}</style>
</section>`
},
{
  id:'portfolio-hero', name:'Portfolio Showcase Hero', icon:'🎨',
  category:['portfolio'],
  tags:['hero','portfolio','creative','minimal'],
  fields:[
    {k:'[data-f="eyebrow"]',t:'text',l:'Eyebrow / Role'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'CTA Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'CTA Link'},
    {k:'[data-f="img1"]',t:'image',l:'Work Image 1'},
    {k:'[data-f="img2"]',t:'image',l:'Work Image 2'},
    {k:'[data-f="img3"]',t:'image',l:'Work Image 3'},
    {k:'[data-f="clients"]',t:'text',l:'Clients Count'},
    {k:'[data-f="years"]',t:'text',l:'Years Experience'},
  ],
  html:`
<section data-sid="portfolio-hero" style="background:#fff;min-height:420px;display:flex;align-items:center;padding:60px 40px;overflow:hidden;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1.1fr 1fr;gap:80px;align-items:center;width:100%;">
    <div>
      <div data-f="eyebrow" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:var(--S2,#F97316);text-transform:uppercase;letter-spacing:2px;margin-bottom:18px;">Brand Designer & Creative Director</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(42px,6vw,76px);font-weight:900;color:#0a0a0a;line-height:1.0;letter-spacing:-3px;margin-bottom:20px;">I Design<br>Things<br>That<br><span style="color:var(--S2,#F97316);">Work.</span></h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;color:#6b7280;line-height:1.75;margin-bottom:36px;max-width:380px;">Brand identity, digital design, and creative direction for businesses that want to stand out.</p>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:36px;">
        <a data-f="cta-link" href="#work" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:15px 30px;border-radius:8px;background:#0a0a0a;color:#fff;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:800;border:none;cursor:pointer;">View My Work →</button></a>
        <a href="https://wa.me/" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;color:#6b7280;text-decoration:none;">💬 Let's Talk</a>
      </div>
      <div style="display:flex;gap:32px;">
        <div><div data-f="clients" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:28px;font-weight:900;color:#0a0a0a;">80+</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:#9ca3af;font-weight:600;margin-top:2px;">Clients</div></div>
        <div style="width:1px;background:#f0f0f0;"></div>
        <div><div data-f="years" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:28px;font-weight:900;color:#0a0a0a;">5yrs</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:#9ca3af;font-weight:600;margin-top:2px;">Experience</div></div>
        <div style="width:1px;background:#f0f0f0;"></div>
        <div><div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:28px;font-weight:900;color:#0a0a0a;">4.9★</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:#9ca3af;font-weight:600;margin-top:2px;">Rating</div></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:12px;">
      <img data-f="img1" src="https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=400&q=80" style="grid-column:1/3;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;"/>
      <img data-f="img2" src="https://images.unsplash.com/photo-1626785774573-4b799315345d?w=400&q=80" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;"/>
      <img data-f="img3" src="https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&q=80" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;"/>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="portfolio-hero"]>div{grid-template-columns:1fr!important;padding:40px 20px!important;gap:40px!important;}[data-sid="portfolio-hero"] h1{font-size:48px!important;}}</style>
</section>`
},
{
  id:'booking-hero', name:'Booking & Appointment Hero', icon:'📅',
  category:['booking'],
  tags:['hero','booking','salon','appointment'],
  fields:[
    {k:'[data-f="eyebrow"]',t:'text',l:'Eyebrow'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Book Button'},
    {k:'[data-f="wa-number"]',t:'link',l:'WhatsApp Link'},
    {k:'[data-f="image"]',t:'image',l:'Studio/Salon Photo'},
    {k:'[data-f="rating"]',t:'text',l:'Rating Text'},
    {k:'[data-f="slots"]',t:'text',l:'Today Slots Text'},
  ],
  html:`
<section data-sid="booking-hero" style="background:#fafaf8;min-height:420px;display:flex;align-items:center;overflow:hidden;padding:60px 40px;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;width:100%;">
    <div style="position:relative;">
      <img data-f="image" src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=80" style="width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.1);"/>
      <div style="position:absolute;top:20px;left:20px;background:#fff;border-radius:14px;padding:14px 18px;box-shadow:0 8px 32px rgba(0,0,0,.1);">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:#10B981;box-shadow:0 0 0 3px rgba(16,185,129,.2);"></div>
          <span data-f="slots" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#0f0f0f;">3 slots available today</span>
        </div>
      </div>
      <div style="position:absolute;bottom:20px;right:20px;background:var(--S2,#7C3AED);border-radius:14px;padding:14px 18px;">
        <div style="color:#FBBF24;font-size:14px;margin-bottom:2px;">★★★★★</div>
        <div data-f="rating" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.8);font-weight:600;">4.9 • 500+ clients</div>
      </div>
    </div>
    <div>
      <div data-f="eyebrow" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:var(--S2,#7C3AED);text-transform:uppercase;letter-spacing:2px;margin-bottom:16px;">Premium Hair Studio · Lagos</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(34px,4.5vw,56px);font-weight:900;color:#0f0f0f;line-height:1.1;letter-spacing:-2px;margin-bottom:18px;">Where Beauty<br>Meets <span style="color:var(--S2,#7C3AED);">Excellence</span></h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;color:#6b7280;line-height:1.75;margin-bottom:32px;">Award-winning stylists. Premium products. Leave feeling your absolute best — every single visit.</p>
      <a data-f="wa-number" href="https://wa.me/" style="text-decoration:none;display:inline-block;margin-bottom:16px;">
        <button data-f="cta-text" contenteditable="false" style="padding:17px 36px;border-radius:12px;background:var(--S2,#7C3AED);color:#fff;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:800;border:none;cursor:pointer;box-shadow:0 8px 28px rgba(124,58,237,.3);">📅 Book Appointment</button>
      </a>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;"><div style="width:32px;height:32px;border-radius:8px;background:rgba(124,58,237,.08);display:flex;align-items:center;justify-content:center;font-size:16px;">⚡</div><span style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#374151;">Instant booking</span></div>
        <div style="display:flex;align-items:center;gap:8px;"><div style="width:32px;height:32px;border-radius:8px;background:rgba(124,58,237,.08);display:flex;align-items:center;justify-content:center;font-size:16px;">✓</div><span style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#374151;">No hidden fees</span></div>
        <div style="display:flex;align-items:center;gap:8px;"><div style="width:32px;height:32px;border-radius:8px;background:rgba(124,58,237,.08);display:flex;align-items:center;justify-content:center;font-size:16px;">💬</div><span style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#374151;">WhatsApp confirmation</span></div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="booking-hero"]>div{grid-template-columns:1fr!important;padding:40px 20px!important;gap:32px!important;}[data-sid="booking-hero"] h1{font-size:34px!important;}}</style>
</section>`
},
{
  id:'event-hero', name:'Event & Concert Hero', icon:'🎟️',
  category:['event'],
  tags:['hero','event','concert','dark'],
  fields:[
    {k:'[data-f="tag"]',t:'text',l:'Event Tag'},
    {k:'[data-f="headline"]',t:'text',l:'Event Name'},
    {k:'[data-f="date"]',t:'text',l:'Date & Time'},
    {k:'[data-f="venue"]',t:'text',l:'Venue'},
    {k:'[data-f="cta-text"]',t:'text',l:'Get Tickets Button'},
    {k:'[data-f="wa-number"]',t:'link',l:'WhatsApp Link'},
    {k:'[data-f="bg-image"]',t:'image',l:'Event Background'},
    {k:'[data-f="target-date"]',t:'text',l:'Countdown Target (YYYY-MM-DD)'},
  ],
  html:`
<section data-sid="event-hero" style="position:relative;min-height:460px;display:flex;align-items:center;overflow:hidden;">
  <img data-f="bg-image" src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1400&q=80" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;"/>
  <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,0,0,.88) 0%,rgba(0,0,0,.65) 50%,rgba(0,0,0,.4) 100%);z-index:1;"></div>
  <div style="position:relative;z-index:2;max-width:1200px;margin:0 auto;padding:60px 40px;width:100%;">
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:60px;align-items:center;">
      <div>
        <div data-f="tag" contenteditable="false" style="display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border-radius:50px;background:rgba(249,115,22,.2);border:1px solid rgba(249,115,22,.4);color:#F97316;font-size:12px;font-weight:800;margin-bottom:20px;font-family:var(--BF,'Inter'),sans-serif;">🎵 Live Event · Limited Tickets</div>
        <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(36px,5.5vw,70px);font-weight:900;color:#fff;line-height:1.05;letter-spacing:-2.5px;margin-bottom:24px;">The Biggest<br>Night of <span style="background:linear-gradient(135deg,#F97316,#EF4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">2025</span></h1>
        <div style="display:flex;gap:20px;margin-bottom:32px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">📅</span><div><div data-f="date" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:800;color:#fff;">December 31, 2025 • 8PM</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.5);">Doors open at 7PM</div></div></div>
          <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">📍</span><div><div data-f="venue" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:800;color:#fff;">Eko Hotel & Suites</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.5);">Victoria Island, Lagos</div></div></div>
        </div>
        <a data-f="wa-number" href="https://wa.me/" style="text-decoration:none;display:inline-block;">
          <button data-f="cta-text" contenteditable="false" style="padding:16px 36px;border-radius:50px;background:linear-gradient(135deg,#F97316,#EF4444);color:#fff;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:900;border:none;cursor:pointer;box-shadow:0 8px 32px rgba(249,115,22,.4);">🎟️ Get Your Tickets Now</button>
        </a>
      </div>
      <div>
        <div style="background:rgba(255,255,255,.06);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:28px;text-align:center;">
          <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;font-weight:800;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:2px;margin-bottom:16px;">Event Starts In</div>
          <div id="evt-countdown" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
            <div style="background:rgba(255,255,255,.08);border-radius:12px;padding:14px 8px;"><div class="evt-n" id="evt-d" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:28px;font-weight:900;color:#fff;">00</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Days</div></div>
            <div style="background:rgba(255,255,255,.08);border-radius:12px;padding:14px 8px;"><div class="evt-n" id="evt-h" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:28px;font-weight:900;color:#fff;">00</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Hrs</div></div>
            <div style="background:rgba(255,255,255,.08);border-radius:12px;padding:14px 8px;"><div class="evt-n" id="evt-m" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:28px;font-weight:900;color:#F97316;">00</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Min</div></div>
            <div style="background:rgba(255,255,255,.08);border-radius:12px;padding:14px 8px;"><div class="evt-n" id="evt-s" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:28px;font-weight:900;color:#F97316;">00</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Sec</div></div>
          </div>
          <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.55);margin-bottom:16px;">🔥 Only 50 VIP tickets remaining</div>
          <a href="https://wa.me/" style="display:block;padding:12px;border-radius:10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;text-decoration:none;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:700;">📱 Reserve via WhatsApp</a>
        </div>
      </div>
    </div>
  </div>
  <script>
  (function(){
    var td=document.querySelector('[data-sid="event-hero"] [data-f="target-date"]');
    var target=td?new Date(td.textContent.trim()+'T20:00:00'):new Date(Date.now()+30*864e5);
    function tick(){var diff=target-Date.now();if(diff<0)return;var d=Math.floor(diff/864e5),h=Math.floor((diff%864e5)/36e5),m=Math.floor((diff%36e5)/6e4),s=Math.floor((diff%6e4)/1e3);['d','h','m','s'].forEach(function(k,i){var el=document.getElementById('evt-'+k);if(el)el.textContent=String([d,h,m,s][i]).padStart(2,'0');});}
    tick();setInterval(tick,1000);
  })();
  </script>
  <style>@media(max-width:768px){[data-sid="event-hero"]>div>div{grid-template-columns:1fr!important;gap:32px!important;padding:40px 20px!important;}[data-sid="event-hero"] h1{font-size:36px!important;}}</style>
</section>`
},
{
  id:'church-hero', name:'Church & Community Hero', icon:'🙏',
  category:['church'],
  tags:['hero','church','community','warm'],
  fields:[
    {k:'[data-f="welcome"]',t:'text',l:'Welcome Text'},
    {k:'[data-f="church-name"]',t:'text',l:'Church Name'},
    {k:'[data-f="tagline"]',t:'text',l:'Tagline'},
    {k:'[data-f="sunday-time"]',t:'text',l:'Sunday Service Time'},
    {k:'[data-f="midweek-time"]',t:'text',l:'Midweek Service Time'},
    {k:'[data-f="location"]',t:'text',l:'Location'},
    {k:'[data-f="cta-text"]',t:'text',l:'CTA Button'},
    {k:'[data-f="wa-number"]',t:'link',l:'WhatsApp Link'},
    {k:'[data-f="bg-image"]',t:'image',l:'Background Image'},
  ],
  html:`
<section data-sid="church-hero" style="position:relative;min-height:420px;display:flex;align-items:center;justify-content:center;overflow:hidden;text-align:center;">
  <img data-f="bg-image" src="https://images.unsplash.com/photo-1438032005730-c779502df39b?w=1400&q=80" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;"/>
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(60,30,0,.75) 0%,rgba(60,30,0,.88) 100%);z-index:1;"></div>
  <div style="position:relative;z-index:2;max-width:800px;padding:60px 40px;">
    <div data-f="welcome" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:rgba(255,220,100,.8);text-transform:uppercase;letter-spacing:3px;margin-bottom:16px;">You Are Welcome Here</div>
    <h1 data-f="church-name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(36px,5.5vw,68px);font-weight:900;color:#fff;letter-spacing:-2px;margin-bottom:14px;line-height:1.1;">House of Grace<br>International Church</h1>
    <p data-f="tagline" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:17px;color:rgba(255,255,255,.75);line-height:1.7;margin-bottom:36px;">A place of faith, love, and community. Come as you are — you belong here.</p>
    <div style="display:flex;justify-content:center;gap:20px;flex-wrap:wrap;margin-bottom:36px;">
      <div style="background:rgba(255,255,255,.1);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:18px 24px;min-width:160px;">
        <div style="font-size:20px;margin-bottom:8px;">🕊️</div>
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13px;font-weight:800;color:rgba(255,220,100,.9);margin-bottom:4px;">Sunday Service</div>
        <div data-f="sunday-time" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;font-weight:700;color:#fff;">9:00am & 11:00am</div>
      </div>
      <div style="background:rgba(255,255,255,.1);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:18px 24px;min-width:160px;">
        <div style="font-size:20px;margin-bottom:8px;">📖</div>
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13px;font-weight:800;color:rgba(255,220,100,.9);margin-bottom:4px;">Bible Study</div>
        <div data-f="midweek-time" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;font-weight:700;color:#fff;">Wednesday 6:00pm</div>
      </div>
      <div style="background:rgba(255,255,255,.1);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:18px 24px;min-width:160px;">
        <div style="font-size:20px;margin-bottom:8px;">📍</div>
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13px;font-weight:800;color:rgba(255,220,100,.9);margin-bottom:4px;">Location</div>
        <div data-f="location" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;font-weight:700;color:#fff;">Lekki Phase 1, Lagos</div>
      </div>
    </div>
    <a data-f="wa-number" href="https://wa.me/" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:16px 36px;border-radius:50px;background:rgba(255,220,100,.95);color:#3c1e00;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:900;border:none;cursor:pointer;box-shadow:0 8px 28px rgba(255,220,100,.3);">Join Us This Sunday</button></a>
  </div>
  <style>@media(max-width:768px){[data-sid="church-hero"] .inner{padding:40px 20px!important;}[data-sid="church-hero"] h1{font-size:36px!important;}[data-sid="church-hero"]>div:last-child{padding:40px 20px!important;}}</style>
</section>`
},
{
  id:'ngo-hero', name:'NGO & Donation Hero', icon:'❤️',
  category:['donation'],
  tags:['hero','ngo','donation','cause'],
  fields:[
    {k:'[data-f="cause"]',t:'text',l:'Cause Tag'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="raised"]',t:'text',l:'Amount Raised'},
    {k:'[data-f="goal"]',t:'text',l:'Goal Amount'},
    {k:'[data-f="donors"]',t:'text',l:'Donors Count'},
    {k:'[data-f="progress"]',t:'text',l:'Progress % (e.g. 65)'},
    {k:'[data-f="cta-text"]',t:'text',l:'Donate Button'},
    {k:'[data-f="wa-number"]',t:'link',l:'WhatsApp Link'},
    {k:'[data-f="bg-image"]',t:'image',l:'Background Image'},
  ],
  html:`
<section data-sid="ngo-hero" style="position:relative;min-height:440px;display:flex;align-items:center;overflow:hidden;">
  <img data-f="bg-image" src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1400&q=80" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;"/>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(15,10,5,.92) 0%,rgba(15,10,5,.7) 60%,rgba(15,10,5,.3) 100%);z-index:1;"></div>
  <div style="position:relative;z-index:2;max-width:1200px;margin:0 auto;padding:60px 40px;display:grid;grid-template-columns:1.1fr 1fr;gap:60px;align-items:center;width:100%;">
    <div>
      <div data-f="cause" contenteditable="false" style="display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:50px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#FCA5A5;font-size:12px;font-weight:800;margin-bottom:20px;font-family:var(--BF,'Inter'),sans-serif;">❤️ Education for Every Child</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(34px,4.5vw,60px);font-weight:900;color:#fff;line-height:1.1;letter-spacing:-2px;margin-bottom:18px;">Every Child<br>Deserves a<br><span style="color:#FCA5A5;">Future.</span></h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;color:rgba(255,255,255,.7);line-height:1.75;margin-bottom:32px;max-width:420px;">Your donation directly funds school fees, books, and meals for underprivileged children across Nigeria.</p>
      <a data-f="wa-number" href="https://wa.me/" style="text-decoration:none;display:inline-block;margin-bottom:16px;">
        <button data-f="cta-text" contenteditable="false" style="padding:16px 36px;border-radius:50px;background:linear-gradient(135deg,#EF4444,#F97316);color:#fff;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:900;border:none;cursor:pointer;box-shadow:0 8px 28px rgba(239,68,68,.4);">❤️ Donate Now</button>
      </a>
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:8px;">
        <div style="display:flex;align-items:center;gap:6px;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.6);"><span>🔒</span> Secure payments</div>
        <div style="display:flex;align-items:center;gap:6px;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.6);"><span>📊</span> Full transparency</div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,.06);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:28px;">
      <div style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <div><span data-f="raised" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:22px;font-weight:900;color:#fff;">₦4.5M</span><span style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.5);"> raised</span></div>
          <div><span style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.5);">Goal: </span><span data-f="goal" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:800;color:#fff;">₦7M</span></div>
        </div>
        <div style="height:10px;background:rgba(255,255,255,.1);border-radius:5px;overflow:hidden;"><div data-f="progress" id="ngo-prog" contenteditable="false" style="height:100%;background:linear-gradient(90deg,#EF4444,#F97316);border-radius:5px;width:65%;transition:.5s;"></div></div>
        <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.5);margin-top:6px;text-align:right;">65% of goal reached</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div style="background:rgba(255,255,255,.06);border-radius:12px;padding:16px;text-align:center;"><div data-f="donors" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:22px;font-weight:900;color:#fff;">320</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;">Donors</div></div>
        <div style="background:rgba(255,255,255,.06);border-radius:12px;padding:16px;text-align:center;"><div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:22px;font-weight:900;color:#fff;">500+</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;">Children Helped</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="dona-btn" style="flex:1;min-width:70px;padding:10px 6px;border-radius:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">₦1,000</button>
        <button class="dona-btn" style="flex:1;min-width:70px;padding:10px 6px;border-radius:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">₦5,000</button>
        <button class="dona-btn" style="flex:1;min-width:70px;padding:10px 6px;border-radius:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">₦10,000</button>
        <button class="dona-btn" style="flex:1;min-width:70px;padding:10px 6px;border-radius:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">₦25,000</button>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="ngo-hero"]>div>div{grid-template-columns:1fr!important;padding:40px 20px!important;gap:32px!important;}[data-sid="ngo-hero"] h1{font-size:34px!important;}}</style>
</section>`
},
{
  id:'digital-hero', name:'Digital Products Hero', icon:'📦',
  category:['digital_marketplace','membership'],
  tags:['hero','digital','products','dark'],
  fields:[
    {k:'[data-f="badge"]',t:'text',l:'Badge'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'CTA Button'},
    {k:'[data-f="cta-link"]',t:'link',l:'CTA Link'},
    {k:'[data-f="product1"]',t:'text',l:'Product 1 Name'},
    {k:'[data-f="product2"]',t:'text',l:'Product 2 Name'},
    {k:'[data-f="product3"]',t:'text',l:'Product 3 Name'},
    {k:'[data-f="customers"]',t:'text',l:'Customers Count'},
  ],
  html:`
<section data-sid="digital-hero" style="background:linear-gradient(135deg,#09090b 0%,#18181b 100%);min-height:420px;display:flex;align-items:center;overflow:hidden;padding:60px 40px;position:relative;">
  <div style="position:absolute;top:-100px;right:-100px;width:500px;height:500px;background:radial-gradient(circle,rgba(139,92,246,.15) 0%,transparent 70%);border-radius:50%;pointer-events:none;"></div>
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;width:100%;position:relative;">
    <div>
      <div data-f="badge" contenteditable="false" style="display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:50px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);color:#A78BFA;font-size:12px;font-weight:800;margin-bottom:22px;font-family:var(--BF,'Inter'),sans-serif;">⚡ Instant Download • Lifetime Access</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(36px,5vw,64px);font-weight:900;color:#fff;line-height:1.05;letter-spacing:-2.5px;margin-bottom:18px;">Premium Digital<br>Products That<br><span style="background:linear-gradient(135deg,#8B5CF6,#06B6D4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Pay Dividends</span></h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:17px;color:rgba(255,255,255,.6);line-height:1.7;margin-bottom:32px;max-width:420px;">Templates, eBooks, courses, and tools built by practitioners. Pay once, use forever.</p>
      <a data-f="cta-link" href="#products" style="text-decoration:none;display:inline-block;margin-bottom:20px;">
        <button data-f="cta-text" contenteditable="false" style="padding:16px 36px;border-radius:12px;background:linear-gradient(135deg,#8B5CF6,#6366F1);color:#fff;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:800;border:none;cursor:pointer;box-shadow:0 8px 32px rgba(139,92,246,.35);">Browse Products →</button>
      </a>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="display:flex;"><div style="width:28px;height:28px;border-radius:50%;border:2px solid #18181b;background:linear-gradient(135deg,#8B5CF6,#6366F1);margin-right:-8px;"></div><div style="width:28px;height:28px;border-radius:50%;border:2px solid #18181b;background:linear-gradient(135deg,#F97316,#EF4444);margin-right:-8px;"></div><div style="width:28px;height:28px;border-radius:50%;border:2px solid #18181b;background:linear-gradient(135deg,#10B981,#0D9488);"></div></div>
        <div><span data-f="customers" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:800;color:#fff;">5,000+</span><span style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.5);"> happy customers</span></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:18px 20px;display:flex;align-items:center;gap:16px;transition:.2s;" onmouseover="this.style.background='rgba(139,92,246,.08)';this.style.borderColor='rgba(139,92,246,.3)'" onmouseout="this.style.background='rgba(255,255,255,.04)';this.style.borderColor='rgba(255,255,255,.07)'">
        <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,rgba(139,92,246,.3),rgba(99,102,241,.3));display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">📊</div>
        <div style="flex:1;min-width:0;"><div data-f="product1" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Business Finance Tracker Template</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.4);margin-top:2px;">Spreadsheet</div></div>
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:900;color:#A78BFA;white-space:nowrap;">₦3,500</div>
      </div>
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:18px 20px;display:flex;align-items:center;gap:16px;transition:.2s;" onmouseover="this.style.background='rgba(139,92,246,.08)';this.style.borderColor='rgba(139,92,246,.3)'" onmouseout="this.style.background='rgba(255,255,255,.04)';this.style.borderColor='rgba(255,255,255,.07)'">
        <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,rgba(139,92,246,.3),rgba(99,102,241,.3));display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">📚</div>
        <div style="flex:1;min-width:0;"><div data-f="product2" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Digital Marketing Mastery eBook</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.4);margin-top:2px;">eBook</div></div>
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:900;color:#A78BFA;white-space:nowrap;">₦5,000</div>
      </div>
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:18px 20px;display:flex;align-items:center;gap:16px;transition:.2s;" onmouseover="this.style.background='rgba(139,92,246,.08)';this.style.borderColor='rgba(139,92,246,.3)'" onmouseout="this.style.background='rgba(255,255,255,.04)';this.style.borderColor='rgba(255,255,255,.07)'">
        <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,rgba(139,92,246,.3),rgba(99,102,241,.3));display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🎨</div>
        <div style="flex:1;min-width:0;"><div data-f="product3" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Brand Identity Kit (Canva)</div><div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.4);margin-top:2px;">Templates</div></div>
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:900;color:#A78BFA;white-space:nowrap;">₦8,000</div>
      </div>
      <div style="background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(6,182,212,.1));border:1px solid rgba(139,92,246,.2);border-radius:14px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,.7);">🔥 New product every week</div>
        <a href="#" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13px;font-weight:800;color:#A78BFA;text-decoration:none;">See all →</a>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="digital-hero"]>div>div{grid-template-columns:1fr!important;padding:40px 20px!important;gap:36px!important;}[data-sid="digital-hero"] h1{font-size:36px!important;}}</style>
</section>`
},
{
  id:'grocery-hero', name:'Grocery & Farm Hero', icon:'🥦',
  category:['grocery'],
  tags:['hero','grocery','farm','fresh'],
  fields:[
    {k:'[data-f="badge"]',t:'text',l:'Badge'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Order Button'},
    {k:'[data-f="wa-number"]',t:'link',l:'WhatsApp Link'},
    {k:'[data-f="image"]',t:'image',l:'Farm/Produce Image'},
    {k:'[data-f="delivery"]',t:'text',l:'Delivery Promise'},
  ],
  html:`
<section data-sid="grocery-hero" style="background:linear-gradient(135deg,#052e16 0%,#14532d 60%,#15803d 100%);min-height:400px;display:flex;align-items:center;overflow:hidden;padding:60px 40px;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;width:100%;">
    <div>
      <div data-f="badge" contenteditable="false" style="display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:50px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:12px;font-weight:800;margin-bottom:20px;font-family:var(--BF,'Inter'),sans-serif;">🌿 Organic • Fresh Daily • Farm-to-Table</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(36px,5vw,62px);font-weight:900;color:#fff;line-height:1.1;letter-spacing:-2px;margin-bottom:16px;">Fresh From<br>the Farm,<br><span style="color:#86EFAC;">Straight to You</span></h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;color:rgba(255,255,255,.7);line-height:1.7;margin-bottom:28px;max-width:400px;">Organic vegetables, fruits, proteins & everyday essentials. Order by 12pm for same-day delivery.</p>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:24px;">
        <a data-f="wa-number" href="https://wa.me/" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:15px 30px;border-radius:50px;background:#fff;color:#052e16;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:900;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2);">🛒 Order Fresh Produce</button></a>
        <a href="#products" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;color:rgba(255,255,255,.7);text-decoration:none;">See price list →</a>
      </div>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:7px;"><span style="font-size:18px;">🚚</span><span data-f="delivery" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,.75);">Same-day delivery available</span></div>
        <div style="display:flex;align-items:center;gap:7px;"><span style="font-size:18px;">✅</span><span style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,.75);">No minimum order</span></div>
      </div>
    </div>
    <div style="position:relative;">
      <div style="position:absolute;inset:-20px;background:radial-gradient(circle,rgba(134,239,172,.15),transparent 70%);border-radius:50%;"></div>
      <img data-f="image" src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80" style="width:100%;border-radius:20px;box-shadow:0 30px 80px rgba(0,0,0,.4);aspect-ratio:4/3;object-fit:cover;position:relative;z-index:1;"/>
      <div style="position:absolute;bottom:-14px;right:-14px;background:#fff;border-radius:14px;padding:14px 18px;z-index:2;box-shadow:0 8px 28px rgba(0,0,0,.15);">
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:18px;font-weight:900;color:#052e16;">100%</div>
        <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;color:#16a34a;font-weight:700;">Organic</div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="grocery-hero"]>div{grid-template-columns:1fr!important;padding:40px 20px!important;gap:32px!important;}[data-sid="grocery-hero"] h1{font-size:36px!important;}}</style>
</section>`
}
,
{
  id:'ecom-bold-hero',name:'Marketplace Hero — Bold',icon:'🛍️',
  category:['ecommerce'],
  tags:['hero','marketplace','search'],
  fields:[
    {k:'[data-f="badge"]',t:'text',l:'Badge'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="highlight"]',t:'text',l:'Highlighted Word'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="search-ph"]',t:'text',l:'Search Placeholder'},
    {k:'[data-f="cat1"]',t:'text',l:'Quick Link 1'},
    {k:'[data-f="cat2"]',t:'text',l:'Quick Link 2'},
    {k:'[data-f="cat3"]',t:'text',l:'Quick Link 3'},
    {k:'[data-f="cat4"]',t:'text',l:'Quick Link 4'},
    {k:'[data-f="trust1"]',t:'text',l:'Trust Badge 1'},
    {k:'[data-f="trust2"]',t:'text',l:'Trust Badge 2'},
    {k:'[data-f="trust3"]',t:'text',l:'Trust Badge 3'},
  ],
  html:`<section data-sid="ecom-bold-hero" style="background:var(--S1,#0a0a0f);padding:70px 24px 50px;position:relative;overflow:hidden;">
  <div style="position:absolute;top:-100px;right:-100px;width:400px;height:400px;background:radial-gradient(circle,var(--S2,#7C3AED),transparent 70%);opacity:.25;border-radius:50%;"></div>
  <div style="max-width:900px;margin:0 auto;position:relative;text-align:center;">
    <div data-f="badge" contenteditable="false" style="display:inline-block;padding:7px 16px;border-radius:50px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:#fff;margin-bottom:22px;">⚡ Flash deals live now</div>
    <h1 style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(34px,6vw,58px);font-weight:900;line-height:1.05;letter-spacing:-1.5px;color:#fff;margin-bottom:16px;">
      <span data-f="headline" contenteditable="false">Everything You Need,</span> <span data-f="highlight" contenteditable="false" style="color:var(--S3,#F97316);">One Tap Away</span>
    </h1>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;color:rgba(255,255,255,.6);max-width:480px;margin:0 auto 30px;">Thousands of products, fast delivery, prices you'll actually like.</p>
    <div style="display:flex;max-width:520px;margin:0 auto 18px;background:#fff;border-radius:14px;padding:6px;box-shadow:0 20px 50px rgba(0,0,0,.4);">
      <input data-f="search-ph" placeholder="Search for products..." style="flex:1;border:none;outline:none;padding:12px 16px;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;background:transparent;">
      <button style="padding:12px 22px;border-radius:10px;background:var(--S2,#7C3AED);color:#fff;border:none;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:800;cursor:pointer;">Search</button>
    </div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:36px;">
      <a href="#" data-f="cat1" contenteditable="false" style="padding:7px 14px;border-radius:50px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.8);text-decoration:none;">Electronics</a>
      <a href="#" data-f="cat2" contenteditable="false" style="padding:7px 14px;border-radius:50px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.8);text-decoration:none;">Fashion</a>
      <a href="#" data-f="cat3" contenteditable="false" style="padding:7px 14px;border-radius:50px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.8);text-decoration:none;">Home & Living</a>
      <a href="#" data-f="cat4" contenteditable="false" style="padding:7px 14px;border-radius:50px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.8);text-decoration:none;">Beauty</a>
    </div>
    <div style="display:flex;gap:28px;justify-content:center;flex-wrap:wrap;padding-top:28px;border-top:1px solid rgba(255,255,255,.08);">
      <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:17px;">🚚</span><span data-f="trust1" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:rgba(255,255,255,.65);">Fast delivery</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:17px;">🔒</span><span data-f="trust2" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:rgba(255,255,255,.65);">Secure checkout</span></div>
      <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:17px;">↩️</span><span data-f="trust3" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:rgba(255,255,255,.65);">Easy returns</span></div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="ecom-bold-hero"]{padding:50px 18px 36px!important;}[data-sid="ecom-bold-hero"] h1{font-size:30px!important;}}</style>
</section>`
},
{
  id:'ecom-deal-strip',name:'Flash Deals — Scroll Rail',icon:'🔥',
  category:['ecommerce'],
  tags:['deals','products','urgency'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="d1-name"]',t:'text',l:'Deal 1 Name'},{k:'[data-f="d1-img"]',t:'image',l:'Deal 1 Image'},{k:'[data-f="d1-old"]',t:'text',l:'Deal 1 Old Price'},{k:'[data-f="d1-new"]',t:'text',l:'Deal 1 Sale Price'},{k:'[data-f="d1-pct"]',t:'text',l:'Deal 1 % Off'},
    {k:'[data-f="d2-name"]',t:'text',l:'Deal 2 Name'},{k:'[data-f="d2-img"]',t:'image',l:'Deal 2 Image'},{k:'[data-f="d2-old"]',t:'text',l:'Deal 2 Old Price'},{k:'[data-f="d2-new"]',t:'text',l:'Deal 2 Sale Price'},{k:'[data-f="d2-pct"]',t:'text',l:'Deal 2 % Off'},
    {k:'[data-f="d3-name"]',t:'text',l:'Deal 3 Name'},{k:'[data-f="d3-img"]',t:'image',l:'Deal 3 Image'},{k:'[data-f="d3-old"]',t:'text',l:'Deal 3 Old Price'},{k:'[data-f="d3-new"]',t:'text',l:'Deal 3 Sale Price'},{k:'[data-f="d3-pct"]',t:'text',l:'Deal 3 % Off'},
    {k:'[data-f="d4-name"]',t:'text',l:'Deal 4 Name'},{k:'[data-f="d4-img"]',t:'image',l:'Deal 4 Image'},{k:'[data-f="d4-old"]',t:'text',l:'Deal 4 Old Price'},{k:'[data-f="d4-new"]',t:'text',l:'Deal 4 Sale Price'},{k:'[data-f="d4-pct"]',t:'text',l:'Deal 4 % Off'},
  ],
  html:`<section data-sid="ecom-deal-strip" style="background:var(--bg,#fff);padding:56px 0;">
  <div style="max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;">🔥 Flash Deals</h2>
    <span style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:800;color:var(--S2,#7C3AED);background:rgba(124,58,237,.08);padding:6px 12px;border-radius:50px;">Ends in 04:12:56</span>
  </div>
  <div style="display:flex;gap:16px;overflow-x:auto;padding:4px 24px 12px;scroll-snap-type:x mandatory;">
    ${[1,2,3,4].map(n=>`
    <div style="flex:0 0 200px;scroll-snap-align:start;border-radius:16px;overflow:hidden;border:1.5px solid var(--bdr,#eee);background:#fff;">
      <div style="position:relative;">
        <img data-f="d${n}-img" src="https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300&q=80" style="width:100%;aspect-ratio:1;object-fit:cover;">
        <div data-f="d${n}-pct" contenteditable="false" style="position:absolute;top:8px;left:8px;background:var(--S3,#F97316);color:#fff;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:11px;font-weight:900;padding:4px 8px;border-radius:6px;">-30%</div>
      </div>
      <div style="padding:12px;">
        <div data-f="d${n}-name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Product ${n}</div>
        <div style="display:flex;align-items:baseline;gap:6px;">
          <span data-f="d${n}-new" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:900;color:var(--S2,#7C3AED);">₦8,500</span>
          <span data-f="d${n}-old" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:#9ca3af;text-decoration:line-through;">₦12,000</span>
        </div>
      </div>
    </div>`).join('')}
  </div>
  <style>@media(max-width:768px){[data-sid="ecom-deal-strip"] > div:first-child{padding:0 18px!important;}[data-sid="ecom-deal-strip"] > div:last-child{padding-left:18px!important;padding-right:18px!important;}}</style>
</section>`
},
{
  id:'ecom-category-tiles',name:'Category Tiles — Bold',icon:'🗂️',
  category:['ecommerce'],
  tags:['categories','navigation','grid'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="t1-name"]',t:'text',l:'Tile 1 Name'},{k:'[data-f="t1-img"]',t:'image',l:'Tile 1 Image'},
    {k:'[data-f="t2-name"]',t:'text',l:'Tile 2 Name'},{k:'[data-f="t2-img"]',t:'image',l:'Tile 2 Image'},
    {k:'[data-f="t3-name"]',t:'text',l:'Tile 3 Name'},{k:'[data-f="t3-img"]',t:'image',l:'Tile 3 Image'},
  ],
  html:`<section data-sid="ecom-category-tiles" style="background:var(--bg,#fff);padding:56px 24px;">
  <div style="max-width:1200px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:20px;">Shop by Category</h2>
    <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:16px;">
      <div style="position:relative;border-radius:18px;overflow:hidden;grid-row:span 2;min-height:340px;">
        <img data-f="t1-img" src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=500&q=80" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.7),transparent 50%);"></div>
        <div data-f="t1-name" contenteditable="false" style="position:absolute;bottom:18px;left:18px;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:20px;font-weight:900;color:#fff;">Electronics</div>
      </div>
      <div style="position:relative;border-radius:18px;overflow:hidden;min-height:162px;">
        <img data-f="t2-img" src="https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&q=80" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.65),transparent 50%);"></div>
        <div data-f="t2-name" contenteditable="false" style="position:absolute;bottom:14px;left:14px;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:900;color:#fff;">Fashion</div>
      </div>
      <div style="position:relative;border-radius:18px;overflow:hidden;min-height:162px;grid-row:span 2;">
        <img data-f="t3-img" src="https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=400&q=80" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.65),transparent 50%);"></div>
        <div data-f="t3-name" contenteditable="false" style="position:absolute;bottom:14px;left:14px;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:900;color:#fff;">Home & Living</div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="ecom-category-tiles"] > div > div{grid-template-columns:1fr 1fr!important;}[data-sid="ecom-category-tiles"] > div > div > div:first-child{grid-row:span 1!important;min-height:180px!important;}}</style>
</section>`
}
,
{
  id:'ecom-minimal-hero',name:'Boutique Hero — Editorial',icon:'✨',
  category:['ecommerce'],
  tags:['hero','minimal','editorial'],
  fields:[
    {k:'[data-f="eyebrow"]',t:'text',l:'Eyebrow'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="image"]',t:'image',l:'Hero Image'},
  ],
  html:`<section data-sid="ecom-minimal-hero" style="background:var(--bg,#fff);padding:60px 6vw 0;">
  <div style="max-width:1300px;margin:0 auto;">
    <div style="max-width:480px;margin-bottom:36px;">
      <div data-f="eyebrow" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--S2,#111827);margin-bottom:16px;">New Collection</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(30px,4.5vw,48px);font-weight:800;line-height:1.1;letter-spacing:-1px;color:#0f0f0f;margin-bottom:18px;">Considered pieces for everyday living</h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15.5px;color:#6b7280;line-height:1.6;margin-bottom:26px;">Thoughtfully made, built to last. No noise, just quality.</p>
      <a data-f="cta-link" href="#products" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 30px;background:#0f0f0f;color:#fff;border:none;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:600;cursor:pointer;letter-spacing:.3px;">Shop the collection</button></a>
    </div>
    <img data-f="image" src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1400&q=80" style="width:100%;aspect-ratio:16/7;object-fit:cover;">
  </div>
  <style>@media(max-width:768px){[data-sid="ecom-minimal-hero"]{padding:40px 20px 0!important;}[data-sid="ecom-minimal-hero"] img{aspect-ratio:4/3!important;}}</style>
</section>`
},
{
  id:'ecom-product-spotlight',name:'Product Spotlight — Split',icon:'🎯',
  category:['ecommerce'],
  tags:['product','spotlight','feature'],
  fields:[
    {k:'[data-f="eyebrow"]',t:'text',l:'Eyebrow'},
    {k:'[data-f="name"]',t:'text',l:'Product Name'},
    {k:'[data-f="desc"]',t:'text',l:'Description'},
    {k:'[data-f="price"]',t:'text',l:'Price'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="image"]',t:'image',l:'Product Image'},
    {k:'[data-f="f1"]',t:'text',l:'Feature 1'},
    {k:'[data-f="f2"]',t:'text',l:'Feature 2'},
    {k:'[data-f="f3"]',t:'text',l:'Feature 3'},
  ],
  html:`<section data-sid="ecom-product-spotlight" style="background:var(--bg2,#F8FAFC);padding:70px 6vw;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;">
    <img data-f="image" src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700&q=80" style="width:100%;aspect-ratio:1;object-fit:cover;">
    <div>
      <div data-f="eyebrow" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--S2,#111827);margin-bottom:14px;">Bestseller</div>
      <h2 data-f="name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(26px,3.5vw,36px);font-weight:800;letter-spacing:-.6px;margin-bottom:14px;">The Everyday Tote</h2>
      <p data-f="desc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;color:#6b7280;line-height:1.7;margin-bottom:22px;">Full-grain leather, hand-stitched, built for the long run. One bag, every day.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:26px;">
        <div style="display:flex;align-items:center;gap:9px;"><span style="color:var(--S2,#111827);">✓</span><span data-f="f1" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;color:#374151;">Full-grain leather</span></div>
        <div style="display:flex;align-items:center;gap:9px;"><span style="color:var(--S2,#111827);">✓</span><span data-f="f2" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;color:#374151;">Hand-stitched details</span></div>
        <div style="display:flex;align-items:center;gap:9px;"><span style="color:var(--S2,#111827);">✓</span><span data-f="f3" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;color:#374151;">Lifetime repair guarantee</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:20px;">
        <span data-f="price" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:800;">₦45,000</span>
        <button data-f="cta-text" contenteditable="false" style="padding:13px 28px;background:#0f0f0f;color:#fff;border:none;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:600;cursor:pointer;">Add to cart</button>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="ecom-product-spotlight"]>div{grid-template-columns:1fr!important;gap:28px!important;}[data-sid="ecom-product-spotlight"]{padding:50px 20px!important;}}</style>
</section>`
}
,
{
  id:'realestate-luxury-hero',name:'Luxury Hero — Full Bleed',icon:'🏛️',
  category:['real_estate'],
  tags:['hero','luxury','property'],
  fields:[
    {k:'[data-f="eyebrow"]',t:'text',l:'Eyebrow'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="image"]',t:'image',l:'Background Image'},
    {k:'[data-f="stat1"]',t:'text',l:'Stat 1'},{k:'[data-f="stat1-lbl"]',t:'text',l:'Stat 1 Label'},
    {k:'[data-f="stat2"]',t:'text',l:'Stat 2'},{k:'[data-f="stat2-lbl"]',t:'text',l:'Stat 2 Label'},
  ],
  html:`<section data-sid="realestate-luxury-hero" style="position:relative;min-height:88vh;display:flex;align-items:flex-end;padding:0;">
  <img data-f="image" src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=85" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
  <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.75),rgba(0,0,0,.15) 60%);"></div>
  <div style="position:relative;max-width:1200px;margin:0 auto;padding:0 6vw 70px;width:100%;">
    <div data-f="eyebrow" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.75);margin-bottom:18px;">Exceptional Properties</div>
    <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(32px,5.5vw,56px);font-weight:800;line-height:1.08;letter-spacing:-1px;color:#fff;margin-bottom:18px;max-width:640px;">Homes that feel like a destination</h1>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:16px;color:rgba(255,255,255,.8);max-width:460px;margin-bottom:32px;">Curated listings for discerning buyers and tenants across the city.</p>
    <div style="display:flex;align-items:center;gap:40px;flex-wrap:wrap;">
      <a data-f="cta-link" href="#listings" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:15px 32px;background:#fff;color:#0f0f0f;border:none;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:.3px;">View Listings</button></a>
      <div style="display:flex;gap:32px;">
        <div><div data-f="stat1" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:22px;font-weight:800;color:#fff;">150+</div><div data-f="stat1-lbl" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.65);">Properties sold</div></div>
        <div><div data-f="stat2" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:22px;font-weight:800;color:#fff;">12yrs</div><div data-f="stat2-lbl" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.65);">In business</div></div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="realestate-luxury-hero"]{min-height:70vh!important;}[data-sid="realestate-luxury-hero"]>div{padding:0 20px 40px!important;}[data-sid="realestate-luxury-hero"] h1{font-size:30px!important;}}</style>
</section>`
},
{
  id:'realestate-listing-rows',name:'Listings — Row Directory',icon:'📋',
  category:['real_estate'],
  tags:['listings','directory','property'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="r1-img"]',t:'image',l:'Row 1 Image'},{k:'[data-f="r1-name"]',t:'text',l:'Row 1 Name'},{k:'[data-f="r1-loc"]',t:'text',l:'Row 1 Location'},{k:'[data-f="r1-price"]',t:'text',l:'Row 1 Price'},{k:'[data-f="r1-tag"]',t:'text',l:'Row 1 Tag'},
    {k:'[data-f="r2-img"]',t:'image',l:'Row 2 Image'},{k:'[data-f="r2-name"]',t:'text',l:'Row 2 Name'},{k:'[data-f="r2-loc"]',t:'text',l:'Row 2 Location'},{k:'[data-f="r2-price"]',t:'text',l:'Row 2 Price'},{k:'[data-f="r2-tag"]',t:'text',l:'Row 2 Tag'},
    {k:'[data-f="r3-img"]',t:'image',l:'Row 3 Image'},{k:'[data-f="r3-name"]',t:'text',l:'Row 3 Name'},{k:'[data-f="r3-loc"]',t:'text',l:'Row 3 Location'},{k:'[data-f="r3-price"]',t:'text',l:'Row 3 Price'},{k:'[data-f="r3-tag"]',t:'text',l:'Row 3 Tag'},
  ],
  html:`<section data-sid="realestate-listing-rows" style="background:var(--bg,#fff);padding:64px 6vw;">
  <div style="max-width:980px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:28px;">Current Listings</h2>
    <div style="display:flex;flex-direction:column;">
      ${[1,2,3].map(n=>`
      <a href="#" style="display:flex;gap:20px;align-items:center;padding:18px 0;border-bottom:1.5px solid var(--bdr,#eee);text-decoration:none;color:inherit;">
        <img data-f="r${n}-img" src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=300&q=80" style="width:120px;height:90px;border-radius:10px;object-fit:cover;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div data-f="r${n}-tag" contenteditable="false" style="display:inline-block;font-family:var(--BF,'Inter'),sans-serif;font-size:10.5px;font-weight:800;color:var(--S2,#111827);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">For Sale</div>
          <div data-f="r${n}-name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:17px;font-weight:800;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Property ${n}</div>
          <div data-f="r${n}-loc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;">📍 Location</div>
        </div>
        <div data-f="r${n}-price" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:17px;font-weight:900;color:var(--S2,#111827);white-space:nowrap;">₦0</div>
      </a>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="realestate-listing-rows"] a{gap:12px!important;}[data-sid="realestate-listing-rows"] img{width:80px!important;height:64px!important;}[data-sid="realestate-listing-rows"]{padding:44px 18px!important;}}</style>
</section>`
}
,
{
  id:'luxury-features-strip',name:'Features — Elegant Strip',icon:'💎',
  category:['real_estate'],
  tags:['features','luxury','strip'],
  fields:[
    {k:'[data-f="f1-icon"]',t:'text',l:'Feature 1 Icon'},{k:'[data-f="f1-title"]',t:'text',l:'Feature 1 Title'},
    {k:'[data-f="f2-icon"]',t:'text',l:'Feature 2 Icon'},{k:'[data-f="f2-title"]',t:'text',l:'Feature 2 Title'},
    {k:'[data-f="f3-icon"]',t:'text',l:'Feature 3 Icon'},{k:'[data-f="f3-title"]',t:'text',l:'Feature 3 Title'},
    {k:'[data-f="f4-icon"]',t:'text',l:'Feature 4 Icon'},{k:'[data-f="f4-title"]',t:'text',l:'Feature 4 Title'},
  ],
  html:`<section data-sid="luxury-features-strip" style="background:var(--S1,#0f1923);padding:40px 6vw;">
  <div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;">
    ${[1,2,3,4].map(n=>`
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;">
      <span data-f="f${n}-icon" contenteditable="false" style="font-size:24px;">✦</span>
      <span data-f="f${n}-title" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.75);">Feature ${n}</span>
    </div>`).join('')}
  </div>
  <style>@media(max-width:768px){[data-sid="luxury-features-strip"]>div{grid-template-columns:1fr 1fr!important;gap:20px!important;}[data-sid="luxury-features-strip"]{padding:32px 20px!important;}}</style>
</section>`
},
{
  id:'luxury-quote-testimonial',name:'Testimonial — Large Quote',icon:'❝',
  category:['real_estate'],
  tags:['testimonial','luxury','quote'],
  fields:[
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Client Name'},
    {k:'[data-f="role"]',t:'text',l:'Client Role/Location'},
  ],
  html:`<section data-sid="luxury-quote-testimonial" style="background:var(--bg,#fff);padding:80px 6vw;">
  <div style="max-width:760px;margin:0 auto;text-align:center;">
    <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:48px;color:var(--S2,#0EA5E9);line-height:1;margin-bottom:10px;">❝</div>
    <p data-f="quote" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(20px,2.8vw,28px);font-weight:600;line-height:1.5;letter-spacing:-.3px;color:#0f0f0f;margin-bottom:26px;">They made finding our home feel effortless — professional from the first call to the final signature.</p>
    <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:800;">Adaeze O.</div>
    <div data-f="role" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;">Homeowner, Lekki</div>
  </div>
  <style>@media(max-width:768px){[data-sid="luxury-quote-testimonial"]{padding:56px 24px!important;}}</style>
</section>`
},
{
  id:'luxury-footer-minimal',name:'Footer — Minimal Centered',icon:'▪️',
  category:['real_estate'],
  tags:['footer','minimal'],
  fields:[
    {k:'[data-f="brand"]',t:'text',l:'Brand Name'},
    {k:'[data-f="tagline"]',t:'text',l:'Tagline'},
    {k:'[data-f="copy"]',t:'text',l:'Copyright Text'},
    {k:'[data-f="wa-link"]',t:'link',l:'WhatsApp Link'},
    {k:'[data-f="ig-link"]',t:'link',l:'Instagram Link'},
  ],
  html:`<footer data-sid="luxury-footer-minimal" style="background:var(--S1,#0f1923);padding:56px 24px 28px;text-align:center;">
  <div data-f="brand" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:20px;font-weight:800;color:#fff;margin-bottom:8px;">Brand Name</div>
  <div data-f="tagline" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;color:rgba(255,255,255,.5);max-width:340px;margin:0 auto 22px;">Exceptional properties, exceptional service.</div>
  <div style="display:flex;gap:14px;justify-content:center;margin-bottom:26px;">
    <a data-f="wa-link" href="https://wa.me/" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:15px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.83 14.07c-.24.68-1.4 1.31-1.93 1.36-.5.05-.99.24-3.34-.7-2.82-1.13-4.63-4.01-4.77-4.2-.14-.19-1.14-1.52-1.14-2.9 0-1.38.72-2.05.98-2.33.26-.28.56-.35.75-.35.19 0 .38 0 .54.01.17.01.4-.07.63.47.24.56.81 1.95.88 2.09.07.14.12.31.02.5-.1.19-.15.31-.29.47-.14.17-.3.37-.43.5-.14.14-.29.29-.12.57.17.28.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.33 1.44.28.14.44.12.6-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.63-.14.26.09 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z"/></svg></a>
    <a data-f="ig-link" href="https://instagram.com/" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:15px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
  </div>
  <div data-f="copy" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.35);padding-top:20px;border-top:1px solid rgba(255,255,255,.08);">© 2026 Brand. All rights reserved.</div>
</footer>`
}
,
{
  id:'cafe-order-hero',name:'Cafe Hero — Order Now',icon:'☕',
  category:['restaurant'],
  tags:['hero','order','delivery'],
  fields:[
    {k:'[data-f="badge"]',t:'text',l:'Badge'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="image"]',t:'image',l:'Food Image'},
    {k:'[data-f="time"]',t:'text',l:'Delivery Time'},
    {k:'[data-f="rating"]',t:'text',l:'Rating'},
  ],
  html:`<section data-sid="cafe-order-hero" style="background:linear-gradient(135deg,var(--bg2,#FFF7ED),var(--bg,#fff));padding:56px 6vw;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;">
    <div>
      <div data-f="badge" contenteditable="false" style="display:inline-block;padding:7px 14px;border-radius:50px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.06);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:var(--S2,#F97316);margin-bottom:18px;">🔥 Trending near you</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(30px,4.5vw,46px);font-weight:900;line-height:1.1;letter-spacing:-.8px;color:#0f0f0f;margin-bottom:16px;">Hot food, delivered fast</h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15.5px;color:#6b7280;margin-bottom:24px;">Order online and get it delivered hot, or pick up in minutes.</p>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <a data-f="cta-link" href="#menu" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 30px;background:var(--S2,#F97316);color:#fff;border:none;border-radius:12px;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;">Order Now</button></a>
        <div style="display:flex;align-items:center;gap:6px;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;"><span>⏱️</span><span data-f="time" contenteditable="false">25-35 min</span></div>
        <div style="display:flex;align-items:center;gap:6px;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;"><span>⭐</span><span data-f="rating" contenteditable="false">4.8 (2,300+ reviews)</span></div>
      </div>
    </div>
    <img data-f="image" src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&q=80" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:24px;">
  </div>
  <style>@media(max-width:768px){[data-sid="cafe-order-hero"]>div{grid-template-columns:1fr!important;gap:24px!important;}[data-sid="cafe-order-hero"]{padding:40px 20px!important;}[data-sid="cafe-order-hero"] img{order:-1;aspect-ratio:4/3!important;}}</style>
</section>`
},
{
  id:'cafe-menu-list',name:'Menu — Tabbed List',icon:'📃',
  category:['restaurant'],
  tags:['menu','list','food'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="tab1"]',t:'text',l:'Category 1'},{k:'[data-f="tab2"]',t:'text',l:'Category 2'},{k:'[data-f="tab3"]',t:'text',l:'Category 3'},
    {k:'[data-f="i1-name"]',t:'text',l:'Item 1 Name'},{k:'[data-f="i1-desc"]',t:'text',l:'Item 1 Desc'},{k:'[data-f="i1-price"]',t:'text',l:'Item 1 Price'},{k:'[data-f="i1-img"]',t:'image',l:'Item 1 Image'},
    {k:'[data-f="i2-name"]',t:'text',l:'Item 2 Name'},{k:'[data-f="i2-desc"]',t:'text',l:'Item 2 Desc'},{k:'[data-f="i2-price"]',t:'text',l:'Item 2 Price'},{k:'[data-f="i2-img"]',t:'image',l:'Item 2 Image'},
    {k:'[data-f="i3-name"]',t:'text',l:'Item 3 Name'},{k:'[data-f="i3-desc"]',t:'text',l:'Item 3 Desc'},{k:'[data-f="i3-price"]',t:'text',l:'Item 3 Price'},{k:'[data-f="i3-img"]',t:'image',l:'Item 3 Image'},
  ],
  html:`<section data-sid="cafe-menu-list" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:800px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:18px;">Our Menu</h2>
    <div style="display:flex;gap:10px;margin-bottom:24px;">
      <span data-f="tab1" contenteditable="false" style="padding:8px 16px;border-radius:50px;background:var(--S2,#F97316);color:#fff;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;">Popular</span>
      <span data-f="tab2" contenteditable="false" style="padding:8px 16px;border-radius:50px;background:var(--bg3,#F1F5F9);color:#374151;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;">Mains</span>
      <span data-f="tab3" contenteditable="false" style="padding:8px 16px;border-radius:50px;background:var(--bg3,#F1F5F9);color:#374151;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;">Drinks</span>
    </div>
    <div style="display:flex;flex-direction:column;">
      ${[1,2,3].map(n=>`
      <div style="display:flex;gap:16px;align-items:center;padding:16px 0;border-bottom:1.5px solid var(--bdr,#eee);">
        <img data-f="i${n}-img" src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=80" style="width:72px;height:72px;border-radius:12px;object-fit:cover;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div data-f="i${n}-name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15.5px;font-weight:800;margin-bottom:3px;">Item ${n}</div>
          <div data-f="i${n}-desc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Description of the dish goes here.</div>
        </div>
        <div data-f="i${n}-price" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:900;color:var(--S2,#F97316);white-space:nowrap;">₦3,500</div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="cafe-menu-list"]{padding:40px 18px!important;}}</style>
</section>`
},
{
  id:'cafe-reviews-strip',name:'Reviews — Star Badges',icon:'⭐',
  category:['restaurant'],
  tags:['reviews','ratings','strip'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="r1-name"]',t:'text',l:'Review 1 Name'},{k:'[data-f="r1-text"]',t:'text',l:'Review 1 Text'},
    {k:'[data-f="r2-name"]',t:'text',l:'Review 2 Name'},{k:'[data-f="r2-text"]',t:'text',l:'Review 2 Text'},
    {k:'[data-f="r3-name"]',t:'text',l:'Review 3 Name'},{k:'[data-f="r3-text"]',t:'text',l:'Review 3 Text'},
  ],
  html:`<section data-sid="cafe-reviews-strip" style="background:var(--bg2,#FFF7ED);padding:56px 6vw;">
  <div style="max-width:1100px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;margin-bottom:22px;text-align:center;">What people are saying</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
      ${[1,2,3].map(n=>`
      <div style="background:#fff;border-radius:14px;padding:18px;">
        <div style="color:#FBBF24;font-size:13px;margin-bottom:8px;">★★★★★</div>
        <p data-f="r${n}-text" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;color:#374151;line-height:1.5;margin-bottom:10px;">Best food in the area, always fresh and on time.</p>
        <div data-f="r${n}-name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:#111827;">Reviewer ${n}</div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="cafe-reviews-strip"]>div>div:last-child{grid-template-columns:1fr!important;}[data-sid="cafe-reviews-strip"]{padding:40px 18px!important;}}</style>
</section>`
},
{
  id:'cafe-footer-light',name:'Footer — Light Rounded',icon:'🧾',
  category:['restaurant','grocery'],
  tags:['footer','light'],
  fields:[
    {k:'[data-f="brand"]',t:'text',l:'Brand Name'},
    {k:'[data-f="hours"]',t:'text',l:'Opening Hours'},
    {k:'[data-f="copy"]',t:'text',l:'Copyright Text'},
    {k:'[data-f="wa-link"]',t:'link',l:'WhatsApp Link'},
    {k:'[data-f="ig-link"]',t:'link',l:'Instagram Link'},
  ],
  html:`<footer data-sid="cafe-footer-light" style="background:var(--bg2,#FFF7ED);padding:40px 6vw 24px;">
  <div style="max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;padding-bottom:20px;border-bottom:1.5px solid rgba(0,0,0,.06);">
    <div data-f="brand" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:18px;font-weight:900;">Brand Name</div>
    <div data-f="hours" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;">Open daily · 9am – 10pm</div>
    <div style="display:flex;gap:10px;">
      <a data-f="wa-link" href="https://wa.me/" style="width:34px;height:34px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;text-decoration:none;"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.83 14.07c-.24.68-1.4 1.31-1.93 1.36-.5.05-.99.24-3.34-.7-2.82-1.13-4.63-4.01-4.77-4.2-.14-.19-1.14-1.52-1.14-2.9 0-1.38.72-2.05.98-2.33.26-.28.56-.35.75-.35.19 0 .38 0 .54.01.17.01.4-.07.63.47.24.56.81 1.95.88 2.09.07.14.12.31.02.5-.1.19-.15.31-.29.47-.14.17-.3.37-.43.5-.14.14-.29.29-.12.57.17.28.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.33 1.44.28.14.44.12.6-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.63-.14.26.09 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z"/></svg></a>
      <a data-f="ig-link" href="https://instagram.com/" style="width:34px;height:34px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;text-decoration:none;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
    </div>
  </div>
  <div data-f="copy" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:#9ca3af;text-align:center;padding-top:16px;">© 2026 Brand. All rights reserved.</div>
</footer>`
}
,
{
  id:'agency-hero',name:'Agency Hero — Bold Type',icon:'🎨',
  category:['portfolio'],
  tags:['hero','agency','bold'],
  fields:[
    {k:'[data-f="status"]',t:'text',l:'Availability Status'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="skill1"]',t:'text',l:'Skill 1'},{k:'[data-f="skill2"]',t:'text',l:'Skill 2'},{k:'[data-f="skill3"]',t:'text',l:'Skill 3'},{k:'[data-f="skill4"]',t:'text',l:'Skill 4'},
  ],
  html:`<section data-sid="agency-hero" style="background:var(--S1,#0a0a0f);padding:80px 6vw 50px;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
      <span style="width:8px;height:8px;border-radius:50%;background:#22C55E;display:inline-block;"></span>
      <span data-f="status" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.6);">Available for new projects</span>
    </div>
    <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(36px,7vw,72px);font-weight:900;line-height:1.02;letter-spacing:-2px;color:#fff;margin-bottom:24px;">Design & code that ships.</h1>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:17px;color:rgba(255,255,255,.55);max-width:480px;margin-bottom:32px;">I help brands turn ideas into fast, beautiful, working products.</p>
    <a data-f="cta-link" href="#work" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:15px 32px;background:#fff;color:#0f0f0f;border:none;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;margin-bottom:40px;">View My Work →</button></a>
    <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:28px;border-top:1px solid rgba(255,255,255,.08);">
      <span data-f="skill1" contenteditable="false" style="padding:7px 14px;border-radius:50px;background:rgba(255,255,255,.06);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.7);">Brand Design</span>
      <span data-f="skill2" contenteditable="false" style="padding:7px 14px;border-radius:50px;background:rgba(255,255,255,.06);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.7);">Web Development</span>
      <span data-f="skill3" contenteditable="false" style="padding:7px 14px;border-radius:50px;background:rgba(255,255,255,.06);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.7);">UI/UX</span>
      <span data-f="skill4" contenteditable="false" style="padding:7px 14px;border-radius:50px;background:rgba(255,255,255,.06);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.7);">Motion</span>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="agency-hero"]{padding:50px 20px 36px!important;}[data-sid="agency-hero"] h1{font-size:34px!important;}}</style>
</section>`
},
{
  id:'agency-work-grid',name:'Work — Large Showcase',icon:'🖼️',
  category:['portfolio'],
  tags:['work','projects','showcase'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="p1-name"]',t:'text',l:'Project 1 Name'},{k:'[data-f="p1-tag"]',t:'text',l:'Project 1 Tag'},{k:'[data-f="p1-img"]',t:'image',l:'Project 1 Image'},
    {k:'[data-f="p2-name"]',t:'text',l:'Project 2 Name'},{k:'[data-f="p2-tag"]',t:'text',l:'Project 2 Tag'},{k:'[data-f="p2-img"]',t:'image',l:'Project 2 Image'},
  ],
  html:`<section data-sid="agency-work-grid" style="background:var(--bg,#fff);padding:64px 6vw;">
  <div style="max-width:1100px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:26px;">Selected Work</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      ${[1,2].map(n=>`
      <div style="cursor:pointer;">
        <div style="border-radius:16px;overflow:hidden;margin-bottom:14px;"><img data-f="p${n}-img" src="https://images.unsplash.com/photo-1522542550221-31fd19575a2d?w=600&q=80" style="width:100%;aspect-ratio:4/3;object-fit:cover;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span data-f="p${n}-name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:17px;font-weight:800;">Project ${n}</span>
          <span data-f="p${n}-tag" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;font-weight:700;color:var(--S2,#7C3AED);">Branding</span>
        </div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="agency-work-grid"]>div>div{grid-template-columns:1fr!important;}[data-sid="agency-work-grid"]{padding:44px 20px!important;}}</style>
</section>`
},
{
  id:'agency-process-strip',name:'Process — Numbered Steps',icon:'🔢',
  category:['portfolio'],
  tags:['process','steps'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="s1-title"]',t:'text',l:'Step 1 Title'},{k:'[data-f="s1-desc"]',t:'text',l:'Step 1 Desc'},
    {k:'[data-f="s2-title"]',t:'text',l:'Step 2 Title'},{k:'[data-f="s2-desc"]',t:'text',l:'Step 2 Desc'},
    {k:'[data-f="s3-title"]',t:'text',l:'Step 3 Title'},{k:'[data-f="s3-desc"]',t:'text',l:'Step 3 Desc'},
  ],
  html:`<section data-sid="agency-process-strip" style="background:var(--bg2,#F8FAFC);padding:60px 6vw;">
  <div style="max-width:1100px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;margin-bottom:28px;">How I Work</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;">
      ${[1,2,3].map(n=>`
      <div>
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:38px;font-weight:900;color:var(--S2,#7C3AED);opacity:.25;margin-bottom:8px;">0${n}</div>
        <div data-f="s${n}-title" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:800;margin-bottom:8px;">Step ${n}</div>
        <div data-f="s${n}-desc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;color:#6b7280;line-height:1.6;">Description of this step in the process.</div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="agency-process-strip"]>div>div:last-child{grid-template-columns:1fr!important;gap:24px!important;}[data-sid="agency-process-strip"]{padding:44px 20px!important;}}</style>
</section>`
},
{
  id:'agency-footer-bold',name:'Footer — Bold CTA',icon:'📢',
  category:['portfolio'],
  tags:['footer','cta','bold'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'CTA Headline'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="copy"]',t:'text',l:'Copyright Text'},
  ],
  html:`<footer data-sid="agency-footer-bold" style="background:var(--S1,#0a0a0f);padding:70px 6vw 28px;text-align:center;">
  <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(26px,4vw,40px);font-weight:900;letter-spacing:-1px;color:#fff;margin-bottom:26px;">Let's build something great.</h2>
  <a data-f="cta-link" href="#contact" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:15px 34px;background:#fff;color:#0f0f0f;border:none;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;margin-bottom:50px;">Get In Touch →</button></a>
  <div data-f="copy" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.35);padding-top:20px;border-top:1px solid rgba(255,255,255,.08);">© 2026 All rights reserved.</div>
</footer>`
}
,
{
  id:'corp-hero-split',name:'Corporate Hero — Split',icon:'🏢',
  category:['general_business'],
  tags:['hero','corporate','professional'],
  fields:[
    {k:'[data-f="eyebrow"]',t:'text',l:'Eyebrow'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="image"]',t:'image',l:'Image'},
  ],
  html:`<section data-sid="corp-hero-split" style="background:var(--bg,#fff);padding:64px 6vw;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1.1fr .9fr;gap:50px;align-items:center;">
    <div>
      <div data-f="eyebrow" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--S2,#111827);margin-bottom:16px;">Trusted Since 2014</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(28px,4vw,44px);font-weight:800;line-height:1.15;letter-spacing:-.6px;color:#0f172a;margin-bottom:18px;">Reliable solutions for growing businesses</h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15.5px;color:#475569;line-height:1.6;margin-bottom:28px;">We partner with businesses to deliver measurable results, on time, every time.</p>
      <a data-f="cta-link" href="#contact" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 30px;background:var(--S2,#111827);color:#fff;border:none;border-radius:8px;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;">Request a Quote</button></a>
    </div>
    <img data-f="image" src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=700&q=80" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;">
  </div>
  <style>@media(max-width:768px){[data-sid="corp-hero-split"]>div{grid-template-columns:1fr!important;gap:26px!important;}[data-sid="corp-hero-split"]{padding:44px 20px!important;}}</style>
</section>`
},
{
  id:'corp-stats-band',name:'Stats — Trust Band',icon:'📊',
  category:['general_business'],
  tags:['stats','trust','numbers'],
  fields:[
    {k:'[data-f="stat1"]',t:'text',l:'Stat 1'},{k:'[data-f="stat1-lbl"]',t:'text',l:'Stat 1 Label'},
    {k:'[data-f="stat2"]',t:'text',l:'Stat 2'},{k:'[data-f="stat2-lbl"]',t:'text',l:'Stat 2 Label'},
    {k:'[data-f="stat3"]',t:'text',l:'Stat 3'},{k:'[data-f="stat3-lbl"]',t:'text',l:'Stat 3 Label'},
    {k:'[data-f="stat4"]',t:'text',l:'Stat 4'},{k:'[data-f="stat4-lbl"]',t:'text',l:'Stat 4 Label'},
  ],
  html:`<section data-sid="corp-stats-band" style="background:var(--S1,#111827);padding:44px 6vw;">
  <div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;">
    ${[1,2,3,4].map(n=>`
    <div style="text-align:center;">
      <div data-f="stat${n}" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(24px,3vw,32px);font-weight:900;color:#fff;margin-bottom:4px;">100+</div>
      <div data-f="stat${n}-lbl" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.55);">Stat label</div>
    </div>`).join('')}
  </div>
  <style>@media(max-width:768px){[data-sid="corp-stats-band"]>div{grid-template-columns:1fr 1fr!important;gap:22px!important;}[data-sid="corp-stats-band"]{padding:32px 20px!important;}}</style>
</section>`
},
{
  id:'corp-footer-formal',name:'Footer — Formal CTA',icon:'📋',
  category:['general_business','booking','event'],
  tags:['footer','cta','formal'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'CTA Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'CTA Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="brand"]',t:'text',l:'Brand Name'},
    {k:'[data-f="copy"]',t:'text',l:'Copyright Text'},
  ],
  html:`<footer data-sid="corp-footer-formal" style="background:var(--bg,#fff);">
  <div style="background:var(--bg2,#F8FAFC);padding:56px 6vw;text-align:center;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(22px,3vw,30px);font-weight:800;letter-spacing:-.5px;margin-bottom:10px;">Ready to get started?</h2>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;color:#475569;margin-bottom:22px;">Let's talk about how we can help your business grow.</p>
    <a data-f="cta-link" href="#contact" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:13px 28px;background:var(--S2,#111827);color:#fff;border:none;border-radius:8px;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Contact Us</button></a>
  </div>
  <div style="padding:22px 6vw;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
    <span data-f="brand" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:800;">Brand Name</span>
    <span data-f="copy" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:#94a3b8;">© 2026 All rights reserved.</span>
  </div>
</footer>`
}
,
{
  id:'course-hero',name:'Course Hero — Enroll Now',icon:'🎓',
  category:['digital_marketplace'],
  tags:['hero','course','education'],
  fields:[
    {k:'[data-f="badge"]',t:'text',l:'Badge'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="students"]',t:'text',l:'Student Count'},
    {k:'[data-f="rating"]',t:'text',l:'Rating'},
    {k:'[data-f="price"]',t:'text',l:'Price'},
  ],
  html:`<section data-sid="course-hero" style="background:linear-gradient(135deg,var(--S1,#0f172a),var(--S2,#8B5CF6));padding:70px 6vw;">
  <div style="max-width:800px;margin:0 auto;text-align:center;">
    <div data-f="badge" contenteditable="false" style="display:inline-block;padding:7px 16px;border-radius:50px;background:rgba(255,255,255,.12);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:#fff;margin-bottom:20px;">🎓 Enrollment open now</div>
    <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(28px,4.5vw,44px);font-weight:900;line-height:1.15;letter-spacing:-.6px;color:#fff;margin-bottom:16px;">Learn the skill, get the results</h1>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15.5px;color:rgba(255,255,255,.75);max-width:520px;margin:0 auto 28px;">A complete, practical course — no fluff, just what actually works.</p>
    <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:26px;flex-wrap:wrap;">
      <a data-f="cta-link" href="#enroll" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 30px;background:#fff;color:#0f172a;border:none;border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:800;cursor:pointer;">Enroll Now</button></a>
      <span data-f="price" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:20px;font-weight:900;color:#fff;">₦15,000</span>
    </div>
    <div style="display:flex;gap:20px;justify-content:center;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.65);">
      <span data-f="students" contenteditable="false">👥 1,200+ students</span>
      <span data-f="rating" contenteditable="false">⭐ 4.9 rating</span>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="course-hero"]{padding:48px 20px!important;}}</style>
</section>`
},
{
  id:'course-curriculum',name:'Curriculum — Module List',icon:'📚',
  category:['digital_marketplace'],
  tags:['curriculum','modules','course'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="m1"]',t:'text',l:'Module 1'},{k:'[data-f="m2"]',t:'text',l:'Module 2'},{k:'[data-f="m3"]',t:'text',l:'Module 3'},{k:'[data-f="m4"]',t:'text',l:'Module 4'},
  ],
  html:`<section data-sid="course-curriculum" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:700px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:22px;">What You'll Learn</h2>
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${[1,2,3,4].map(n=>`
      <div style="display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:12px;background:var(--bg2,#F8FAFC);">
        <span style="width:28px;height:28px;border-radius:50%;background:var(--S2,#8B5CF6);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13px;font-weight:800;flex-shrink:0;">${n}</span>
        <span data-f="m${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:600;color:#374151;">Module ${n} title goes here</span>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="course-curriculum"]{padding:40px 18px!important;}}</style>
</section>`
}
,
{
  id:'fashion-editorial-hero',name:'Editorial Hero — Full Bleed',icon:'👠',
  category:['fashion_store'],
  tags:['hero','editorial','fashion'],
  fields:[
    {k:'[data-f="label"]',t:'text',l:'Label'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="image"]',t:'image',l:'Image'},
  ],
  html:`<section data-sid="fashion-editorial-hero" style="position:relative;min-height:92vh;display:flex;align-items:flex-end;">
  <img data-f="image" src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600&q=85" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
  <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.6),transparent 55%);"></div>
  <div style="position:relative;padding:0 6vw 60px;width:100%;">
    <div data-f="label" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#fff;margin-bottom:14px;">New Collection</div>
    <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(40px,9vw,110px);font-weight:900;line-height:.95;letter-spacing:-3px;text-transform:uppercase;color:#fff;margin-bottom:26px;">Style Redefined</h1>
    <a data-f="cta-link" href="#shop" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 30px;background:#fff;color:#0f0f0f;border:none;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;">Shop The Edit</button></a>
  </div>
  <style>@media(max-width:768px){[data-sid="fashion-editorial-hero"]{min-height:70vh!important;}[data-sid="fashion-editorial-hero"]>div{padding:0 20px 36px!important;}}</style>
</section>`
},
{
  id:'fashion-lookbook-split',name:'Lookbook — Alternating Split',icon:'📖',
  category:['fashion_store'],
  tags:['lookbook','editorial','split'],
  fields:[
    {k:'[data-f="l1-title"]',t:'text',l:'Look 1 Title'},{k:'[data-f="l1-desc"]',t:'text',l:'Look 1 Desc'},{k:'[data-f="l1-img"]',t:'image',l:'Look 1 Image'},
    {k:'[data-f="l2-title"]',t:'text',l:'Look 2 Title'},{k:'[data-f="l2-desc"]',t:'text',l:'Look 2 Desc'},{k:'[data-f="l2-img"]',t:'image',l:'Look 2 Image'},
  ],
  html:`<section data-sid="fashion-lookbook-split" style="background:var(--bg,#fff);">
  <div style="display:grid;grid-template-columns:1fr 1fr;">
    <img data-f="l1-img" src="https://images.unsplash.com/photo-1509631179647-0177331693ae?w=700&q=80" style="width:100%;height:100%;object-fit:cover;min-height:400px;">
    <div style="display:flex;flex-direction:column;justify-content:center;padding:6vw;">
      <div data-f="l1-title" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(22px,3vw,32px);font-weight:800;letter-spacing:-.5px;margin-bottom:12px;">The Weekend Edit</div>
      <div data-f="l1-desc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;color:#6b7280;line-height:1.7;">Effortless pieces for days off — comfort without compromising style.</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;">
    <div style="display:flex;flex-direction:column;justify-content:center;padding:6vw;order:1;">
      <div data-f="l2-title" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(22px,3vw,32px);font-weight:800;letter-spacing:-.5px;margin-bottom:12px;">Evening Essentials</div>
      <div data-f="l2-desc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;color:#6b7280;line-height:1.7;">Statement pieces for nights that matter.</div>
    </div>
    <img data-f="l2-img" src="https://images.unsplash.com/photo-1483985988355-763728e1935b?w=700&q=80" style="width:100%;height:100%;object-fit:cover;min-height:400px;order:2;">
  </div>
  <style>@media(max-width:768px){[data-sid="fashion-lookbook-split"]>div{grid-template-columns:1fr!important;}[data-sid="fashion-lookbook-split"]>div>div{padding:32px 20px!important;order:2!important;}[data-sid="fashion-lookbook-split"]>div img{min-height:280px!important;order:1!important;}}</style>
</section>`
}
,
{
  id:'testimonial-spotlight-photo',name:'Testimonial — Photo Spotlight',icon:'🗣️',
  category:['universal'],
  tags:['testimonial','spotlight','photo'],
  fields:[
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Name'},
    {k:'[data-f="role"]',t:'text',l:'Role/Location'},
    {k:'[data-f="photo"]',t:'image',l:'Photo'},
  ],
  html:`<section data-sid="testimonial-spotlight-photo" style="background:var(--bg2,#F8FAFC);padding:64px 6vw;">
  <div style="max-width:700px;margin:0 auto;display:flex;flex-direction:column;align-items:center;text-align:center;gap:18px;">
    <img data-f="photo" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">
    <p data-f="quote" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(18px,2.4vw,24px);font-weight:600;line-height:1.55;letter-spacing:-.2px;color:#0f0f0f;">"Genuinely changed how I see this — worth every naira."</p>
    <div>
      <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:800;">Customer Name</div>
      <div data-f="role" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;">Role or location</div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="testimonial-spotlight-photo"]{padding:44px 22px!important;}}</style>
</section>`
},
{
  id:'testimonial-marquee-strip',name:'Testimonials — Quote Marquee',icon:'💬',
  category:['universal'],
  tags:['testimonial','marquee','strip'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="q1"]',t:'text',l:'Quote 1'},{k:'[data-f="n1"]',t:'text',l:'Name 1'},
    {k:'[data-f="q2"]',t:'text',l:'Quote 2'},{k:'[data-f="n2"]',t:'text',l:'Name 2'},
    {k:'[data-f="q3"]',t:'text',l:'Quote 3'},{k:'[data-f="n3"]',t:'text',l:'Name 3'},
    {k:'[data-f="q4"]',t:'text',l:'Quote 4'},{k:'[data-f="n4"]',t:'text',l:'Name 4'},
  ],
  html:`<section data-sid="testimonial-marquee-strip" style="background:var(--bg,#fff);padding:56px 0;">
  <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;text-align:center;margin-bottom:26px;padding:0 24px;">Loved by customers</h2>
  <div style="display:flex;gap:16px;overflow-x:auto;padding:4px 24px 12px;">
    ${[1,2,3,4].map(n=>`
    <div style="flex:0 0 260px;background:var(--bg2,#F8FAFC);border-radius:14px;padding:18px;">
      <div style="color:#FBBF24;font-size:12px;margin-bottom:8px;">★★★★★</div>
      <p data-f="q${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;color:#374151;line-height:1.55;margin-bottom:10px;">Quote ${n} goes here, short and genuine.</p>
      <div data-f="n${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;">Name ${n}</div>
    </div>`).join('')}
  </div>
  <style>@media(max-width:768px){[data-sid="testimonial-marquee-strip"] > div:last-child{padding-left:18px!important;padding-right:18px!important;}}</style>
</section>`
},
{
  id:'feature-icons-row',name:'Features — Icon Row',icon:'✅',
  category:['universal'],
  tags:['features','icons','row'],
  fields:[
    {k:'[data-f="f1-icon"]',t:'text',l:'Feature 1 Icon'},{k:'[data-f="f1-title"]',t:'text',l:'Feature 1 Title'},{k:'[data-f="f1-desc"]',t:'text',l:'Feature 1 Desc'},
    {k:'[data-f="f2-icon"]',t:'text',l:'Feature 2 Icon'},{k:'[data-f="f2-title"]',t:'text',l:'Feature 2 Title'},{k:'[data-f="f2-desc"]',t:'text',l:'Feature 2 Desc'},
    {k:'[data-f="f3-icon"]',t:'text',l:'Feature 3 Icon'},{k:'[data-f="f3-title"]',t:'text',l:'Feature 3 Title'},{k:'[data-f="f3-desc"]',t:'text',l:'Feature 3 Desc'},
  ],
  html:`<section data-sid="feature-icons-row" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:0;">
    ${[1,2,3].map(n=>`
    <div style="display:flex;align-items:center;gap:20px;padding:20px 0;border-bottom:1.5px solid var(--bdr,#eee);">
      <span data-f="f${n}-icon" contenteditable="false" style="font-size:26px;flex-shrink:0;width:44px;">✓</span>
      <div>
        <div data-f="f${n}-title" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15.5px;font-weight:800;margin-bottom:3px;">Feature ${n}</div>
        <div data-f="f${n}-desc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;color:#6b7280;">Short description of this benefit.</div>
      </div>
    </div>`).join('')}
  </div>
  <style>@media(max-width:768px){[data-sid="feature-icons-row"]{padding:40px 18px!important;}}</style>
</section>`
},
{
  id:'stats-with-quote',name:'Stat + Quote Combo',icon:'📈',
  category:['universal'],
  tags:['stats','quote','trust'],
  fields:[
    {k:'[data-f="stat"]',t:'text',l:'Big Stat'},
    {k:'[data-f="stat-lbl"]',t:'text',l:'Stat Label'},
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Name'},
  ],
  html:`<section data-sid="stats-with-quote" style="background:var(--bg2,#F8FAFC);padding:56px 6vw;">
  <div style="max-width:900px;margin:0 auto;display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:center;">
    <div style="text-align:center;">
      <div data-f="stat" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:52px;font-weight:900;color:var(--S2,#7C3AED);line-height:1;">98%</div>
      <div data-f="stat-lbl" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;margin-top:6px;">Satisfaction rate</div>
    </div>
    <div style="border-left:2px solid var(--bdr,#e2e8f0);padding-left:32px;">
      <p data-f="quote" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15.5px;color:#374151;line-height:1.6;margin-bottom:8px;">"This completely changed the way I get things done — I recommend it to everyone."</p>
      <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#6b7280;">— Customer Name</div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="stats-with-quote"]>div{grid-template-columns:1fr!important;text-align:center!important;}[data-sid="stats-with-quote"]>div>div:last-child{border-left:none!important;padding-left:0!important;border-top:2px solid var(--bdr,#e2e8f0);padding-top:20px;}[data-sid="stats-with-quote"]{padding:40px 20px!important;}}</style>
</section>`
}
,
{
  id:'grocery-box-hero',name:'Grocery Hero — Box Subscription',icon:'📦',
  category:['grocery'],
  tags:['hero','subscription','box'],
  fields:[
    {k:'[data-f="badge"]',t:'text',l:'Badge'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="image"]',t:'image',l:'Image'},
  ],
  html:`<section data-sid="grocery-box-hero" style="background:var(--bg2,#F0FDF4);padding:60px 6vw;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;">
    <div>
      <div data-f="badge" contenteditable="false" style="display:inline-block;padding:7px 14px;border-radius:50px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.05);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:var(--S2,#16A34A);margin-bottom:18px;">📦 Weekly box delivery</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(28px,4.5vw,44px);font-weight:900;line-height:1.12;letter-spacing:-.6px;color:#0f172a;margin-bottom:16px;">Fresh groceries, delivered weekly</h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15.5px;color:#475569;margin-bottom:26px;">Pick a box size, we handle the rest — fresh produce at your door, every week.</p>
      <a data-f="cta-link" href="#plans" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 30px;background:var(--S2,#16A34A);color:#fff;border:none;border-radius:12px;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;">Choose Your Box</button></a>
    </div>
    <img data-f="image" src="https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=700&q=80" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:20px;">
  </div>
  <style>@media(max-width:768px){[data-sid="grocery-box-hero"]>div{grid-template-columns:1fr!important;gap:24px!important;}[data-sid="grocery-box-hero"]{padding:40px 20px!important;}[data-sid="grocery-box-hero"] img{order:-1;aspect-ratio:4/3!important;}}</style>
</section>`
},
{
  id:'grocery-plan-cards',name:'Box Plans — Pricing Tiers',icon:'🗳️',
  category:['grocery'],
  tags:['pricing','plans','box'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="p1-name"]',t:'text',l:'Plan 1 Name'},{k:'[data-f="p1-price"]',t:'text',l:'Plan 1 Price'},{k:'[data-f="p1-desc"]',t:'text',l:'Plan 1 Desc'},
    {k:'[data-f="p2-name"]',t:'text',l:'Plan 2 Name'},{k:'[data-f="p2-price"]',t:'text',l:'Plan 2 Price'},{k:'[data-f="p2-desc"]',t:'text',l:'Plan 2 Desc'},
    {k:'[data-f="p3-name"]',t:'text',l:'Plan 3 Name'},{k:'[data-f="p3-price"]',t:'text',l:'Plan 3 Price'},{k:'[data-f="p3-desc"]',t:'text',l:'Plan 3 Desc'},
  ],
  html:`<section data-sid="grocery-plan-cards" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:1000px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;text-align:center;margin-bottom:28px;">Choose Your Box</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;">
      ${[1,2,3].map(n=>`
      <div style="border-radius:16px;border:${n===2?'2.5px solid var(--S2,#16A34A)':'1.5px solid var(--bdr,#eee)'};padding:24px 20px;text-align:center;position:relative;">
        ${n===2?'<div style="position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:var(--S2,#16A34A);color:#fff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:50px;">POPULAR</div>':''}
        <div data-f="p${n}-name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:800;margin-bottom:6px;">Box ${n}</div>
        <div data-f="p${n}-price" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;color:var(--S2,#16A34A);margin-bottom:8px;">₦8,000</div>
        <div data-f="p${n}-desc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;">Good for a household of ${n+1}.</div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="grocery-plan-cards"]>div>div{grid-template-columns:1fr!important;gap:16px!important;}[data-sid="grocery-plan-cards"]{padding:40px 18px!important;}}</style>
</section>`
}
,
{
  id:'booking-slots-hero',name:'Booking Hero — Slot Picker',icon:'🗓️',
  category:['booking'],
  tags:['hero','scheduling','booking'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="slot1"]',t:'text',l:'Slot 1'},{k:'[data-f="slot2"]',t:'text',l:'Slot 2'},{k:'[data-f="slot3"]',t:'text',l:'Slot 3'},
  ],
  html:`<section data-sid="booking-slots-hero" style="background:var(--bg,#fff);padding:64px 6vw;">
  <div style="max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1.1fr .9fr;gap:44px;align-items:center;">
    <div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(28px,4vw,42px);font-weight:900;line-height:1.15;letter-spacing:-.6px;color:#0f172a;margin-bottom:16px;">Book your appointment in seconds</h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;color:#475569;margin-bottom:26px;">Pick a time that works for you — no calls, no waiting.</p>
      <a data-f="cta-link" href="#book" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 30px;background:var(--S2,#7C3AED);color:#fff;border:none;border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;">Book Now</button></a>
    </div>
    <div style="background:var(--bg2,#F8FAFC);border-radius:18px;padding:20px;">
      <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;font-weight:700;color:#6b7280;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px;">Available Today</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div data-f="slot1" contenteditable="false" style="padding:12px 16px;background:#fff;border-radius:10px;border:1.5px solid var(--bdr,#e2e8f0);font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;">10:00 AM</div>
        <div data-f="slot2" contenteditable="false" style="padding:12px 16px;background:var(--S2,#7C3AED);color:#fff;border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;">1:30 PM ✓</div>
        <div data-f="slot3" contenteditable="false" style="padding:12px 16px;background:#fff;border-radius:10px;border:1.5px solid var(--bdr,#e2e8f0);font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;">4:00 PM</div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="booking-slots-hero"]>div{grid-template-columns:1fr!important;gap:24px!important;}[data-sid="booking-slots-hero"]{padding:44px 20px!important;}}</style>
</section>`
},
{
  id:'booking-calendar-grid',name:'Availability — Week Grid',icon:'📆',
  category:['booking'],
  tags:['calendar','availability','schedule'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
  ],
  html:`<section data-sid="booking-calendar-grid" style="background:var(--bg2,#F8FAFC);padding:56px 6vw;">
  <div style="max-width:800px;margin:0 auto;text-align:center;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;margin-bottom:8px;">This Week's Availability</h2>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;color:#6b7280;margin-bottom:26px;">Green means open — tap any day to see time slots.</p>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;">
      ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=>`
      <div style="padding:14px 4px;border-radius:10px;background:${i<5?'#fff':'var(--bg3,#F1F5F9)'};border:1.5px solid ${i<5?'#22C55E':'var(--bdr,#e2e8f0)'};">
        <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;">${d}</div>
        <div style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13px;font-weight:800;color:${i<5?'#22C55E':'#94a3b8'};">${i<5?'Open':'Closed'}</div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="booking-calendar-grid"]>div>div{grid-template-columns:repeat(4,1fr)!important;}[data-sid="booking-calendar-grid"]{padding:40px 18px!important;}}</style>
</section>`
}
,
{
  id:'ecom-star-badges',name:'Reviews — Star Badge Grid',icon:'⭐',
  category:['ecommerce'],
  tags:['reviews','ecommerce'],
  fields:[
    {k:'[data-f="score"]',t:'text',l:'Overall Score'},
    {k:'[data-f="count"]',t:'text',l:'Review Count'},
    {k:'[data-f="r1"]',t:'text',l:'Review 1'},{k:'[data-f="r2"]',t:'text',l:'Review 2'},{k:'[data-f="r3"]',t:'text',l:'Review 3'},
  ],
  html:`<section data-sid="ecom-star-badges" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:1000px;margin:0 auto;text-align:center;">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">
      <span data-f="score" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:32px;font-weight:900;">4.8</span>
      <span style="color:#FBBF24;font-size:16px;">★★★★★</span>
    </div>
    <div data-f="count" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;margin-bottom:24px;">Based on 3,000+ reviews</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
      ${[1,2,3].map(n=>`<div style="background:var(--bg2,#F8FAFC);border-radius:12px;padding:16px;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#374151;text-align:left;"><div style="color:#FBBF24;font-size:11px;margin-bottom:6px;">★★★★★</div><span data-f="r${n}" contenteditable="false">Great quality, fast shipping.</span></div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="ecom-star-badges"]>div>div:last-child{grid-template-columns:1fr!important;}[data-sid="ecom-star-badges"]{padding:40px 20px!important;}}</style>
</section>`
},
{
  id:'restaurant-quote-ribbon',name:'Quote — Ribbon Banner',icon:'🎗️',
  category:['restaurant'],
  tags:['testimonial','ribbon'],
  fields:[
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Name'},
  ],
  html:`<section data-sid="restaurant-quote-ribbon" style="background:var(--S2,#F97316);padding:36px 6vw;text-align:center;">
  <p data-f="quote" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(16px,2.2vw,20px);font-weight:700;color:#fff;max-width:700px;margin:0 auto 8px;">"The best meal I've had all year — every single time."</p>
  <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.8);">— Regular Customer</div>
  <style>@media(max-width:768px){[data-sid="restaurant-quote-ribbon"]{padding:28px 20px!important;}}</style>
</section>`
},
{
  id:'portfolio-client-logos',name:'Clients — Logo Strip',icon:'🏷️',
  category:['portfolio'],
  tags:['clients','logos'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="c1"]',t:'text',l:'Client 1'},{k:'[data-f="c2"]',t:'text',l:'Client 2'},{k:'[data-f="c3"]',t:'text',l:'Client 3'},{k:'[data-f="c4"]',t:'text',l:'Client 4'},
  ],
  html:`<section data-sid="portfolio-client-logos" style="background:var(--bg2,#F8FAFC);padding:40px 6vw;">
  <div style="max-width:900px;margin:0 auto;text-align:center;">
    <div data-f="headline" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:20px;">Trusted by teams at</div>
    <div style="display:flex;justify-content:center;gap:40px;flex-wrap:wrap;">
      ${[1,2,3,4].map(n=>`<span data-f="c${n}" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:17px;font-weight:800;color:#94a3b8;">Client ${n}</span>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="portfolio-client-logos"]>div>div{gap:22px!important;}[data-sid="portfolio-client-logos"]{padding:30px 20px!important;}}</style>
</section>`
},
{
  id:'portfolio-quote-minimal',name:'Quote — Minimal Line',icon:'💭',
  category:['portfolio'],
  tags:['testimonial','minimal'],
  fields:[
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Name'},
  ],
  html:`<section data-sid="portfolio-quote-minimal" style="background:var(--bg,#fff);padding:56px 6vw;text-align:center;">
  <p data-f="quote" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(18px,2.4vw,24px);font-weight:600;letter-spacing:-.3px;color:#0f0f0f;max-width:620px;margin:0 auto 12px;">"Rare to find someone this fast who doesn't cut corners."</p>
  <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;">— Client, Product Lead</div>
  <style>@media(max-width:768px){[data-sid="portfolio-quote-minimal"]{padding:40px 22px!important;}}</style>
</section>`
},
{
  id:'realestate-client-quotes',name:'Client Quotes — Two Column',icon:'🏠',
  category:['real_estate'],
  tags:['testimonial','property'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="q1"]',t:'text',l:'Quote 1'},{k:'[data-f="n1"]',t:'text',l:'Name 1'},
    {k:'[data-f="q2"]',t:'text',l:'Quote 2'},{k:'[data-f="n2"]',t:'text',l:'Name 2'},
  ],
  html:`<section data-sid="realestate-client-quotes" style="background:var(--bg2,#F8FAFC);padding:56px 6vw;">
  <div style="max-width:1000px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;margin-bottom:26px;text-align:center;">From Our Clients</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      ${[1,2].map(n=>`<div style="background:#fff;border-radius:14px;padding:22px;"><p data-f="q${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;color:#374151;line-height:1.6;margin-bottom:10px;">Quote ${n} goes here.</p><div data-f="n${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;">Client ${n}</div></div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="realestate-client-quotes"]>div>div:last-child{grid-template-columns:1fr!important;}[data-sid="realestate-client-quotes"]{padding:40px 20px!important;}}</style>
</section>`
}
,
{
  id:'corp-case-quote',name:'Case Study Quote',icon:'📁',
  category:['general_business'],
  tags:['testimonial','case-study'],
  fields:[
    {k:'[data-f="result"]',t:'text',l:'Result Stat'},
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Name'},
  ],
  html:`<section data-sid="corp-case-quote" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:800px;margin:0 auto;background:var(--bg2,#F8FAFC);border-radius:16px;padding:36px;display:flex;align-items:center;gap:28px;flex-wrap:wrap;">
    <div data-f="result" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:38px;font-weight:900;color:var(--S2,#111827);flex-shrink:0;">+40%</div>
    <div style="flex:1;min-width:220px;">
      <p data-f="quote" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;color:#374151;line-height:1.6;margin-bottom:6px;">"Working with them increased our efficiency significantly within the first quarter."</p>
      <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;">— Operations Director</div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="corp-case-quote"]>div{padding:24px!important;}[data-sid="corp-case-quote"]{padding:40px 20px!important;}}</style>
</section>`
},
{
  id:'biz-values-row',name:'Our Values — Row',icon:'🧭',
  category:['general_business'],
  tags:['values','features'],
  fields:[
    {k:'[data-f="v1"]',t:'text',l:'Value 1'},{k:'[data-f="v2"]',t:'text',l:'Value 2'},{k:'[data-f="v3"]',t:'text',l:'Value 3'},{k:'[data-f="v4"]',t:'text',l:'Value 4'},
  ],
  html:`<section data-sid="biz-values-row" style="background:var(--S1,#111827);padding:36px 6vw;">
  <div style="max-width:1000px;margin:0 auto;display:flex;justify-content:center;gap:36px;flex-wrap:wrap;">
    ${[1,2,3,4].map(n=>`<span data-f="v${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;font-weight:700;color:rgba(255,255,255,.7);">Value ${n}</span>`).join('')}
  </div>
  <style>@media(max-width:768px){[data-sid="biz-values-row"]>div{gap:18px!important;}[data-sid="biz-values-row"]{padding:26px 20px!important;}}</style>
</section>`
},
{
  id:'fashion-ig-quotes',name:'As Worn By — IG Quotes',icon:'📸',
  category:['fashion_store'],
  tags:['testimonial','social'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="q1"]',t:'text',l:'Quote 1'},{k:'[data-f="h1"]',t:'text',l:'Handle 1'},
    {k:'[data-f="q2"]',t:'text',l:'Quote 2'},{k:'[data-f="h2"]',t:'text',l:'Handle 2'},
    {k:'[data-f="q3"]',t:'text',l:'Quote 3'},{k:'[data-f="h3"]',t:'text',l:'Handle 3'},
  ],
  html:`<section data-sid="fashion-ig-quotes" style="background:#0f0f0f;padding:56px 6vw;">
  <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.5);text-align:center;margin-bottom:24px;">As Worn By You</h2>
  <div style="max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
    ${[1,2,3].map(n=>`<div style="border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:18px;"><p data-f="q${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;color:rgba(255,255,255,.8);line-height:1.55;margin-bottom:10px;">"Obsessed with the fit and fabric."</p><div data-f="h${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:var(--S2,#EC4899);">@handle</div></div>`).join('')}
  </div>
  <style>@media(max-width:768px){[data-sid="fashion-ig-quotes"]>div{grid-template-columns:1fr!important;}[data-sid="fashion-ig-quotes"]{padding:40px 20px!important;}}</style>
</section>`
},
{
  id:'booking-benefits-check',name:'Why Book With Us — Checklist',icon:'✔️',
  category:['booking'],
  tags:['benefits','checklist'],
  fields:[
    {k:'[data-f="b1"]',t:'text',l:'Benefit 1'},{k:'[data-f="b2"]',t:'text',l:'Benefit 2'},{k:'[data-f="b3"]',t:'text',l:'Benefit 3'},{k:'[data-f="b4"]',t:'text',l:'Benefit 4'},
  ],
  html:`<section data-sid="booking-benefits-check" style="background:var(--bg,#fff);padding:44px 6vw;">
  <div style="max-width:700px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
    ${[1,2,3,4].map(n=>`<div style="display:flex;align-items:center;gap:10px;"><span style="color:var(--S2,#7C3AED);font-size:16px;">✓</span><span data-f="b${n}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;color:#374151;">Benefit ${n}</span></div>`).join('')}
  </div>
  <style>@media(max-width:768px){[data-sid="booking-benefits-check"]>div{grid-template-columns:1fr!important;}[data-sid="booking-benefits-check"]{padding:32px 20px!important;}}</style>
</section>`
},
{
  id:'booking-footer-clean',name:'Footer — Clean Minimal',icon:'🔲',
  category:['booking','gig_marketplace'],
  tags:['footer','minimal'],
  fields:[
    {k:'[data-f="brand"]',t:'text',l:'Brand Name'},
    {k:'[data-f="copy"]',t:'text',l:'Copyright Text'},
    {k:'[data-f="wa-link"]',t:'link',l:'WhatsApp Link'},
  ],
  html:`<footer data-sid="booking-footer-clean" style="background:var(--bg2,#F8FAFC);padding:32px 6vw;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
  <span data-f="brand" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:15px;font-weight:800;">Brand Name</span>
  <div style="display:flex;align-items:center;gap:16px;">
    <a data-f="wa-link" href="https://wa.me/" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:var(--S2,#7C3AED);text-decoration:none;font-weight:700;"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.83 14.07c-.24.68-1.4 1.31-1.93 1.36-.5.05-.99.24-3.34-.7-2.82-1.13-4.63-4.01-4.77-4.2-.14-.19-1.14-1.52-1.14-2.9 0-1.38.72-2.05.98-2.33.26-.28.56-.35.75-.35.19 0 .38 0 .54.01.17.01.4-.07.63.47.24.56.81 1.95.88 2.09.07.14.12.31.02.5-.1.19-.15.31-.29.47-.14.17-.3.37-.43.5-.14.14-.29.29-.12.57.17.28.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.33 1.44.28.14.44.12.6-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.63-.14.26.09 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z"/></svg></a>
    <span data-f="copy" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:#94a3b8;">© 2026</span>
  </div>
</footer>`
},
{
  id:'course-success-banner',name:'Success Stat Banner',icon:'🏆',
  category:['digital_marketplace'],
  tags:['stats','success'],
  fields:[
    {k:'[data-f="stat"]',t:'text',l:'Stat'},
    {k:'[data-f="text"]',t:'text',l:'Text'},
  ],
  html:`<section data-sid="course-success-banner" style="background:var(--bg2,#F8FAFC);padding:36px 6vw;text-align:center;">
  <p style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;color:#374151;"><span data-f="stat" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-weight:900;color:var(--S2,#8B5CF6);">89%</span> <span data-f="text" contenteditable="false">of students land results within 30 days of finishing.</span></p>
  <style>@media(max-width:768px){[data-sid="course-success-banner"]{padding:26px 20px!important;}}</style>
</section>`
},
{
  id:'grocery-family-quote',name:'Happy Family Quote',icon:'👨‍👩‍👧',
  category:['grocery'],
  tags:['testimonial','family'],
  fields:[
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Name'},
  ],
  html:`<section data-sid="grocery-family-quote" style="background:var(--S1,#052e16);padding:44px 6vw;text-align:center;">
  <p data-f="quote" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(16px,2.2vw,20px);font-weight:600;color:#fff;max-width:600px;margin:0 auto 8px;">"One less thing to think about every week — and everything is always fresh."</p>
  <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.6);">— Happy Family, Lekki</div>
  <style>@media(max-width:768px){[data-sid="grocery-family-quote"]{padding:32px 20px!important;}}</style>
</section>`
},
{
  id:'grocery-footer-fresh',name:'Footer — Fresh Green',icon:'🍃',
  category:['grocery','hotel_rental'],
  tags:['footer'],
  fields:[
    {k:'[data-f="brand"]',t:'text',l:'Brand Name'},
    {k:'[data-f="hours"]',t:'text',l:'Hours / Info Line'},
    {k:'[data-f="copy"]',t:'text',l:'Copyright Text'},
    {k:'[data-f="wa-link"]',t:'link',l:'WhatsApp Link'},
  ],
  html:`<footer data-sid="grocery-footer-fresh" style="background:var(--S1,#052e16);padding:36px 6vw 22px;text-align:center;">
  <div data-f="brand" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:17px;font-weight:800;color:#fff;margin-bottom:6px;">Brand Name</div>
  <div data-f="hours" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:rgba(255,255,255,.55);margin-bottom:16px;">Delivering daily, 8am – 6pm</div>
  <a data-f="wa-link" href="https://wa.me/" style="display:inline-block;padding:9px 20px;border-radius:50px;background:rgba(255,255,255,.1);color:#fff;font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;text-decoration:none;margin-bottom:18px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.83 14.07c-.24.68-1.4 1.31-1.93 1.36-.5.05-.99.24-3.34-.7-2.82-1.13-4.63-4.01-4.77-4.2-.14-.19-1.14-1.52-1.14-2.9 0-1.38.72-2.05.98-2.33.26-.28.56-.35.75-.35.19 0 .38 0 .54.01.17.01.4-.07.63.47.24.56.81 1.95.88 2.09.07.14.12.31.02.5-.1.19-.15.31-.29.47-.14.17-.3.37-.43.5-.14.14-.29.29-.12.57.17.28.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.33 1.44.28.14.44.12.6-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.63-.14.26.09 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z"/></svg></a>
  <div data-f="copy" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:11.5px;color:rgba(255,255,255,.35);padding-top:14px;border-top:1px solid rgba(255,255,255,.08);">© 2026 All rights reserved.</div>
</footer>`
}
,
{
  id:'agency-stat-quote',name:'Agency Stat + Quote — Dark',icon:'💼',
  category:['portfolio'],
  tags:['stats','quote','dark'],
  fields:[
    {k:'[data-f="stat"]',t:'text',l:'Stat'},
    {k:'[data-f="stat-lbl"]',t:'text',l:'Stat Label'},
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Name'},
  ],
  html:`<section data-sid="agency-stat-quote" style="background:var(--S1,#0a0a0f);padding:56px 6vw;">
  <div style="max-width:900px;margin:0 auto;display:flex;align-items:center;gap:40px;flex-wrap:wrap;">
    <div style="text-align:center;">
      <div data-f="stat" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:44px;font-weight:900;color:#fff;">30+</div>
      <div data-f="stat-lbl" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;">Projects shipped</div>
    </div>
    <div style="flex:1;min-width:220px;border-left:2px solid rgba(255,255,255,.1);padding-left:30px;">
      <p data-f="quote" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;color:rgba(255,255,255,.8);line-height:1.6;margin-bottom:8px;">"Rare mix of great design instincts and solid engineering."</p>
      <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:rgba(255,255,255,.45);">— Client, Product Lead</div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="agency-stat-quote"]>div{flex-direction:column;text-align:center;}[data-sid="agency-stat-quote"]>div>div:last-child{border-left:none!important;padding-left:0!important;border-top:2px solid rgba(255,255,255,.1);padding-top:20px;}[data-sid="agency-stat-quote"]{padding:40px 20px!important;}}</style>
</section>`
}
,
{
  id:'conf-hero',name:'Conference Hero — Professional',icon:'🎤',
  category:['event'],
  tags:['hero','conference','professional'],
  fields:[
    {k:'[data-f="tag"]',t:'text',l:'Tag'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="date"]',t:'text',l:'Date'},
    {k:'[data-f="venue"]',t:'text',l:'Venue'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
  ],
  html:`<section data-sid="conf-hero" style="background:var(--bg2,#F8FAFC);padding:70px 6vw;">
  <div style="max-width:800px;margin:0 auto;text-align:center;">
    <div data-f="tag" contenteditable="false" style="display:inline-block;padding:7px 16px;border-radius:50px;background:var(--S2,#7C3AED);color:#fff;font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;margin-bottom:20px;">📅 Registration Open</div>
    <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(28px,4.5vw,44px);font-weight:900;line-height:1.15;letter-spacing:-.6px;color:#0f172a;margin-bottom:14px;">The Future of Business Summit</h1>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15.5px;color:#475569;max-width:560px;margin:0 auto 26px;">A full day of talks, workshops, and networking with industry leaders.</p>
    <div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;margin-bottom:28px;font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;color:#374151;font-weight:600;">
      <span data-f="date" contenteditable="false">📅 March 15, 2026</span>
      <span data-f="venue" contenteditable="false">📍 Landmark Centre, Lagos</span>
    </div>
    <a data-f="cta-link" href="#register" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 32px;background:var(--S2,#7C3AED);color:#fff;border:none;border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;">Register Now</button></a>
  </div>
  <style>@media(max-width:768px){[data-sid="conf-hero"]{padding:44px 20px!important;}}</style>
</section>`
},
{
  id:'conf-schedule',name:'Agenda — Schedule Timeline',icon:'🗒️',
  category:['event'],
  tags:['schedule','agenda','timeline'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="t1-time"]',t:'text',l:'Session 1 Time'},{k:'[data-f="t1-title"]',t:'text',l:'Session 1 Title'},{k:'[data-f="t1-speaker"]',t:'text',l:'Session 1 Speaker'},
    {k:'[data-f="t2-time"]',t:'text',l:'Session 2 Time'},{k:'[data-f="t2-title"]',t:'text',l:'Session 2 Title'},{k:'[data-f="t2-speaker"]',t:'text',l:'Session 2 Speaker'},
    {k:'[data-f="t3-time"]',t:'text',l:'Session 3 Time'},{k:'[data-f="t3-title"]',t:'text',l:'Session 3 Title'},{k:'[data-f="t3-speaker"]',t:'text',l:'Session 3 Speaker'},
  ],
  html:`<section data-sid="conf-schedule" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:700px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:24px;">Event Schedule</h2>
    <div style="display:flex;flex-direction:column;">
      ${[1,2,3].map(n=>`
      <div style="display:flex;gap:18px;padding:18px 0;border-bottom:1.5px solid var(--bdr,#eee);">
        <div data-f="t${n}-time" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:800;color:var(--S2,#7C3AED);flex-shrink:0;width:90px;">9:00 AM</div>
        <div>
          <div data-f="t${n}-title" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;font-weight:700;margin-bottom:3px;">Session ${n} Title</div>
          <div data-f="t${n}-speaker" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;">Speaker Name</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="conf-schedule"]{padding:40px 18px!important;}}</style>
</section>`
},
{
  id:'conf-speakers',name:'Speakers — Grid',icon:'🎙️',
  category:['event'],
  tags:['speakers','lineup'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="p1-name"]',t:'text',l:'Speaker 1 Name'},{k:'[data-f="p1-title"]',t:'text',l:'Speaker 1 Title'},{k:'[data-f="p1-img"]',t:'image',l:'Speaker 1 Photo'},
    {k:'[data-f="p2-name"]',t:'text',l:'Speaker 2 Name'},{k:'[data-f="p2-title"]',t:'text',l:'Speaker 2 Title'},{k:'[data-f="p2-img"]',t:'image',l:'Speaker 2 Photo'},
    {k:'[data-f="p3-name"]',t:'text',l:'Speaker 3 Name'},{k:'[data-f="p3-title"]',t:'text',l:'Speaker 3 Title'},{k:'[data-f="p3-img"]',t:'image',l:'Speaker 3 Photo'},
  ],
  html:`<section data-sid="conf-speakers" style="background:var(--bg2,#F8FAFC);padding:56px 6vw;">
  <div style="max-width:900px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;text-align:center;margin-bottom:26px;">Featured Speakers</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
      ${[1,2,3].map(n=>`
      <div style="text-align:center;">
        <img data-f="p${n}-img" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin:0 auto 10px;">
        <div data-f="p${n}-name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14.5px;font-weight:800;">Speaker ${n}</div>
        <div data-f="p${n}-title" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;">Title, Company</div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="conf-speakers"]>div>div:last-child{grid-template-columns:1fr!important;gap:24px!important;}[data-sid="conf-speakers"]{padding:40px 20px!important;}}</style>
</section>`
}
,
{
  id:'resort-hero',name:'Resort Hero — Poolside',icon:'🏖️',
  category:['hotel_rental'],
  tags:['hero','resort','vacation'],
  fields:[
    {k:'[data-f="badge"]',t:'text',l:'Badge'},
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
    {k:'[data-f="image"]',t:'image',l:'Image'},
    {k:'[data-f="rating"]',t:'text',l:'Rating'},
  ],
  html:`<section data-sid="resort-hero" style="background:linear-gradient(135deg,#e0f2fe,#fff);padding:56px 6vw;">
  <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center;">
    <div>
      <div data-f="badge" contenteditable="false" style="display:inline-block;padding:7px 14px;border-radius:50px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.06);font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;font-weight:700;color:var(--S2,#0EA5E9);margin-bottom:18px;">☀️ Book your escape</div>
      <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(28px,4.5vw,44px);font-weight:900;line-height:1.12;letter-spacing:-.6px;color:#0f172a;margin-bottom:16px;">Your poolside escape awaits</h1>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15.5px;color:#475569;margin-bottom:20px;">Relax, unwind, and enjoy resort-style comfort — right in the city.</p>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:26px;">
        <span data-f="rating" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#374151;">⭐ 4.9 · 800+ stays</span>
      </div>
      <a data-f="cta-link" href="#rooms" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 30px;background:var(--S2,#0EA5E9);color:#fff;border:none;border-radius:12px;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;cursor:pointer;">Check Availability</button></a>
    </div>
    <img data-f="image" src="https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=700&q=80" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:20px;">
  </div>
  <style>@media(max-width:768px){[data-sid="resort-hero"]>div{grid-template-columns:1fr!important;gap:22px!important;}[data-sid="resort-hero"]{padding:40px 20px!important;}[data-sid="resort-hero"] img{order:-1;aspect-ratio:4/3!important;}}</style>
</section>`
},
{
  id:'resort-amenities-grid',name:'Amenities — Icon Grid',icon:'🏊',
  category:['hotel_rental'],
  tags:['amenities','features'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="a1"]',t:'text',l:'Amenity 1'},{k:'[data-f="a2"]',t:'text',l:'Amenity 2'},{k:'[data-f="a3"]',t:'text',l:'Amenity 3'},{k:'[data-f="a4"]',t:'text',l:'Amenity 4'},{k:'[data-f="a5"]',t:'text',l:'Amenity 5'},{k:'[data-f="a6"]',t:'text',l:'Amenity 6'},
  ],
  html:`<section data-sid="resort-amenities-grid" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:900px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;text-align:center;margin-bottom:26px;">Everything You Need</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
      ${[['🏊','a1','Swimming Pool'],['📶','a2','Free Wi-Fi'],['🍳','a3','Breakfast Included'],['🚗','a4','Free Parking'],['❄️','a5','Air Conditioning'],['🧖','a6','Spa & Gym']].map(([icon,key,def])=>`
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:16px;">
        <span style="font-size:26px;">${icon}</span>
        <span data-f="${key}" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;color:#374151;">${def}</span>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="resort-amenities-grid"]>div>div{grid-template-columns:1fr 1fr!important;}[data-sid="resort-amenities-grid"]{padding:40px 18px!important;}}</style>
</section>`
},
{
  id:'resort-rooms-list',name:'Room Types — List',icon:'🛌',
  category:['hotel_rental'],
  tags:['rooms','pricing'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="r1-name"]',t:'text',l:'Room 1 Name'},{k:'[data-f="r1-desc"]',t:'text',l:'Room 1 Desc'},{k:'[data-f="r1-price"]',t:'text',l:'Room 1 Price'},{k:'[data-f="r1-img"]',t:'image',l:'Room 1 Image'},
    {k:'[data-f="r2-name"]',t:'text',l:'Room 2 Name'},{k:'[data-f="r2-desc"]',t:'text',l:'Room 2 Desc'},{k:'[data-f="r2-price"]',t:'text',l:'Room 2 Price'},{k:'[data-f="r2-img"]',t:'image',l:'Room 2 Image'},
  ],
  html:`<section data-sid="resort-rooms-list" style="background:var(--bg2,#F8FAFC);padding:56px 6vw;">
  <div style="max-width:900px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;margin-bottom:24px;text-align:center;">Choose Your Room</h2>
    <div style="display:flex;flex-direction:column;gap:16px;">
      ${[1,2].map(n=>`
      <div style="display:flex;gap:20px;align-items:center;background:#fff;border-radius:16px;padding:14px;">
        <img data-f="r${n}-img" src="https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=300&q=80" style="width:130px;height:100px;border-radius:12px;object-fit:cover;flex-shrink:0;">
        <div style="flex:1;">
          <div data-f="r${n}-name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:800;margin-bottom:4px;">Room ${n}</div>
          <div data-f="r${n}-desc" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;margin-bottom:8px;">Room description goes here.</div>
          <div data-f="r${n}-price" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:16px;font-weight:900;color:var(--S2,#0EA5E9);">₦35,000/night</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="resort-rooms-list"] > div > div{flex-direction:column!important;text-align:center;}[data-sid="resort-rooms-list"] img{width:100%!important;height:140px!important;}[data-sid="resort-rooms-list"]{padding:40px 18px!important;}}</style>
</section>`
}
,
{
  id:'resort-guest-quote',name:'Guest Review — Card',icon:'💬',
  category:['hotel_rental'],
  tags:['testimonial','review'],
  fields:[
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Guest Name'},
    {k:'[data-f="stay"]',t:'text',l:'Stay Type'},
  ],
  html:`<section data-sid="resort-guest-quote" style="background:var(--bg,#fff);padding:48px 6vw;text-align:center;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="color:#FBBF24;font-size:16px;margin-bottom:10px;">★★★★★</div>
    <p data-f="quote" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(17px,2.2vw,21px);font-weight:600;color:#0f0f0f;margin-bottom:10px;">"Exactly like the photos, spotless, and the pool was a huge bonus."</p>
    <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;font-weight:700;">Tomiwa A.</div>
    <div data-f="stay" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12px;color:#6b7280;">3-night stay</div>
  </div>
  <style>@media(max-width:768px){[data-sid="resort-guest-quote"]{padding:36px 20px!important;}}</style>
</section>`
}
,
{
  id:'talent-hero',name:'Talent Hero — Find an Expert',icon:'🔍',
  category:['gig_marketplace'],
  tags:['hero','talent','search'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="search-ph"]',t:'text',l:'Search Placeholder'},
    {k:'[data-f="tag1"]',t:'text',l:'Popular Tag 1'},{k:'[data-f="tag2"]',t:'text',l:'Popular Tag 2'},{k:'[data-f="tag3"]',t:'text',l:'Popular Tag 3'},
  ],
  html:`<section data-sid="talent-hero" style="background:var(--bg,#fff);padding:64px 6vw;text-align:center;">
  <div style="max-width:700px;margin:0 auto;">
    <h1 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(28px,4.5vw,42px);font-weight:900;letter-spacing:-.6px;color:#0f172a;margin-bottom:14px;">Find the right expert, fast</h1>
    <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;color:#475569;margin-bottom:26px;">Vetted freelancers ready to start today.</p>
    <div style="display:flex;max-width:520px;margin:0 auto 16px;background:var(--bg2,#F8FAFC);border-radius:14px;padding:6px;border:1.5px solid var(--bdr,#e2e8f0);">
      <input data-f="search-ph" placeholder="Search skills, e.g. logo design..." style="flex:1;border:none;outline:none;padding:12px 16px;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;background:transparent;">
      <button style="padding:12px 22px;border-radius:10px;background:var(--S2,#7C3AED);color:#fff;border:none;font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14px;font-weight:800;cursor:pointer;">Search</button>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      <span data-f="tag1" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;padding:5px 12px;border-radius:50px;background:var(--bg2,#F8FAFC);">Web Design</span>
      <span data-f="tag2" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;padding:5px 12px;border-radius:50px;background:var(--bg2,#F8FAFC);">Copywriting</span>
      <span data-f="tag3" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;padding:5px 12px;border-radius:50px;background:var(--bg2,#F8FAFC);">Video Editing</span>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="talent-hero"]{padding:44px 20px!important;}}</style>
</section>`
},
{
  id:'talent-profiles-grid',name:'Freelancer Profiles — Grid',icon:'🧑‍💻',
  category:['gig_marketplace'],
  tags:['profiles','freelancers'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="p1-name"]',t:'text',l:'Freelancer 1 Name'},{k:'[data-f="p1-role"]',t:'text',l:'Freelancer 1 Role'},{k:'[data-f="p1-rate"]',t:'text',l:'Freelancer 1 Rate'},{k:'[data-f="p1-img"]',t:'image',l:'Freelancer 1 Photo'},
    {k:'[data-f="p2-name"]',t:'text',l:'Freelancer 2 Name'},{k:'[data-f="p2-role"]',t:'text',l:'Freelancer 2 Role'},{k:'[data-f="p2-rate"]',t:'text',l:'Freelancer 2 Rate'},{k:'[data-f="p2-img"]',t:'image',l:'Freelancer 2 Photo'},
    {k:'[data-f="p3-name"]',t:'text',l:'Freelancer 3 Name'},{k:'[data-f="p3-role"]',t:'text',l:'Freelancer 3 Role'},{k:'[data-f="p3-rate"]',t:'text',l:'Freelancer 3 Rate'},{k:'[data-f="p3-img"]',t:'image',l:'Freelancer 3 Photo'},
  ],
  html:`<section data-sid="talent-profiles-grid" style="background:var(--bg2,#F8FAFC);padding:56px 6vw;">
  <div style="max-width:1000px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;text-align:center;margin-bottom:26px;">Top-Rated Talent</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;">
      ${[1,2,3].map(n=>`
      <div style="background:#fff;border-radius:16px;padding:20px;text-align:center;">
        <img data-f="p${n}-img" src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin:0 auto 10px;">
        <div data-f="p${n}-name" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:14.5px;font-weight:800;margin-bottom:2px;">Freelancer ${n}</div>
        <div data-f="p${n}-role" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;margin-bottom:8px;">Specialty</div>
        <div data-f="p${n}-rate" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:13.5px;font-weight:800;color:var(--S2,#7C3AED);">From ₦15,000</div>
      </div>`).join('')}
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="talent-profiles-grid"]>div>div:last-child{grid-template-columns:1fr!important;gap:14px!important;}[data-sid="talent-profiles-grid"]{padding:40px 20px!important;}}</style>
</section>`
}
,
{
  id:'gig-client-quote',name:'Client Satisfaction Quote',icon:'✅',
  category:['gig_marketplace'],
  tags:['testimonial','satisfaction'],
  fields:[
    {k:'[data-f="stat"]',t:'text',l:'Satisfaction Stat'},
    {k:'[data-f="quote"]',t:'text',l:'Quote'},
    {k:'[data-f="name"]',t:'text',l:'Name'},
  ],
  html:`<section data-sid="gig-client-quote" style="background:var(--bg,#fff);padding:48px 6vw;text-align:center;">
  <div data-f="stat" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:36px;font-weight:900;color:var(--S2,#7C3AED);margin-bottom:8px;">98%</div>
  <p data-f="quote" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;color:#374151;max-width:560px;margin:0 auto 8px;">"Client satisfaction rate — because every freelancer here is vetted before they're listed."</p>
  <div data-f="name" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:12.5px;color:#6b7280;">Based on completed projects</div>
  <style>@media(max-width:768px){[data-sid="gig-client-quote"]{padding:36px 20px!important;}}</style>
</section>`
}
,
{
  id:'contact-form-split',name:'Contact — Form + Info Split',icon:'📝',
  category:['universal'],
  tags:['contact','form'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="wa-number"]',t:'text',l:'WhatsApp Number'},
    {k:'[data-f="email"]',t:'text',l:'Email Address'},
  ],
  html:`<section data-sid="contact-form-split" style="background:var(--bg2,#F8FAFC);padding:56px 6vw;">
  <div style="max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:40px;">
    <div>
      <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:10px;">Get In Touch</h2>
      <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;color:#6b7280;margin-bottom:20px;">We usually reply within a few hours.</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">💬</span><span data-f="wa-number" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:600;">+234 800 000 0000</span></div>
        <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">✉️</span><span data-f="email" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:600;">hello@business.com</span></div>
      </div>
    </div>
    <div style="background:#fff;border-radius:16px;padding:24px;">
      <input placeholder="Your name" style="width:100%;padding:12px 14px;border:1.5px solid var(--bdr,#e2e8f0);border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;margin-bottom:10px;">
      <input placeholder="Your email" style="width:100%;padding:12px 14px;border:1.5px solid var(--bdr,#e2e8f0);border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;margin-bottom:10px;">
      <textarea placeholder="Your message" rows="3" style="width:100%;padding:12px 14px;border:1.5px solid var(--bdr,#e2e8f0);border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;margin-bottom:12px;resize:none;"></textarea>
      <button style="width:100%;padding:13px;background:var(--S2,#7C3AED);color:#fff;border:none;border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14px;font-weight:700;cursor:pointer;">Send Message</button>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="contact-form-split"]>div{grid-template-columns:1fr!important;gap:24px!important;}[data-sid="contact-form-split"]{padding:40px 20px!important;}}</style>
</section>`
},
{
  id:'contact-info-cards',name:'Contact — Three Info Cards',icon:'📇',
  category:['universal'],
  tags:['contact','cards'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="wa-number"]',t:'text',l:'WhatsApp Number'},
    {k:'[data-f="email"]',t:'text',l:'Email Address'},
    {k:'[data-f="location"]',t:'text',l:'Location'},
  ],
  html:`<section data-sid="contact-info-cards" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:900px;margin:0 auto;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;text-align:center;margin-bottom:26px;">Reach Us Anytime</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
      <div style="background:var(--bg2,#F8FAFC);border-radius:14px;padding:22px;text-align:center;">
        <div style="font-size:26px;margin-bottom:8px;">💬</div>
        <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">WhatsApp</div>
        <div data-f="wa-number" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;font-weight:700;">+234 800 000 0000</div>
      </div>
      <div style="background:var(--bg2,#F8FAFC);border-radius:14px;padding:22px;text-align:center;">
        <div style="font-size:26px;margin-bottom:8px;">✉️</div>
        <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Email</div>
        <div data-f="email" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;font-weight:700;">hello@business.com</div>
      </div>
      <div style="background:var(--bg2,#F8FAFC);border-radius:14px;padding:22px;text-align:center;">
        <div style="font-size:26px;margin-bottom:8px;">📍</div>
        <div style="font-family:var(--BF,'Inter'),sans-serif;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Location</div>
        <div data-f="location" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;font-weight:700;">Lagos, Nigeria</div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="contact-info-cards"]>div>div:last-child{grid-template-columns:1fr!important;}[data-sid="contact-info-cards"]{padding:40px 20px!important;}}</style>
</section>`
},
{
  id:'contact-cta-banner',name:'Contact — Bold Banner',icon:'📣',
  category:['universal'],
  tags:['contact','banner'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="subtext"]',t:'text',l:'Subtext'},
    {k:'[data-f="cta-text"]',t:'text',l:'Button Text'},
    {k:'[data-f="cta-link"]',t:'link',l:'Button Link'},
  ],
  html:`<section data-sid="contact-cta-banner" style="background:var(--S2,#7C3AED);padding:52px 6vw;text-align:center;">
  <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:clamp(22px,3.5vw,32px);font-weight:900;letter-spacing:-.6px;color:#fff;margin-bottom:10px;">Let's talk</h2>
  <p data-f="subtext" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:15px;color:rgba(255,255,255,.85);margin-bottom:24px;">Reach out and we will get back to you fast.</p>
  <a data-f="cta-link" href="https://wa.me/" style="text-decoration:none;"><button data-f="cta-text" contenteditable="false" style="padding:14px 32px;background:#fff;color:var(--S2,#7C3AED);border:none;border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:800;cursor:pointer;">Message Us →</button></a>
  <style>@media(max-width:768px){[data-sid="contact-cta-banner"]{padding:40px 20px!important;}}</style>
</section>`
},
{
  id:'contact-address-focus',name:'Contact — Address Focus',icon:'📍',
  category:['universal'],
  tags:['contact','address'],
  fields:[
    {k:'[data-f="headline"]',t:'text',l:'Headline'},
    {k:'[data-f="address"]',t:'text',l:'Address'},
    {k:'[data-f="hours"]',t:'text',l:'Hours'},
    {k:'[data-f="wa-number"]',t:'text',l:'WhatsApp Number'},
    {k:'[data-f="cta-link"]',t:'link',l:'WhatsApp Link'},
  ],
  html:`<section data-sid="contact-address-focus" style="background:var(--bg,#fff);padding:56px 6vw;">
  <div style="max-width:700px;margin:0 auto;text-align:center;">
    <h2 data-f="headline" contenteditable="false" style="font-family:var(--HF,'Plus Jakarta Sans'),sans-serif;font-size:24px;font-weight:900;letter-spacing:-.5px;margin-bottom:20px;">Visit or Message Us</h2>
    <div style="background:var(--bg2,#F8FAFC);border-radius:16px;padding:28px;">
      <div style="font-size:22px;margin-bottom:10px;">📍</div>
      <div data-f="address" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:14.5px;font-weight:700;margin-bottom:6px;">123 Example Street, Lagos</div>
      <div data-f="hours" contenteditable="false" style="font-family:var(--BF,'Inter'),sans-serif;font-size:13px;color:#6b7280;margin-bottom:18px;">Open daily, 9am – 6pm</div>
      <a data-f="cta-link" href="https://wa.me/" style="text-decoration:none;"><button style="padding:12px 26px;background:var(--S2,#7C3AED);color:#fff;border:none;border-radius:10px;font-family:var(--BF,'Inter'),sans-serif;font-size:13.5px;font-weight:700;cursor:pointer;">Chat on WhatsApp: <span data-f="wa-number" contenteditable="false">+234 800 000 0000</span></button></a>
    </div>
  </div>
  <style>@media(max-width:768px){[data-sid="contact-address-focus"]{padding:40px 20px!important;}}</style>
</section>`
}
];

// Merge into main ECO_SECTIONS array
if(window.ECO_SECTIONS) {
  window.ECO_SECTIONS = window.ECO_SECTIONS.concat(EXTRA_SECTIONS);
} else {
  window.ECO_SECTIONS = EXTRA_SECTIONS;
}

})();
