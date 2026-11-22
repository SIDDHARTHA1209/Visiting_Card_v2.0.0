/* safety: an older common.js must not crash this page */
if(!DVC.storedCards){DVC.storedCards={get(){return null;},set(){},remove(){},guids(){return[];},all(){return[];},owned(){return[];}};}
if(!DVC.savedCards){DVC.savedCards={get(){return null;},set(){},remove(){},guids(){return[];},all(){return[];},has(){return false;}};}
/* Home page */

const LAST_CARD_KEY="lastSelectedCard";

let appId="";
let cards=[];
let selectedCard=null;
let loadedOnce=false;
let started=false;
let picker=null;

const $=id=>document.getElementById(id);

document.addEventListener("DOMContentLoaded",init);

/* `defer` scripts run after parsing, so DOMContentLoaded may already be done */
if(document.readyState!=="loading"){
  init();
}

function init(){
  if(started)return;
  started=true;

  adoptKeyFromUrl();

  appId=DVC.getAppId();

  picker=CardPicker.create($("cardPicker"),{
    createHref:"create/",
    onSelect:onPick
  });

  bind();
  loadCards();
}

function onPick(guid){
  selectedCard=cards.find(card=>card.guid===guid)||null;

  if(selectedCard){
    DVC.lsSet("dvc:"+LAST_CARD_KEY,selectedCard.guid);
  }

  renderSelected();
}

function bind(){
  $("swapQrButton").addEventListener("click",swapQr);

  $("copyLinkButton").addEventListener("click",copyCardLink);

  $("savedCardsButton").addEventListener("click",()=>{
    location.href="saved/";
  });

  updateSavedBadge();
}

/* Instant render from the localStorage copy, then refresh in the background */
async function loadCards(){
  const cached=DVC.cacheGet(DVC.cardsKey(appId));

  if(!cached){
    /* show the cards stored on this device (storedCards/<guid>) straight away */
    const local=DVC.storedCards.owned(appId).map(x=>
      Object.assign({ownerStatus:"Active",isFavourite:false,responseCount:0},x.record,{guid:x.guid})
    );

    if(local.length){
      applyCards({success:true,cards:local,local:true});
    }else{
      showLoading("Loading your cards…");
    }
  }

  try{
    await DVC.swr(
      DVC.cardsKey(appId),
      "?action=ownedcards&appId="+encodeURIComponent(appId),
      applyCards,
      {retries:1}
    );
  }catch(error){
    hideLoading();

    showToast(error.message||"Unable to load cards.",true);

    if(!cards.length)renderEmpty(true);
  }
}

function applyCards(data){
  const list=Array.isArray(data&&data.cards)?data.cards:[];

  /* keep every card on this device in storedCards/<guid> */
  list.forEach(card=>{
    if(card&&card.guid)DVC.storedCards.set(card.guid,card,{owned:true,appId:appId});
  });

  /* remove owned copies that no longer exist on the server */
  if(data&&data.success&&data.fromServer!==false){
    const live=new Set(list.map(card=>card.guid));

    DVC.storedCards.owned(appId).forEach(x=>{
      if(!live.has(x.guid)&&data.cards&&!data.local)DVC.storedCards.remove(x.guid);
    });
  }

  /* Only active cards are offered on the home page */
  cards=list.filter(card=>(card.ownerStatus||"Active")!=="Archived");

  hideLoading();

  const previous=
    (selectedCard&&selectedCard.guid)||
    DVC.lsGet("dvc:"+LAST_CARD_KEY)||
    "";

  const keepSelection=cards.find(card=>card.guid===previous);

  const next=keepSelection||cards[0]||null;

  /* A background refresh must not reset the QR the user is looking at */
  const sameCard=
    selectedCard&&next&&selectedCard.guid===next.guid;

  selectedCard=next;

  renderCardSelector();

  if(!cards.length){
    renderEmpty(false);
    return;
  }

  if(sameCard&&loadedOnce){
    refreshSelectedMeta();
  }else{
    renderSelected();
  }

  loadedOnce=true;
}

function showLoading(text){
  $("loadingText").textContent=text;
  $("loadingState").classList.remove("hidden");
  $("emptyState").classList.add("hidden");
}

function hideLoading(){
  $("loadingState").classList.add("hidden");
}

function renderCardSelector(){
  picker.setCards(cards);

  picker.setValue(selectedCard?selectedCard.guid:"");
}

function updateSavedBadge(){
  const count=DVC.savedCards.guids().length;
  const badge=$("savedBadge");

  badge.textContent=count;
  badge.classList.toggle("hidden",!count);
}

function refreshSelectedMeta(){
  updateSavedBadge();
}

function renderSelected(){
  if(!selectedCard)return;

  $("emptyState").classList.add("hidden");
  $("selectedPreview").classList.remove("hidden");

  $("welcomeName").textContent=
    selectedCard.name||"Welcome";

  

  setImage(
    $("welcomeImage"),
    selectedCard.photoUrl||selectedCard.logoUrl,
    $("welcomeInitials"),
    initials(selectedCard.name)
  );

  picker.setValue(selectedCard.guid);

  renderHomeQr(selectedCard.guid);
  renderWhatsappQr(selectedCard);
  setFlipped(false);

  $("openCardButton").href=DVC.localCardUrl(selectedCard.guid);

  refreshSelectedMeta();
}

function renderEmpty(failed){
  $("selectedPreview").classList.add("hidden");
  $("homeQr").innerHTML="";
  $("homeQrWa").innerHTML="";

  $("emptyState").classList.remove("hidden");

  $("welcomeName").textContent="Welcome";

  

  $("welcomeImage").style.display="none";

  $("welcomeInitials").textContent="VC";
  $("welcomeInitials").style.display="grid";

  const heading=document.querySelector("#emptyState h2");
  const text=document.querySelector("#emptyState p");

  if(failed){
    heading.textContent="Unable to load cards";
    text.textContent="Check your connection and reload the page.";
  }else{
    heading.textContent="No cards yet";
    text.textContent="Create your first digital visiting card to get started.";
  }
}

