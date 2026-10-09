const CONFIG={
  API_URL:"https://script.google.com/macros/s/AKfycbxypiPlx03NxLC1riLifBALvIWLkrSSnMlkKjUXa5CajVzxVBlpxX0J0d9xGdWBMBAFWw/exec",
  FRONTEND_BASE_URL:"https://siddhartha1209.github.io/Visiting_Card_v2.0.0/"
};

const APP_KEY="digitalVisitingCardAppId";

let appId="";
let cards=[];
let selectedCard=null;

const $=id=>document.getElementById(id);

document.addEventListener("DOMContentLoaded",init);

async function init(){
  appId=localStorage.getItem(APP_KEY)||generateAppId();
  localStorage.setItem(APP_KEY,appId);

  bind();
  await loadCards();
}

function generateAppId(){
  return crypto?.randomUUID
    ?crypto.randomUUID()
    :"APP-"+Date.now()+"-"+Math.random().toString(36).slice(2,12);
}

function bind(){
  $("cardSelect").addEventListener("change",()=>{
    const guid=$("cardSelect").value;

    selectedCard=
      cards.find(card=>card.guid===guid)||null;

    renderSelected();
  });

  $("viewResponsesButton").addEventListener("click",()=>{
    if(!selectedCard)return;

    location.href=
      "responses/?guid="+
      encodeURIComponent(selectedCard.guid);
  });
}

async function loadCards(){
  try{
    const response=await fetch(
      CONFIG.API_URL+
      "?action=ownedcards&appId="+
      encodeURIComponent(appId),
      {cache:"no-store"}
    );

    const data=await response.json();

    if(!data.success){
      throw new Error(
        data.error||"Unable to load cards."
      );
    }

    cards=Array.isArray(data.cards)
      ?data.cards
      :[];

    renderCardSelector();

    if(cards.length){
      selectedCard=cards[0];
      renderSelected();
    }else{
      renderEmpty();
    }

  }catch(error){
    showToast(
      error.message||"Unable to load cards.",
      true
    );

    renderEmpty();
  }
}

function renderCardSelector(){
  const select=$("cardSelect");

  select.innerHTML=
    '<option value="">-- Choose a Card --</option>'+
    cards.map(card=>
      '<option value="'+
      safeAttr(card.guid)+
      '">'+
      escapeHtml(card.name||"Untitled Card")+
      (card.title
        ?" — "+escapeHtml(card.title)
        :"")+
      "</option>"
    ).join("");

  if(selectedCard){
    select.value=selectedCard.guid;
  }
}

function renderSelected(){
  if(!selectedCard)return;

  $("emptyState").classList.add("hidden");
  $("selectedPreview").classList.remove("hidden");

  $("welcomeName").textContent=
    selectedCard.name||"Welcome";

  $("welcomeInstitute").textContent=
    selectedCard.instituteName||
    selectedCard.title||
    "Digital Visiting Card";

  setImage(
    $("welcomeImage"),
    selectedCard.photoUrl||selectedCard.logoUrl,
    $("welcomeInitials"),
    initials(selectedCard.name)
  );

  $("cardSelect").value=
    selectedCard.guid;

  renderHomeQr(selectedCard.guid);
}

function renderEmpty(){
  $("selectedPreview").classList.add("hidden");
  $("homeQr").innerHTML="";

  $("emptyState").classList.remove("hidden");

  $("welcomeName").textContent="Welcome";

  $("welcomeInstitute").textContent=
    "Create your first digital visiting card.";

  $("welcomeImage").style.display="none";

  $("welcomeInitials").textContent="VC";
  $("welcomeInitials").style.display="grid";
}

function renderHomeQr(guid){
  const el=$("homeQr");

  if(!el||!guid)return;

  el.innerHTML="";

  const url=
    CONFIG.FRONTEND_BASE_URL+
    "card/?guid="+
    encodeURIComponent(guid);

  if(typeof QRCode!=="undefined"){
    try{
      new QRCode(el,{
        text:url,
        width:190,
        height:190,
        colorDark:"#111318",
        colorLight:"#ffffff",
        correctLevel:QRCode.CorrectLevel.H
      });

      return;
    }catch(error){}
  }

  const image=document.createElement("img");

  image.src=
    "https://api.qrserver.com/v1/create-qr-code/?size=190x190&data="+
    encodeURIComponent(url);

  image.width=190;
  image.height=190;
  image.alt="Digital visiting card QR code";

  el.appendChild(image);
}

function setImage(image,url,fallback,text){
  const src=driveImage(url);

  if(!src){
    image.style.display="none";
    fallback.textContent=text;
    fallback.style.display="grid";
    return;
  }

  image.src=src;
  image.style.display="block";
  fallback.style.display="none";

  image.onerror=()=>{
    image.style.display="none";
    fallback.textContent=text;
    fallback.style.display="grid";
  };
}

function driveImage(url){
  const value=String(url||"").trim();

  if(!value)return"";

  const match=value.match(/[-\w]{25,}/);

  return value.includes("drive.google.com")&&match
    ?"https://drive.google.com/uc?export=view&id="+match[0]
    :value;
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
    :(words[0][0]+words.at(-1)[0]).toUpperCase();
}

function escapeHtml(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function safeAttr(value){
  return escapeHtml(value);
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
