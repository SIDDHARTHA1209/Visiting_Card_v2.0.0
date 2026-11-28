/* Paste your Google Maps JavaScript API key here (see instructions). Empty = fallback map. */
const GOOGLE_MAPS_KEY="";

/* safety: an older common.js must not crash this page */
if(!DVC.storedCards){DVC.storedCards={get(){return null;},set(){},remove(){},guids(){return[];},all(){return[];},owned(){return[];}};}
if(!DVC.savedCards){DVC.savedCards={get(){return null;},set(){},remove(){},guids(){return[];},all(){return[];},has(){return false;}};}
const CONFIG={
	API_URL:DVC.API_URL,
	FRONTEND_BASE_URL:DVC.FRONTEND_BASE_URL,
	MAX_IMAGE_DIMENSION:1400,
	TARGET_IMAGE_BYTES:180000,
	MAX_IMAGE_QUALITY:0.84
};

const $=id=>document.getElementById(id);

function getOrCreateAppId(){
	return DVC.getAppId();
}
const form=$("cardForm");
const toast=$("toast");

let toastTimer;
let deferredInstallPrompt=null;
let whatsappSameAsPhone=false;

/* ?edit=<guid> opens this page in "edit an existing card" mode */
const EDIT_GUID=new URLSearchParams(location.search).get("edit")||"";
const IS_EDIT=Boolean(EDIT_GUID);
console.info("DigiCard create page v1.6.0 | edit mode:",IS_EDIT?EDIT_GUID:"off");
const SUBMIT_LABEL=IS_EDIT?"Save Changes":"Create Digital Card";
let editOriginal=null;

document.addEventListener("DOMContentLoaded",function(){
	getOrCreateAppId();
	initPhoneFields();
	setupTemplatePicker();

	if(IS_EDIT){
		startEditMode();
	}else{
		loadDraft();
	}

	if(!$("linksList").querySelector(".link-row")){
		addLinkRow();
	}

	setupImage("photo","photoPreview","photoMeta");
	setupImage("logo","logoPreview","logoMeta");
	setupInstallPrompt();

	$("photoAddButton").addEventListener("click",()=>{
		$("photo").click();
	});

	$("logoAddButton").addEventListener("click",()=>{
		$("logo").click();
	});

	$("addLink").addEventListener("click",()=>addLinkRow());
	$("detectLocation").addEventListener("click",detectLocation);
	$("viewLocation").addEventListener("click",viewLocation);
	$("pickLocation").addEventListener("click",openLocationPicker);
	$("closeLocationMap").addEventListener("click",closeLocationMap);

	$("sameWhatsappButton").addEventListener("click",toggleSameWhatsapp);
	$("phone").addEventListener("input",updateWhatsappFromPhone);
	pickers.phone.onChange(()=>{
		updateWhatsappFromPhone();
		saveDraft();
	});
	pickers.whatsapp.onChange(saveDraft);

	form.addEventListener("input",saveDraft);
	form.addEventListener("submit",submitForm);

	setupPreview();
});

/* ---------- card preview popup ---------- */
function previewImage(previewId){
	const img=$(previewId);

	return img&&!img.classList.contains("hidden")?(img.getAttribute("src")||""):"";
}

function buildPreviewRecord(){
	return{
		guid:IS_EDIT?EDIT_GUID:"",
		name:$("name").value.trim(),
		title:$("title").value.trim(),
		instituteName:$("instituteName").value.trim(),
		companyDescription:$("companyDescription").value.trim(),
		address:$("address").value.trim(),
		website:$("website").value.trim(),
		phone:phoneValue("phone"),
		whatsapp:phoneValue("whatsapp"),
		emails:$("emails").value.trim(),
		locationLink:$("locationLink").value.trim(),
		customLinks:getLinks(),
		logoUrl:previewImage("logoPreview"),
		photoUrl:previewImage("photoPreview"),
		template:selectedTemplate||"classic",
		accent:selectedAccent
	};
}

function setupPreview(){
	const tile=$("previewTile");
	const modal=$("previewModal");
	const frame=$("previewFrame");

	if(!tile||!modal||!frame)return;

	function close(){
		modal.classList.add("hidden");
		document.body.style.overflow="";
		frame.removeAttribute("src");
		tile.focus();
	}

	tile.addEventListener("click",()=>{
		try{
			sessionStorage.setItem("dvc:cardPreview",JSON.stringify(buildPreviewRecord()));
		}catch(e){
			notify("Could not open the preview. Please try again.",true);
			return;
		}

		frame.src="../card/index.html?preview=1&t="+Date.now();
		modal.classList.remove("hidden");
		document.body.style.overflow="hidden";
		$("previewClose").focus();
	});

	$("previewClose").addEventListener("click",close);

	modal.addEventListener("click",event=>{
		if(event.target===modal)close();
	});

	document.addEventListener("keydown",event=>{
		if(event.key==="Escape"&&!modal.classList.contains("hidden"))close();
	});
}

function notify(message,isError=false){
	toast.textContent=message;
	toast.style.background=isError?"#991b1b":"#172033";
	toast.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer=setTimeout(()=>toast.classList.remove("show"),3500);
}

function setupInstallPrompt() {
    const button = $("installButton");

    if (!button) return;

    button.hidden = true;

    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();

        deferredInstallPrompt = event;
        button.hidden = false;
    });

    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        button.hidden = true;

        notify("Digital Visiting Card Creator installed successfully.");
    });

    button.addEventListener("click", installApp);

    if (isIOS() && !isStandalone()) {
        button.hidden = false;
    }
}


function removeInstallButton(){
	const button=$("installAppButton");

	if(button){
		button.remove();
	}
}

async function installApp() {
    if (!deferredInstallPrompt) {
        if (isIOS()) {
            showIOSInstallInstructions();
        } else {
            notify(
                "Installation is not available yet. Open this site in a supported browser and check the PWA requirements.",
                true
            );
        }

        return;
    }

    deferredInstallPrompt.prompt();

    const result = await deferredInstallPrompt.userChoice;

    if (result.outcome === "accepted") {
        notify("Installing Digital Visiting Card Creator...");
    }

    deferredInstallPrompt = null;

    const button = $("installButton");

    if (button) {
        button.hidden = true;
    }
}

function isIOS(){
	return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(){
	return window.matchMedia("(display-mode: standalone)").matches||
		window.navigator.standalone===true;
}

function showIOSInstallInstructions(){
	notify(
		"On iPhone/iPad: tap Share, select Add to Home Screen, then tap Add."
	);
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
			$(metaId).textContent=
				`${file.name} • ${formatBytes(result.bytes)} after compression`;

			saveDraft();
		}catch(err){
			notify(err.message,true);
		}
	});
}

