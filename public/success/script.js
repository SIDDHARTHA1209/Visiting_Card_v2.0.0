const params=new URLSearchParams(location.search);
const cardUrl=params.get("cardUrl")||params.get("url")||"";
const urlEl=document.getElementById("cardUrl");
const openBtn=document.getElementById("open");
const copyBtn=document.getElementById("copy");

urlEl.textContent=cardUrl&&cardUrl!=="undefined"?cardUrl:"Card URL is unavailable.";

if(cardUrl&&cardUrl!=="undefined"&&window.QRCode){
    new QRCode(document.getElementById("qr"),{
        text:cardUrl,
        width:190,
        height:190,
        correctLevel:QRCode.CorrectLevel.M
    });
}

openBtn.addEventListener("click",()=>{
    if(cardUrl&&cardUrl!=="undefined") location.href=cardUrl;
});

copyBtn.addEventListener("click",async()=>{
    if(!cardUrl||cardUrl==="undefined") return;

    try{
        await navigator.clipboard.writeText(cardUrl);
        copyBtn.textContent="Copied!";
        setTimeout(()=>copyBtn.textContent="Copy link",1800);
    }catch(e){
        window.prompt("Copy this card URL:",cardUrl);
    }
});
