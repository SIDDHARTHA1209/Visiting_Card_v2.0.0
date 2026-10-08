const CONFIG={
  API_URL:"https://script.google.com/macros/s/AKfycbz5gpC6_-LX0Q4E1r-DTkIVilTLZgoENzrJlzEvx9iY-dxACnGqPZLelcqkxETA-NcWhA/exec",
  FRONTEND_BASE_URL:"https://siddhartha1209.github.io/Visiting_Card_v2.0.0/"
};

let currentCard=null;
let savedCards=[];
let flipped=false;

const $=id=>document.getElementById(id);

document.addEventListener(
  "DOMContentLoaded",
  loadCard
);

async function loadCard(){

  const guid=
    new URLSearchParams(
      location.search
    ).get("guid");

  if(!guid){
    showError(
      "Missing card GUID."
    );
    return;
  }

  try{

    const data=
      await api(
        "?action=card&guid="+
        encodeURIComponent(guid)
      );

    if(
      !data.success||
      !data.record
    ){
      throw new Error(
        data.error||
        "Card not found."
      );
    }

    currentCard=
      data.record;

    renderCard();

    loadOwnedCards(guid);

  }catch(error){

    showError(
      error.message||
      "Unable to load card."
    );
  }
}

async function loadOwnedCards(
  currentGuid
){

  const appId=
    localStorage.getItem(
      "digitalVisitingCardAppId"
    );

  if(!appId)return;

  try{

    const data=
      await api(
        "?action=ownedcards&appId="+
        encodeURIComponent(appId)
      );

    savedCards=
      Array.isArray(data.cards)?
      data.cards:
      [];

    const select=
      $("cardSelect");

    if(!select)return;

    select.innerHTML=
      savedCards.map(
        card=>`
          <option
            value="${safeAttr(card.guid)}"
          >
            ${escapeHtml(
              card.name||
              "Untitled Card"
            )}
            ${
              card.title?
              " — "+
              escapeHtml(
                card.title
              ):
              ""
            }
          </option>
        `
      ).join("");

    if(
      !savedCards.some(
        card=>
          card.guid===
          currentGuid
      )
    ){

      select.insertAdjacentHTML(
        "afterbegin",
        `
          <option
            value="${safeAttr(currentGuid)}"
          >
            Current Card —
            ${escapeHtml(
              currentCard.name||
              "Card"
            )}
          </option>
        `
      );
    }

    select.value=
      currentGuid;

    $("cardSelector")
      .classList
      .remove("hidden");

  }catch(error){}
}

async function api(query){

  const response=
    await fetch(
      CONFIG.API_URL+
      query,
      {
        cache:"no-store"
      }
    );

  const data=
    await response.json();

  if(
    !response.ok||
    data.success===false
  ){
    throw new Error(
      data.error||
      "API request failed."
    );
  }

  return data;
}

