const CONFIG={API_URL:"https://script.google.com/macros/s/AKfycbw2zYfZoJF_g_iD1MkzA8vYU7IP8qltWn7I_ylhA80CyyhioTrop1HKUaWsbV1kHwnM2A/exec",MAX_IMAGE_DIMENSION:1400,TARGET_IMAGE_BYTES:180000,MAX_IMAGE_QUALITY:0.84};

const $=id=>document.getElementById(id);
const form=$("cardForm");
const toast=$("toast");
let toastTimer;

document.addEventListener("DOMContentLoaded",function(){
  loadDraft();
  addLinkRow();
  setupImage("photo","photoPreview","photoMeta");
  setupImage("logo","logoPreview","logoMeta");
  $("addLink").addEventListener("click",()=>addLinkRow());
  $("detectLocation").addEventListener("click",detectLocation);
  form.addEventListener("input",saveDraft);
  form.addEventListener("submit",submitForm);
});

function notify(message,isError=false){
  toast.textContent=message;
  toast.style.background=isError?"#991b1b":"#172033";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove("show"),3500);
}

function setupImage(inputId,previewId,metaId){
  $(inputId).addEventListener("change",async function(){
    const file=this.files[0];
    if(!file)return;
    try{
      const result=await processImage(file);
      this.dataset.payload=JSON.stringify(result);
      $(previewId).src=result.data;
      $(previewId).classList.remove("hidden");
      $(metaId).textContent=`${file.name} • ${formatBytes(result.bytes)} after compression`;
      saveDraft();
    }catch(err){notify(err.message,true);}
  });
}

async function processImage(file){
  if(!file.type.startsWith("image/"))throw new Error("Please select an image file.");
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,CONFIG.MAX_IMAGE_DIMENSION/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
  let quality=CONFIG.MAX_IMAGE_QUALITY;
  let data=canvas.toDataURL("image/jpeg",quality);
  while(data.length*0.75>CONFIG.TARGET_IMAGE_BYTES&&quality>0.5){
    quality-=0.06;
    data=canvas.toDataURL("image/jpeg",quality);
  }
  return {name:file.name,type:"image/jpeg",data:data,bytes:Math.ceil(data.length*.75)};
}

function formatBytes(bytes){
  if(bytes<1024)return bytes+" B";
  if(bytes<1048576)return (bytes/1024).toFixed(1)+" KB";
  return (bytes/1048576).toFixed(1)+" MB";
}

function addLinkRow(data={}){
  const row=document.createElement("div");
  row.className="link-row";
  row.innerHTML=`<input class="link-label" maxlength="80" placeholder="Label" value="${escapeAttr(data.label||"")}"><input class="link-url" type="url" placeholder="https://..." value="${escapeAttr(data.url||"")}"><button type="button" aria-label="Remove link">Remove</button>`;
  row.querySelector("button").addEventListener("click",()=>{row.remove();saveDraft();});
  $("linksList").appendChild(row);
}

function getLinks(){
  return [...document.querySelectorAll(".link-row")].map(row=>({label:row.querySelector(".link-label").value.trim(),url:row.querySelector(".link-url").value.trim()})).filter(x=>x.label||x.url);
}

function validate(){
  if(!$("name").value.trim())return "Full Name is required.";
  if(!$("phone").value.trim())return "Phone number is required.";
  if($("website").value&&!validUrl($("website").value))return "Website URL is invalid.";
  if($("locationLink").value&&!validUrl($("locationLink").value))return "Location URL is invalid.";
  for(const link of getLinks()){
    if(!link.label||!link.url||!validUrl(link.url))return "Each custom link needs a label and valid URL.";
  }
  const emails=$("emails").value.split(",").map(x=>x.trim()).filter(Boolean);
  for(const email of emails)if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return "One or more email addresses are invalid.";
  return "";
}

async function submitForm(event){
  event.preventDefault();
  const error=validate();
  if(error){notify(error,true);return;}
  if(!CONFIG.API_URL||CONFIG.API_URL.includes("YOUR_DEPLOYMENT_ID")){notify("Configure the Apps Script API URL in public/script.js first.",true);return;}
  const button=$("submitButton");
  button.disabled=true;
  button.textContent="Creating…";
  try{
    const body={
      action:"submit",
      name:$("name").value.trim(),
      title:$("title").value.trim(),
      instituteName:$("instituteName").value.trim(),
      tagline:$("tagline").value.trim(),
      address:$("address").value.trim(),
      website:$("website").value.trim(),
      phone:$("phone").value.trim(),
      whatsapp:$("whatsapp").value.trim(),
      emails:$("emails").value.trim(),
      locationLink:$("locationLink").value.trim(),
      customLinks:JSON.stringify(getLinks()),
      logoImage:readImagePayload("logo"),
      photoImage:readImagePayload("photo")
    };
    const response=await fetch(CONFIG.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body)});
    const data=await response.json();
    if(!data.success)throw new Error(data.error||"Unable to create the card.");
    localStorage.removeItem("vcardDraft");
    location.href="success/?guid="+encodeURIComponent(data.guid)+"&url="+encodeURIComponent(data.cardUrl);
  }catch(err){
    notify(err.message||"Network error. Please try again.",true);
    button.disabled=false;
    button.textContent="Create Digital Card";
  }
}

function readImagePayload(id){
  const raw=$(id).dataset.payload;
  return raw?JSON.parse(raw):null;
}

function detectLocation(){
  const status=$("locationStatus");
  if(!navigator.geolocation){status.textContent="Geolocation is not supported by this browser.";return;}
  status.textContent="Detecting location…";
  navigator.geolocation.getCurrentPosition(
    position=>{
      const {latitude,longitude}=position.coords;
      $("locationLink").value=`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      status.textContent=`Location detected: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      saveDraft();
    },
    ()=>{status.textContent="Could not detect location. Enter a Google Maps URL manually.";},
    {enableHighAccuracy:true,timeout:10000,maximumAge:60000}
  );
}

function saveDraft(){
  const draft={};
  ["name","title","instituteName","tagline","address","website","phone","whatsapp","emails","locationLink"].forEach(id=>draft[id]=$(id).value);
  draft.links=getLinks();
  try{localStorage.setItem("vcardDraft",JSON.stringify(draft));}catch(e){}
}

function loadDraft(){
  try{
    const draft=JSON.parse(localStorage.getItem("vcardDraft")||"null");
    if(!draft)return;
    ["name","title","instituteName","tagline","address","website","phone","whatsapp","emails","locationLink"].forEach(id=>{if(draft[id])$(id).value=draft[id];});
    (draft.links||[]).forEach(addLinkRow);
  }catch(e){}
}

function validUrl(value){
  try{
    const u=new URL(/^https?:\/\//i.test(value)?value:"https://"+value);
    return u.protocol==="http:"||u.protocol==="https:";
  }catch(e){return false;}
}

function escapeAttr(value){
  return String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
