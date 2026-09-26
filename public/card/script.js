const CONFIG={
  API_URL:"https://script.google.com/macros/s/AKfycbw2zYfZoJF_g_iD1MkzA8vYU7IP8qltWn7I_ylhA80CyyhioTrop1HKUaWsbV1kHwnM2A/exec"
};

document.addEventListener("DOMContentLoaded",loadCard);

async function loadCard(){
  const guid=new URLSearchParams(location.search).get("guid");
  const app=document.getElementById("app");

  if(!guid){
    showError("Missing card GUID.");
    return;
  }

  try{
    if(
      !CONFIG.API_URL||
      CONFIG.API_URL.includes("YOUR_DEPLOYMENT_ID")
    ){
      throw new Error("API URL is not configured.");
    }

    const response=await fetch(
      CONFIG.API_URL+
      "?action=card&guid="+
      encodeURIComponent(guid),
      {cache:"no-store"}
    );

    const data=await response.json();

    if(!data.success){
      throw new Error(
        data.error||
        "Card not found."
      );
    }

    renderCard(data.record);

  }catch(err){
    showError(
      err.message||
      "Unable to load the card."
    );
  }
}

function renderCard(r){
  const app=document.getElementById("app");

  document.title=
    (r.name||"Digital Visiting Card")+
    " • Digital Card";

  const emails=String(r.emails||"")
    .split(",")
    .map(x=>x.trim())
    .filter(Boolean);

  const customLinks=
    Array.isArray(r.customLinks)?
    r.customLinks:
    parseLinks(r.customLinks);

  const phoneHref=telHref(r.phone);

  const whatsappHref=
    r.whatsapp?
    "https://wa.me/"+digits(r.whatsapp):
    "";

  const website=r.website||"";
  const map=r.locationLink||"";

  app.className="";

  app.innerHTML=`
    <article class="card-shell">

      <div class="cover"></div>

      <section class="identity">

        ${
          r.photoUrl?
          `<img
            class="photo"
            src="${safeAttr(r.photoUrl)}"
            alt="${safeAttr(r.name)}"
          >`:
          `<div class="photo"></div>`
        }

        ${
          r.logoUrl?
          `<img
            class="logo"
            src="${safeAttr(r.logoUrl)}"
            alt="Institute logo"
          >`:
          ""
        }

        <h1>
          ${escapeHtml(r.name)}
        </h1>

        ${
          r.title?
          `<div class="title">
            ${escapeHtml(r.title)}
          </div>`:
          ""
        }

        ${
          r.instituteName?
          `<div class="institute">
            ${escapeHtml(r.instituteName)}
          </div>`:
          ""
        }

        ${
          r.tagline?
          `<p class="tagline">
            ${escapeHtml(r.tagline)}
          </p>`:
          ""
        }

      </section>

      <section class="body">

        ${
          r.companyDescription?
          `
          <div class="company-description">
            <h3>About the Company</h3>
            <p>
              ${escapeHtml(r.companyDescription)}
            </p>
          </div>
          `:
          ""
        }

        <div class="actions">

          ${
            r.phone?
            `<a
              class="action"
              href="${safeAttr(phoneHref)}"
            >Call</a>`:
            ""
          }

          ${
            r.whatsapp?
            `<a
              class="action"
              href="${safeAttr(whatsappHref)}"
              target="_blank"
              rel="noopener"
            >WhatsApp</a>`:
            ""
          }

          ${
            emails[0]?
            `<a
              class="action"
              href="mailto:${safeAttr(emails[0])}"
            >Email</a>`:
            ""
          }

          ${
            website?
            `<a
              class="action"
              href="${safeAttr(website)}"
              target="_blank"
              rel="noopener"
            >Website</a>`:
            ""
          }

          ${
            map?
            `<a
              class="action"
              href="${safeAttr(map)}"
              target="_blank"
              rel="noopener"
            >Maps</a>`:
            ""
          }

          <button
            class="action dark"
            id="saveContact"
          >Save Contact</button>

        </div>

        <div class="details">

          ${
            r.phone?
            detail(
              "Phone",
              `<a
                href="${safeAttr(phoneHref)}"
              >${escapeHtml(r.phone)}</a>`
            ):
            ""
          }

          ${
            r.whatsapp?
            detail(
              "WhatsApp",
              `<a
                href="${safeAttr(whatsappHref)}"
                target="_blank"
                rel="noopener"
              >${escapeHtml(r.whatsapp)}</a>`
            ):
            ""
          }

          ${
            emails.length?
            detail(
              "Email",
              emails
                .map(e=>
                  `<a
                    href="mailto:${safeAttr(e)}"
                  >${escapeHtml(e)}</a>`
                )
                .join("<br>")
            ):
            ""
          }

          ${
            r.website?
            detail(
              "Website",
              `<a
                href="${safeAttr(r.website)}"
                target="_blank"
                rel="noopener"
              >${escapeHtml(r.website)}</a>`
            ):
            ""
          }

          ${
            r.address?
            detail(
              "Address",
              escapeHtml(r.address)
            ):
            ""
          }

          ${
            r.locationLink?
            detail(
              "Location",
              `<a
                href="${safeAttr(r.locationLink)}"
                target="_blank"
                rel="noopener"
              >Open Google Maps</a>`
            ):
            ""
          }

        </div>

        ${
          customLinks.length?
          `
          <div class="custom-links">

            ${
              customLinks
                .map(x=>
                  `<a
                    class="action"
                    href="${safeAttr(x.url)}"
                    target="_blank"
                    rel="noopener"
                  >${escapeHtml(x.label)}</a>`
                )
                .join("")
            }

          </div>
          `:
          ""
        }

        <div class="qr-section">

          <h3>Share this card</h3>

          <div id="qr" class="qr"></div>

          <p
            id="qrUrl"
            class="qr-url"
          ></p>

        </div>

      </section>

    </article>
  `;

  document
    .getElementById("saveContact")
    .addEventListener(
      "click",
      ()=>downloadVCard(r,emails)
    );

  const url=location.href;

  document.getElementById("qrUrl").textContent=url;

  try{
    new QRCode(
      document.getElementById("qr"),
      {
        text:url,
        width:180,
        height:180,
        correctLevel:QRCode.CorrectLevel.M
      }
    );
  }catch(e){}
}