async function processImage(file){
	if(!file.type.startsWith("image/")){
		throw new Error("Please select an image file.");
	}

	const bitmap=await createImageBitmap(file);

	const scale=Math.min(
		1,
		CONFIG.MAX_IMAGE_DIMENSION/
		Math.max(bitmap.width,bitmap.height)
	);

	const canvas=document.createElement("canvas");

	canvas.width=Math.max(
		1,
		Math.round(bitmap.width*scale)
	);

	canvas.height=Math.max(
		1,
		Math.round(bitmap.height*scale)
	);

	const ctx=canvas.getContext("2d");

	/* JPEG has no transparency: without this, transparent PNG logos turn black */
	ctx.fillStyle="#ffffff";
	ctx.fillRect(0,0,canvas.width,canvas.height);

	ctx
		.drawImage(
			bitmap,
			0,
			0,
			canvas.width,
			canvas.height
		);

	let quality=CONFIG.MAX_IMAGE_QUALITY;
	let data=canvas.toDataURL("image/jpeg",quality);

	while(
		data.length*0.75>CONFIG.TARGET_IMAGE_BYTES&&
		quality>0.5
	){
		quality-=0.06;
		data=canvas.toDataURL("image/jpeg",quality);
	}

	return{
		name:file.name,
		type:"image/jpeg",
		data:data,
		bytes:Math.ceil(data.length*.75)
	};
}

function formatBytes(bytes){
	if(bytes<1024)return bytes+" B";
	if(bytes<1048576)return(bytes/1024).toFixed(1)+" KB";
	return(bytes/1048576).toFixed(1)+" MB";
}

function toggleSameWhatsapp(){
	whatsappSameAsPhone=!whatsappSameAsPhone;

	const whatsapp=$("whatsapp");
	const button=$("sameWhatsappButton");

	if(whatsappSameAsPhone){
		whatsapp.value=$("phone").value.trim();
		pickers.whatsapp.set(pickers.phone.iso);
		pickers.whatsapp.setDisabled(true);
		whatsapp.readOnly=true;
		whatsapp.classList.add("same-number-active");
		button.classList.add("active");
		button.textContent="Using Phone Number";
	}else{
		pickers.whatsapp.setDisabled(false);
		whatsapp.readOnly=false;
		whatsapp.classList.remove("same-number-active");
		button.classList.remove("active");
		button.textContent="Same as Phone";
	}

	saveDraft();
}

function updateWhatsappFromPhone(){
	if(!whatsappSameAsPhone)return;

	$("whatsapp").value=$("phone").value.trim();
	pickers.whatsapp.set(pickers.phone.iso);
	saveDraft();
}

function addLinkRow(data={},checkPrevious=true){
	const rows=[...document.querySelectorAll(".link-row")];

	if(checkPrevious&&rows.length){
		const last=rows[rows.length-1];
		const label=last.querySelector(".link-label").value.trim();
		const url=last.querySelector(".link-url").value.trim();

		if(!label||!url){
			notify(
				"Please complete the current link before adding another.",
				true
			);
			return false;
		}

		if(!validUrl(url)){
			notify(
				"Please enter a valid URL before adding another link.",
				true
			);
			return false;
		}
	}

	if(rows.length>=20){
		notify(
			"You can add a maximum of 20 custom links.",
			true
		);
		return false;
	}

	const row=document.createElement("div");

	row.className="link-row";

	row.innerHTML=`
		<input
			class="link-label"
			maxlength="80"
			placeholder="Label"
			value="${escapeAttr(data.label||"")}"
		>
		<input
			class="link-url"
			type="url"
			placeholder="https://..."
			value="${escapeAttr(data.url||"")}"
		>
		<button
			type="button"
			aria-label="Remove link"
		>
			Remove
		</button>
	`;

	row.querySelector("button").addEventListener("click",()=>{
		row.remove();

		if(!$("linksList").querySelector(".link-row")){
			addLinkRow({},false);
		}

		saveDraft();
	});

	row.querySelectorAll("input").forEach(input=>{
		input.addEventListener("input",saveDraft);
	});

	$("linksList").appendChild(row);

	return true;
}

function getLinks(){
	return[...document.querySelectorAll(".link-row")]
		.map(row=>({
			label:row.querySelector(".link-label").value.trim(),
			url:row.querySelector(".link-url").value.trim()
		}))
		.filter(x=>x.label||x.url);
}

function validate(){
	if(!$("name").value.trim()){
		return"Full Name is required.";
	}

	if(!$("phone").value.trim()){
		return"Phone number is required.";
	}

	if(!/^\d{10}$/.test($("phone").value)){
		$("phone").classList.add("invalid");
		$("phone").focus();
		return"Phone number must be exactly 10 digits.";
	}

	if(
		$("whatsapp").value&&
		!/^\d{10}$/.test($("whatsapp").value)
	){
		$("whatsapp").classList.add("invalid");
		$("whatsapp").focus();
		return"WhatsApp number must be exactly 10 digits.";
	}

	if(
		$("website").value&&
		!validUrl($("website").value)
	){
		return"Website URL is invalid.";
	}

	if(
		$("locationLink").value&&
		!validUrl($("locationLink").value)
	){
		return"Location URL is invalid.";
	}

	for(const link of getLinks()){
		if(
			!link.label||
			!link.url||
			!validUrl(link.url)
		){
			return"Each custom link needs a label and valid URL.";
		}
	}

	const emails=$("emails").value
		.split(",")
		.map(x=>x.trim())
		.filter(Boolean);

	for(const email of emails){
		if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
			return"One or more email addresses are invalid.";
		}
	}

	return"";
}

