const CONFIG={
  SPREADSHEET_ID:"1qSvVyxwHFVfJCtc2cZXHYiCbmk_NjRZqBeUZkJ6O9OA",
  SHEET_NAME:"Cards",
  DRIVE_FOLDER_ID:"1nBH0EkyB4_Dj0LLEkYne-YdP4iJkABVo",
  FRONTEND_BASE_URL:"https://YOUR-FRONTEND-DOMAIN/",
  MAX_INLINE_IMAGE_BYTES:180000,
  MAX_UPLOAD_BYTES:9000000,
  CACHE_SECONDS:21600,
  HEADER_CACHE_SECONDS:3600
};

const HEADERS=[
  "guid","name","title","instituteName","tagline","address","website","phone",
  "whatsapp","emails","logoUrl","photoUrl","locationLink","customLinks","createdAt"
];

function doGet(e){
  try{
    const p=e&&e.parameter?e.parameter:{};
    const action=String(p.action||"health").toLowerCase();
    if(action==="card")return json_(getCard_(p.guid));
    if(action==="health")return json_({success:true,status:"ok",timestamp:new Date().toISOString()});
    return json_({success:true,message:"Digital Visiting Card API",actions:["submit","card","health"]});
  }catch(err){
    return json_({success:false,error:safeError_(err)});
  }
}

function doPost(e){
  try{
    const body=parseBody_(e);
    if(String(body.action||"").toLowerCase()!=="submit"){
      return json_({success:false,error:"Unsupported action."});
    }
    return json_(submitCard_(body));
  }catch(err){
    return json_({success:false,error:safeError_(err)});
  }
}

function submitCard_(p){
  const errors=validatePayload_(p);
  if(errors.length)throw new Error(errors.join(" "));
  const sheet=getSheet_();
  const guid=Utilities.getUuid();
  const imageResults={
    logoUrl:handleImage_(p.logoImage,"logo",guid),
    photoUrl:handleImage_(p.photoImage,"photo",guid)
  };
  const customLinks=normalizeCustomLinks_(p.customLinks);
  const createdAt=new Date().toISOString();
  const record={
    guid:guid,
    name:clean_(p.name),
    title:clean_(p.title),
    instituteName:clean_(p.instituteName),
    tagline:clean_(p.tagline),
    address:clean_(p.address),
    website:normalizeUrl_(p.website),
    phone:clean_(p.phone),
    whatsapp:clean_(p.whatsapp),
    emails:clean_(p.emails),
    logoUrl:imageResults.logoUrl,
    photoUrl:imageResults.photoUrl,
    locationLink:normalizeUrl_(p.locationLink),
    customLinks:JSON.stringify(customLinks),
    createdAt:createdAt
  };
  sheet.appendRow(HEADERS.map(function(h){return record[h]||"";}));
  CacheService.getScriptCache().put("card:"+guid,JSON.stringify(record),CONFIG.CACHE_SECONDS);
  const cardUrl=buildCardUrl_(guid);
  sendWelcomeEmail_(record,cardUrl);
  return {success:true,guid:guid,cardUrl:cardUrl,record:record};
}

function getCard_(guid){
  guid=String(guid||"").trim();
  if(!guid)return {success:false,status:400,error:"GUID is required."};
  const cache=CacheService.getScriptCache();
  const cached=cache.get("card:"+guid);
  if(cached){
    return {success:true,record:JSON.parse(cached)};
  }
  const sheet=getSheet_();
  const values=sheet.getDataRange().getValues();
  if(values.length<2)return {success:false,status:404,error:"Card not found."};
  const guidIndex=HEADERS.indexOf("guid");
  for(let i=1;i<values.length;i++){
    if(String(values[i][guidIndex])===guid){
      const record=rowToRecord_(values[i]);
      cache.put("card:"+guid,JSON.stringify(record),CONFIG.CACHE_SECONDS);
      return {success:true,record:record};
    }
  }
  return {success:false,status:404,error:"Card not found."};
}

function getSheet_(){
  if(!CONFIG.SPREADSHEET_ID||CONFIG.SPREADSHEET_ID==="YOUR_SPREADSHEET_ID"){
    throw new Error("Google Sheet ID is not configured.");
  }
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.SHEET_NAME);
  if(!sheet)sheet=ss.insertSheet(CONFIG.SHEET_NAME);
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet){
  const cache=CacheService.getScriptCache();
  if(cache.get("headers:"+sheet.getSheetId()))return;
  const range=sheet.getRange(1,1,1,HEADERS.length);
  const current=range.getValues()[0];
  let matches=true;
  for(let i=0;i<HEADERS.length;i++){
    if(String(current[i]||"")!==HEADERS[i]){matches=false;break;}
  }
  if(!matches){
    if(sheet.getLastRow()===0||sheet.getLastRow()===1){
      range.setValues([HEADERS]);
    }else{
      const first=sheet.getRange(1,1,1,HEADERS.length).getValues()[0];
      const blank=first.every(function(v){return String(v||"").trim()==="";});
      if(blank)range.setValues([HEADERS]);
      else throw new Error("Sheet header row does not match the required schema.");
    }
  }
  cache.put("headers:"+sheet.getSheetId(),"1",CONFIG.HEADER_CACHE_SECONDS);
}