function renderCard(){

  const r=
    currentCard;

  const emails=
    String(r.emails||"")
      .split(",")
      .map(
        x=>x.trim()
      )
      .filter(Boolean);

  const links=
    Array.isArray(
      r.customLinks
    )?
    r.customLinks:
    parseLinks(
      r.customLinks
    );

  const logo=
    driveImageUrl(
      r.logoUrl
    );

  const photo=
    driveImageUrl(
      r.photoUrl
    );

  const website=
    r.website?
    normalizeWebsite(
      r.website
    ):
    "";

  const description=
    r.companyDescription||
    r.description||
    "Connect with this card owner.";

  document.title=
    (
      r.name||
      "Digital Visiting Card"
    )+
    " • Digital Card";

  $("app").className=
    "card-page";

  $("app").innerHTML=`

    <header class="page-header">

      <a
        class="home-link"
        href="../"
      >
        ⌂ Home
      </a>

      <div
        id="cardSelector"
        class="card-selector hidden"
      >

        <label
          for="cardSelect"
        >
          Select Card
        </label>

        <select
          id="cardSelect"
        ></select>

      </div>

      <a
        class="create-card"
        href="../create/"
      >
        Create Card
      </a>

    </header>

    <section class="viewer-shell">

      <p class="flip-hint">
        Tap the card to view the back side
      </p>

      <div
        id="cardStage"
        class="card-stage"
        tabindex="0"
        role="button"
        aria-label="Flip digital visiting card"
      >

        <div
          id="cardInner"
          class="card-inner"
        >

          <!-- FRONT -->

          <article
            class="visiting-card card-front"
          >

            <div class="front-navy"></div>
            <div class="front-gold"></div>

            <div class="front-logo">

              ${
                logo?

                `
                  <img
                    src="${safeAttr(logo)}"
                    alt="Institute logo"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"
                  >

                  <div
                    class="front-logo-fallback"
                    style="display:none"
                  >
                    ${escapeHtml(
                      initials(
                        r.instituteName||
                        r.name
                      )
                    )}
                  </div>
                `

                :

                `
                  <div
                    class="front-logo-fallback"
                  >
                    ${escapeHtml(
                      initials(
                        r.instituteName||
                        r.name
                      )
                    )}
                  </div>
                `
              }

            </div>

            ${
              r.instituteName?

              `
                <div class="front-institute">
                  ${escapeHtml(
                    r.instituteName
                  )}
                </div>
              `

              :

              ""
            }

            <div class="front-person">

              <h1>
                ${escapeHtml(
                  r.name||
                  "Your Name"
                )}
              </h1>

              ${
                r.title?

                `
                  <p>
                    ${escapeHtml(
                      r.title
                    )}
                  </p>
                `

                :

                ""
              }

            </div>

            ${
              photo?

              `
                <img
                  class="front-profile"
                  src="${safeAttr(photo)}"
                  alt=""
                  onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"
                >

                <div
                  class="front-profile-fallback"
                  style="display:none"
                >
                  ${escapeHtml(
                    initials(r.name)
                  )}
                </div>
              `

              :

              `
                <div
                  class="front-profile-fallback"
                >
                  ${escapeHtml(
                    initials(r.name)
                  )}
                </div>
              `
            }

            <div class="front-bottom">

              ${
                r.website?

                `
                  <span>
                    ${escapeHtml(
                      r.website
                    )}
                  </span>
                `

                :

                `
                  <span>
                    DIGITAL CARD
                  </span>
                `
              }

              ${
                r.phone?

                `
                  <div
                    class="front-divider"
                  ></div>

                  <span>
                    ${escapeHtml(
                      r.phone
                    )}
                  </span>
                `

                :

                ""
              }

            </div>

          </article>

          <!-- BACK -->

          <article
            class="visiting-card card-back"
          >

            <div class="back-gold"></div>

            <div class="back-name">

              <h2>
                ${escapeHtml(
                  r.name||
                  "Your Name"
                )}
              </h2>

              ${
                r.title?

                `
                  <p>
                    ${escapeHtml(
                      r.title
                    )}
                  </p>
                `

                :

                ""
              }

            </div>

            <button
              id="responseQr"
              class="back-qr"
              type="button"
              aria-label="Open viewer response form"
            >

              <span
                id="responseQrCode"
                class="qr"
              ></span>

            </button>

            <div class="back-contact">

              ${
                r.instituteName?

                `
                  <h3>
                    ${escapeHtml(
                      r.instituteName
                    )}
                  </h3>
                `

                :

                ""
              }

              <p>

                ${
                  r.address?

                  `
                    ${escapeHtml(
                      r.address
                    )}
                    <br>
                  `

                  :

                  ""
                }

                ${
                  r.phone?

                  `
                    ${escapeHtml(
                      r.phone
                    )}
                    <br>
                  `

                  :

                  ""
                }

                ${
                  emails.length?

                  `
                    ${escapeHtml(
                      emails[0]
                    )}
                    <br>
                  `

                  :

                  ""
                }

                ${
                  r.website?

                  `
                    <a
                      href="${safeAttr(
                        website
                      )}"
                      target="_blank"
                      rel="noopener"
                    >
                      ${escapeHtml(
                        r.website
                      )}
                    </a>
                  `

                  :

                  ""
                }

              </p>

            </div>

            <div class="back-gold-bottom">

              <span>
                DIGITAL
              </span>

              <span>|</span>

              <span>
                CONNECT
              </span>

              <span>|</span>

              <span>
                SHARE
              </span>

            </div>

          </article>

        </div>

      </div>

      <div class="social-actions">

        ${
          r.phone?

          actionLink(
            "phone",
            telHref(r.phone),
            "Call"
          ):

          ""
        }

        ${
          r.whatsapp?

          actionLink(
            "whatsapp",
            "https://wa.me/"+
            digits(r.whatsapp),
            "WhatsApp"
          ):

          ""
        }

        ${
          emails.length?

          actionLink(
            "email",
            emails.length>1?
            "#":
            "mailto:"+
            emails[0],
            "Email"
          ):

          ""
        }

        ${
          website?

          actionLink(
            "website",
            website,
            "Website"
          ):

          ""
        }

        ${
          r.locationLink?

          actionLink(
            "map",
            directionsUrl(
              r.locationLink
            ),
            "Maps"
          ):

          ""
        }

        ${
          links.length?

          actionLink(
            "more",
            "#",
            "More"
          ):

          ""
        }

      </div>

      <div class="main-actions">

        <button
          id="saveCard"
          class="main-action"
          type="button"
        >
          ${icon("bookmark")}
          <span>Save Card</span>
        </button>

        <button
          id="shareCard"
          class="main-action"
          type="button"
        >
          ${icon("share")}
          <span>Share Card</span>
        </button>

      </div>

      <button
        id="saveContact"
        class="contact-action"
        type="button"
      >
        ${icon("contact")}
        <span>Save Contact</span>
      </button>

    </section>

    ${
      emails.length>1?

      `
        <div
          id="emailPicker"
          class="modal hidden"
        >

          <div class="modal-box">

            <h3>
              Select email
            </h3>

            ${
              emails.map(
                email=>`
                  <a
                    href="mailto:${safeAttr(email)}"
                  >
                    ${escapeHtml(
                      email
                    )}
                  </a>
                `
              ).join("")
            }

            <button
              id="closeEmailPicker"
              type="button"
            >
              Close
            </button>

          </div>

        </div>
      `:

      ""
    }

    ${
      links.length?

      `
        <div
          id="linksPicker"
          class="modal hidden"
        >

          <div class="modal-box">

            <h3>
              Select link
            </h3>

            ${
              links.map(
                link=>`

                  <a
                    href="${safeAttr(
                      normalizeWebsite(
                        link.url||
                        "#"
                      )
                    )}"
                    target="_blank"
                    rel="noopener"
                  >
                    ${escapeHtml(
                      link.label||
                      link.url||
                      "Link"
                    )}
                  </a>

                `
              ).join("")
            }

            <button
              id="closeLinksPicker"
              type="button"
            >
              Close
            </button>

          </div>

        </div>
      `:

      ""
    }
  `;

  setupInteractions();

  renderResponseQr(
    r.guid
  );
}

