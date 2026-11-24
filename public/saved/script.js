/* Saved Cards: lists savedCards/<guid> from this device, by person and institute */
const $=id=>document.getElementById(id);
let query="";
let view="list";

try{view=localStorage.getItem("dvc:savedView2")==="grid"?"grid":"list";}catch(e){}

const ICON={
	phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
	wa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 20.5l1.7-5.5A8.4 8.4 0 1 1 21 11.5z"/><path d="M9 8.5c.5 3 2.5 5 5.5 5.5l1.2-1.4-2-1-.8.7a4 4 0 0 1-2-2l.7-.8-1-2z"/></svg>',
	mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
	trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>'
};

function digits(v){return String(v||"").replace(/[^\d+]/g,"");}

function setView(next,remember){
	view=next;

	/* only a tap on the toggle is remembered, so list stays the default until the user chooses */
	if(remember){try{localStorage.setItem("dvc:savedView2",view);}catch(e){}}

	$("cards").className="cards "+view;

	$("gridView").classList.toggle("active",view==="grid");
	$("listView").classList.toggle("active",view==="list");
	$("gridView").setAttribute("aria-pressed",view==="grid");
	$("listView").setAttribute("aria-pressed",view==="list");
}

function esc(v){return DVC.escapeHtml?DVC.escapeHtml(v):String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function toast(msg){
	const t=$("toast");
	t.textContent=msg;
	t.className="toast show";
	clearTimeout(toast.t);
	toast.t=setTimeout(()=>t.className="toast",2200);
}

function initials(name){
	return String(name||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase()||"?";
}

function render(){
	const store=DVC.savedCards;
	const q=query.trim().toLowerCase();

	/* sorted by the person's name, then institute */
	const mine=new Set(DVC.storedCards.owned(DVC.getAppId()).map(x=>x.guid));

	const items=(store?store.all():[])
		.filter(x=>!mine.has(x.guid))
		.map(x=>Object.assign({},x.record,{guid:x.guid}))
		.filter(c=>!q||[c.name,c.instituteName,c.title].join(" ").toLowerCase().includes(q))
		.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))||String(a.instituteName||"").localeCompare(String(b.instituteName||"")));

	$("empty").classList.toggle("hidden",items.length>0);

	if(!items.length&&q)$("empty").textContent="No saved card matches your search.";

	$("cards").innerHTML=items.map(c=>{
		const photo=c.photoUrl||c.logoUrl||"";
		const img=photo&&DVC.driveImage?DVC.driveImage(photo):"";
		const phone=digits(c.phone);
		const wa=digits(c.whatsapp||c.phone).replace(/^\+/,"");
		const mail=String(c.emails||"").split(/[,;\s]+/).filter(Boolean)[0]||"";

		return `<article class="card">
			<div class="top">
				<div class="avatar">${img?`<img src="${esc(img)}" alt="" onerror="this.remove()">`:esc(initials(c.name))}</div>
				<div class="info">
					<div class="name">${esc(c.name||"Unnamed")}</div>
					${c.instituteName?`<div class="inst">${esc(c.instituteName)}</div>`:""}
					${c.title?`<div class="role">${esc(c.title)}</div>`:""}
				</div>
			</div>
			${(c.phone||mail)?`<div class="contact">
				${c.phone?`<div class="line">${esc(c.phone)}</div>`:""}
				${mail?`<div class="line mail">${esc(mail)}</div>`:""}
			</div>`:""}
			<div class="actions">
				${phone?`<a class="ico" href="tel:${esc(phone)}" aria-label="Call">${ICON.phone}</a>`:""}
				${wa?`<a class="ico wa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICON.wa}</a>`:""}
				${mail?`<a class="ico mail" href="mailto:${esc(mail)}" aria-label="Email">${ICON.mail}</a>`:""}
				<span class="spacer"></span>
				<button class="ico remove" type="button" data-guid="${esc(c.guid)}" aria-label="Remove" style="color:#991b1b">${ICON.trash}</button>
				<a class="open" href="../card/?guid=${encodeURIComponent(c.guid)}">Open</a>
			</div>
		</article>`;
	}).join("");
}

document.addEventListener("DOMContentLoaded",()=>{
	$("gridView").addEventListener("click",()=>setView("grid",true));
	$("listView").addEventListener("click",()=>setView("list",true));
	setView(view);

	$("search").addEventListener("input",e=>{query=e.target.value;render();});

	$("cards").addEventListener("click",e=>{
		const b=e.target.closest(".remove");

		if(!b)return;

		DVC.savedCards.remove(b.dataset.guid);
		toast("Removed from Saved Cards.");
		render();
	});

	render();
});
