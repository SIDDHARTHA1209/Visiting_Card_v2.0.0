/*
  DigiCard card picker: a styled replacement for the native <select>
  (the browser's own list cannot be styled). Used on the home page and the
  card page.

  const picker = CardPicker.create(rootElement, {
    createHref: "create/",      // optional "+ Create new card" row
    onSelect: guid => {...}
  });
  picker.setCards(cards, { fallback: cardRecord });  // fallback = card that is not in the list
  picker.setValue(guid);
*/
var CardPicker=(function(){
  "use strict";

  var STYLE_ID="cardpicker-style";

  var CSS=[
    ".cp{position:relative;width:100%;min-width:0;font-family:inherit}",
    ".cp-trigger{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 14px 8px 10px;border:1px solid #3a3d43;border-radius:14px;background:#202329;color:#fff;cursor:pointer;text-align:left;transition:border-color .2s,box-shadow .2s,background .2s}",
    ".cp-trigger:hover{border-color:#4b4f57;background:#23272e}",
    ".cp-trigger:focus-visible,.cp.open .cp-trigger{outline:none;border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.3)}",
    ".cp-avatar{flex:0 0 auto;display:grid;place-items:center;width:38px;height:38px;border-radius:11px;overflow:hidden;background:linear-gradient(135deg,#0f766e,#0b4f8a);color:#fff;font-size:13px;font-weight:900;letter-spacing:.5px}",
    ".cp-avatar img{width:100%;height:100%;object-fit:cover;display:block;background:#fff}",
    ".cp-logo{background:#fff}",
    ".cp-logo img{object-fit:contain;padding:2px}",
    ".cp-text{flex:1 1 auto;min-width:0;display:grid;gap:2px}",
    ".cp-title{font-size:15px;font-weight:850;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".cp-sub{font-size:12px;color:#9aa0a9;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".cp-chevron{flex:0 0 auto;color:#9aa0a9;transition:transform .2s}",
    ".cp.open .cp-chevron{transform:rotate(180deg)}",
    ".cp-menu{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:80;display:none;padding:8px;border:1px solid #33363c;border-radius:16px;background:#1a1d22;box-shadow:0 22px 50px rgba(0,0,0,.55)}",
    ".cp.open .cp-menu{display:block;animation:cp-pop .14s ease-out}",
    "@keyframes cp-pop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}",
    ".cp-search{width:100%;height:40px;margin-bottom:8px;padding:0 12px;border:1px solid #33363c;border-radius:10px;background:#12141a;color:#fff;font-size:14px;outline:none}",
    ".cp-search:focus{border-color:#0f766e}",
    ".cp-list{margin:0;padding:0;list-style:none;max-height:min(340px,56vh);overflow-y:auto;overscroll-behavior:contain}",
    ".cp-option{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:11px;color:#fff;cursor:pointer}",
    ".cp-option.active{background:#262b33}",
    ".cp-option[aria-selected=true]{background:rgba(15,118,110,.22)}",
    ".cp-option .cp-avatar{width:36px;height:36px}",
    ".cp-badges{flex:0 0 auto;display:flex;align-items:center;gap:8px;color:#d4a72c}",
    ".cp-check{color:#2dd4bf}",
    ".cp-empty{padding:16px 10px;text-align:center;color:#9aa0a9;font-size:13px}",
    ".cp-create{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;padding:11px;border-radius:11px;border:1px dashed #3a3d43;color:#2dd4bf;font-size:13px;font-weight:850;text-decoration:none}",
    ".cp-create:hover{background:rgba(15,118,110,.14);border-color:#0f766e}",
    "@media(max-width:600px){.cp-trigger{min-height:54px}.cp-title{font-size:14px}}",
    "@media(prefers-reduced-motion:reduce){.cp.open .cp-menu{animation:none}.cp-chevron{transition:none}}"
  ].join("\n");

  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;

    var style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=CSS;
    document.head.appendChild(style);
  }

  function esc(value){
    return String(value==null?"":value)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  function initials(value){
    var words=String(value||"").trim().split(/\s+/).filter(Boolean);

    if(!words.length)return"VC";

    return words.length===1
      ?words[0].slice(0,2).toUpperCase()
      :(words[0][0]+words[words.length-1][0]).toUpperCase();
  }

  /* Two lines per card: the owner's card name (bold) and who/what it is */
  function lines(card){
    var cardName=String(card.cardName||"").trim();
    var name=String(card.name||"").trim();
    var detail=String(card.title||card.instituteName||"").trim();

    if(card.__current){
      return{title:name||"This card",sub:"Shared card (not in your list)"};
    }

    if(cardName){
      return{
        title:cardName,
        sub:[name,detail].filter(Boolean).join(" · ")
      };
    }

    return{title:name||"Untitled Card",sub:detail};
  }

  /* Institute letters: "Siddaganga Institute of Technology" -> SIT, "East West College" -> EW */
  function instituteInitials(value){
    var skip={of:1,the:1,and:1,for:1,"&":1,at:1,in:1};
    var generic={college:1,school:1,university:1};
    var words=String(value||"").replace(/[^A-Za-z0-9&\s]/g," ").split(/\s+/).filter(Boolean)
      .filter(function(w){return!skip[w.toLowerCase()];});

    var core=words.filter(function(w){return!generic[w.toLowerCase()];});

    if(core.length>=2)words=core;

    if(!words.length)return"";

    return words.length===1
      ?words[0].slice(0,3).toUpperCase()
      :words.slice(0,3).map(function(w){return w[0];}).join("").toUpperCase();
  }

  /* Dropdown avatar: the institute logo, else the institute letters (never the profile photo) */
  function avatarHtml(card){
    var src=(window.DVC&&DVC.driveImage)?DVC.driveImage(card.logoUrl):"";
    var text=instituteInitials(card.instituteName)||initials(card.name||card.cardName);

    if(!src)return'<span class="cp-avatar">'+esc(text)+"</span>";

    return'<span class="cp-avatar cp-logo"><img src="'+esc(src)+'" alt="" loading="lazy" '+
      "onerror=\"this.parentNode.className='cp-avatar';this.parentNode.textContent='"+esc(text)+"'\"></span>";
  }

  var STAR='<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-label="Favourite"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
  var CHECK='<svg class="cp-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  var CHEVRON='<svg class="cp-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  var counter=0;

  function create(root,options){
    options=options||{};
    injectStyle();

    if(root.__cardPicker)return root.__cardPicker;

    var uid="cp"+(++counter);
    var cards=[];
    var selected="";
    var visible=[];
    var active=-1;

    root.classList.add("cp");

    root.innerHTML=
      '<button type="button" class="cp-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="'+uid+'-list"></button>'+
      '<div class="cp-menu">'+
        '<input type="search" class="cp-search" placeholder="Search your cards" autocomplete="off" aria-label="Search your cards">'+
        '<ul class="cp-list" role="listbox" id="'+uid+'-list"></ul>'+
        (options.createHref?'<a class="cp-create" href="'+esc(options.createHref)+'">+ Create new card</a>':"")+
      "</div>";

    var trigger=root.querySelector(".cp-trigger");
    var menu=root.querySelector(".cp-menu");
    var search=root.querySelector(".cp-search");
    var list=root.querySelector(".cp-list");

    function current(){
      return cards.filter(function(c){return c.guid===selected;})[0]||null;
    }

    function paintTrigger(){
      var card=current();

      if(!card){
        trigger.innerHTML=
          '<span class="cp-avatar">+</span>'+
          '<span class="cp-text"><span class="cp-title">Choose a card</span>'+
          '<span class="cp-sub">'+(cards.length?"Select one of your cards":"No cards yet")+"</span></span>"+CHEVRON;
        return;
      }

      var l=lines(card);

      trigger.innerHTML=
        avatarHtml(card)+
        '<span class="cp-text"><span class="cp-title">'+esc(l.title)+"</span>"+
        (l.sub?'<span class="cp-sub">'+esc(l.sub)+"</span>":"")+"</span>"+CHEVRON;
    }

    function paintList(){
      var q=search.value.trim().toLowerCase();

      visible=cards.filter(function(c){
        var l=lines(c);

        return[l.title,l.sub,c.name,c.title,c.instituteName,c.phone,c.emails]
          .join(" ").toLowerCase().indexOf(q)!==-1;
      });

      if(!visible.length){
        list.innerHTML='<li class="cp-empty">No cards found</li>';
        return;
      }

      list.innerHTML=visible.map(function(c,i){
        var l=lines(c);

        return'<li class="cp-option'+(i===active?" active":"")+'" role="option" id="'+uid+"-o"+i+'" data-guid="'+esc(c.guid)+'" aria-selected="'+(c.guid===selected)+'">'+
          avatarHtml(c)+
          '<span class="cp-text"><span class="cp-title">'+esc(l.title)+"</span>"+
          (l.sub?'<span class="cp-sub">'+esc(l.sub)+"</span>":"")+"</span>"+
          '<span class="cp-badges">'+(c.isFavourite?STAR:"")+(c.guid===selected?CHECK:"")+"</span>"+
        "</li>";
      }).join("");
    }

    function open(){
      if(root.classList.contains("open"))return;

      root.classList.add("open");
      trigger.setAttribute("aria-expanded","true");

      search.style.display=cards.length>5?"":"none";
      search.value="";

      active=Math.max(0,cards.findIndex(function(c){return c.guid===selected;}));
      paintList();

      if(cards.length>5)search.focus();

      var el=list.children[active];
      if(el&&el.scrollIntoView)el.scrollIntoView({block:"nearest"});
    }

    function close(focusTrigger){
      root.classList.remove("open");
      trigger.setAttribute("aria-expanded","false");

      if(focusTrigger)trigger.focus();
    }

    function choose(guid){
      close(true);

      if(guid===selected)return;

      selected=guid;
      paintTrigger();

      if(options.onSelect)options.onSelect(guid);
    }

    function move(delta){
      if(!visible.length)return;

      active=(active+delta+visible.length)%visible.length;
      paintList();

      var el=list.children[active];
      if(el&&el.scrollIntoView)el.scrollIntoView({block:"nearest"});
    }

    trigger.addEventListener("click",function(){
      root.classList.contains("open")?close(false):open();
    });

    trigger.addEventListener("keydown",function(e){
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){
        e.preventDefault();
        open();
      }
    });

    search.addEventListener("input",function(){
      active=0;
      paintList();
    });

    function onKey(e){
      if(e.key==="Escape"){
        e.preventDefault();
        close(true);
      }else if(e.key==="ArrowDown"){
        e.preventDefault();
        move(1);
      }else if(e.key==="ArrowUp"){
        e.preventDefault();
        move(-1);
      }else if(e.key==="Enter"&&root.classList.contains("open")&&visible[active]){
        e.preventDefault();
        choose(visible[active].guid);
      }
    }

    menu.addEventListener("keydown",onKey);
    trigger.addEventListener("keydown",function(e){
      if(root.classList.contains("open"))onKey(e);
    });

    list.addEventListener("click",function(e){
      var option=e.target.closest(".cp-option");

      if(!option)return;

      e.preventDefault();
      choose(option.getAttribute("data-guid"));
    });

    list.addEventListener("mousemove",function(e){
      var option=e.target.closest(".cp-option");

      if(!option)return;

      var index=Array.prototype.indexOf.call(list.children,option);

      if(index!==active){
        var old=list.children[active];

        if(old)old.classList.remove("active");

        active=index;
        option.classList.add("active");
      }
    });

    document.addEventListener("click",function(e){
      if(!root.contains(e.target))close(false);
    });

    var api={
      setCards:function(newCards,opts){
        cards=(newCards||[]).slice();

        /* a card that is open but not owned by this device still gets a row */
        if(opts&&opts.fallback&&!cards.some(function(c){return c.guid===opts.fallback.guid;})){
          cards.unshift(Object.assign({},opts.fallback,{__current:true}));
        }

        if(selected&&!cards.some(function(c){return c.guid===selected;}))selected="";

        paintTrigger();

        if(root.classList.contains("open"))paintList();
      },
      setValue:function(guid){
        selected=guid||"";
        paintTrigger();

        if(root.classList.contains("open"))paintList();
      },
      get value(){return selected;}
    };

    paintTrigger();
    root.__cardPicker=api;

    return api;
  }

  return{create:create};
})();