/* ---------- QR codes ---------- */

function renderHomeQr(guid){
  const el=$("homeQr");

  if(!el||!guid)return;

  drawQr(
    el,
    DVC.cardUrl(guid),
    "#111318",
    "#ffffff",
    "111318",
    "ffffff",
    "Digital visiting card QR code"
  );
}

function drawQr(el,text,dark,light,darkHex,lightHex,alt){
  el.innerHTML="";

  if(typeof QRCode==="undefined"){
    /* Library still loading from the CDN: show the hosted image now and
       swap to the local canvas as soon as the library arrives. */
    appendQrImage(el,text,darkHex,lightHex,alt);

    DVC.whenQr(()=>{
      /* the card may have changed while we were waiting */
      if(el.dataset.qrText!==text)return;

      el.innerHTML="";
      drawQr(el,text,dark,light,darkHex,lightHex,alt);
    });

    el.dataset.qrText=text;
    return;
  }

  el.dataset.qrText=text;

  try{
    new QRCode(el,{
      text:text,
      width:190,
      height:190,
      colorDark:dark,
      colorLight:light,
      correctLevel:QRCode.CorrectLevel.M
    });
  }catch(error){
    el.innerHTML="";
    appendQrImage(el,text,darkHex,lightHex,alt);
  }
}

function appendQrImage(el,text,darkHex,lightHex,alt){
  const image=document.createElement("img");

  image.src=
    "https://api.qrserver.com/v1/create-qr-code/?size=190x190&color="+
    darkHex+"&bgcolor="+lightHex+"&data="+
    encodeURIComponent(text);

  image.width=190;
  image.height=190;
  image.alt=alt;

  el.appendChild(image);
}

/* WhatsApp number of the card (digits with country code) */
function whatsappNumber(card){
  const raw=String(
    card.whatsapp||card.phone||""
  ).trim().replace(/\.0+$/,"");

  let number=raw.replace(/\D/g,"");

  if(!number)return"";

  /* older cards were saved without a country code */
  if(!raw.startsWith("+")&&number.length===10){
    number="91"+number;
  }

  return number;
}

function whatsappLink(card){
  const number=whatsappNumber(card);

  if(!number)return"";

  return"https://wa.me/"+number+
    "?text="+encodeURIComponent(DVC.cardUrl(card.guid));
}

function renderWhatsappQr(card){
  const el=$("homeQrWa");
  const link=whatsappLink(card);
  const button=$("swapQrButton");

  el.innerHTML="";

  if(!link){
    button.disabled=true;
    button.title="Add a WhatsApp or phone number to this card to enable the WhatsApp QR.";
    return;
  }

  button.disabled=false;
  button.title="";

  drawQr(
    el,
    link,
    "#064e3b",
    "#dcf8c6",
    "064e3b",
    "dcf8c6",
    "WhatsApp QR code"
  );
}

function setFlipped(flag){
  $("qrFlip").classList.toggle("flipped",flag);

  $("qrTitle").textContent=
    flag?"WhatsApp QR":"Card QR";

  $("qrHint").textContent=
    flag
      ?"Scan to message on WhatsApp with the card link"
      :"Scan to open this digital card";
}

function swapQr(){
  if(!selectedCard||$("swapQrButton").disabled)return;

  setFlipped(
    !$("qrFlip").classList.contains("flipped")
  );
}

async function copyCardLink(){
  if(!selectedCard)return;

  const flipped=
    $("qrFlip").classList.contains("flipped");

  const text=flipped
    ?whatsappLink(selectedCard)
    :DVC.cardUrl(selectedCard.guid);

  try{
    await navigator.clipboard.writeText(text);
    showToast("Link copied.");
  }catch(error){
    window.prompt("Copy this link:",text);
  }
}

/* ---------- helpers ---------- */

function setImage(image,url,fallback,text){
  const src=DVC.driveImage(url);

  if(!src){
    image.style.display="none";
    fallback.textContent=text;
    fallback.style.display="grid";
    return;
  }

  image.onerror=()=>{
    image.style.display="none";
    fallback.textContent=text;
    fallback.style.display="grid";
  };

  image.src=src;
  image.style.display="block";
  fallback.style.display="none";
}

function initials(value){
  const words=
    String(value||"")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if(!words.length)return"VC";

  return words.length===1
    ?words[0].slice(0,2).toUpperCase()
    :(words[0][0]+words[words.length-1][0]).toUpperCase();
}

function showToast(message,error=false){
  const el=$("toast");

  el.textContent=message;

  el.className=
    "toast show"+
    (error?" error":"");

  clearTimeout(showToast.timer);

  showToast.timer=
    setTimeout(
      ()=>el.className="toast",
      2800
    );
}


/* ---------- device sync (Card Key) ---------- */

/* ?key=... in the address bar links this browser to that Card Key */
function adoptKeyFromUrl(){
  try{
    const params=new URLSearchParams(location.search);
    const key=params.get("key");

    if(!key)return;

    const clean=new URL(location.href);
    clean.searchParams.delete("key");
    history.replaceState(null,"",clean.pathname+clean.search+clean.hash);

    if(!DVC.validKey(key))return;

    if(key===DVC.getAppId())return;

    if(confirm("Link this device to the Card Key from the other device?\nIts cards will appear here.")){
      DVC.setAppId(key);
    }
  }catch(error){}
}

