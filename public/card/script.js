/* safety: an older common.js must not crash this page */
if(!DVC.storedCards){DVC.storedCards={has(){return false;},get(){return null;},set(){},remove(){},guids(){return[];},all(){return[];},owned(){return[];}};}
if(!DVC.savedCards){DVC.savedCards={get(){return null;},set(){},remove(){},guids(){return[];},all(){return[];},has(){return false;}};}
let currentCard=null;
let savedCards=[];
let flipped=false;
let renderedJson="";
let loadStarted=false;
let activeGuid="";
let switching=false;
let selectorSignature="";
let fitObserver=null;
let fitFrame=0;
const $=id=>document.getElementById(id);

document.addEventListener(
  "DOMContentLoaded",
  loadCard
);

if(document.readyState!=="loading"){
  loadCard();
}

/* Renders instantly from the localStorage copy (if this card was opened
   before) and refreshes it from the server in the background. */
function guidFromUrl(){
  return new URLSearchParams(location.search).get("guid");
}

async function loadCard(){
  if(loadStarted)return;
  loadStarted=true;

  /* opened inside the Create page's preview popup */
  if(new URLSearchParams(location.search).get("preview")){
    renderPreview();
    return;
  }

  const guid=guidFromUrl();

  if(!guid){
    /* opened without a card link (installed app, bookmark): go to the card last used on this device */
    let fallback="";

    try{
      const last=localStorage.getItem("dvc:lastSelectedCard");
      const own=DVC.storedCards.owned(DVC.getAppId());

      fallback=(last&&DVC.storedCards.has(last)&&last)||(own[0]&&own[0].guid)||"";
    }catch(e){}

    if(fallback){
      location.replace("?guid="+encodeURIComponent(fallback));
      return;
    }

    showError("Missing card GUID. Open a card from the home page or scan its QR code.");
    return;
  }

  await openCard(guid);
}

/* The owner's own cards, from the local copy, so the selector can show at the first paint */
function primeOwnedCards(){
  try{
    const appId=DVC.getAppId();
    const cached=DVC.cacheGet(DVC.cardsKey(appId));
    const list=cached&&cached.data&&cached.data.cards;

    if(Array.isArray(list)&&list.length){
      savedCards=list;
      return;
    }

    const local=DVC.storedCards.owned(appId).map(x=>
      Object.assign({ownerStatus:"Active"},x.record,{guid:x.guid})
    );

    if(local.length)savedCards=local;
  }catch(e){}
}

/* Opens one card: instantly from the local copy if there is one, then refreshes it from the server */
async function openCard(guid){
  activeGuid=guid;

  primeOwnedCards();

  /* Cards the owner has in their own list are already cached by the home page */
  const seeded=findInOwnedCache(guid);

  if(seeded&&!DVC.cacheGet("card:"+guid)){
    DVC.cacheSet("card:"+guid,{success:true,record:seeded});
  }

  /* storedCards/<guid>: the card is kept on this device, so it opens instantly */
  const stored=DVC.storedCards.get(guid);

  if(stored&&stored.record&&!DVC.cacheGet("card:"+guid)){
    DVC.cacheSet("card:"+guid,{success:true,record:stored.record});
  }

  try{
    await DVC.swr(
      "card:"+guid,
      "?action=card&guid="+encodeURIComponent(guid),
      data=>{
        /* the user already picked another card */
        if(guid!==activeGuid)return;

        if(!data||!data.success||!data.record){
          throw new Error(
            (data&&data.error)||"Card not found."
          );
        }

        const json=JSON.stringify(data.record);

        currentCard=data.record;

        /* storedCards holds only cards created on this device */
        if(DVC.storedCards.has?DVC.storedCards.has(guid):DVC.storedCards.get(guid)){
          DVC.storedCards.set(guid,data.record);
        }

        /* keep a saved copy fresh */
        if(DVC.savedCards.has(guid))DVC.savedCards.set(guid,data.record,{keepTime:true});

        /* do not rebuild the page (and un-flip the card) if nothing changed */
        if(json!==renderedJson){
          renderedJson=json;
          renderCard();
        }

        refreshSaveButton();

        DVC.track(guid,"view");

        $("app").classList.remove("switching");
        switching=false;
      },
      {retries:1}
    );

    if(guid===activeGuid)loadOwnedCards(guid);
  }catch(error){
    if(guid!==activeGuid)return;

    $("app").classList.remove("switching");

    if(/removed by its owner/i.test(error.message||"")){
      DVC.savedCards.remove(guid);
      DVC.cacheRemove("card:"+guid);
    }

    if(!currentCard||!switching){
      if(!currentCard){
        showError(
          error.message||
          "Unable to load card."
        );
      }
    }else{
      /* switching failed: stay on the page, go back to the card that is showing */
      switching=false;
      activeGuid=currentCard.guid;
      history.replaceState(null,"","?guid="+encodeURIComponent(currentCard.guid));
      fillCardSelector(currentCard.guid,true);
      showToast(error.message||"Unable to load that card.",true);
    }
  }
}

