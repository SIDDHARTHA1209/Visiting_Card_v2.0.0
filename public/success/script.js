const params=new URLSearchParams(location.search);
const cardUrl=params.get("url")||"";
const urlEl=document.getElementById("cardUrl");
urlEl.textContent=cardUrl||"Card URL is unavailable.";
if(cardUrl&&window.QRCode)new QRCode(document.getElementById("qr"),{text:cardUrl,width:190,height:190,correctLevel:QRCode.CorrectLevel.M});
document.getElementById("open").addEventListener("click",()=>{if(cardUrl)location.href=cardUrl;});
document.getElementById("copy").addEventListener("click",async()=>{
  if(!cardUrl)return;
  try{
    await navigator.clipboard.writeText(cardUrl);
    document.getElementById("copy").textContent="Copied!";
    setTimeout(()=>document.getElementById("copy").textContent="Copy link",1800);
  }catch(e){
    window.prompt("Copy this card URL:",cardUrl);
  }
});
