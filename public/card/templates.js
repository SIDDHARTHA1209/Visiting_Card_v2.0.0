/* =========================================================
   CARD TEMPLATES
   Each template draws the front and the back of a card.
   Sizes are written for a 680 x 396 card; every number is scaled to the real
   card width (--u = 1/680 of the card width), so the cards look the same on
   every screen. Text boxes use .fit-box, so long text shrinks instead of
   overflowing (script.js does the shrinking).

   To add a template later: add an entry to TEMPLATES below, then give it a
   front() and a back() function.
   ========================================================= */

(function(){
  "use strict";

  const DEFAULT_ID="classic";

  const TEMPLATES=[
    {id:"classic" ,name:"Classic Gold",accent:"#f6b02a"},
    {id:"academic",name:"Academic"    ,accent:"#b4472d"},
    {id:"orange"  ,name:"Orange Edge" ,accent:"#f26a21"},
    {id:"fold"    ,name:"Fold"        ,accent:"#ec5b3a"},
    {id:"midnight",name:"Midnight"    ,accent:"#ff8a1f"}
  ];

  /* accent colours offered next to the colour picker */
  const ACCENT_CHOICES=["#f6b02a","#e8504b","#1fa88e","#3b82f6","#7a4fb0","#f26a21"];

  const NO_UNIT=/^(font-weight|line-height|opacity|flex|flex-grow|flex-shrink|z-index|order)$/;

  function esc(v){
    return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function byId(id){
    return TEMPLATES.find(t=>t.id===id)||TEMPLATES[0];
  }

  function normalizeAccent(v){
    return /^#[0-9a-f]{6}$/i.test(String(v||"").trim())?String(v).trim().toLowerCase():"";
  }

  function accentOf(r){
    return normalizeAccent(r&&r.accent)||byId(r&&r.template).accent;
  }

  function mix(hex,t,to){
    const n=parseInt(hex.slice(1),16);
    const ch=[(n>>16)&255,(n>>8)&255,n&255].map(c=>Math.round(c+(to-c)*t));
    return "#"+ch.map(c=>c.toString(16).padStart(2,"0")).join("");
  }

  const lighter=hex=>mix(hex,.38,255);
  const darker=hex=>mix(hex,.28,0);

  /* "left:34;top:12;font-size:16" -> real CSS, numbers scaled to the card */
  function S(text){
    return String(text).split(";").map(p=>p.trim()).filter(Boolean).map(p=>{
      const i=p.indexOf(":");
      const prop=p.slice(0,i).trim();
      const val=p.slice(i+1).trim();
      if(NO_UNIT.test(prop))return prop+":"+val;
      const v=val.split(/\s+/).map(tok=>
        /^-?\d+(\.\d+)?$/.test(tok)&&tok!=="0"?"calc(var(--u)*"+tok+")":tok
      ).join(" ");
      return prop+":"+v;
    }).join(";");
  }

  /* absolutely placed block */
  const A=(style,inner,cls)=>`<div${cls?` class="${cls}"`:""} style="position:absolute;${S(style)}">${inner||""}</div>`;

  /* absolutely placed text block that shrinks to fit */
  /* the size goes in --fs (see templates.css): script.js resets the plain font-size while it fits text */
const T=(style,inner)=>`<div class="fit-box" style="position:absolute;${S(style.replace(/(^|;)font-size:/,"$1--fs:"))}">${inner}</div>`;

  const svgIcon={
    phone:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.6 3.6a1 1 0 01-.25 1z"/></svg>',
    mail:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm9 7.2L4.5 7v.2L12 12.4 19.5 7.2V7z"/></svg>',
    web:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    pin:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>'
  };

  /* ---------- shared pieces ---------- */

  function initialsOf(text){
    return (typeof window.initials==="function"?window.initials(text):String(text||"").trim().slice(0,2).toUpperCase());
  }

  /* photo (or initials when there is none); `style` places and sizes the frame */
  function photoBox(c,style,extra){
    const r=c.r;
    const ini=esc(initialsOf(r.name));
    const inner=c.photo?
      `<img src="${esc(c.photo)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="tpl-ini" style="display:none">${ini}</div>`:
      `<div class="tpl-ini">${ini}</div>`;
    return A("color:#3d4656;font-size:34;"+style+";overflow:hidden;"+(extra||""),inner);
  }

  /* institute logo (or initials when there is none) */
  function logoBox(c,style,extra){
    const r=c.r;
    const ini=esc(initialsOf(r.instituteName||r.name));
    const inner=c.logo?
      `<img src="${esc(c.logo)}" alt="Institute logo" style="position:absolute;inset:8%;width:84%;height:84%;object-fit:contain" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="tpl-ini" style="display:none">${ini}</div>`:
      `<div class="tpl-ini">${ini}</div>`;
    return A(style+";overflow:hidden;"+(extra||""),inner);
  }

  /* QR: scanning it opens the card */
  function qrBox(style){
    return A(style,'<span id="responseQrCode" class="qr"></span>',"tpl-qr");
  }

  function contacts(c){
    const r=c.r;
    const list=[];
    if(r.phone)list.push({k:"phone",t:esc(r.phone)});
    if(c.emails[0])list.push({k:"mail",t:esc(c.emails[0])});
    if(r.website)list.push({k:"web",t:esc(window.displayUrl?window.displayUrl(r.website):r.website)});
    return list;
  }

  /* lets long emails / links break after @ . / - instead of in the middle of a word */
  const brk=t=>String(t).replace(/([@./-])(?=[^<>]*$)/g,"$1<wbr>");

  const display=(c)=>esc(window.displayUrl?window.displayUrl(c.r.website||""):c.r.website||"");

  function root(c,cls,vars,inner,face){
    const ac=accentOf(c.r);
    return `<article class="visiting-card ${face} tpl ${cls}" style="--ac:${ac};--ac2:${lighter(ac)};--ac3:${darker(ac)};${vars||""}">${inner}</article>`;
  }

  /* =======================================================
     2 · ACADEMIC
     ======================================================= */

  function academicFront(c){
    const r=c.r;
    const ct=contacts(c).map(x=>`<div>${x.t}</div>`).join("");
    return root(c,"tpl-academic","",
      A("left:0;top:0;bottom:0;width:8;background:var(--ac)")+
      photoBox(c,"left:40;top:32;width:92;height:92;border-radius:50%;border:3 solid var(--ac);background:#e4e0d6")+
      (ct?T("right:36;top:34;width:330;height:76;text-align:right;font-family:Inter,system-ui,sans-serif;font-size:14;line-height:1.55;font-weight:500;color:#3a4252;white-space:nowrap",ct):"")+
      logoBox(c,"left:303;top:112;width:74;height:74;border-radius:50%;background:#1d2433;color:#fff;font-size:30;font-weight:700")+
      T("left:30;right:30;top:198;height:62;text-align:center;font-size:46;font-weight:700;letter-spacing:-0.01em;line-height:1.1;display:flex;align-items:center;justify-content:center",`<span>${esc(r.name||"Your Name")}</span>`)+
      (r.title?T("left:60;right:60;top:262;height:26;text-align:center;font-size:17;font-style:italic;color:#5a6173;line-height:1.3",esc(r.title)):"")+
      A("left:270;top:300;width:140;height:2;background:var(--ac)")+
      (r.instituteName?T("left:50;right:50;top:310;height:30;text-align:center;font-size:19;font-weight:700;letter-spacing:0.04em;line-height:1.3",esc(r.instituteName)):"")+
      (r.address?T("left:60;right:60;top:342;height:34;text-align:center;font-family:Inter,system-ui,sans-serif;font-size:13;color:#5a6173;line-height:1.35",esc(r.address)):""),
      "card-front");
  }

  function academicBack(c){
    const r=c.r;
    return root(c,"tpl-academic","",
      A("right:0;top:0;bottom:0;width:8;background:var(--ac)")+
      logoBox(c,"left:121;top:60;width:96;height:96;border-radius:50%;background:#1d2433;color:#fff;font-size:38;font-weight:700")+
      (r.instituteName?T("left:24;width:290;top:176;height:100;text-align:center;font-size:21;font-weight:700;line-height:1.25",esc(r.instituteName)):"")+
      (r.address?T("left:44;width:250;top:284;height:60;text-align:center;font-family:Inter,system-ui,sans-serif;font-size:12;color:#5a6173;line-height:1.4",esc(r.address)):"")+
      A("left:339;top:48;bottom:48;width:2;background:var(--ac)")+
      qrBox("left:411;top:82;width:190;height:190;border-radius:16;background:#fff;border:4 solid var(--ac);padding:12;box-shadow:0 10 24 rgba(29,36,51,0.14)")+
      T("left:340;width:332;top:296;height:22;text-align:center;font-family:Inter,system-ui,sans-serif;font-size:12;font-weight:800;letter-spacing:0.18em;color:#1d2433","SCAN TO VIEW CARD"),
      "card-back");
  }

  /* =======================================================
     3 · ORANGE EDGE
     ======================================================= */

  function orangeFront(c){
    const r=c.r;
    const rows=[];
    if(r.phone)rows.push(["phone",esc(r.phone)]);
    if(c.emails[0])rows.push(["mail",brk(esc(c.emails[0]))]);
    if(r.website)rows.push(["web",brk(display(c))]);
    if(r.address)rows.push(["pin",esc(r.address)]);
    const list=rows.map((x,i)=>
      T(`left:318;right:36;top:${174+i*49};height:${x[0]==="pin"?64:42};font-size:15;font-weight:600;display:flex;align-items:center;gap:14;line-height:1.15`,
        `<span class="tpl-badge" style="width:calc(var(--u)*34);height:calc(var(--u)*34);background:var(--ac)"><span style="width:calc(var(--u)*17);height:calc(var(--u)*17);display:block">${svgIcon[x[0]]}</span></span><span class="tpl-wrap">${x[1]}</span>`)
    ).join("");
    return root(c,"tpl-orange","",
      A("left:0;top:0;width:250;height:396;background:#2b2f38;clip-path:polygon(0 0,100% 0,62% 100%,0 100%)")+
      A("left:0;top:0;width:290;height:396;background:var(--ac);clip-path:polygon(78% 0,100% 0,66% 100%,44% 100%)")+
      A("right:0;top:0;width:120;height:14;background:var(--ac)")+
      photoBox(c,"left:36;top:40;width:128;height:128;border-radius:50%;border:5 solid var(--ac);background:#e6e2dc")+
      logoBox(c,"left:36;bottom:36;width:70;height:70;border-radius:16;background:#fff;color:#2b2f38;font-size:28;font-weight:900")+
      T("left:318;right:36;top:40;height:46;font-size:38;font-weight:900;line-height:1.1;letter-spacing:-0.01em;display:flex;align-items:center",`<span>${esc(r.name||"Your Name")}</span>`)+
      (r.title?T("left:318;right:36;top:90;height:24;font-size:16;font-weight:700;color:var(--ac);line-height:1.3",esc(r.title)):"")+
      (r.instituteName?T("left:318;right:36;top:116;height:22;font-size:14;font-weight:500;color:#555b68;line-height:1.3",esc(r.instituteName)):"")+
      list,
      "card-front");
  }

  function orangeBack(c){
    const r=c.r;
    return root(c,"tpl-orange","",
      A("right:0;top:0;width:300;height:396;background:var(--ac);clip-path:polygon(40% 0,100% 0,100% 100%,0 100%)")+
      A("right:0;top:0;width:220;height:396;background:#23262d;clip-path:polygon(50% 0,100% 0,100% 100%,0 100%)")+
      A("left:0;top:0;width:120;height:14;background:var(--ac)")+
      logoBox(c,"left:44;top:56;width:84;height:84;border-radius:20;background:#fff;color:#2b2f38;font-size:34;font-weight:900")+
      (r.instituteName?T("left:44;top:158;width:330;height:78;color:#fff;font-size:30;font-weight:900;line-height:1.12",esc(r.instituteName)):"")+
      (r.tagline?T("left:44;top:244;width:330;height:64;color:#c9ccd3;font-size:14;font-weight:500;line-height:1.5",esc(r.tagline)):"")+
      (r.address?T("left:44;bottom:30;width:330;height:52;color:#fff;font-size:14;font-weight:600;line-height:1.45",`<div style="color:var(--ac);font-weight:800;letter-spacing:0.12em;font-size:0.86em">ADDRESS</div>${esc(r.address)}`):"")+
      qrBox("right:36;top:112;width:150;height:150;border-radius:18;background:#fff;padding:14;box-shadow:0 12 26 rgba(0,0,0,0.3)")+
      T("right:28;top:276;width:166;height:18;text-align:center;color:#fff;font-size:12;font-weight:800;letter-spacing:0.16em","SCAN TO VIEW CARD"),
      "card-back");
  }

  /* =======================================================
     4 · FOLD
     ======================================================= */

  function foldFront(c){
    const r=c.r;
    const bits=[];
    if(r.phone)bits.push(`<span style="flex:none;white-space:nowrap">${esc(r.phone)}</span>`);
    if(c.emails[0])bits.push(`<span class="tpl-wrap">${brk(esc(c.emails[0]))}</span>`);
    if(r.website)bits.push(`<span class="tpl-wrap" style="opacity:.85">${brk(display(c))}</span>`);
    const row=bits.join('<span class="tpl-sep"></span>');
    return root(c,"tpl-fold","",
      A("right:0;top:0;width:260;height:190;background:var(--ac);clip-path:polygon(30% 0,100% 0,100% 100%)")+
      A("right:0;top:0;width:200;height:150;background:var(--ac3);clip-path:polygon(40% 0,100% 0,100% 100%)")+
      A("left:0;bottom:0;width:680;height:120;background:#12313a;clip-path:polygon(0 0,78% 0,100% 40%,100% 100%,0 100%)")+
      A("left:0;bottom:0;width:160;height:120;background:var(--ac);clip-path:polygon(0 0,100% 100%,0 100%)")+
      photoBox(c,"left:40;top:36;width:116;height:116;border-radius:22;border:4 solid #12313a;background:#dbe6e6")+
      T("left:40;top:172;width:470;height:52;font-size:44;font-weight:900;line-height:1.1;letter-spacing:-0.015em;display:flex;align-items:center",`<span>${esc(r.name||"Your Name")}</span>`)+
      (r.title?T("left:40;top:228;width:470;height:26;font-size:18;font-weight:700;color:var(--ac);line-height:1.3",esc(r.title)):"")+
      (r.instituteName?T("left:40;top:256;width:470;height:22;font-size:14;font-weight:500;color:#4a6168;line-height:1.3",esc(r.instituteName)):"")+
      logoBox(c,"left:20;bottom:16;width:48;height:48;border-radius:12;background:#fff;color:#12313a;font-size:20;font-weight:900")+
      (row?T("left:156;right:40;bottom:18;height:50;display:flex;align-items:center;gap:14;color:#fff;font-size:14;font-weight:600;line-height:1.15",row):""),
      "card-front");
  }

  function foldBack(c){
    const r=c.r;
    return root(c,"tpl-fold","",
      A("left:0;top:0;width:240;height:170;background:var(--ac);clip-path:polygon(0 0,100% 0,0 100%)")+
      A("left:0;top:0;width:170;height:120;background:var(--ac3);clip-path:polygon(0 0,100% 0,0 100%)")+
      A("right:0;bottom:0;width:170;height:125;background:var(--ac);clip-path:polygon(100% 0,100% 100%,0 100%)")+
      qrBox("left:245;top:40;width:190;height:190;border-radius:20;background:#fff;padding:16")+
      T("left:0;right:0;top:244;height:18;text-align:center;color:#fff;font-size:12;font-weight:800;letter-spacing:0.2em","SCAN TO VIEW CARD")+
      (r.instituteName?T("left:90;right:90;top:276;height:36;text-align:center;color:#fff;font-size:26;font-weight:900;line-height:1.2",esc(r.instituteName)):"")+
      (r.tagline?T("left:130;right:130;top:314;height:20;text-align:center;color:#b9cfd3;font-size:14;font-weight:500;line-height:1.3",esc(r.tagline)):"")+
      (r.address?T("left:130;right:130;top:338;height:34;text-align:center;color:#b9cfd3;font-size:13;font-weight:500;line-height:1.3",esc(r.address)):""),
      "card-back");
  }

  /* =======================================================
     5 · MIDNIGHT
     ======================================================= */

  function midnightFront(c){
    const r=c.r;
    const items=contacts(c).slice(0,3).map(x=>
      `<span class="tpl-dia"${x.k==="phone"?' style="flex:none"':""}><span class="tpl-diamond" style="width:calc(var(--u)*28);height:calc(var(--u)*28);background:var(--ac)"><span style="width:calc(var(--u)*14);height:calc(var(--u)*14);display:block;transform:rotate(-45deg)">${svgIcon[x.k]}</span></span><span class="tpl-wrap" style="margin-left:calc(var(--u)*4)">${x.k==="phone"?x.t:brk(x.t)}</span></span>`
    ).join("");
    return root(c,"tpl-midnight","",
      A("inset:0;background:#0e1a33")+
      A("inset:0;background:#14244a;clip-path:polygon(0 0,55% 0,30% 100%,0 100%)")+
      A("inset:0;background:#1b2f5e;clip-path:polygon(0 0,34% 0,8% 100%,0 100%)")+
      A("inset:0;background:#101e3d;clip-path:polygon(55% 0,100% 0,100% 100%,30% 100%)")+
      A("right:0;top:0;width:6;height:396;background:var(--ac)")+
      photoBox(c,"left:40;top:38;width:108;height:108;border-radius:24;border:4 solid var(--ac);background:#dfe6ee")+
      logoBox(c,"right:36;top:34;width:62;height:62;border-radius:14;background:#fff;color:#0e1a33;font-size:24;font-weight:900")+
      T("left:40;right:40;top:166;height:50;color:#fff;font-size:42;font-weight:900;line-height:1.1;letter-spacing:-0.01em;display:flex;align-items:center",`<span>${esc(r.name||"Your Name")}</span>`)+
      (r.title?T("left:40;right:40;top:220;height:24;font-size:17;font-weight:700;color:var(--ac);line-height:1.3",esc(r.title)):"")+
      (r.instituteName?T("left:40;right:40;top:246;height:22;font-size:14;color:#aab6d3;font-weight:500;line-height:1.3",esc(r.instituteName)):"")+
      A("left:0;bottom:0;width:680;height:112;background:#fff;clip-path:polygon(0 28%,100% 0,100% 100%,0 100%)")+
      (items?T("left:40;right:40;bottom:16;height:44;display:flex;gap:16;align-items:center;color:#0e1a33;font-size:13;font-weight:700;line-height:1.15",items):""),
      "card-front");
  }

  function midnightBack(c){
    const r=c.r;
    return root(c,"tpl-midnight","",
      A("inset:0;background:#0e1a33")+
      A("inset:0;background:#14244a;clip-path:polygon(0 0,45% 0,70% 100%,0 100%)")+
      A("inset:0;background:#1b2f5e;clip-path:polygon(0 0,22% 0,40% 100%,0 100%)")+
      A("left:0;top:0;width:6;height:396;background:var(--ac)")+
      logoBox(c,"left:44;top:44;width:76;height:76;border-radius:18;background:#fff;color:#0e1a33;font-size:30;font-weight:900")+
      (r.instituteName?T("left:44;top:140;width:340;height:68;color:#fff;font-size:26;font-weight:900;line-height:1.15",esc(r.instituteName)):"")+
      (r.tagline?T("left:44;top:214;width:340;height:40;font-size:13;font-weight:800;letter-spacing:0.14em;color:var(--ac);line-height:1.35",esc(r.tagline)):"")+
      (r.address?T("left:44;top:262;width:330;height:70;font-size:13;line-height:1.6;color:#aab6d3",esc(r.address)):"")+
      A("right:0;top:0;width:290;height:396;background:#fff;clip-path:polygon(22% 0,100% 0,100% 100%,0 100%)")+
      qrBox("right:48;top:96;width:170;height:170;border-radius:16;background:#fff;border:4 solid var(--ac);padding:12")+
      T("right:40;top:282;width:186;height:18;text-align:center;color:#0e1a33;font-size:12;font-weight:800;letter-spacing:0.16em","SCAN TO VIEW CARD"),
      "card-back");
  }

  const faces={
    academic:{front:academicFront,back:academicBack},
    orange:{front:orangeFront,back:orangeBack},
    fold:{front:foldFront,back:foldBack},
    midnight:{front:midnightFront,back:midnightBack}
  };

  /* c = {r: card record, logo, photo, emails: [..]}; returns "" for the classic template */
  function render(side,c){
    const f=faces[(c.r&&c.r.template)||""];
    return f?f[side](c):"";
  }

  /* ---------- small previews for the template picker (Create page) ---------- */

  const SAMPLE={
    name:"Ananya Rao",title:"Assistant Professor",instituteName:"Sunrise Institute of Technology",
    phone:"+91 98765 43210",emails:"ananya@sunrise.edu",website:"www.sunrise.edu",address:"Tumakuru, Karnataka",tagline:"Learn. Lead. Inspire."
  };

  function classicThumb(r){
    const c={r:r};
    return root(c,"tpl-classic-thumb","",
      A("left:0;right:0;top:0;height:10;background:linear-gradient(90deg,#0a2342 40%,var(--ac))")+
      A("left:294;top:34;width:92;height:92;border-radius:18;background:#fff;box-shadow:0 0 0 2 var(--ac2),0 10 22 rgba(10,35,66,.18);display:grid;place-items:center;font-size:42;font-weight:900;color:#0a2342","SI")+
      A("left:0;right:0;top:144;text-align:center;font-size:19;font-weight:800;letter-spacing:.06em;color:#0a1f3d","SUNRISE INSTITUTE")+
      A("left:310;top:176;width:60;height:4;border-radius:2;background:var(--ac)")+
      A("left:0;right:0;top:190;text-align:center;font-size:50;font-weight:800;color:#0a1f3d",esc(r.name))+
      A("left:0;right:0;top:252;text-align:center;font-size:17;font-weight:700;color:#1f4b8f",esc(r.title))+
      A("left:0;bottom:0;width:262;height:118;background:linear-gradient(135deg,#0a2342,#15457c);clip-path:polygon(0 0,92% 0,100% 100%,0 100%)")+
      A("left:34;bottom:14;width:112;height:112;border-radius:50%;border:7 solid var(--ac);background:#dfe6ee")+
      A("right:0;bottom:0;width:470;height:112;background:linear-gradient(100deg,var(--ac),var(--ac2));clip-path:polygon(14% 0,100% 0,100% 100%,0 100%)"),
      "card-front");
  }

  /* the front of a template with sample details (accent "" = the template's own colour) */
  function thumb(id,accent){
    const r=Object.assign({},SAMPLE,{template:id,accent:accent||""});
    if(!faces[id])return classicThumb(r);
    return faces[id].front({r:r,logo:"",photo:"",emails:[r.emails]});
  }

  /* the back of a template with sample details; "" for classic (it has its own stand-in) */
  function thumbBack(id,accent){
    if(!faces[id])return "";
    const r=Object.assign({},SAMPLE,{template:id,accent:accent||""});
    return faces[id].back({r:r,logo:"",photo:"",emails:[r.emails]});
  }

  window.DVCT={
    thumb,
    thumbBack,
    DEFAULT_ID,
    list:TEMPLATES,
    accents:ACCENT_CHOICES,
    byId,
    accentOf,
    normalizeAccent,
    lighter,
    darker,
    front:c=>render("front",c),
    back:c=>render("back",c),
    isClassic:r=>!faces[(r&&r.template)||""]
  };
})();