/* Switch cards from the dropdown without reloading the page: the header and the dropdown stay put */
function switchCard(guid,push){
  if(!guid||guid===activeGuid)return;

  if(push!==false){
    history.pushState(null,"","?guid="+encodeURIComponent(guid));
  }

  flipped=false;
  renderedJson="";
  switching=true;

  $("app").classList.add("switching");

  openCard(guid);
}

window.addEventListener("popstate",()=>{
  const guid=guidFromUrl();

  if(guid&&guid!==activeGuid)switchCard(guid,false);
});

function findInOwnedCache(guid){
  try{
    const cached=DVC.cacheGet(
      DVC.cardsKey(DVC.getAppId())
    );

    const list=
      cached&&cached.data&&cached.data.cards;

    if(!Array.isArray(list))return null;

    const card=list.find(c=>c.guid===guid);

    if(!card)return null;

    const record=Object.assign({},card);

    delete record.ownerStatus;
    delete record.isFavourite;
    delete record.responseCount;

    return record;
  }catch(error){
    return null;
  }
}

function fillCardSelector(currentGuid,force){
  const root=$("cardPicker");

  if(!root)return;

  /* do not rebuild (and close) the dropdown when nothing changed */
  const signature=JSON.stringify([currentGuid,savedCards.map(c=>[c.guid,c.cardName,c.name,c.instituteName,c.logoUrl,c.photoUrl,c.title])]);

  if(!force&&signature===selectorSignature&&root.firstChild)return;

  selectorSignature=signature;

  const picker=CardPicker.create(root,{
    createHref:"../create/",
    onSelect:guid=>switchCard(guid)
  });

  picker.setCards(savedCards,{fallback:currentCard});
  picker.setValue(currentGuid);

  $("cardSelector")
    .classList
    .remove("hidden");
}

/* The card list only feeds the selector, so it never blocks the card itself */
function loadOwnedCards(currentGuid){
  const appId=DVC.getAppId();

  if(!appId)return;

  const apply=data=>{
    savedCards=
      Array.isArray(data&&data.cards)?
      data.cards:
      [];

    fillCardSelector(currentGuid);
    refreshEditButton();
  };

  const run=()=>{
    DVC.swr(
      DVC.cardsKey(appId),
      "?action=ownedcards&appId="+
      encodeURIComponent(appId),
      apply,
      {retries:0}
    ).catch(()=>{});
  };

  /* Show the cached list straight away, refresh when the browser is idle */
  const cached=DVC.cacheGet(DVC.cardsKey(appId));

  if(cached)apply(cached.data);

  if("requestIdleCallback" in window){
    requestIdleCallback(run,{timeout:2500});
  }else{
    setTimeout(run,300);
  }
}