function setupInteractions(){

  const stage=
    $("cardStage");

  const select=
    $("cardSelect");

  stage.addEventListener(
    "click",
    event=>{

      if(
        event.target.closest(
          "a,button,select,input"
        )
      ){
        return;
      }

      flipCard();
    }
  );

  stage.addEventListener(
    "keydown",
    event=>{

      if(
        event.key==="Enter"||
        event.key===" "
      ){

        event.preventDefault();

        flipCard();
      }
    }
  );

  select?.addEventListener(
    "change",
    ()=>{

      if(select.value){

        location.href=
          "?guid="+
          encodeURIComponent(
            select.value
          );
      }
    }
  );

  document
    .querySelectorAll(
      '.social-action[aria-label="Email"]'
    )
    .forEach(
      button=>{

        button.addEventListener(
          "click",
          event=>{

            if(
              button.getAttribute(
                "href"
              )==="#"
            ){

              event.preventDefault();

              $("emailPicker")
                ?.classList
                .remove(
                  "hidden"
                );
            }
          }
        );
      }
    );

  document
    .querySelectorAll(
      '.social-action[aria-label="More"]'
    )
    .forEach(
      button=>{

        button.addEventListener(
          "click",
          event=>{

            event.preventDefault();

            $("linksPicker")
              ?.classList
              .remove(
                "hidden"
              );
          }
        );
      }
    );

  $("closeEmailPicker")
    ?.addEventListener(
      "click",
      ()=>
        $("emailPicker")
          ?.classList
          .add("hidden")
    );

  $("closeLinksPicker")
    ?.addEventListener(
      "click",
      ()=>
        $("linksPicker")
          ?.classList
          .add("hidden")
    );

  document
    .querySelectorAll(".modal")
    .forEach(
      modal=>{

        modal.addEventListener(
          "click",
          event=>{

            if(
              event.target===
              modal
            ){
              modal.classList.add(
                "hidden"
              );
            }

          }
        );

      }
    );

  $("responseQr")
    ?.addEventListener(
      "click",
      event=>{

        event.stopPropagation();

        location.href=
          CONFIG.FRONTEND_BASE_URL+
          "viewer/?guid="+
          encodeURIComponent(
            currentCard.guid
          );
      }
    );

  $("shareCard")
    ?.addEventListener(
      "click",
      shareCard
    );

  $("saveContact")
    ?.addEventListener(
      "click",
      ()=>
        downloadVCard(
          currentCard
        )
    );

  $("saveCard")
    ?.addEventListener(
      "click",
      saveCardLocally
    );
}