async function submitForm(event){
	event.preventDefault();

	const error=validate();

	if(error){
		notify(error,true);
		return;
	}

	if(
		!CONFIG.API_URL||
		CONFIG.API_URL.includes("YOUR_DEPLOYMENT_ID")
	){
		notify(
			"Configure the Apps Script API URL in public/script.js first.",
			true
		);
		return;
	}

	const button=$("submitButton");

	button.disabled=true;
	button.textContent=IS_EDIT?"Saving…":"Creating…";

	try{
		const body={
			action:IS_EDIT?"update":"submit",
			guid:IS_EDIT?EDIT_GUID:undefined,
			appId:getOrCreateAppId(),
			cardName:$("cardName").value.trim(),
			name:$("name").value.trim(),
			title:$("title").value.trim(),
			instituteName:$("instituteName").value.trim(),
			companyDescription:$("companyDescription").value.trim(),
			address:$("address").value.trim(),
			website:$("website").value.trim(),
			phone:phoneValue("phone"),
			whatsapp:phoneValue("whatsapp"),
			emails:$("emails").value.trim(),
			locationLink:$("locationLink").value.trim(),
			customLinks:JSON.stringify(getLinks()),
			logoImage:readImagePayload("logo"),
			photoImage:readImagePayload("photo"),
			/* no design chosen = the first (classic) design; the server ignores it when editing */
			template:selectedTemplate||"classic",
			accent:selectedAccent
		};

		if(IS_EDIT&&editOriginal){
			/* an image that was there, has no new upload and was removed with the × button */
			body.removeLogo=Boolean(
				editOriginal.logoUrl&&
				!body.logoImage&&
				!$("logoPreview").getAttribute("src")
			);

			body.removePhoto=Boolean(
				editOriginal.photoUrl&&
				!body.photoImage&&
				!$("photoPreview").getAttribute("src")
			);
		}

		const data=await DVC.post(body,{timeout:90000});

		if(!data.guid){
			throw new Error(
				"Card was created but no card ID was returned."
			);
		}

		if(IS_EDIT){
			finishEdit(body,data);
			return;
		}

		const cardUrl=
			data.cardUrl||
			CONFIG.FRONTEND_BASE_URL+
			"card/?guid="+
			encodeURIComponent(data.guid);

		localStorage.removeItem("vcardDraft");

		/* Put the new card into the local cache so Home shows it instantly */
		try{
			DVC.cacheCardsUpdate(body.appId,cards=>{
				cards.unshift(Object.assign({},data.record||{},{
					guid:data.guid,
					cardName:body.cardName,
					ownerStatus:"Active",
					isFavourite:false,
					responseCount:0,
					companyDescription:body.companyDescription
				}));

				return cards;
			});

			DVC.storedCards.set(data.guid,Object.assign({},data.record||{},{
				guid:data.guid,
				cardName:body.cardName,
				companyDescription:body.companyDescription
			}),{owned:true,appId:body.appId});

			DVC.lsSet("dvc:lastSelectedCard",data.guid);
		}catch(e){}

		location.href=
			"../success/?guid="+
			encodeURIComponent(data.guid)+
			"&cardUrl="+
			encodeURIComponent(cardUrl);

	}catch(err){
		notify(
			err.message||
			"Network error. Please try again.",
			true
		);

		button.disabled=false;
		button.textContent=SUBMIT_LABEL;
	}
}

function readImagePayload(id){
	const raw=$(id).dataset.payload;
	return raw?JSON.parse(raw):null;
}

function getPosition(options){
	return new Promise((resolve,reject)=>{
		navigator.geolocation.getCurrentPosition(resolve,reject,options);
	});
}

/* Approximate (city level) position from the visitor's IP address.
   Used only when the device itself cannot give a position. */
async function ipLocation(){
	const place=d=>[d.city,d.region||d.region_name].filter(Boolean).join(", ");

	const sources=[
		["https://ipwho.is/",d=>d&&d.success!==false?{lat:d.latitude,lng:d.longitude,place:place(d)}:null],
		["https://get.geojs.io/v1/ip/geo.json",d=>d?{lat:d.latitude,lng:d.longitude,place:place(d)}:null],
		["https://ipapi.co/json/",d=>d&&!d.error?{lat:d.latitude,lng:d.longitude,place:place(d)}:null]
	];

	for(const[url,read]of sources){
		const controller=new AbortController();
		const timer=setTimeout(()=>controller.abort(),6000);

		try{
			const response=await fetch(url,{signal:controller.signal,cache:"no-store"});
			const found=read(await response.json());
			const lat=Number(found&&found.lat);
			const lng=Number(found&&found.lng);

			if(Number.isFinite(lat)&&Number.isFinite(lng)&&(lat||lng)){
				return{lat:lat,lng:lng,place:found.place};
			}
		}catch(e){
			/* try the next service */
		}finally{
			clearTimeout(timer);
		}
	}

	throw new Error("No network location available.");
}

async function detectLocation(){
	const status=$("locationStatus");
	const button=$("detectLocation");

	function finish(){
		button.disabled=false;
		button.textContent="Detect location";
	}

	function fail(message){
		finish();
		status.textContent=message;
		notify(message,true);
	}

	function save(lat,lng){
		$("locationLink").value=
			`https://www.google.com/maps?q=${lat},${lng}`;

		closeLocationMap();
		saveDraft();
	}

	button.disabled=true;
	button.textContent="Detecting...";
	status.textContent="Getting your current location...";

	/* 1 + 2: the device itself (Wi-Fi / GPS) */
	let reason="";

	if(!navigator.geolocation){
		reason="this browser has no location support";
	}else if(!window.isSecureContext){
		reason="this page is not secure (https or localhost)";
	}else{
		const attempts=[
			{enableHighAccuracy:false,timeout:10000,maximumAge:300000},
			{enableHighAccuracy:true,timeout:20000,maximumAge:0}
		];

		for(let i=0;i<attempts.length;i++){
			try{
				const position=await getPosition(attempts[i]);
				const{latitude,longitude,accuracy}=position.coords;

				if(Number.isFinite(latitude)&&Number.isFinite(longitude)){
					finish();
					save(latitude,longitude);

					const meters=Math.round(accuracy||0);

					status.textContent=
						meters>500
							?`Location detected (about ${meters} m, approximate). Tap View Location to check it, or paste an exact Google Maps link.`
							:`Location detected with approximately ${meters} meter accuracy.`;

					openLocationPicker();

					return;
				}
			}catch(error){
				if(error&&error.code===1){
					fail("Location permission was denied. Allow location for this site in the browser, or paste a Google Maps link.");
					return;
				}

				reason=error&&error.code===3
					?"the device took too long to answer"
					:"the device could not provide a position";

				if(i===0)status.textContent="Trying again with high accuracy...";
			}
		}
	}

	/* 3: device could not answer - let the user tap the exact spot on a map */
	finish();
	status.textContent=
		`Device location unavailable (${reason}). Tap your exact spot on the map instead.`;

	openLocationPicker();
}

/* ---------- pick a spot on a map (works on any computer) ---------- */

let leafletReady=null;

function loadLeaflet(){
	if(window.L)return Promise.resolve();

	if(leafletReady)return leafletReady;

	leafletReady=new Promise((resolve,reject)=>{
		const css=document.createElement("link");

		css.rel="stylesheet";
		css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
		document.head.appendChild(css);

		const js=document.createElement("script");

		js.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
		js.onload=resolve;
		js.onerror=()=>{leafletReady=null;reject(new Error("map library failed"));};
		document.head.appendChild(js);
	});

	return leafletReady;
}