function detail(label,content){
  return `
    <div class="detail">
      <strong>${label}</strong>
      <span>${content}</span>
    </div>
  `;
}

function parseLinks(value){
  try{
    const x=JSON.parse(value||"[]");

    return Array.isArray(x)?
      x:
      [];
  }catch(e){
    return[];
  }
}

function digits(value){
  return String(value||"")
    .replace(/[^\d]/g,"");
}

function telHref(value){
  return "tel:"+
    String(value||"")
      .replace(/[^\d+]/g,"");
}

function validUrl(value){
  try{
    const u=new URL(value);

    return u.protocol==="http:"||
      u.protocol==="https:";
  }catch(e){
    return false;
  }
}

function safeAttr(value){
  return escapeHtml(
    String(value||"")
  ).replace(/'/g,"&#39;");
}

function escapeHtml(value){
  return String(value??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function downloadVCard(r,emails){
  const lines=[
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:"+vcard(r.name),
    "ORG:"+vcard(r.instituteName),
    "TITLE:"+vcard(r.title),
    r.phone?
      "TEL;TYPE=CELL:"+r.phone:
      "",
    r.whatsapp?
      "TEL;TYPE=WORK:"+r.whatsapp:
      "",
    emails[0]?
      "EMAIL;TYPE=INTERNET:"+emails[0]:
      "",
    r.website?
      "URL:"+r.website:
      "",
    r.address?
      "ADR;TYPE=WORK:;;"+
      vcard(r.address)+
      "; ; ;":
      "",
    "END:VCARD"
  ]
  .filter(Boolean)
  .join("\r\n");

  const blob=new Blob(
    [lines+"\r\n"],
    {
      type:"text/vcard;charset=utf-8"
    }
  );

  const a=document.createElement("a");

  a.href=URL.createObjectURL(blob);

  a.download=
    String(r.name||"contact")
      .replace(/[^\w-]+/g,"_")+
    ".vcf";

  a.click();

  setTimeout(
    ()=>URL.revokeObjectURL(a.href),
    1000
  );
}

function vcard(value){
  return String(value||"")
    .replace(/\\/g,"\\\\")
    .replace(/\n/g,"\\n")
    .replace(/;/g,"\\;")
    .replace(/,/g,"\\,");
}

function showError(message){
  document.getElementById("app").className="error";

  document.getElementById("app").innerHTML=`
    <h1>Card unavailable</h1>
    <p>${escapeHtml(message)}</p>
  `;
}