function flipCard(){

  flipped=!flipped;

  $("cardInner")
    ?.classList
    .toggle(
      "flipped",
      flipped
    );
}

function renderResponseQr(
  guid
){

  const qr=
    $("responseQrCode");

  if(
    !qr||
    !guid||
    typeof QRCode===
    "undefined"
  ){
    return;
  }

  qr.innerHTML="";

  new QRCode(
    qr,
    {
      text:
        CONFIG.FRONTEND_BASE_URL+
        "viewer/?guid="+
        encodeURIComponent(
          guid
        ),

      width:160,
      height:160,

      colorDark:"#062442",
      colorLight:"#ffffff",

      correctLevel:
        QRCode.CorrectLevel.H
    }
  );
}

async function shareCard(){

  try{

    if(
      navigator.share
    ){

      await navigator.share({
        title:
          currentCard.name||
          "Digital Visiting Card",

        text:
          "Digital visiting card of "+
          (
            currentCard.name||
            "this person"
          ),

        url:location.href
      });

      return;
    }

    await navigator.clipboard.writeText(
      location.href
    );

    showToast(
      "Card link copied."
    );

  }catch(error){

    if(
      error.name!=="AbortError"
    ){

      showToast(
        "Unable to share card.",
        true
      );
    }
  }
}

function saveCardLocally(){

  const key=
    "digitalVisitingSavedCards";

  let cards=[];

  try{

    cards=
      JSON.parse(
        localStorage.getItem(
          key
        )||
        "[]"
      );

  }catch(error){}

  if(
    !Array.isArray(cards)
  ){
    cards=[];
  }

  if(
    !cards.some(
      card=>
        card.guid===
        currentCard.guid
    )
  ){

    cards.push({
      guid:
        currentCard.guid,

      name:
        currentCard.name||
        "",

      savedAt:
        new Date().toISOString()
    });

    localStorage.setItem(
      key,
      JSON.stringify(cards)
    );

    showToast(
      "Card saved."
    );

  }else{

    showToast(
      "Card is already saved."
    );
  }
}