let gmapsReady=null;

function loadGoogleMaps(){
	if(window.google&&google.maps)return Promise.resolve();

	if(gmapsReady)return gmapsReady;

	gmapsReady=new Promise((resolve,reject)=>{
		const js=document.createElement("script");

		js.src="https://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(GOOGLE_MAPS_KEY);
		js.onload=resolve;
		js.onerror=()=>{gmapsReady=null;reject(new Error("google maps failed"));};
		document.head.appendChild(js);
	});

	return gmapsReady;
}

/* one map API for the picker: Google Maps when a key is set, else the fallback */
function mapView(ll,zoom){
	const p=Array.isArray(ll)?{lat:ll[0],lng:ll[1]}:ll;

	if(GOOGLE_MAPS_KEY){
		picker.map.setCenter(p);
		picker.map.setZoom(zoom);
	}else{
		picker.map.setView(p,zoom);
	}
}

function getPin(){
	if(!picker.marker)return null;

	if(GOOGLE_MAPS_KEY){
		const p=picker.marker.getPosition();

		return{lat:p.lat(),lng:p.lng()};
	}

	return picker.marker.getLatLng();
}

async function searchPlaces(q){
	if(GOOGLE_MAPS_KEY){
		await loadGoogleMaps();

		return new Promise(resolve=>{
			new google.maps.Geocoder().geocode({address:q},(res,status)=>{
				if(status!=="OK"||!res)return resolve([]);

				resolve(res.slice(0,6).map(x=>({
					name:x.formatted_address,
					lat:x.geometry.location.lat(),
					lng:x.geometry.location.lng()
				})));
			});
		});
	}

	const res=await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=6&q="+encodeURIComponent(q),{headers:{Accept:"application/json"}});
	const list=await res.json();

	return(Array.isArray(list)?list:[]).map(x=>({name:x.display_name,lat:Number(x.lat),lng:Number(x.lon)}));
}

let picker=null;

