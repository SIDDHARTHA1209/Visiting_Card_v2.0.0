const CONFIG={API_URL:"https://script.google.com/macros/s/AKfycbxypiPlx03NxLC1riLifBALvIWLkrSSnMlkKjUXa5CajVzxVBlpxX0J0d9xGdWBMBAFWw/exec"};
const $=id=>document.getElementById(id);
let card=null;
document.addEventListener("DOMContentLoaded",load);
async function load(){
  const guid=new URLSearchParams(location.search).get("guid");
  if(!guid)return showError("Card link is incomplete.");
  try{
    const data=await api("?action=card&guid="+encodeURIComponent(guid));
    if(!data.success||!data.record)throw new Error(data.error||"Card not found.");
    card=data.record;
    document.title="Connect with "+(card.name||"this card");
    render();
  }catch(e){showError(e.message||"Unable to load card.");}
}
async function api(query){
  const response=await fetch(CONFIG.API_URL+query,{cache:"no-store"});
  const data=await response.json();
  if(!response.ok||data.success===false)throw new Error(data.error||"Request failed.");
  return data;
}
function render(){
  const photo=driveImage(card.photoUrl);
  $("app").className="page";
  $("app").innerHTML=`<section class="panel"><div class="card-summary"><img class="avatar" src="${safe(photo)}" alt="${safe(card.name||"Photo")}" onerror="this.style.display='none'"><div><span class="eyebrow">DIGITAL VISITING CARD</span><h1>${safe(card.name||"Card")}</h1><p>${safe(card.title||card.instituteName||"")}</p></div></div><form id="responseForm"><div class="form-grid"><label>Name *<input id="viewerName" required maxlength="120" autocomplete="name"></label><label>Phone<input id="phone" type="tel" maxlength="30" autocomplete="tel"></label><label>WhatsApp<input id="whatsapp" type="tel" maxlength="30"></label><label>Email<input id="email" type="email" maxlength="180" autocomplete="email"></label><label>Company / Organization<input id="company" maxlength="180"></label><label>Message / Details<textarea id="message" rows="4" maxlength="1000"></textarea></label></div><div class="actions"><button class="button primary" id="submit" type="submit">Send Details</button><button class="button secondary" type="button" onclick="history.back()">Back</button></div></form></section>`;
  $("responseForm").addEventListener("submit",submit);
}
async function submit(event){
  event.preventDefault();
  const button=$("submit");
  const name=$("viewerName").value.trim();
  if(!name)return toast("Name is required.",true);
  button.disabled=true;button.textContent="Sending...";
  try{
    const body={action:"submitResponse",cardGuid:card.guid,viewerName:name,phone:$("phone").value.trim(),whatsapp:$("whatsapp").value.trim(),email:$("email").value.trim(),company:$("company").value.trim(),message:$("message").value.trim()};
    const response=await fetch(CONFIG.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body)});
    const data=await response.json();
    if(!data.success)throw new Error(data.error||"Unable to send details.");
    $("app").innerHTML=`<section class="panel success"><div class="check">✓</div><h1>Details sent</h1><p>Your information has been shared with ${safe(card.name||"the card owner")}.</p><div class="actions"><button class="button secondary" type="button" onclick="location.href='../card/?guid=${encodeURIComponent(card.guid)}'">Back to Card</button></div></section>`;
  }catch(e){toast(e.message||"Unable to send details.",true);button.disabled=false;button.textContent="Send Details";}
}
function driveImage(url){const value=String(url||"").trim();const match=value.match(/[-\w]{25,}/);return match&&value.includes("drive.google.com")?"https://drive.google.com/uc?export=view&id="+match[0]:value;}
function safe(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function toast(message,error=false){const el=$("toast");el.textContent=message;el.className="toast show"+(error?" error":"");setTimeout(()=>el.className="toast",2800);}
function showError(message){$("app").className="page";$("app").innerHTML=`<section class="panel success"><h1>Unable to load card</h1><p>${safe(message)}</p></section>`;}