function downloadVCard(
  card
){

  const name=
    String(
      card.name||
      "Contact"
    )
    .replace(
      /[^\w\s.-]/g,
      ""
    )
    .trim()||
    "Contact";

  const lines=[
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:"+
      escapeVCard(
        card.name||
        ""
      ),
    "TITLE:"+
      escapeVCard(
        card.title||
        ""
      )
  ];

  if(card.phone){

    lines.push(
      "TEL;TYPE=CELL:"+
      escapeVCard(
        card.phone
      )
    );
  }

  if(card.whatsapp){

    lines.push(
      "TEL;TYPE=WORK:"+
      escapeVCard(
        card.whatsapp
      )
    );
  }

  String(
    card.emails||
    ""
  )
  .split(",")
  .map(
    x=>x.trim()
  )
  .filter(Boolean)
  .forEach(
    email=>{
      lines.push(
        "EMAIL:"+
        escapeVCard(
          email
        )
      );
    }
  );

  if(card.website){

    lines.push(
      "URL:"+
      escapeVCard(
        card.website
      )
    );
  }

  if(card.address){

    lines.push(
      "ADR:;;"+
      escapeVCard(
        card.address
      )
    );
  }

  if(card.instituteName){

    lines.push(
      "ORG:"+
      escapeVCard(
        card.instituteName
      )
    );
  }

  lines.push(
    "END:VCARD"
  );

  const url=
    URL.createObjectURL(
      new Blob(
        [
          lines.join(
            "\r\n"
          )
        ],
        {
          type:
            "text/vcard;charset=utf-8"
        }
      )
    );

  const link=
    document.createElement(
      "a"
    );

  link.href=url;

  link.download=
    name+".vcf";

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  setTimeout(
    ()=>
      URL.revokeObjectURL(
        url
      ),
    1000
  );
}

function escapeVCard(
  value
){

  return String(
    value||
    ""
  )
  .replace(
    /\\/g,
    "\\\\"
  )
  .replace(
    /\n/g,
    "\\n"
  )
  .replace(
    /;/g,
    "\\;"
  )
  .replace(
    /,/g,
    "\\,"
  );
}

function driveImageUrl(
  value
){

  const url=
    String(
      value||
      ""
    ).trim();

  if(!url){
    return "";
  }

  const match=
    url.match(
      /[?&]id=([^&]+)/i
    )||
    url.match(
      /\/d\/([^/]+)/i
    );

  if(
    match&&
    match[1]&&
    url.includes(
      "drive.google.com"
    )
  ){

    return(
      "https://drive.google.com/thumbnail?id="+
      encodeURIComponent(
        match[1]
      )+
      "&sz=w1200"
    );
  }

  return url;
}

function directionsUrl(
  value
){

  try{

    const url=
      new URL(
        String(value||"")
      );

    const query=
      url.searchParams.get(
        "query"
      )||
      url.searchParams.get(
        "q"
      );

    return query?

      "https://www.google.com/maps/dir/?api=1&destination="+
      encodeURIComponent(
        query
      ):

      String(value||"");

  }catch(error){

    return String(
      value||
      ""
    );
  }
}

function normalizeWebsite(
  value
){

  let v=
    String(
      value||
      ""
    )
    .trim()
    .replace(
      /^(https?:\/\/)+/i,
      "https://"
    );

  return(
    v&&
    !/^https?:\/\//i.test(v)
  )?

    "https://"+
    v:

    v;
}

function telHref(
  value
){

  return(
    "tel:"+
    String(
      value||
      ""
    )
    .replace(
      /[^\d+]/g,
      ""
    )
  );
}

function digits(
  value
){

  return String(
    value||
    ""
  ).replace(
    /\D/g,
    ""
  );
}