async function openLocationPicker(){
	const status=$("locationStatus");

	if(!picker){
		const box=document.createElement("div");

		box.className="location-map-container";
		box.innerHTML=
			'<div class="location-modal">'+
				'<div class="location-map-header">'+
					'<div><strong>Your location</strong>'+
					'<small>Search for your place, then tap the map or drag the pin to your exact spot, then press Use this location.</small></div>'+
					'<button type="button" class="location-close-button" aria-label="Close">×</button>'+
				'</div>'+
				'<form id="pickSearchForm" style="display:flex;gap:8px;padding:10px 16px 0">'+
					'<input id="pickSearch" type="search" placeholder="Search a place, institute or address" autocomplete="off" style="flex:1;min-width:0;padding:11px 12px;border:1px solid #cfc9bb;border-radius:10px;font-size:16px">'+
					'<button type="submit" class="button" id="pickSearchBtn">Search</button>'+
				'</form>'+
				'<div id="pickResults" style="padding:6px 16px 0;max-height:150px;overflow:auto"></div>'+
				'<div class="location-map"><div id="pickMap" style="width:100%;height:100%;min-height:340px"></div></div>'+
				'<div style="display:flex;gap:10px;justify-content:flex-end;padding:12px 16px;flex-wrap:wrap">'+
					'<button type="button" class="button secondary" id="pickMyPos">Use my position</button>'+
					'<button type="button" class="button" id="pickUse">Use this location</button>'+
				'</div>'+
			'</div>';

		document.body.appendChild(box);
		picker={box:box,map:null,marker:null};

		box.querySelector(".location-close-button").addEventListener("click",()=>box.classList.add("hidden"));

		const form=box.querySelector("#pickSearchForm");
		const input=box.querySelector("#pickSearch");
		const results=box.querySelector("#pickResults");

		form.addEventListener("submit",async e=>{
			e.preventDefault();

			const q=input.value.trim();

			if(!q)return;

			results.innerHTML='<small>Searching...</small>';

			try{
				const list=await searchPlaces(q);

				if(!list.length){
					results.innerHTML='<small>No place found. Try a city or a nearby landmark.</small>';
					return;
				}

				results.innerHTML="";

				list.forEach(item=>{
					const b=document.createElement("button");

					b.type="button";
					b.textContent=item.name;
					b.style.cssText="display:block;width:100%;text-align:left;padding:9px 10px;margin:0 0 6px;border:1px solid #e3ded3;border-radius:8px;background:#fff;font-size:13px;cursor:pointer";
					b.addEventListener("click",()=>{
						const ll={lat:item.lat,lng:item.lng};

						mapView(ll,17);
						setPin(ll);
						results.innerHTML="";
					});
					results.appendChild(b);
				});

				/* jump straight to the best match */
				const ll={lat:list[0].lat,lng:list[0].lng};

				mapView(ll,15);
				setPin(ll);
			}catch(err){
				results.innerHTML='<small>Search failed. Check your internet and try again.</small>';
			}
		});

		/* pre-fill from what the user already typed */
		const inst=($("instituteName")&&$("instituteName").value.trim())||"";

		if(inst)input.value=inst;
	}

	picker.box.classList.remove("hidden");

	try{
		await(GOOGLE_MAPS_KEY?loadGoogleMaps():loadLeaflet());
	}catch(e){
		picker.box.classList.add("hidden");
		status.textContent="Could not load the map. Paste a Google Maps link instead.";
		notify("Could not load the map.",true);
		return;
	}

	/* start where the user already is, else the network position, else India */
	let start=[20.59,78.96],zoom=5;
	const current=getMapQuery($("locationLink").value.trim()||"");
	const m=/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(current||"");

	if(m){
		start=[Number(m[1]),Number(m[2])];
		zoom=17;
	}

	if(!picker.map){
		if(GOOGLE_MAPS_KEY){
			picker.map=new google.maps.Map($("pickMap"),{
				center:{lat:start[0],lng:start[1]},
				zoom:zoom,
				streetViewControl:false,
				mapTypeControl:false,
				fullscreenControl:false
			});

			picker.map.addListener("click",e=>setPin(e.latLng.toJSON()));
		}else{
			picker.map=L.map("pickMap").setView(start,zoom);

			L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
				maxZoom:19,
				attribution:"&copy; OpenStreetMap"
			}).addTo(picker.map);

			picker.map.on("click",e=>setPin(e.latlng));
		}

		picker.box.querySelector("#pickUse").addEventListener("click",()=>{
			if(!picker.marker){
				notify("Tap the map to place the pin first.",true);
				return;
			}

			const p=getPin();

			$("locationLink").value=
				`https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

			picker.box.classList.add("hidden");
			$("locationStatus").textContent="Location set from the map. Tap View Location to check it.";
			saveDraft();
		});

		picker.box.querySelector("#pickMyPos").addEventListener("click",()=>{
			if(!navigator.geolocation){notify("No device location available.",true);return;}

			navigator.geolocation.getCurrentPosition(
				pos=>{
					const ll={lat:pos.coords.latitude,lng:pos.coords.longitude};

					mapView(ll,17);
					setPin(ll);
				},
				()=>notify("Device location is not available. Tap the map instead.",true),
				{enableHighAccuracy:true,timeout:15100,maximumAge:0}
			);
		});
	}else{
		mapView(start,zoom);
	}

	if(m)setPin({lat:start[0],lng:start[1]});

	if(!GOOGLE_MAPS_KEY)setTimeout(()=>picker.map.invalidateSize(),150);

	/* no pin yet: centre on the network position so the user starts near home */
	if(!m){
		ipLocation().then(f=>{
			if(!picker.marker)mapView([f.lat,f.lng],13);
		}).catch(()=>{});
	}
}

function setPin(latlng){
	if(picker.marker){
		if(GOOGLE_MAPS_KEY)picker.marker.setPosition(latlng);
		else picker.marker.setLatLng(latlng);
		return;
	}

	picker.marker=GOOGLE_MAPS_KEY?
		new google.maps.Marker({position:latlng,map:picker.map,draggable:true}):
		L.marker(latlng,{draggable:true}).addTo(picker.map);
}

function viewLocation(){
	const location=$("locationLink").value.trim();
	const status=$("locationStatus");

	if(!location){
		status.textContent=
			"Enter or detect a location first.";

		notify(
			"Please enter or detect a location first.",
			true
		);

		return;
	}

	if(!validUrl(location)){
		status.textContent=
			"Please enter a valid Google Maps URL.";

		notify(
			"Please enter a valid Google Maps URL.",
			true
		);

		return;
	}

	const mapQuery=getMapQuery(location);

	/* a saved pin opens in the same map as Detect and Pick on Map */
	if(/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(mapQuery)){
		openLocationPicker();
		return;
	}

	$("locationMap").src=
		`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;

	$("locationMapContainer").classList.remove("hidden");

	status.textContent=
		"Verify that the displayed location is correct.";

	saveDraft();
}

function getMapQuery(location){
	try{
		const url=new URL(location);

		const query=
			url.searchParams.get("query")||
			url.searchParams.get("q");

		if(query)return query;

		return location;
	}catch(e){
		return location;
	}
}

function closeLocationMap(){
	$("locationMapContainer").classList.add("hidden");
	$("locationMap").src="";
}

function saveDraft(){
	if(IS_EDIT)return;

	const draft={};

	[
		"name",
		"title",
		"instituteName",
		"companyDescription",
		"address",
		"website",
		"phone",
		"whatsapp",
		"emails",
		"locationLink",
		"cardName"
	].forEach(id=>{
		draft[id]=$(id).value;
	});

	draft.phoneCountry=pickers.phone.iso;
	draft.whatsappCountry=pickers.whatsapp.iso;
	draft.whatsappSameAsPhone=whatsappSameAsPhone;
	draft.links=getLinks();
	draft.template=selectedTemplate;
	draft.accent=selectedAccent;

	try{
		localStorage.setItem(
			"vcardDraft",
			JSON.stringify(draft)
		);
	}catch(e){}
}

function clearFormFields(){
	applyTemplateChoice("","",false);

	[
		"name",
		"title",
		"instituteName",
		"companyDescription",
		"address",
		"website",
		"phone",
		"whatsapp",
		"emails",
		"locationLink",
		"cardName"
	].forEach(id=>{
		const element=$(id);

		if(element){
			element.value="";
		}
	});

	[
		"photo",
		"logo"
	].forEach(id=>{
		const element=$(id);

		if(element){
			element.value="";
			delete element.dataset.payload;
		}
	});

	if($("photoPreview")){
		$("photoPreview").src="";
		$("photoPreview").classList.add("hidden");
	}

	if($("logoPreview")){
		$("logoPreview").src="";
		$("logoPreview").classList.add("hidden");
	}

	if($("photoMeta")){
		$("photoMeta").textContent="Kindly add a profile photo.";
	}

	if($("logoMeta")){
		$("logoMeta").textContent="Kindly add your institute logo.";
	}

	if($("linksList")){
		$("linksList").innerHTML="";
	}

	whatsappSameAsPhone=false;

	if(pickers.phone){
		pickers.phone.set("in");
		pickers.whatsapp.set("in");
		pickers.whatsapp.setDisabled(false);
	}

	if($("whatsapp")){
		$("whatsapp").readOnly=false;
		$("whatsapp").classList.remove("same-number-active");
	}

	if($("sameWhatsappButton")){
		$("sameWhatsappButton").classList.remove("active");
		$("sameWhatsappButton").textContent="Same as Phone";
	}
}

function loadDraft(){
	try{
		const raw=localStorage.getItem("vcardDraft");

		if(!raw){
			clearFormFields();
			return;
		}

		const draft=JSON.parse(raw);

		if(!draft){
			clearFormFields();
			return;
		}

		[
			"name",
			"title",
			"instituteName",
			"companyDescription",
			"address",
			"website",
			"phone",
			"whatsapp",
			"emails",
			"locationLink",
			"cardName"
		].forEach(id=>{
			const element=$(id);

			if(element){
				element.value=draft[id]||"";
			}
		});

		$("phone").value=onlyDigits($("phone").value);
		$("whatsapp").value=onlyDigits($("whatsapp").value);

		pickers.phone.set(draft.phoneCountry);
		pickers.whatsapp.set(draft.whatsappCountry);

		whatsappSameAsPhone=draft.whatsappSameAsPhone===true;

		if(whatsappSameAsPhone){
			pickers.whatsapp.set(pickers.phone.iso);
			pickers.whatsapp.setDisabled(true);
			$("whatsapp").value=$("phone").value.trim();
			$("whatsapp").readOnly=true;
			$("whatsapp").classList.add("same-number-active");
			$("sameWhatsappButton").classList.add("active");
			$("sameWhatsappButton").textContent="Using Phone Number";
		}

		if($("linksList")){
			$("linksList").innerHTML="";
		}

		(Array.isArray(draft.links)?draft.links:[])
			.forEach(link=>addLinkRow(link,false));

		applyTemplateChoice(draft.template||"",draft.accent||"",false);

	}catch(e){
		clearFormFields();
		console.error("Could not load draft:",e);
	}
}

function validUrl(value){
	try{
		const u=new URL(
			/^https?:\/\//i.test(value)
				?value
				:"https://"+value
		);

		return(
			u.protocol==="http:"||
			u.protocol==="https:"
		);
	}catch(e){
		return false;
	}
}

function escapeAttr(value){
	return String(value)
		.replace(/&/g,"&amp;")
		.replace(/"/g,"&quot;")
		.replace(/</g,"&lt;")
		.replace(/>/g,"&gt;");
}

/* IMAGE PREVIEW AND REMOVE CONTROLS */

document.addEventListener("DOMContentLoaded", function () {
	const images = [
		{
			input: "photo",
			preview: "photoPreview",
			wrapper: "photoPreviewWrap",
			remove: "photoRemoveButton",
			meta: "photoMeta",
			defaultText: "Kindly add the profile photo."
		},
		{
			input: "logo",
			preview: "logoPreview",
			wrapper: "logoPreviewWrap",
			remove: "logoRemoveButton",
			meta: "logoMeta",
			defaultText: "Kindly add the institution/organization logo."
		}
	];

	images.forEach(function (item) {
		const input = document.getElementById(item.input);
		const preview = document.getElementById(item.preview);
		const wrapper = document.getElementById(item.wrapper);
		const remove = document.getElementById(item.remove);
		const meta = document.getElementById(item.meta);

		if (!input || !preview || !wrapper || !remove) return;

		function updatePreviewState() {
			const hasImage =
				!preview.classList.contains("hidden") &&
				Boolean(preview.getAttribute("src"));

			wrapper.classList.toggle("has-image", hasImage);
			remove.classList.toggle("hidden", !hasImage);
		}

		const observer = new MutationObserver(updatePreviewState);

		observer.observe(preview, {
			attributes: true,
			attributeFilter: ["src", "class"]
		});

		input.addEventListener("change", function () {
			updatePreviewState();
		});

		remove.addEventListener("click", function () {
			input.value = "";
			delete input.dataset.payload;
			preview.removeAttribute("src");
			preview.classList.add("hidden");
			wrapper.classList.remove("has-image");
			remove.classList.add("hidden");

			if (meta) {
				meta.textContent = item.defaultText;
			}

			input.dispatchEvent(new Event("change", { bubbles: true }));
		});

		updatePreviewState();
	});
});


/* =========================================
   COUNTRY PICKER (flag dropdown, code hidden)
========================================= */

const COUNTRIES=[
	["in","India","91"],["us","United States","1"],["gb","United Kingdom","44"],
	["ae","United Arab Emirates","971"],["sa","Saudi Arabia","966"],["qa","Qatar","974"],
	["kw","Kuwait","965"],["om","Oman","968"],["bh","Bahrain","973"],
	["sg","Singapore","65"],["my","Malaysia","60"],["au","Australia","61"],
	["nz","New Zealand","64"],["ca","Canada","1"],["de","Germany","49"],
	["fr","France","33"],["it","Italy","39"],["es","Spain","34"],
	["nl","Netherlands","31"],["ch","Switzerland","41"],["se","Sweden","46"],
	["no","Norway","47"],["dk","Denmark","45"],["ie","Ireland","353"],
	["pt","Portugal","351"],["ru","Russia","7"],["tr","Turkey","90"],
	["cn","China","86"],["jp","Japan","81"],["kr","South Korea","82"],
	["hk","Hong Kong","852"],["th","Thailand","66"],["id","Indonesia","62"],
	["ph","Philippines","63"],["vn","Vietnam","84"],["bd","Bangladesh","880"],
	["pk","Pakistan","92"],["lk","Sri Lanka","94"],["np","Nepal","977"],
	["bt","Bhutan","975"],["mv","Maldives","960"],["af","Afghanistan","93"],
	["za","South Africa","27"],["ng","Nigeria","234"],["ke","Kenya","254"],
	["eg","Egypt","20"],["br","Brazil","55"],["mx","Mexico","52"],
	["ar","Argentina","54"],["il","Israel","972"]
];

const pickers={};

function onlyDigits(value){
	return String(value||"").replace(/\D/g,"").slice(0,10);
}

function phoneValue(kind){
	const digits=onlyDigits($(kind).value);

	if(!digits)return"";

	return"+"+pickers[kind].dial+" "+digits;
}

function initPhoneFields(){
	pickers.phone=createCountryPicker($("phoneCountry"));
	pickers.whatsapp=createCountryPicker($("whatsappCountry"));

	["phone","whatsapp"].forEach(id=>{
		$(id).addEventListener("input",()=>{
			const clean=onlyDigits($(id).value);

			if($(id).value!==clean){
				$(id).value=clean;
			}

			$(id).classList.remove("invalid");
		});
	});
}

function createCountryPicker(root){
	const byIso={};
	COUNTRIES.forEach(c=>byIso[c[0]]=c);

	let iso=root.dataset.default||"in";
	let activeIndex=-1;
	let visible=COUNTRIES;
	const listeners=[];

	root.innerHTML=`
		<button type="button" class="country-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Select country">
			<span class="flag-slot"></span>
			<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
		</button>
		<div class="country-menu hidden">
			<input type="search" class="country-search" placeholder="Search country" autocomplete="off" aria-label="Search country">
			<ul role="listbox"></ul>
		</div>`;

	const button=root.querySelector(".country-btn");
	const slot=root.querySelector(".flag-slot");
	const menu=root.querySelector(".country-menu");
	const search=root.querySelector(".country-search");
	const list=root.querySelector("ul");

	function flag(code,name){
		const wrap=document.createElement("span");
		wrap.style.display="inline-flex";

		const img=document.createElement("img");
		img.className="country-flag";
		img.alt="";
		img.loading="lazy";
		img.src=`https://flagcdn.com/w40/${code}.png`;
		img.srcset=`https://flagcdn.com/w80/${code}.png 2x`;
		img.onerror=()=>{
			const fb=document.createElement("span");
			fb.className="country-flag-fallback";
			fb.textContent=code;
			wrap.replaceChildren(fb);
		};

		wrap.appendChild(img);
		wrap.title=name;
		return wrap;
	}

	function paintButton(){
		const c=byIso[iso];

		slot.replaceChildren(flag(c[0],c[1]));
		button.title=c[1];
		button.setAttribute("aria-label","Country: "+c[1]);
	}

	function renderList(){
		const q=search.value.trim().toLowerCase();

		visible=COUNTRIES.filter(c=>c[1].toLowerCase().includes(q));
		list.innerHTML="";

		if(!visible.length){
			list.innerHTML='<li class="country-empty">No country found</li>';
			return;
		}

		visible.forEach((c,index)=>{
			const li=document.createElement("li");
			li.setAttribute("role","option");
			li.setAttribute("aria-selected",c[0]===iso?"true":"false");

			if(index===activeIndex)li.classList.add("active");

			li.appendChild(flag(c[0],c[1]));
			li.appendChild(document.createTextNode(c[1]));

			li.addEventListener("mousedown",e=>{
				e.preventDefault();
				choose(c[0]);
			});

			list.appendChild(li);
		});
	}

	function open(){
		if(button.disabled)return;

		activeIndex=Math.max(0,COUNTRIES.findIndex(c=>c[0]===iso));
		search.value="";
		renderList();
		menu.classList.remove("hidden");
		button.setAttribute("aria-expanded","true");
		search.focus();

		const selected=list.querySelector('[aria-selected="true"]');
		if(selected)selected.scrollIntoView({block:"nearest"});
	}

	function close(){
		menu.classList.add("hidden");
		button.setAttribute("aria-expanded","false");
	}

	function choose(code){
		api.set(code);
		close();
		button.focus();
		listeners.forEach(fn=>fn(code));
	}

	button.addEventListener("click",()=>{
		menu.classList.contains("hidden")?open():close();
	});

	search.addEventListener("input",()=>{
		activeIndex=0;
		renderList();
	});

	search.addEventListener("keydown",e=>{
		if(e.key==="Escape"){
			close();
			button.focus();
		}else if(e.key==="ArrowDown"||e.key==="ArrowUp"){
			e.preventDefault();
			activeIndex=Math.min(
				visible.length-1,
				Math.max(0,activeIndex+(e.key==="ArrowDown"?1:-1))
			);
			renderList();
			list.children[activeIndex]?.scrollIntoView({block:"nearest"});
		}else if(e.key==="Enter"){
			e.preventDefault();
			if(visible[activeIndex])choose(visible[activeIndex][0]);
		}
	});

	document.addEventListener("click",e=>{
		if(!root.contains(e.target))close();
	});

	const api={
		get iso(){return iso;},
		get dial(){return byIso[iso][2];},
		set(code){
			if(!byIso[code])code=root.dataset.default||"in";
			iso=code;
			paintButton();
		},
		setDisabled(flag){
			button.disabled=!!flag;
			if(flag)close();
		},
		onChange(fn){listeners.push(fn);}
	};

	paintButton();
	return api;
}


/* =========================================
   EDIT MODE
========================================= */

/* "+91 8310123185" -> { iso:"in", digits:"8310123185" } */
function splitPhone(value){
	const all=String(value||"").replace(/\.0+$/,"").replace(/\D/g,"");

	if(!all)return{iso:"in",digits:""};

	const digits=all.slice(-10);
	const dial=all.slice(0,-10);
	const match=dial?COUNTRIES.find(c=>c[2]===dial):null;

	return{iso:match?match[0]:"in",digits:digits};
}

function setImagePreview(previewId,metaId,url){
	const src=DVC.driveImage(url);

	if(!src)return;

	const preview=$(previewId);

	preview.src=src;
	preview.classList.remove("hidden");

	$(metaId).textContent="Current image. Choose a new file to replace it, or tap × to remove it.";
}

function fillEditForm(card){
	/* every step is separate, so one bad value can never leave the form half-empty */
	const steps={
		text(){
			[
				"name","title","instituteName","companyDescription",
				"address","website","emails","locationLink","cardName"
			].forEach(id=>{
				if($(id))$(id).value=card[id]||"";
			});
		},
		design(){
			/* the design is fixed once the card exists; only the colour can change */
			applyTemplateChoice(card.template||"classic",card.accent||"",true);
		},
		phone(){
			const phone=splitPhone(card.phone);

			pickers.phone.set(phone.iso);
			$("phone").value=phone.digits;

			const whatsapp=splitPhone(card.whatsapp);

			if(whatsapp.digits&&whatsapp.digits===phone.digits&&whatsapp.iso===phone.iso){
				if(!whatsappSameAsPhone)toggleSameWhatsapp();
			}else{
				pickers.whatsapp.set(whatsapp.iso);
				$("whatsapp").value=whatsapp.digits;
			}
		},
		links(){
			$("linksList").innerHTML="";

			let links=card.customLinks;

			if(typeof links==="string"){
				try{links=JSON.parse(links);}catch(e){links=[];}
			}

			links=Array.isArray(links)?links:[];

			links.forEach(link=>addLinkRow(link,false));

			if(!links.length)addLinkRow({},false);
		},
		images(){
			setImagePreview("logoPreview","logoMeta",card.logoUrl);
			setImagePreview("photoPreview","photoMeta",card.photoUrl);
		}
	};

	Object.keys(steps).forEach(name=>{
		try{
			steps[name]();
		}catch(error){
			console.error("Edit form: could not fill "+name,error);
		}
	});

	editOriginal={logoUrl:card.logoUrl||"",photoUrl:card.photoUrl||""};
}

async function startEditMode(){
	document.title="Edit Digital Visiting Card";

	const delPanel=$("deletePanel");

	if(delPanel){
		delPanel.classList.remove("hidden");

		$("deleteCardButton").addEventListener("click",async()=>{
			const label=[$("name").value.trim(),$("instituteName").value.trim()].filter(Boolean).join(" – ")||"this card";

			try{
				if(await DVC.deleteOwnCard(EDIT_GUID,label))location.href="../";
			}catch(error){
				notify(error.message||"Could not delete the card.",true);
			}
		});
	}

	const back=document.querySelector(".back-home");

	if(back){
		back.href="../card/?guid="+encodeURIComponent(EDIT_GUID);
		back.textContent="← Back to Card";
	}

	const heading=document.querySelector(".hero h1");
	const intro=document.querySelector(".hero-content p");
	const eyebrow=document.querySelector(".hero .eyebrow");

	if(heading)heading.textContent="Edit Your Digital Visiting Card";
	if(intro)intro.textContent="Update your details. Your card link and QR code stay the same.";
	if(eyebrow)eyebrow.textContent="EDIT CARD";

	const button=$("submitButton");

	button.textContent=SUBMIT_LABEL;
	button.disabled=true;

	/* a banner so it is always obvious this page is editing, not creating */
	const banner=document.createElement("div");

	banner.id="editBanner";
	banner.style.cssText="margin:0 0 16px;padding:13px 16px;border-radius:12px;background:#fff4d6;border:1px solid #f0c75a;color:#5c4200;font-size:14px;font-weight:700;line-height:1.5";
	banner.textContent="Editing your card. Loading the current details...";

	/* banner is no longer shown (kept detached so the code below still works) */

	const appId=getOrCreateAppId();
	let filled=false;

	try{
		await DVC.swr(
			DVC.cardsKey(appId),
			"?action=ownedcards&appId="+encodeURIComponent(appId),
			data=>{
				if(filled)return;

				const card=(data&&Array.isArray(data.cards)?data.cards:[])
					.find(c=>c.guid===EDIT_GUID);

				if(card){
					fillEditForm(card);
					filled=true;
					button.disabled=false;

					banner.textContent=
						"Editing \u201c"+(card.cardName||card.name||"your card")+
						"\u201d. Saving updates this card. It will not create a new one.";
				}
			},
			{retries:1}
		);

		if(!filled){
			throw new Error(
				"This card was not created on this device, so it can't be edited here. On the Home page use \"Sync this device\" first."
			);
		}
	}catch(error){
		notify(error.message||"Unable to load the card.",true);

		banner.remove();

		const note=document.createElement("p");

		note.className="edit-blocked";
		note.style.cssText="margin:12px 0;padding:12px 14px;border-radius:10px;background:#fde8e8;color:#7a1414;font-weight:700;font-size:13px;line-height:1.5";
		note.textContent=error.message||"Unable to load the card.";

		form.prepend(note);
		button.disabled=true;
	}
}

function finishEdit(body,data){
	const record=data.record||{};

	try{
		DVC.cacheCardsUpdate(body.appId,cards=>cards.map(card=>
			card.guid===EDIT_GUID
				?Object.assign({},card,record,{
					cardName:body.cardName,
					companyDescription:body.companyDescription
				})
				:card
		));

		DVC.storedCards.set(EDIT_GUID,Object.assign({},record,{
			guid:EDIT_GUID,
			cardName:body.cardName,
			companyDescription:body.companyDescription
		}),{owned:true,appId:body.appId});

		/* the card page shows the new version immediately */
		DVC.cacheSet("card:"+EDIT_GUID,{success:true,record:Object.assign({},record,{
			companyDescription:body.companyDescription
		})});
	}catch(e){}

	location.href="../card/?guid="+encodeURIComponent(EDIT_GUID);
}


/* ---------- card design (template) picker ---------- */
let selectedTemplate="";   /* "" = nothing chosen yet */
let selectedAccent="";     /* "" = the design's own colour */
let templateLocked=false;  /* true when editing: the design cannot change */

function setupTemplatePicker(){
	if(!window.DVCT||!$("templateRow"))return;

	renderTemplatePicker();

	$("templateRow").addEventListener("click",event=>{
		const button=event.target.closest(".tpl-thumb");

		if(!button||templateLocked)return;

		applyTemplateChoice(button.dataset.id,"",false);
		saveDraft();
	});

	$("accentBox").addEventListener("click",event=>{
		const swatch=event.target.closest(".accent-swatch");

		if(!swatch)return;

		setAccent(swatch.dataset.color);
	});

	$("accentBox").addEventListener("change",event=>{
		if(event.target.id==="accentCustom")setAccent(event.target.value);
	});
}

function setAccent(color){
	const base=DVCT.byId(selectedTemplate).accent;
	const clean=DVCT.normalizeAccent(color);

	selectedAccent=clean&&clean!==base?clean:"";
	renderTemplatePicker();
	saveDraft();
}

function applyTemplateChoice(id,accent,lock){
	selectedTemplate=window.DVCT&&DVCT.list.some(t=>t.id===id)?id:"";
	selectedAccent=selectedTemplate?(DVCT.normalizeAccent(accent)||""):"";
	templateLocked=Boolean(lock)&&Boolean(selectedTemplate);
	renderTemplatePicker();
}

function renderTemplatePicker(){
	const row=$("templateRow");
	const box=$("accentBox");

	if(!row||!window.DVCT)return;

	row.innerHTML=DVCT.list
		.filter(t=>!templateLocked||t.id===selectedTemplate)
		.map(t=>{
			const on=t.id===selectedTemplate;

			return'<button type="button" class="tpl-thumb'+(on?" selected":"")+'" data-id="'+t.id+'" role="radio" aria-checked="'+on+'">'+
				'<span class="tpl-thumb-stage">'+DVCT.thumb(t.id,on?selectedAccent:"")+'</span>'+
				'<span class="tpl-thumb-name">'+t.name+(on?" ✓":"")+'</span>'+
			'</button>';
		}).join("");

	$("templateHint").textContent=templateLocked?
		"The design cannot be changed after the card is created. You can still change its colour.":
		"Pick how your card will look. The design cannot be changed after the card is created.";

	/* colour choice, once a design is picked */
	if(selectedTemplate){
		const base=DVCT.byId(selectedTemplate).accent;
		const current=selectedAccent||base;
		/* always six colours: the design's own first, then the shared ones */
		const colors=[base].concat(DVCT.accents.filter(c=>c!==base)).slice(0,6);
		const customOn=!colors.includes(current);

		box.innerHTML=
			'<span class="label-text">Accent colour <span class="optional-label">(Optional)</span></span>'+
			'<div class="accent-swatches">'+
			colors.map(c=>
				'<button type="button" class="accent-swatch'+(c===current?" on":"")+'" data-color="'+c+'" style="background:'+c+'" aria-label="Colour '+c+(c===base?" (default)":"")+'"></button>'
			).join("")+
			'<label class="accent-custom'+(customOn?" on":"")+'" title="Custom colour"><input id="accentCustom" type="color" value="'+current+'" aria-label="Pick any colour">'+(customOn?'<span class="accent-dot" style="background:'+current+'"></span>':"")+'</label>'+
			'</div>';
		box.classList.remove("hidden");
	}else{
		box.innerHTML="";
		box.classList.add("hidden");
	}

	/* the preview shows only after a design is chosen */
	const panel=$("previewPanel");

	if(panel)panel.classList.toggle("hidden",!selectedTemplate);

	/* the blurred card on the preview button follows the chosen design */
	const tile=$("previewTile");
	const live=$("previewLive");

	if(tile&&live){
		const ac=DVCT.normalizeAccent(selectedAccent);
		const html=selectedTemplate?DVCT.thumbBack(selectedTemplate,ac):"";

		live.innerHTML=html;
		live.classList.toggle("hidden",!html);
		tile.classList.toggle("has-live",Boolean(html));

		/* classic: recolour the gold stand-in */
		const base=DVCT.byId("classic").accent;
		const color=selectedTemplate==="classic"&&ac&&ac!==base?ac:"";

		tile.style.setProperty("--pva",color||base);
		tile.style.setProperty("--pva2",color?DVCT.lighter(color):"#ffd36a");
	}
}
