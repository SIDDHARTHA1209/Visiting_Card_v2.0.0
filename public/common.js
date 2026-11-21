/*
  DigiCard shared helpers (loaded before every page script).

  - One place for the API URL and the public frontend URL.
  - fetch with timeout + one automatic retry (Apps Script cold starts and
    occasional HTML error pages are common).
  - A small localStorage cache so pages can render instantly from the last
    known data and refresh in the background (stale-while-revalidate).
  - Safe localStorage access (private mode / blocked storage never crashes the app).
*/
var DVC=(function(){
  "use strict";

  var API_URL="https://script.google.com/macros/s/AKfycbxypiPlx03NxLC1riLifBALvIWLkrSSnMlkKjUXa5CajVzxVBlpxX0J0d9xGdWBMBAFWw/exec";
  var FRONTEND_BASE_URL="https://siddhartha1209.github.io/Visiting_Card_v2.0.0/";

  /* Folder this file lives in = the app root of whatever server is running it
     (VS Code Live Server /public/, GitHub Pages, Vercel...). */
  var APP_ROOT=(function(){
    try{
      var src=document.currentScript&&document.currentScript.src;

      if(src)return new URL("./",src).href;
    }catch(e){}

    return new URL("./",location.href).href;
  })();

  var IS_LOCAL=/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/
    .test(location.hostname);

  var APP_KEY="digitalVisitingCardAppId";
  var PREFIX="dvc:";
  var memory={};

  /* ---------- safe storage ---------- */

  function lsGet(key){
    try{return localStorage.getItem(key);}catch(e){return memory[key]||null;}
  }

  function lsSet(key,value){
    try{localStorage.setItem(key,value);}catch(e){memory[key]=value;}
  }

  function lsRemove(key){
    try{localStorage.removeItem(key);}catch(e){}
    delete memory[key];
  }

  /* ---------- app id ---------- */

  /* A cookie copy of the id survives a different port (127.0.0.1:5501 vs :5502)
     because cookies are not isolated by port the way localStorage is. */
  var COOKIE_NAME="dvcAppId";

  function readCookie(){
    try{
      var m=document.cookie.match(new RegExp("(?:^|;\\s*)"+COOKIE_NAME+"=([^;]+)"));

      return m?decodeURIComponent(m[1]):"";
    }catch(e){
      return"";
    }
  }

  function writeCookie(id){
    try{
      document.cookie=COOKIE_NAME+"="+encodeURIComponent(id)+
        "; max-age=63072000; path=/; SameSite=Lax"+
        (location.protocol==="https:"?"; Secure":"");
    }catch(e){}
  }

  function validKey(id){
    return/^[A-Za-z0-9_-]{8,80}$/.test(String(id||""));
  }

  function getAppId(){
    var id=lsGet(APP_KEY);

    if(!validKey(id)){
      id=readCookie();
    }

    if(!validKey(id)){
      id=(window.crypto&&typeof window.crypto.randomUUID==="function")
        ?window.crypto.randomUUID()
        :"APP-"+Date.now()+"-"+Math.random().toString(36).slice(2,12);
    }

    /* keep both copies in step */
    if(lsGet(APP_KEY)!==id)lsSet(APP_KEY,id);
    if(readCookie()!==id)writeCookie(id);

    return id;
  }

  /* Link this browser to a Card Key from another device / address.
     Returns true when the key was accepted. */
  function setAppId(id){
    id=String(id||"").trim();

    if(!validKey(id))return false;

    lsSet(APP_KEY,id);
    writeCookie(id);

    /* drop cached cards of the previous key */
    try{
      var remove=[];

      for(var i=0;i<localStorage.length;i++){
        var k=localStorage.key(i);

        if(k&&k.indexOf(PREFIX)===0)remove.push(k);
      }

      remove.forEach(function(k){localStorage.removeItem(k);});
    }catch(e){}

    return true;
  }

  /* Link that opens the home page and adopts this device's Card Key */
  function syncLink(){
    var base=(IS_LOCAL?FRONTEND_BASE_URL:APP_ROOT).replace(/\/+$/,"/");

    return base+"?key="+encodeURIComponent(getAppId());
  }

  /* ---------- cache ---------- */

  function cacheGet(key,maxAgeMs){
    try{
      var raw=lsGet(PREFIX+key);

      if(!raw)return null;

      var item=JSON.parse(raw);

      if(!item||typeof item.t!=="number")return null;

      var age=Date.now()-item.t;

      if(maxAgeMs&&age>maxAgeMs)return null;

      return{data:item.d,age:age};
    }catch(e){
      return null;
    }
  }

  function cacheSet(key,data){
    try{
      lsSet(PREFIX+key,JSON.stringify({t:Date.now(),d:data}));
    }catch(e){}
  }

  function cacheRemove(key){
    lsRemove(PREFIX+key);
  }

  /* ---------- network ---------- */

  function sleep(ms){
    return new Promise(function(resolve){setTimeout(resolve,ms);});
  }

  async function fetchJson(url,options,timeoutMs){
    var controller=("AbortController" in window)?new AbortController():null;
    var timer=controller?setTimeout(function(){controller.abort();},timeoutMs):null;

    try{
      var init=Object.assign({},options||{});

      if(controller)init.signal=controller.signal;

      var response=await fetch(url,init);
      var text=await response.text();
      var data;

      try{
        data=JSON.parse(text);
      }catch(e){
        throw new Error("The server sent an unexpected response. Please try again.");
      }

      return data;
    }catch(error){
      if(error&&error.name==="AbortError"){
        throw new Error("The server took too long to respond. Please try again.");
      }

      if(error instanceof TypeError){
        throw new Error("Network error. Check your connection and try again.");
      }

      throw error;
    }finally{
      if(timer)clearTimeout(timer);
    }
  }

  /* GET (safe to retry) */
  async function get(query,opts){
    opts=opts||{};

    var timeout=opts.timeout||25000;
    var attempts=opts.retries===undefined?2:opts.retries+1;
    var lastError;

    for(var i=0;i<attempts;i++){
      try{
        var data=await fetchJson(API_URL+query,{cache:"no-store"},timeout);

        if(data&&data.success===false){
          var err=new Error(data.error||"Request failed.");
          err.fromServer=true;
          throw err;
        }

        return data;
      }catch(error){
        lastError=error;

        /* a real answer from the server is final; only network problems retry */
        if(error.fromServer)throw error;

        if(i<attempts-1)await sleep(600);
      }
    }

    throw lastError;
  }

  /* POST (never retried automatically: it could create duplicates) */
  async function post(body,opts){
    opts=opts||{};

    var data=await fetchJson(
      API_URL,
      {
        method:"POST",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify(body)
      },
      opts.timeout||60000
    );

    if(!data||data.success===false){
      throw new Error((data&&data.error)||"Request failed.");
    }

    return data;
  }

  /*
    Stale-while-revalidate.
    onData(data,fromCache) is called immediately with cached data (if any) and
    again when fresh data arrives. Resolves with the fresh data.
  */
  async function swr(cacheKey,query,onData,opts){
    opts=opts||{};

    var cached=cacheGet(cacheKey,opts.maxAge||7*24*3600*1000);
    var hadCache=false;

    if(cached){
      hadCache=true;
      try{onData(cached.data,true);}catch(e){console.error(e);}
    }

    try{
      var fresh=await get(query,opts);

      cacheSet(cacheKey,fresh);
      onData(fresh,false);

      return fresh;
    }catch(error){
      /* cached data is already on screen; only surface the error if nothing is */
      if(hadCache){
        console.warn("Background refresh failed:",error.message);
        return cached.data;
      }

      throw error;
    }
  }

  /* ---------- misc helpers ---------- */

  /* Google Drive images: the thumbnail endpoint is the one that keeps working. */
  function driveImage(url){
    var value=String(url||"").trim();

    if(!value)return"";

    var match=value.match(/[?&]id=([^&]+)/i)||value.match(/\/d\/([^/?]+)/i);

    if(match&&match[1]&&value.indexOf("drive.google.com")!==-1){
      return"https://drive.google.com/thumbnail?id="+
        encodeURIComponent(match[1])+"&sz=w800";
    }

    return value;
  }

  function escapeHtml(value){
    return String(value==null?"":value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  /* Shareable link (QR codes, WhatsApp text, copy). It must work on other
     people's phones, so while testing locally it uses the public site. */
  function cardUrl(guid){
    var base=IS_LOCAL?FRONTEND_BASE_URL:APP_ROOT;

    return base.replace(/\/+$/,"/")+
      "card/?guid="+encodeURIComponent(guid);
  }

  /* In-app navigation (buttons/links) always stays on the server you are using */
  function localCardUrl(guid){
    return APP_ROOT+"card/?guid="+encodeURIComponent(guid);
  }

  /* Name shown in lists: the owner's card name first, then the person's name */
  function cardLabel(card){
    var label=String(card.cardName||"").trim();
    var name=String(card.name||"").trim();

    if(label&&name&&label.toLowerCase()!==name.toLowerCase()){
      return label+" — "+name;
    }

    return label||name||"Untitled Card";
  }

  /* Run fn once the QR library (loaded async from a CDN) is available */
  function whenQr(fn){
    if(typeof QRCode!=="undefined"){
      fn();
      return;
    }

    window.addEventListener("qrlib",function handler(){
      window.removeEventListener("qrlib",handler);
      fn();
    });
  }

  /* Cards cache shared by home / saved / responses / card pages */
  function cardsKey(appId){
    return"cards:"+appId;
  }

  function cacheCardsUpdate(appId,mutator){
    var cached=cacheGet(cardsKey(appId));

    if(!cached||!cached.data||!Array.isArray(cached.data.cards))return;

    var data=cached.data;

    data.cards=mutator(data.cards.slice())||data.cards;
    data.count=data.cards.length;

    cacheSet(cardsKey(appId),data);
  }

  /* ---------- local card folders ----------
     storedCards/<guid> : cards created on this device
     savedCards/<guid>  : cards other people shared and this user saved
     (localStorage has no real folders, so the folder is the key prefix) */

  function makeStore(dir){
    var store={
      get:function(guid){
        try{
          var raw=lsGet(dir+guid);

          return raw?JSON.parse(raw):null;
        }catch(e){
          return null;
        }
      },

      /* value = { guid, record, owned, appId, savedAt } */
      set:function(guid,record,meta){
        if(!guid||!record)return;

        var old=store.get(guid)||{};
        var m=meta||{};

        try{
          lsSet(dir+guid,JSON.stringify({
            guid:guid,
            record:record,
            owned:m.owned!==undefined?!!m.owned:!!old.owned,
            appId:m.appId||old.appId||"",
            savedAt:old.savedAt&&m.keepTime?old.savedAt:Date.now()
          }));
        }catch(e){}
      },

      has:function(guid){
        return !!store.get(guid);
      },

      remove:function(guid){
        lsRemove(dir+guid);
      },

      guids:function(){
        var out=[];

        try{
          for(var i=0;i<localStorage.length;i++){
            var k=localStorage.key(i);

            if(k&&k.indexOf(dir)===0)out.push(k.slice(dir.length));
          }
        }catch(e){}

        return out;
      },

      all:function(){
        return store.guids()
          .map(store.get)
          .filter(Boolean)
          .sort(function(a,b){return(b.savedAt||0)-(a.savedAt||0);});
      },

      owned:function(appId){
        return store.all().filter(function(x){return x.owned&&x.appId===appId;});
      }
    };

    return store;
  }

  var storedCards=makeStore("storedCards/");
  var savedCards=makeStore("savedCards/");

  return{
    storedCards:storedCards,
    savedCards:savedCards,
    API_URL:API_URL,
    FRONTEND_BASE_URL:FRONTEND_BASE_URL,
    APP_KEY:APP_KEY,
    getAppId:getAppId,
    setAppId:setAppId,
    syncLink:syncLink,
    validKey:validKey,
    lsGet:lsGet,
    lsSet:lsSet,
    lsRemove:lsRemove,
    cacheGet:cacheGet,
    cacheSet:cacheSet,
    cacheRemove:cacheRemove,
    get:get,
    post:post,
    swr:swr,
    driveImage:driveImage,
    escapeHtml:escapeHtml,
    cardUrl:cardUrl,
    localCardUrl:localCardUrl,
    APP_ROOT:APP_ROOT,
    IS_LOCAL:IS_LOCAL,
    cardLabel:cardLabel,
    whenQr:whenQr,
    cardsKey:cardsKey,
    cacheCardsUpdate:cacheCardsUpdate
  };
})();