function renderCard(){
  const r=
    currentCard;
  const emails=
    String(r.emails||"")
      .split(",")
      .map(
        x=>x.trim()
      )
      .filter(Boolean);
  const links=
    Array.isArray(
      r.customLinks
    )?
    r.customLinks:
    parseLinks(
      r.customLinks
    );
  const logo=
    driveImageUrl(
      r.logoUrl
    );
  const photo=
    driveImageUrl(
      r.photoUrl
    );
  const website=
    r.website?
    normalizeWebsite(
      r.website
    ):
    "";
  const description=
    r.companyDescription||
    r.description||
    "Connect with this card owner.";
  document.title=
    (
      r.name||
      "Digital Visiting Card"
    )+
    " • Digital Card";
  $("app").className=
    "card-page";
  $("app").innerHTML=`
    <header class="page-header">
      <a
        class="home-link"
        href="../"
      >
        ⌂ Home
      </a>
      <div
        id="cardSelector"
        class="card-selector hidden"
      >
        <span class="selector-label">Select Card</span>
        <div id="cardPicker"></div>
      </div>
      <a
        class="create-card"
        href="../create/"
      >
        Create Card
      </a>
    </header>
    <section class="viewer-shell">
      <p class="flip-hint">
        Tap the card to view the back side
      </p>
      <div
        id="cardStage"
        class="card-stage"
        tabindex="0"
        role="button"
        aria-label="Flip digital visiting card"
      >
        <div
          id="cardInner"
          class="card-inner"
        >
          ${frontHtml(r,logo,photo)}
          ${backHtml(r,emails,website)}
        </div>
      </div>
      <div class="social-actions">
        ${
          r.whatsapp?
          actionLink(
            "whatsapp",
            "https://wa.me/"+
            waDigits(r.whatsapp),
            "WhatsApp"
          ):
          ""
        }
        ${
          r.phone?
          actionLink(
            "phone",
            telHref(r.phone),
            "Call"
          ):
          ""
        }
        ${
          emails.length?
          actionLink(
            "email",
            emails.length>1?
            "#":
            "mailto:"+
            emails[0],
            "Email"
          ):
          ""
        }
        ${
          website?
          actionLink(
            "website",
            website,
            "Website"
          ):
          ""
        }
        ${
          r.locationLink?
          actionLink(
            "map",
            mapsUrl(
              r.locationLink
            ),
            "Location"
          ):
          ""
        }
        ${
          links.length?
          actionLink(
            "more",
            "#",
            "More"
          ):
          ""
        }
      </div>
      <div class="main-actions">
        <button
          id="saveCard"
          class="main-action"
          type="button"
        >
          ${icon("bookmark")}
          <span>Save Card</span>
        </button>
        <button
          id="shareCard"
          class="main-action"
          type="button"
        >
          ${icon("share")}
          <span>Share Card</span>
        </button>
        <a
          id="editCard"
          class="main-action hidden"
          href="../create/?edit=${encodeURIComponent(r.guid)}"
        >
          ${icon("edit")}
          <span>Edit Card</span>
        </a>
        <button
          id="deleteCard"
          class="main-action danger hidden"
          type="button"
          aria-label="Delete card"
          title="Delete card"
        >
          ${icon("trash")}
        </button>
      </div>
      <div id="cardStats" class="card-stats hidden"></div>
      <button
        id="saveContact"
        class="contact-action"
        type="button"
      >
        ${icon("contact")}
        <span>Save Contact</span>
      </button>
    </section>
    ${
      emails.length>1?
      `
        <div
          id="emailPicker"
          class="modal hidden"
        >
          <div class="modal-box">
            <h3>
              Select email
            </h3>
            ${
              emails.map(
                email=>`
                  <a
                    href="mailto:${safeAttr(email)}"
                  >
                    ${escapeHtml(
                      email
                    )}
                  </a>
                `
              ).join("")
            }
            <button
              id="closeEmailPicker"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      `:
      ""
    }
    ${
      links.length?
      `
        <div
          id="linksPicker"
          class="modal hidden"
        >
          <div class="modal-box">
            <h3>
              Select link
            </h3>
            ${
              links.map(
                link=>`
                  <a
                    href="${safeAttr(
                      normalizeWebsite(
                        link.url||
                        "#"
                      )
                    )}"
                    target="_blank"
                    rel="noopener"
                  >
                    ${escapeHtml(
                      link.label||
                      link.url||
                      "Link"
                    )}
                  </a>
                `
              ).join("")
            }
            <button
              id="closeLinksPicker"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      `:
      ""
    }
  `;
  setupInteractions();
  renderResponseQr(
    r.guid
  );
  selectorSignature="";
  fillCardSelector(currentCard.guid,true);
  refreshEditButton();
  setupFit();
}
function setupInteractions(){
  const stage=
    $("cardStage");
  stage.addEventListener(
    "click",
    event=>{
      if(
        event.target.closest(
          "a,button,select,input"
        )
      ){
        return;
      }
      flipCard();
    }
  );
  stage.addEventListener(
    "keydown",
    event=>{
      if(
        event.key==="Enter"||
        event.key===" "
      ){
        event.preventDefault();
        flipCard();
      }
    }
  );
  document
    .querySelectorAll(
      '.social-action[aria-label="Email"]'
    )
    .forEach(
      button=>{
        button.addEventListener(
          "click",
          event=>{
            if(
              button.getAttribute(
                "href"
              )==="#"
            ){
              event.preventDefault();
              $("emailPicker")
                ?.classList
                .remove(
                  "hidden"
                );
            }
          }
        );
      }
    );
  document
    .querySelectorAll(
      '.social-action[aria-label="More"]'
    )
    .forEach(
      button=>{
        button.addEventListener(
          "click",
          event=>{
            event.preventDefault();
            $("linksPicker")
              ?.classList
              .remove(
                "hidden"
              );
          }
        );
      }
    );
  $("closeEmailPicker")
    ?.addEventListener(
      "click",
      ()=>
        $("emailPicker")
          ?.classList
          .add("hidden")
    );
  $("closeLinksPicker")
    ?.addEventListener(
      "click",
      ()=>
        $("linksPicker")
          ?.classList
          .add("hidden")
    );
  document
    .querySelectorAll(".modal")
    .forEach(
      modal=>{
        modal.addEventListener(
          "click",
          event=>{
            if(
              event.target===
              modal
            ){
              modal.classList.add(
                "hidden"
              );
            }
          }
        );
      }
    );
  // QR clicks must not navigate or trigger the card-flip handler.
  $("responseQr")?.addEventListener("click", event => event.stopPropagation());
  $("deleteCard")?.addEventListener("click",deleteThisCard);
  $("shareCard")
    ?.addEventListener(
      "click",
      shareCard
    );
  $("saveContact")
    ?.addEventListener(
      "click",
      ()=>
        downloadVCard(
          currentCard
        )
    );
  $("saveCard")
    ?.addEventListener(
      "click",
      saveCardLocally
    );

  refreshSaveButton();
}
function flipCard(){
  flipped=!flipped;
  $("cardInner")
    ?.classList
    .toggle(
      "flipped",
      flipped
    );
}
function renderResponseQr(guid) {
  if (typeof QRCode === "undefined") {
    /* library still loading from the CDN: draw as soon as it arrives */
    DVC.whenQr(() => renderResponseQr(guid));
    return;
  }
  const qr = $("responseQrCode");
  if (!qr || !guid) {
    return;
  }
  qr.innerHTML = "";
  /* Scanning this QR opens the card (the public link while testing locally) */
  new QRCode(qr, {
    text: DVC.cardUrl(guid),
    width: 180,
    height: 180,
    colorDark: "#0a2342",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}
function isMobileDevice(){
  let hinted=false;

  try{
    hinted=!!(navigator.userAgentData&&navigator.userAgentData.mobile);
  }catch(e){}

  return hinted||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function shareLink(){
  /* the public card link (not the localhost address while testing) */
  return DVC.cardUrl(currentCard.guid);
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    try{
      const box=document.createElement("textarea");

      box.value=text;
      box.style.cssText="position:fixed;opacity:0";
      document.body.appendChild(box);
      box.select();

      const ok=document.execCommand("copy");

      box.remove();

      return ok;
    }catch(error){
      return false;
    }
  }
}

let shareBusy=false;

/* Phones: the system share sheet. Computers: our own share panel (Copy link / WhatsApp / Email),
   because the Windows system share window can freeze the browser behind a blurred screen. */
async function shareCard(){
  if(!currentCard||shareBusy)return;

  const name=currentCard.name||"Digital Visiting Card";
  const link=shareLink();

  if(isMobileDevice()&&navigator.share){
    shareBusy=true;

    try{
      await navigator.share({
        title:name,
        text:"Digital visiting card of "+name,
        url:link
      });

      DVC.track(currentCard.guid,"share");
    }catch(error){
      if(error&&error.name!=="AbortError"){
        openShareSheet(name,link);
      }
    }finally{
      shareBusy=false;
    }

    return;
  }

  openShareSheet(name,link);
}

function openShareSheet(name,link){
  closeShareSheet();

  const text="Digital visiting card of "+name+": "+link;
  const overlay=document.createElement("div");

  overlay.id="shareSheet";
  overlay.className="share-sheet";
  overlay.innerHTML=`
    <div class="share-panel" role="dialog" aria-modal="true" aria-label="Share card">
      <div class="share-head">
        <strong>Share card</strong>
        <button type="button" class="share-close" aria-label="Close">×</button>
      </div>
      <input class="share-link" type="text" readonly value="${safeAttr(link)}">
      <div class="share-actions">
        <button type="button" data-share="copy">Copy link</button>
        <a data-share="wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">WhatsApp</a>
        <a data-share="mail" href="mailto:?subject=${encodeURIComponent(name+" - Digital Visiting Card")}&body=${encodeURIComponent(text)}">Email</a>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const input=overlay.querySelector(".share-link");

  input.addEventListener("focus",()=>input.select());

  overlay.addEventListener("click",async event=>{
    if(event.target===overlay||event.target.closest(".share-close")){
      closeShareSheet();
      return;
    }

    if(event.target.closest('[data-share="wa"],[data-share="mail"]')){
      DVC.track(currentCard&&currentCard.guid,"share");
    }

    if(event.target.closest('[data-share="copy"]')){
      const ok=await copyText(link);

      if(ok)DVC.track(currentCard&&currentCard.guid,"share");

      showToast(ok?"Card link copied.":"Could not copy. Select the link and copy it.",!ok);

      if(ok)closeShareSheet();
    }
  });

  document.addEventListener("keydown",shareSheetKey);
}

function shareSheetKey(event){
  if(event.key==="Escape")closeShareSheet();
}

function closeShareSheet(){
  const old=document.getElementById("shareSheet");

  if(old)old.remove();

  document.removeEventListener("keydown",shareSheetKey);
}
function isOwnCard(guid){
  if(!guid)return false;

  if(savedCards.some(card=>card.guid===guid))return true;

  try{
    const cached=DVC.cacheGet(DVC.cardsKey(DVC.getAppId()));
    const list=cached&&cached.data&&cached.data.cards;

    if(Array.isArray(list)&&list.some(card=>card.guid===guid))return true;

    return DVC.storedCards.has(guid);
  }catch(e){
    return false;
  }
}

function refreshSaveButton(){
  const button=$("saveCard");

  if(!button||!currentCard)return;

  /* a card you created is never saved: it is already yours */
  if(isOwnCard(currentCard.guid)){
    DVC.savedCards.remove(currentCard.guid);
    button.classList.add("hidden");
    return;
  }

  button.classList.remove("hidden");

  const saved=DVC.savedCards.has(currentCard.guid);
  const label=button.querySelector("span");

  if(label)label.textContent=saved?"Saved":"Save Card";

  button.classList.toggle("is-saved",saved);
}

/* Save Card: keeps this card in savedCards/<guid> on this device */
function saveCardLocally(){
  if(!currentCard)return;

  if(isOwnCard(currentCard.guid)){
    showToast("This is your own card, so it is not added to Saved Cards.");
    return;
  }

  if(DVC.savedCards.has(currentCard.guid)){
    DVC.savedCards.remove(currentCard.guid);
    DVC.track(currentCard.guid,"unsave");
    refreshSaveButton();
    showToast("Removed from Saved Cards.");
    return;
  }

  DVC.savedCards.set(currentCard.guid,currentCard);
  DVC.track(currentCard.guid,"save");
  refreshSaveButton();
  showToast("Saved. Find it in Saved Cards on the home page.");
}

function downloadVCard(
  card
){
  const name=
    String(
      card.name||
      "Contact"
    )
    .replace(
      /[^\w\s.-]/g,
      ""
    )
    .trim()||
    "Contact";
  const lines=[
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:"+
      escapeVCard(
        card.name||
        ""
      ),
    "TITLE:"+
      escapeVCard(
        card.title||
        ""
      )
  ];
  if(card.phone){
    lines.push(
      "TEL;TYPE=CELL:"+
      escapeVCard(
        card.phone
      )
    );
  }
  if(card.whatsapp){
    lines.push(
      "TEL;TYPE=WORK:"+
      escapeVCard(
        card.whatsapp
      )
    );
  }
  String(
    card.emails||
    ""
  )
  .split(",")
  .map(
    x=>x.trim()
  )
  .filter(Boolean)
  .forEach(
    email=>{
      lines.push(
        "EMAIL:"+
        escapeVCard(
          email
        )
      );
    }
  );
  if(card.website){
    lines.push(
      "URL:"+
      escapeVCard(
        card.website
      )
    );
  }
  if(card.address){
    lines.push(
      "ADR:;;"+
      escapeVCard(
        card.address
      )
    );
  }
  if(card.instituteName){
    lines.push(
      "ORG:"+
      escapeVCard(
        card.instituteName
      )
    );
  }
  lines.push(
    "END:VCARD"
  );
  const url=
    URL.createObjectURL(
      new Blob(
        [
          lines.join(
            "\r\n"
          )
        ],
        {
          type:
            "text/vcard;charset=utf-8"
        }
      )
    );
  const link=
    document.createElement(
      "a"
    );
  link.href=url;
  link.download=
    name+".vcf";
  document.body.appendChild(
    link
  );
  link.click();
  link.remove();
  setTimeout(
    ()=>
      URL.revokeObjectURL(
        url
      ),
    1000
  );
}
function escapeVCard(
  value
){
  return String(
    value||
    ""
  )
  .replace(
    /\\/g,
    "\\\\"
  )
  .replace(
    /\n/g,
    "\\n"
  )
  .replace(
    /;/g,
    "\\;"
  )
  .replace(
    /,/g,
    "\\,"
  );
}
function driveImageUrl(
  value
){
  const url=
    String(
      value||
      ""
    ).trim();
  if(!url){
    return "";
  }
  const match=
    url.match(
      /[?&]id=([^&]+)/i
    )||
    url.match(
      /\/d\/([^/]+)/i
    );
  if(
    match&&
    match[1]&&
    url.includes(
      "drive.google.com"
    )
  ){
    return(
      "https://drive.google.com/thumbnail?id="+
      encodeURIComponent(
        match[1]
      )+
      "&sz=w1200"
    );
  }
  return url;
}
/* Location button: https://www.google.com/maps?q=<coordinates or place> */
function mapsUrl(value){
  const raw=String(value||"").trim();

  if(!raw)return"";

  let query="";

  try{
    const url=new URL(raw);

    query=
      url.searchParams.get("q")||
      url.searchParams.get("query")||
      url.searchParams.get("destination")||
      "";

    if(!query){
      /* .../@12.97,77.59,17z or /place/12.97,77.59 */
      const at=/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname+url.hash);

      if(at)query=at[1]+","+at[2];
    }

    if(!query)return raw;
  }catch(error){
    query=raw;
  }

  return"https://www.google.com/maps?q="+encodeURIComponent(query).replace(/%2C/gi,",");
}

function normalizeWebsite(
  value
){
  let v=
    String(
      value||
      ""
    )
    .trim()
    .replace(
      /^(https?:\/\/)+/i,
      "https://"
    );
  return(
    v&&
    !/^https?:\/\//i.test(v)
  )?
    "https://"+
    v:
    v;
}
function telHref(
  value
){
  return(
    "tel:"+
    String(
      value||
      ""
    )
    .replace(
      /[^\d+]/g,
      ""
    )
  );
}
function waDigits(value){
  const raw=String(value||"").trim().replace(/\.0+$/,"");
  const d=raw.replace(/\D/g,"");

  /* older cards were saved without a country code */
  return(!raw.startsWith("+")&&d.length===10)?"91"+d:d;
}
function digits(
  value
){
  return String(
    value||
    ""
  ).replace(
    /\D/g,
    ""
  );
}
function parseLinks(
  value
){
  if(
    Array.isArray(value)
  ){
    return value;
  }
  if(!value){
    return[];
  }
  try{
    const parsed=
      JSON.parse(
        value
      );
    return Array.isArray(
      parsed
    )?
      parsed:
      [];
  }catch(error){
    return[];
  }
}
function initials(
  name
){
  const words=
    String(
      name||
      ""
    )
    .trim()
    .split(
      /\s+/
    )
    .filter(Boolean);
  if(!words.length){
    return"VC";
  }
  return words.length===1?
    words[0]
      .slice(0,2)
      .toUpperCase():
    (
      words[0][0]+
      words.at(-1)[0]
    ).toUpperCase();
}
function actionLink(
  type,
  url,
  label
){
  const external=/^https?:/i.test(url)&&type!=="phone";

  return`
    <a
      class="social-action ${safeAttr(type)}"
      href="${safeAttr(url)}"
      ${external?'target="_blank" rel="noopener"':""}
      aria-label="${safeAttr(label)}"
      title="${safeAttr(label)}"
    >
      ${colorIcon(type)}
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

/* coloured icons for the action tiles */
function colorIcon(type){
  const icons={
    whatsapp:`
      <svg viewBox="0 0 24 24">
        <path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
      </svg>`,
    phone:`
      <svg viewBox="0 0 48 48">
        <path fill="#1FA85B" d="M40 33.6v5.3a3.5 3.5 0 0 1-3.8 3.5A34.7 34.7 0 0 1 21 37 34.1 34.1 0 0 1 10.5 26.5 34.7 34.7 0 0 1 5.6 11.2 3.5 3.5 0 0 1 9.1 7.4h5.3a3.5 3.5 0 0 1 3.5 3c.2 1.6.6 3.1 1.1 4.6a3.5 3.5 0 0 1-.8 3.7l-2.2 2.2a28 28 0 0 0 10.5 10.5l2.2-2.2a3.5 3.5 0 0 1 3.7-.8c1.5.5 3 .9 4.6 1.1a3.5 3.5 0 0 1 3 3.7z"/>
      </svg>`,
    email:`
      <svg viewBox="0 0 48 48">
        <rect x="4" y="9" width="40" height="30" rx="5" fill="#EA4335"/>
        <path d="m6 13 18 14 18-14" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    website:`
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" fill="#1A73E8"/>
        <g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round">
          <ellipse cx="24" cy="24" rx="8.5" ry="20"/>
          <path d="M4.5 24h39M7.5 14h33M7.5 34h33"/>
        </g>
      </svg>`,
    map:`
      <svg viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 3C15.7 3 9 9.6 9 17.8 9 28.6 24 45 24 45s15-16.4 15-27.2C39 9.6 32.3 3 24 3z"/>
        <circle cx="24" cy="18" r="6" fill="#fff"/>
      </svg>`,
    more:`
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="15" r="8" fill="#1A73E8"/>
        <path fill="#1A73E8" d="M8 41c0-9 7.2-15 16-15s16 6 16 15z"/>
      </svg>`
  };

  return icons[type]||icon(type);
}

function icon(
  type
){
  const icons={
    phone:`
      <svg viewBox="0 0 24 24">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 5.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L9 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/>
      </svg>
    `,
    whatsapp:`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9"/>
        <path d="M8.5 8.5c.4-.7 1-.7 1.4-.2l1 1.4c.3.4.2.8-.1 1.1l-.5.5c.8 1.4 1.8 2.4 3.2 3.2l.5-.5c.3-.3.7-.4 1.1-.1l1.4 1c.5.4.5 1 .2 1.4-.4.6-1.1.9-1.8.8-3.9-.6-7.2-3.9-7.8-7.8-.1-.7.2-1.4.8-1.8z"/>
      </svg>
    `,
    email:`
      <svg viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <path d="m3 7 9 6 9-6"/>
      </svg>
    `,
    website:`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9"/>
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
      </svg>
    `,
    map:`
      <svg viewBox="0 0 24 24">
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/>
        <circle cx="12" cy="10" r="2.5"/>
      </svg>
    `,
    more:`
      <svg viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="1.5"/>
        <circle cx="12" cy="12" r="1.5"/>
        <circle cx="19" cy="12" r="1.5"/>
      </svg>
    `,
    bookmark:`
      <svg viewBox="0 0 24 24">
        <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-3-6 3z"/>
      </svg>
    `,
    share:`
      <svg viewBox="0 0 24 24">
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
      </svg>
    `,
    trash:`
      <svg viewBox="0 0 24 24">
        <path d="M3 6h18"/>
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
        <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/>
        <path d="M10 11v6M14 11v6"/>
      </svg>
    `,
    edit:`
      <svg viewBox="0 0 24 24">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>
      </svg>
    `,
    contact:`
      <svg viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3"/>
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 8h4M17 12h4M17 16h4"/>
      </svg>
    `
  };
  return(
    icons[type]||
    ""
  );
}
function escapeHtml(
  value
){
  return String(
    value??
    ""
  )
  .replace(
    /&/g,
    "&amp;"
  )
  .replace(
    /</g,
    "&lt;"
  )
  .replace(
    />/g,
    "&gt;"
  )
  .replace(
    /"/g,
    "&quot;"
  )
  .replace(
    /'/g,
    "&#039;"
  );
}
function safeAttr(
  value
){
  return escapeHtml(
    value
  );
}
function showToast(
  message,
  error=false
){
  const toast=
    $("toast");
  toast.textContent=
    message;
  toast.className=
    "toast show"+
    (
      error?
      " error":
      ""
    );
  clearTimeout(
    showToast.timer
  );
  showToast.timer=
    setTimeout(
      ()=>
        toast.className=
          "toast",
      2600
    );
}
function showError(
  message
){
  $("app").className=
    "error-page";
  $("app").innerHTML=`
    <div class="error-box">
      <a
        class="home-link"
        href="../"
      >
        ⌂ Home
      </a>
      <h1>
        Unable to load card
      </h1>
      <p>
        ${escapeHtml(
          message||
          "Something went wrong."
        )}
      </p>
    </div>
  `;
}


/* =========================================================
   CARD FACES
   ========================================================= */

function frontHtml(r,logo,photo){
  const logoInitials=escapeHtml(initials(r.instituteName||r.name));
  const photoInitials=escapeHtml(initials(r.name));

  const logoBlock=logo?
    `<img src="${safeAttr(logo)}" alt="Institute logo" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
     <div class="front-logo-fallback" style="display:none">${logoInitials}</div>`:
    `<div class="front-logo-fallback">${logoInitials}</div>`;

  const photoBlock=photo?
    `<img class="front-profile" src="${safeAttr(photo)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
     <div class="front-profile-fallback" style="display:none">${photoInitials}</div>`:
    `<div class="front-profile-fallback">${photoInitials}</div>`;

  const bottom=[
    r.website?escapeHtml(displayUrl(r.website)):"DIGITAL CARD",
    r.phone?escapeHtml(r.phone):""
  ].filter(Boolean);

  return`
    <article class="visiting-card card-front">
      <div class="front-navy"></div>
      <div class="front-gold"></div>
      <div class="front-logo">${logoBlock}</div>
      ${r.instituteName?`<div class="front-institute fit-box"><span>${escapeHtml(r.instituteName)}</span></div>`:""}
      <div class="front-rule"></div>
      <div class="front-person fit-box">
        <h1>${escapeHtml(r.name||"Your Name")}</h1>
        ${r.title?`<p>${escapeHtml(r.title)}</p>`:""}
      </div>
      ${photoBlock}
      <div class="front-bottom fit-box">
        ${bottom.map(t=>`<span>${t}</span>`).join('<i class="front-divider"></i>')}
      </div>
    </article>`;
}

/* show a website without https:// (the link itself still uses the full address) */
function displayUrl(value){
  return String(value||"").trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i,"").replace(/\/+$/,"");
}

function backHtml(r,emails,website){
  const info=[];

  if(r.instituteName){
    info.push(`<h3>${escapeHtml(r.instituteName)}</h3>`);
  }

  if(r.address){
    info.push(`<div class="c-line">${escapeHtml(r.address)}</div>`);
  }

  if(r.phone){
    info.push(`<div class="c-line">${escapeHtml(r.phone)}</div>`);
  }

  if(emails.length){
    info.push(`<div class="c-line">${escapeHtml(emails[0])}</div>`);
  }

  if(r.website){
    info.push(`<a class="c-line" href="${safeAttr(website)}" target="_blank" rel="noopener">${escapeHtml(displayUrl(r.website))}</a>`);
  }

  return`
    <article class="visiting-card card-back">
      <div class="back-gold"></div>
      <div class="back-name fit-box">
        <h2>${escapeHtml(r.name||"Your Name")}</h2>
        ${r.title?`<p>${escapeHtml(r.title)}</p>`:""}
      </div>
      <div id="responseQr" class="back-qr" role="img" aria-label="QR code that opens this digital visiting card">
        <span id="responseQrCode" class="qr"></span>
      </div>
      <div class="back-contact"></div>
      <div class="back-info fit-box">${info.join("")}</div>
      <div class="back-gold-bottom">
        <span>DIGITAL</span><span>|</span><span>CONNECT</span><span>|</span><span>SHARE</span>
      </div>
    </article>`;
}

/* =========================================================
   AUTO-FIT TEXT
   Every .fit-box has a fixed size on the card. Its font size starts at the
   design size and is reduced until all of its text fits inside the box.
   ========================================================= */


function boxOverflows(box){
  return box.scrollHeight>box.clientHeight+1||
    box.scrollWidth>box.clientWidth+1;
}

/* The gold name shape on the back grows (or stays at its minimum) with the name,
   so a long name is never broken in the middle of a word. */
function sizeBackName(stage){
  const card=stage.querySelector(".card-back");
  const gold=card&&card.querySelector(".back-gold");
  const box=card&&card.querySelector(".back-name");
  const h2=box&&box.querySelector("h2");

  if(!card||!gold||!box||!h2)return;

  const cw=card.offsetWidth;

  if(!cw)return;

  gold.style.width="";
  box.style.width="";
  box.style.fontSize="";
  h2.style.whiteSpace="nowrap";
  h2.style.maxWidth="none";
  box.style.width="max-content";

  const textW=box.offsetWidth;

  box.style.width="";
  h2.style.maxWidth="";

  const minG=cw*.41;
  const maxG=cw*.68;
  const G=Math.min(maxG,Math.max(minG,(cw*.045+textW+cw*.035)/.86));
  const boxW=Math.max(0,G*.86-cw*.045-cw*.02);

  gold.style.width=G+"px";
  box.style.width=boxW+"px";

  /* one line when it fits, otherwise wrap between words and let fit-box shrink it */
  h2.style.whiteSpace=textW<=boxW+1?"nowrap":"";
}

/* Preview popup (from the Create page): both sides of the card are shown at once,
   from the details typed so far. Nothing is loaded from or sent to the server. */
function renderPreview(){
  let r={};

  try{
    r=JSON.parse(sessionStorage.getItem("dvc:cardPreview")||"{}")||{};
  }catch(e){}

  currentCard=r;

  const emails=String(r.emails||"").split(",").map(x=>x.trim()).filter(Boolean);
  const logo=driveImageUrl(r.logoUrl);
  const photo=driveImageUrl(r.photoUrl);
  const website=r.website?normalizeWebsite(r.website):"";

  document.body.classList.add("preview-mode");

  $("app").className="card-page preview-page";
  $("app").innerHTML=`
    <section class="preview-side">
      <h2>Front side</h2>
      <div id="cardStage" class="card-stage preview-face">${frontHtml(r,logo,photo)}</div>
    </section>
    <section class="preview-side">
      <h2>Back side</h2>
      <div class="card-stage preview-face">${backHtml(r,emails,website)}</div>
    </section>
    <p class="preview-note">The QR code on the back is a sample. The real one is made when you create the card.</p>
  `;

  renderResponseQr(r.guid||"preview");
  setupFit();
}

function fitAll(){
  const stages=[...document.querySelectorAll(".card-stage")];

  if(!stages.length)return;

  stages.forEach(fitStage);
}

function fitStage(stage){
  const width=stage.clientWidth;

  if(!width)return;

  stage.style.setProperty("--cw",width);

  sizeBackName(stage);

  stage.querySelectorAll(".fit-box").forEach(box=>{
    box.style.fontSize="";

    if(!boxOverflows(box))return;

    const max=parseFloat(getComputedStyle(box).fontSize)||16;

    let low=Math.max(5,max*0.3);
    let high=max;

    for(let i=0;i<10;i++){
      const mid=(low+high)/2;

      box.style.fontSize=mid+"px";

      if(boxOverflows(box))high=mid;
      else low=mid;
    }

    box.style.fontSize=low+"px";
  });
}

function scheduleFit(){
  cancelAnimationFrame(fitFrame);
  fitFrame=requestAnimationFrame(fitAll);
}

function setupFit(){
  const stage=$("cardStage");

  if(!stage)return;

  if(fitObserver)fitObserver.disconnect();

  fitAll();
  scheduleFit();

  /* web fonts and images can change text widths after the first paint */
  if(document.fonts&&document.fonts.ready){
    document.fonts.ready.then(scheduleFit);
    document.fonts.addEventListener&&document.fonts.addEventListener("loadingdone",scheduleFit);
  }

  /* late layout changes (fonts, images, orientation): re-fit a few times */
  [250,800,2000].forEach(ms=>setTimeout(scheduleFit,ms));
  window.addEventListener("orientationchange",()=>setTimeout(scheduleFit,200));

  window.addEventListener("load",scheduleFit,{once:true});

  if("ResizeObserver" in window){
    fitObserver=new ResizeObserver(scheduleFit);
    fitObserver.observe(stage);
  }else{
    window.addEventListener("resize",scheduleFit);
  }
}

/* The Edit button only shows on a device that owns the card.
   (The server checks ownership again when the change is saved.) */
function refreshEditButton(){
  const button=$("editCard");

  if(!button||!currentCard)return;

  let owned=savedCards.some(card=>card.guid===currentCard.guid);

  if(!owned){
    const cached=DVC.cacheGet(DVC.cardsKey(DVC.getAppId()));
    const list=cached&&cached.data&&cached.data.cards;

    owned=Array.isArray(list)&&list.some(card=>card.guid===currentCard.guid);
  }

  button.classList.toggle("hidden",!owned);

  const del=$("deleteCard");

  if(del)del.classList.toggle("hidden",!owned);

  refreshSaveButton();
  refreshStats(owned);
}

async function deleteThisCard(){
  if(!currentCard)return;

  const label=[currentCard.name,currentCard.instituteName].filter(Boolean).join(" – ")||"this card";

  try{
    const done=await DVC.deleteOwnCard(currentCard.guid,label);

    if(done)location.href="../";
  }catch(error){
    showToast(error.message||"Could not delete the card.",true);
  }
}

/* views / shares / saves, shown only on my own cards */
async function refreshStats(owned){
  const box=$("cardStats");

  if(!box||!currentCard)return;

  if(!owned){
    box.classList.add("hidden");
    return;
  }

  const guid=currentCard.guid;

  try{
    const data=await DVC.get("?action=stats&appId="+encodeURIComponent(DVC.getAppId()),{retries:0});
    const s=data&&data.stats&&data.stats[guid];

    if(!s||!currentCard||currentCard.guid!==guid)return;

    box.innerHTML=
      '<strong>Viewed by '+s.views+' '+(s.views===1?"person":"people")+'</strong>'+
      '<span>Shared '+s.shares+' '+(s.shares===1?"time":"times")+' · Saved by '+s.saves+'</span>';
    box.classList.remove("hidden");
  }catch(e){}
}