function parseLinks(
  value
){

  if(
    Array.isArray(value)
  ){
    return value;
  }

  if(!value){
    return[];
  }

  try{

    const parsed=
      JSON.parse(
        value
      );

    return Array.isArray(
      parsed
    )?
      parsed:
      [];

  }catch(error){

    return[];
  }
}

function initials(
  name
){

  const words=
    String(
      name||
      ""
    )
    .trim()
    .split(
      /\s+/
    )
    .filter(Boolean);

  if(!words.length){
    return"VC";
  }

  return words.length===1?

    words[0]
      .slice(0,2)
      .toUpperCase():

    (
      words[0][0]+
      words.at(-1)[0]
    ).toUpperCase();
}

function actionLink(
  type,
  url,
  label
){

  return`
    <a
      class="social-action"
      href="${safeAttr(url)}"
      aria-label="${safeAttr(label)}"
      title="${safeAttr(label)}"
    >
      ${icon(type)}
    </a>
  `;
}

function icon(
  type
){

  const icons={

    phone:`
      <svg viewBox="0 0 24 24">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 5.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L9 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/>
      </svg>
    `,

    whatsapp:`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9"/>
        <path d="M8.5 8.5c.4-.7 1-.7 1.4-.2l1 1.4c.3.4.2.8-.1 1.1l-.5.5c.8 1.4 1.8 2.4 3.2 3.2l.5-.5c.3-.3.7-.4 1.1-.1l1.4 1c.5.4.5 1 .2 1.4-.4.6-1.1.9-1.8.8-3.9-.6-7.2-3.9-7.8-7.8-.1-.7.2-1.4.8-1.8z"/>
      </svg>
    `,

    email:`
      <svg viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <path d="m3 7 9 6 9-6"/>
      </svg>
    `,

    website:`
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9"/>
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
      </svg>
    `,

    map:`
      <svg viewBox="0 0 24 24">
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/>
        <circle cx="12" cy="10" r="2.5"/>
      </svg>
    `,

    more:`
      <svg viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="1.5"/>
        <circle cx="12" cy="12" r="1.5"/>
        <circle cx="19" cy="12" r="1.5"/>
      </svg>
    `,

    bookmark:`
      <svg viewBox="0 0 24 24">
        <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-3-6 3z"/>
      </svg>
    `,

    share:`
      <svg viewBox="0 0 24 24">
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
      </svg>
    `,

    contact:`
      <svg viewBox="0 0 24 24">
        <circle cx="9" cy="8" r="3"/>
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 8h4M17 12h4M17 16h4"/>
      </svg>
    `
  };

  return(
    icons[type]||
    ""
  );
}

function escapeHtml(
  value
){

  return String(
    value??
    ""
  )
  .replace(
    /&/g,
    "&amp;"
  )
  .replace(
    /</g,
    "&lt;"
  )
  .replace(
    />/g,
    "&gt;"
  )
  .replace(
    /"/g,
    "&quot;"
  )
  .replace(
    /'/g,
    "&#039;"
  );
}

function safeAttr(
  value
){

  return escapeHtml(
    value
  );
}

function showToast(
  message,
  error=false
){

  const toast=
    $("toast");

  toast.textContent=
    message;

  toast.className=
    "toast show"+
    (
      error?
      " error":
      ""
    );

  clearTimeout(
    showToast.timer
  );

  showToast.timer=
    setTimeout(
      ()=>
        toast.className=
          "toast",
      2600
    );
}

function showError(
  message
){

  $("app").className=
    "error-page";

  $("app").innerHTML=`

    <div class="error-box">

      <a
        class="home-link"
        href="../"
      >
        ⌂ Home
      </a>

      <h1>
        Unable to load card
      </h1>

      <p>
        ${escapeHtml(
          message||
          "Something went wrong."
        )}
      </p>

    </div>

  `;
}