function rowToRecord_(row){
  const record={};
  HEADERS.forEach(function(h,i){record[h]=row[i]===undefined?"":String(row[i]);});
  try{
    record.customLinks=JSON.parse(record.customLinks||"[]");
  }catch(e){
    record.customLinks=[];
  }
  return record;
}

function parseBody_(e){
  if(!e||!e.postData||!e.postData.contents)throw new Error("Empty request body.");
  const raw=e.postData.contents;
  try{return JSON.parse(raw);}
  catch(err){throw new Error("Invalid JSON payload.");}
}

function validatePayload_(p){
  const errors=[];
  if(!clean_(p.name))errors.push("Full name is required.");
  if(!clean_(p.phone))errors.push("Phone number is required.");
  if(p.website&&!isValidUrl_(p.website))errors.push("Website URL is invalid.");
  if(p.locationLink&&!isValidUrl_(p.locationLink))errors.push("Location URL is invalid.");
  if(p.customLinks){
    try{normalizeCustomLinks_(p.customLinks);}
    catch(err){errors.push(err.message);}
  }
  ["logoImage","photoImage"].forEach(function(key){
    const image=p[key];
    if(image&&image.data){
      const approx=Math.ceil(String(image.data).length*0.75);
      if(approx>CONFIG.MAX_UPLOAD_BYTES)errors.push(key+" exceeds the upload limit.");
      if(!String(image.type||"").toLowerCase().startsWith("image/"))errors.push(key+" is not an image.");
    }
  });
  return errors;
}

function handleImage_(image,kind,guid){
  if(!image||!image.data)return "";
  const data=String(image.data);
  const comma=data.indexOf(",");
  const meta=comma>0?data.substring(0,comma):"";
  const encoded=comma>0?data.substring(comma+1):data;
  const bytes=Utilities.base64Decode(encoded);
  if(bytes.length>CONFIG.MAX_UPLOAD_BYTES)throw new Error(kind+" image is too large.");
  if(bytes.length<=CONFIG.MAX_INLINE_IMAGE_BYTES)return data;
  if(!CONFIG.DRIVE_FOLDER_ID||CONFIG.DRIVE_FOLDER_ID==="YOUR_DRIVE_FOLDER_ID"){
    throw new Error(kind+" image requires Drive fallback, but DRIVE_FOLDER_ID is not configured.");
  }
  const mime=String(image.type||"image/jpeg");
  const ext=extensionForMime_(mime);
  const name=guid+"_"+kind+"_"+Date.now()+"."+ext;
  const blob=Utilities.newBlob(bytes,mime,name);
  const folder=DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const file=folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return "https://drive.google.com/uc?export=view&id="+file.getId();
}

function extensionForMime_(mime){
  const map={
    "image/jpeg":"jpg",
    "image/png":"png",
    "image/webp":"webp",
    "image/gif":"gif"
  };
  return map[mime.toLowerCase()]||"jpg";
}

function normalizeCustomLinks_(input){
  if(!input)return [];
  let arr=input;
  if(typeof input==="string"){
    try{arr=JSON.parse(input);}
    catch(err){throw new Error("Custom links contain invalid JSON.");}
  }
  if(!Array.isArray(arr))throw new Error("Custom links must be an array.");
  return arr.map(function(item){
    const label=clean_(item&&item.label);
    const url=normalizeUrl_(item&&item.url);
    if(!label||!isValidUrl_(url))throw new Error("Every custom link needs a label and valid URL.");
    return {label:label,url:url};
  }).slice(0,20);
}

function normalizeUrl_(value){
  let url=clean_(value);
  if(!url)return "";
  if(!/^https?:\/\//i.test(url))url="https://"+url;
  return url;
}

function isValidUrl_(url){
  try{
    const u=new URL(String(url));
    return u.protocol==="http:"||u.protocol==="https:";
  }catch(e){return false;}
}

function clean_(value){
  return String(value===undefined||value===null?"":value).trim();
}

function buildCardUrl_(guid){
  if(!CONFIG.FRONTEND_BASE_URL||CONFIG.FRONTEND_BASE_URL==="https://YOUR-FRONTEND-DOMAIN/"){
    throw new Error("FRONTEND_BASE_URL is not configured.");
  }
  return CONFIG.FRONTEND_BASE_URL.replace(/\/+$/,"/")+"card/?guid="+encodeURIComponent(guid);
}

function sendWelcomeEmail_(record,cardUrl){
  const recipients=clean_(record.emails).split(",").map(function(v){return v.trim();}).filter(Boolean);
  if(!recipients.length)return;
  const to=recipients[0];
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))return;
  try{
    MailApp.sendEmail({
      to:to,
      subject:"Your Digital Visiting Card is ready",
      body:
        "Hello "+record.name+",\n\n"+
        "Your digital visiting card has been created successfully.\n\n"+
        "Card URL:\n"+cardUrl+"\n\n"+
        "You can open, share, or save this card from the link above.\n\n"+
        "Digital Visiting Card Creator"
    });
  }catch(err){
    console.warn("Email delivery failed: "+err);
  }
}

function safeError_(err){
  return err&&err.message?err.message:"Unexpected server error.";
}

function json_(data){
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
