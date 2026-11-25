const CONFIG={
  SPREADSHEET_ID:"1qSvVyxwHFVfJCtc2cZXHYiCbmk_NjRZqBeUZkJ6O9OA",
  SHEET_NAME:"Cards",
  COMPANY_SHEET_NAME:"CompanyMaster",
  OWNER_SHEET_NAME:"CardOwners",
  STATS_SHEET_NAME:"CardStats",
  VISITOR_SHEET_NAME:"CardVisitors",
  DEVICE_SHEET_NAME:"Devices",
  DAILY_SHEET_NAME:"DailyStats",
  DRIVE_FOLDER_ID:"1nBH0EkyB4_Dj0LLEkYne-YdP4iJkABVo",
  FRONTEND_BASE_URL:"https://siddhartha1209.github.io/Visiting_Card_v2.0.0/",
  MAX_UPLOAD_BYTES:9000000,
  CACHE_SECONDS:21600,
  OWNED_CACHE_SECONDS:300,
  COMPANY_MAP_CACHE_SECONDS:3600,
  HEADER_CACHE_SECONDS:3600
};

const HEADERS=[
  "guid","name","title","instituteName","tagline","address","website","phone",
  "whatsapp","emails","logoUrl","photoUrl","locationLink","customLinks","createdAt"
];

const COMPANY_HEADERS=[
  "companyId","companyName","tagline","address","website",
  "logoUrl","locationLink","createdAt","updatedAt","status","description"
];

const OWNER_HEADERS=[
	"appId","guid","cardName","createdAt","status","isFavourite"
];
const STATS_HEADERS=["guid","views","shares","saves","updatedAt"];
const DEVICE_HEADERS=["deviceId","firstSeen","lastSeen","opens","installed","installedAt","shares","lastMode"];
const DAILY_HEADERS=["date","opens","newDevices","installs","shares"];
const VISITOR_HEADERS=["key","guid","type","createdAt"];

function doGet(e){
  try{
    const p=e&&e.parameter?e.parameter:{};
    const action=String(p.action||"health").toLowerCase();

    if(action==="card"){
      return json_(getCard_(p.guid));
    }

    if(action==="company"){
      return json_(getCompany_(p.companyId));
    }

    if(action==="ownedcards"){
      return json_(getOwnedCards_(p.appId));
    }

    if(action==="adminusers"){
      return json_(getAdminUsers_(p.key));
    }

    if(action==="admin"){
      return json_(getAdminStats_(p.key));
    }

    if(action==="stats"){
      return json_(getStats_(p.appId));
    }

    if(action==="health"){
      return json_({
        success:true,
        status:"ok",
        timestamp:new Date().toISOString()
      });
    }

    return json_({
      success:true,
      message:"Digital Visiting Card API",
      actions:["submit","card","company","ownedCards","favourite","status","delete","track","stats","admin","adminusers","health"]
    });
  }catch(err){
    return json_({
      success:false,
      error:safeError_(err)
    });
  }
}

function doPost(e){
  try{
    const body=parseBody_(e);

    const action=String(body.action||"").toLowerCase();

    if(action==="submit")return json_(submitCard_(body));
    if(action==="update")return json_(updateCard_(body));
    if(action==="delete")return json_(deleteCard_(body));
    if(action==="track")return json_(trackEvent_(body));
    if(action==="favourite")return json_(updateOwnerField_(body,"isFavourite"));
    if(action==="status")return json_(updateOwnerField_(body,"status"));

    return json_({success:false,error:"Unsupported action."});
  }catch(err){
    return json_({
      success:false,
      error:safeError_(err)
    });
  }
}

function submitCard_(p){
  const errors=validatePayload_(p);

  if(errors.length){
    throw new Error(errors.join(" "));
  }

  validateConfiguration_();

  const sheet=getSheet_();
  const ownerSheet=getOwnerSheet_();
  const guid=Utilities.getUuid();
  const createdAt=new Date().toISOString();
  const appId=clean_(p.appId);

  const logoUrl=handleImage_(p.logoImage,"logo",guid);
  const photoUrl=handleImage_(p.photoImage,"photo",guid);

  const customLinks=normalizeCustomLinks_(p.customLinks);

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
    logoUrl:logoUrl,
    photoUrl:photoUrl,
    locationLink:normalizeUrl_(p.locationLink),
    customLinks:JSON.stringify(customLinks),
    createdAt:createdAt
  };

  const cardUrl=buildCardUrl_(guid);
  let company=null;

  /* Only the sheet writes are locked, so two people submitting at the same
     moment cannot overwrite each other's rows (the slow image upload above
     stays outside the lock). */
  withLock_(function(){
    if(clean_(p.instituteName)){
      company=upsertCompany_({
        companyName:p.instituteName,
        tagline:p.tagline,
        description:p.companyDescription,
        address:p.address,
        website:p.website,
        logoUrl:logoUrl,
        locationLink:p.locationLink
      });
    }

    appendRowAsText_(
      sheet,
      HEADERS.map(function(header){
        return record[header]||"";
      }),
      ["phone","whatsapp"],
      HEADERS
    );

    ownerSheet.appendRow([
      appId,
      guid,
      clean_(p.cardName),
      createdAt,
      "Active",
      "false"
    ]);
  });

  invalidateOwnedCache_(appId);
  invalidateCompanyMap_();

  /* the cached record carries the company description, so reading a card
     never has to touch the CompanyMaster sheet again */
  record.companyDescription=company?clean_(company.description):"";

  CacheService.getScriptCache().put(
    "card:"+guid,
    JSON.stringify(Object.assign({},record,{customLinks:customLinks})),
    CONFIG.CACHE_SECONDS
  );

  sendWelcomeEmail_(record,cardUrl);

  return{
    success:true,
    guid:guid,
    appId:appId,
    cardUrl:cardUrl,
    companyId:company?company.companyId:"",
    record:record
  };
}

/* Edit an existing card. Only the device (appId) that created the card may do this. */
function updateCard_(p){
  const errors=validatePayload_(p);

  if(errors.length){
    throw new Error(errors.join(" "));
  }

  validateConfiguration_();

  const appId=clean_(p.appId);
  const guid=clean_(p.guid);

  if(!guid){
    throw new Error("Card ID is required.");
  }

  /* refuse early, before anything is uploaded to Drive */
  if(!getOwnedGuidSet_(appId)[guid]){
    throw new Error("You can only edit cards that were created on this device.");
  }

  /* new images are uploaded first, outside the lock (slow) */
  const newLogo=handleImage_(p.logoImage,"logo",guid);
  const newPhoto=handleImage_(p.photoImage,"photo",guid);

  const customLinks=normalizeCustomLinks_(p.customLinks);
  let record=null;
  let company=null;

  withLock_(function(){
    const ownerSheet=getOwnerSheet_();
    const ownerValues=ownerSheet.getDataRange().getValues();
    const ownerAppIndex=OWNER_HEADERS.indexOf("appId");
    const ownerGuidIndex=OWNER_HEADERS.indexOf("guid");
    const ownerNameIndex=OWNER_HEADERS.indexOf("cardName");
    let ownerRow=-1;

    for(let i=1;i<ownerValues.length;i++){
      if(
        clean_(ownerValues[i][ownerAppIndex])===appId&&
        clean_(ownerValues[i][ownerGuidIndex])===guid
      ){
        ownerRow=i+1;
        break;
      }
    }

    if(ownerRow<0){
      throw new Error("You can only edit cards that were created on this device.");
    }

    const sheet=getSheet_();
    const values=sheet.getDataRange().getValues();
    const guidIndex=HEADERS.indexOf("guid");
    let rowNumber=-1;

    for(let i=1;i<values.length;i++){
      if(String(values[i][guidIndex])===guid){
        rowNumber=i+1;
        values.existing=rowToRecord_(values[i]);
        break;
      }
    }

    if(rowNumber<0){
      throw new Error("Card not found.");
    }

    const existing=values.existing;

    const logoUrl=newLogo||(p.removeLogo===true?"":existing.logoUrl);
    const photoUrl=newPhoto||(p.removePhoto===true?"":existing.photoUrl);

    if(clean_(p.instituteName)){
      company=upsertCompany_({
        companyName:p.instituteName,
        tagline:existing.tagline,
        description:p.companyDescription,
        address:p.address,
        website:p.website,
        logoUrl:logoUrl,
        locationLink:p.locationLink
      });
    }

    record={
      guid:guid,
      name:clean_(p.name),
      title:clean_(p.title),
      instituteName:clean_(p.instituteName),
      tagline:existing.tagline,
      address:clean_(p.address),
      website:normalizeUrl_(p.website),
      phone:clean_(p.phone),
      whatsapp:clean_(p.whatsapp),
      emails:clean_(p.emails),
      logoUrl:logoUrl,
      photoUrl:photoUrl,
      locationLink:normalizeUrl_(p.locationLink),
      customLinks:JSON.stringify(customLinks),
      createdAt:existing.createdAt
    };

    ["phone","whatsapp"].forEach(function(header){
      sheet.getRange(rowNumber,HEADERS.indexOf(header)+1).setNumberFormat("@");
    });

    sheet.getRange(rowNumber,1,1,HEADERS.length).setValues([
      HEADERS.map(function(header){
        return record[header]||"";
      })
    ]);

    if(ownerNameIndex>=0){
      ownerSheet.getRange(ownerRow,ownerNameIndex+1).setValue(clean_(p.cardName));
    }
  });

  record.customLinks=customLinks;
  record.companyDescription=company?clean_(company.description):"";

  /* the next read of this card (and of the owner's list) must see the edit */
  CacheService.getScriptCache().put(
    "card:"+guid,
    JSON.stringify(record),
    CONFIG.CACHE_SECONDS
  );

  invalidateOwnedCache_(appId);
  invalidateCompanyMap_();

  return{
    success:true,
    guid:guid,
    appId:appId,
    record:record
  };
}

function getCard_(guid){
  guid=String(guid||"").trim();

  if(!guid){
    return{
      success:false,
      status:400,
      error:"GUID is required."
    };
  }

  const cache=CacheService.getScriptCache();
  const cached=cache.get("card:"+guid);

  if(cached){
    const record=JSON.parse(cached);

    if(record.companyDescription===undefined){
      attachCompanyDescription_(record);
    }

    return{
      success:true,
      record:record
    };
  }

  if(isCardDeleted_(guid)){
    return{
      success:false,
      status:410,
      removed:true,
      error:"This card was removed by its owner."
    };
  }

  const sheet=getSheet_();
  const values=sheet.getDataRange().getValues();

  if(values.length<2){
    return{
      success:false,
      status:404,
      error:"Card not found."
    };
  }

  const guidIndex=HEADERS.indexOf("guid");

  for(let i=1;i<values.length;i++){
    if(String(values[i][guidIndex])===guid){
      const record=rowToRecord_(values[i]);

      attachCompanyDescription_(record);

      cache.put(
        "card:"+guid,
        JSON.stringify(record),
        CONFIG.CACHE_SECONDS
      );

      return{
        success:true,
        record:record
      };
    }
  }

  return{
    success:false,
    status:404,
    error:"Card not found."
  };
}

function getOwnedCards_(appId){
  appId=clean_(appId);

  if(!appId){
    return{
      success:false,
      status:400,
      error:"App ID is required."
    };
  }

  const cache=CacheService.getScriptCache();
  const cachedResult=cache.get(ownedCacheKey_(appId));

  if(cachedResult){
    return JSON.parse(cachedResult);
  }

  const ownerSheet=getOwnerSheet_();
  const cardSheet=getSheet_();

  const ownerValues=ownerSheet.getDataRange().getValues();
  const cardValues=cardSheet.getDataRange().getValues();

  if(ownerValues.length<2){
    return{
      success:true,
      appId:appId,
      cards:[]
    };
  }

  if(cardValues.length<2){
    return{
      success:true,
      appId:appId,
      cards:[]
    };
  }

  const ownerGuidIndex=OWNER_HEADERS.indexOf("guid");
  const ownerAppIdIndex=OWNER_HEADERS.indexOf("appId");
  const ownerCardNameIndex=OWNER_HEADERS.indexOf("cardName");
  const ownerStatusIndex=OWNER_HEADERS.indexOf("status");
  const ownerFavouriteIndex=OWNER_HEADERS.indexOf("isFavourite");

  const cardsByGuid={};

  const cardGuidIndex=HEADERS.indexOf("guid");

  for(let i=1;i<cardValues.length;i++){
    const record=rowToRecord_(cardValues[i]);
    const guid=String(cardValues[i][cardGuidIndex]||"").trim();

    if(guid){
      cardsByGuid[guid]=record;
    }
  }

  const companyMap=getCompanyDescriptionMap_();
  const cards=[];

  for(let i=1;i<ownerValues.length;i++){
    const row=ownerValues[i];

    const rowAppId=String(
      row[ownerAppIdIndex]||""
    ).trim();

    if(rowAppId!==appId){
      continue;
    }

    const status=String(
      row[ownerStatusIndex]||"Active"
    ).trim();

    const guid=String(
      row[ownerGuidIndex]||""
    ).trim();

    if(!guid||!cardsByGuid[guid]||status==="Deleted"){
      continue;
    }

    const card=cardsByGuid[guid];

    attachCompanyDescription_(card,companyMap);

    cards.push({
      ...card,
      cardName:clean_(row[ownerCardNameIndex]),
      ownerStatus:status,
      isFavourite:
        String(row[ownerFavouriteIndex]||"false")
          .toLowerCase()==="true",
    });
  }

  const result={
    success:true,
    appId:appId,
    count:cards.length,
    cards:cards
  };

  try{
    cache.put(
      ownedCacheKey_(appId),
      JSON.stringify(result),
      CONFIG.OWNED_CACHE_SECONDS
    );
  }catch(e){
    /* result larger than the cache entry limit: just skip caching */
  }

  return result;
}

function ownedCacheKey_(appId){
  return"owned:"+appId;
}

function invalidateOwnedCache_(appId){
  try{
    CacheService.getScriptCache().remove(ownedCacheKey_(appId));
  }catch(e){}
}

function invalidateCompanyMap_(){
  try{
    CacheService.getScriptCache().remove("companyMap");
  }catch(e){}
}

/* Runs fn while holding the script lock (prevents two requests writing the
   same sheet at once). */
function withLock_(fn){
  const lock=LockService.getScriptLock();

  try{
    lock.waitLock(25000);
  }catch(e){
    throw new Error("The server is busy. Please try again in a moment.");
  }

  try{
    return fn();
  }finally{
    lock.releaseLock();
  }
}





function getOwnedGuidSet_(appId){
  const sheet=getOwnerSheet_();
  const values=sheet.getDataRange().getValues();
  const appIdIndex=OWNER_HEADERS.indexOf("appId");
  const guidIndex=OWNER_HEADERS.indexOf("guid");
  const statusIndex=OWNER_HEADERS.indexOf("status");
  const result={};
  for(let i=1;i<values.length;i++){
    if(clean_(values[i][appIdIndex])===appId){
      const guid=clean_(values[i][guidIndex]);
      if(guid&&clean_(values[i][statusIndex]||"Active")!=="Deleted")result[guid]=true;
    }
  }
  return result;
}

function isCardDeleted_(guid){
  const values=getOwnerSheet_().getDataRange().getValues();
  const guidIndex=OWNER_HEADERS.indexOf("guid");
  const statusIndex=OWNER_HEADERS.indexOf("status");

  for(let i=1;i<values.length;i++){
    if(clean_(values[i][guidIndex])===guid){
      return clean_(values[i][statusIndex]||"Active")==="Deleted";
    }
  }

  return false;
}

/* Delete one of my own cards. The row is kept but marked Deleted, so the public
   link stops working and the card disappears from every list. */
function deleteCard_(p){
  const appId=clean_(p.appId);
  const guid=clean_(p.guid);

  if(!appId||!guid)throw new Error("App ID and card ID are required.");

  withLock_(function(){
    const sheet=getOwnerSheet_();
    const values=sheet.getDataRange().getValues();
    const appIndex=OWNER_HEADERS.indexOf("appId");
    const guidIndex=OWNER_HEADERS.indexOf("guid");
    const statusIndex=OWNER_HEADERS.indexOf("status");
    let found=false;

    for(let i=1;i<values.length;i++){
      if(clean_(values[i][appIndex])===appId&&clean_(values[i][guidIndex])===guid){
        sheet.getRange(i+1,statusIndex+1).setValue("Deleted");
        found=true;
        break;
      }
    }

    if(!found)throw new Error("You can only delete cards that were created on this device.");
  });

  try{
    CacheService.getScriptCache().remove("card:"+guid);
  }catch(e){}

  invalidateOwnedCache_(appId);

  return{success:true,guid:guid,deleted:true};
}

function getStatsSheet_(){
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.STATS_SHEET_NAME);

  if(!sheet)sheet=ss.insertSheet(CONFIG.STATS_SHEET_NAME);

  ensureHeaders_(sheet,STATS_HEADERS,"stats");

  return sheet;
}

function getVisitorSheet_(){
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.VISITOR_SHEET_NAME);

  if(!sheet)sheet=ss.insertSheet(CONFIG.VISITOR_SHEET_NAME);

  ensureHeaders_(sheet,VISITOR_HEADERS,"visitors");

  return sheet;
}

/* type: view | share | save | unsave.
   views and saves count each person (device) once; shares count every tap. */
function trackEvent_(p){
  const guid=clean_(p.guid);
  const type=clean_(p.type).toLowerCase();
  const visitor=clean_(p.visitorId||p.appId);

  /* app-level events (no card): open / install */
  if(type==="open"||type==="install"){
    if(!visitor)return{success:false,error:"Device ID is required."};

    withLock_(function(){
      touchDevice_(visitor,type,clean_(p.mode));
    });

    return{success:true};
  }

  if(!guid||["view","share","save","unsave"].indexOf(type)<0){
    return{success:false,error:"Invalid event."};
  }

  /* the owner opening or saving their own card is not a view */
  if((type==="view"||type==="save"||type==="unsave")&&visitor&&getOwnedGuidSet_(visitor)[guid]){
    return{success:true,skipped:true};
  }

  withLock_(function(){
    const statsSheet=getStatsSheet_();
    let delta={views:0,shares:0,saves:0};

    if(type==="share"){
      delta.shares=1;

      if(visitor){
        touchDevice_(visitor,"share","");
      }else{
        bumpDaily_({shares:1});
      }
    }else{
      if(!visitor)return;

      const visitors=getVisitorSheet_();
      const key=(type==="unsave"?"save":type)+"|"+guid+"|"+visitor;
      const hit=visitors.createTextFinder(key).matchEntireCell(true).findNext();

      if(type==="view"){
        if(hit)return;
        visitors.appendRow([key,guid,"view",new Date().toISOString()]);
        delta.views=1;
      }else if(type==="save"){
        if(hit)return;
        visitors.appendRow([key,guid,"save",new Date().toISOString()]);
        delta.saves=1;
      }else{
        if(!hit)return;
        visitors.deleteRow(hit.getRow());
        delta.saves=-1;
      }
    }

    const finder=statsSheet.createTextFinder(guid).matchEntireCell(true).findNext();
    let row=finder?finder.getRow():-1;

    if(row<2){
      statsSheet.appendRow([guid,0,0,0,""]);
      row=statsSheet.getLastRow();
    }

    const range=statsSheet.getRange(row,1,1,5);
    const v=range.getValues()[0];

    range.setValues([[
      guid,
      Math.max(0,Number(v[1]||0)+delta.views),
      Math.max(0,Number(v[2]||0)+delta.shares),
      Math.max(0,Number(v[3]||0)+delta.saves),
      new Date().toISOString()
    ]]);
  });

  return{success:true};
}

function getDeviceSheet_(){
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.DEVICE_SHEET_NAME);

  if(!sheet)sheet=ss.insertSheet(CONFIG.DEVICE_SHEET_NAME);

  ensureHeaders_(sheet,DEVICE_HEADERS,"devices");

  return sheet;
}

function getDailySheet_(){
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.DAILY_SHEET_NAME);

  if(!sheet){
    sheet=ss.insertSheet(CONFIG.DAILY_SHEET_NAME);
    sheet.getRange("A:A").setNumberFormat("@");
  }

  ensureHeaders_(sheet,DAILY_HEADERS,"daily");

  return sheet;
}

function today_(){
  return Utilities.formatDate(new Date(),"Asia/Kolkata","yyyy-MM-dd");
}

/* add numbers to today's row (call while holding the lock) */
function bumpDaily_(add){
  const sheet=getDailySheet_();
  const day=today_();
  const hit=sheet.createTextFinder(day).matchEntireCell(true).findNext();
  let row=hit?hit.getRow():-1;

  if(row<2){
    row=sheet.getLastRow()+1;
    sheet.getRange(row,1).setNumberFormat("@").setValue(day);
    sheet.getRange(row,2,1,4).setValues([[0,0,0,0]]);
  }

  const range=sheet.getRange(row,2,1,4);
  const v=range.getValues()[0];

  range.setValues([[
    Number(v[0]||0)+(add.opens||0),
    Number(v[1]||0)+(add.newDevices||0),
    Number(v[2]||0)+(add.installs||0),
    Number(v[3]||0)+(add.shares||0)
  ]]);
}

/* one row per device: opens, install, shares (call while holding the lock) */
function touchDevice_(deviceId,type,mode){
  const sheet=getDeviceSheet_();
  const now=new Date().toISOString();
  const hit=sheet.createTextFinder(deviceId).matchEntireCell(true).findNext();
  const daily={};
  let row=hit?hit.getRow():-1;

  if(row<2){
    sheet.appendRow([deviceId,now,now,0,"false","",0,""]);
    row=sheet.getLastRow();
    daily.newDevices=1;
  }

  const range=sheet.getRange(row,1,1,DEVICE_HEADERS.length);
  const v=range.getValues()[0];
  let opens=Number(v[3]||0);
  let installed=String(v[4]).toLowerCase()==="true";
  let installedAt=v[5]||"";
  let shares=Number(v[6]||0);
  let lastMode=v[7]||"";

  if(type==="open"){
    opens++;
    daily.opens=1;
    lastMode=mode||lastMode;
  }

  if(type==="share"){
    shares++;
    daily.shares=1;
  }

  /* an "install" event, or opening from the home screen, means it is installed */
  if(type==="install"||(type==="open"&&mode==="standalone")){
    if(!installed){
      installed=true;
      installedAt=now;
      daily.installs=1;
    }
  }

  range.setValues([[deviceId,v[1]||now,now,opens,String(installed),installedAt,shares,lastMode]]);
  bumpDaily_(daily);
}

/* Admin summary. The key is stored in Script properties as ADMIN_KEY. */
function getAdminStats_(key){
  const saved=PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");

  if(!saved){
    return{success:false,status:500,error:"ADMIN_KEY is not set in Script properties."};
  }

  if(String(key||"")!==saved){
    return{success:false,status:401,error:"Wrong admin key."};
  }

  const users={};
  const total={devices:0,installed:0,opens:0,shares:0,activeWeek:0,cardsCreated:0,cardsActive:0,cardsDeleted:0,views:0,saves:0};
  const weekAgo=Date.now()-7*86400000;

  function user(id){
    if(!users[id])users[id]={id:id,opens:0,cards:0,shares:0,installed:false,firstSeen:"",lastSeen:""};
    return users[id];
  }

  const dv=getDeviceSheet_().getDataRange().getValues();

  for(let i=1;i<dv.length;i++){
    const id=clean_(dv[i][0]);

    if(!id)continue;

    const u=user(id);

    u.firstSeen=String(dv[i][1]||"");
    u.lastSeen=String(dv[i][2]||"");
    u.opens=Number(dv[i][3]||0);
    u.installed=String(dv[i][4]).toLowerCase()==="true";
    u.shares=Number(dv[i][6]||0);

    total.devices++;
    total.opens+=u.opens;
    total.shares+=u.shares;

    if(u.installed)total.installed++;
    if(new Date(u.lastSeen).getTime()>=weekAgo)total.activeWeek++;
  }

  const ov=getOwnerSheet_().getDataRange().getValues();
  const oApp=OWNER_HEADERS.indexOf("appId");
  const oStatus=OWNER_HEADERS.indexOf("status");

  for(let i=1;i<ov.length;i++){
    const id=clean_(ov[i][oApp]);

    if(!id)continue;

    total.cardsCreated++;

    if(clean_(ov[i][oStatus]||"Active")==="Deleted"){
      total.cardsDeleted++;
    }else{
      total.cardsActive++;
      user(id).cards++;
    }
  }

  const cs=getStatsSheet_().getDataRange().getValues();

  for(let i=1;i<cs.length;i++){
    total.views+=Number(cs[i][1]||0);
    total.saves+=Number(cs[i][3]||0);
  }

  const dy=getDailySheet_().getDataRange().getValues();
  const daily=[];

  for(let i=1;i<dy.length;i++){
    const d=dy[i][0] instanceof Date?Utilities.formatDate(dy[i][0],"Asia/Kolkata","yyyy-MM-dd"):String(dy[i][0]);

    if(!d)continue;

    daily.push({date:d,opens:Number(dy[i][1]||0),newDevices:Number(dy[i][2]||0),installs:Number(dy[i][3]||0),shares:Number(dy[i][4]||0)});
  }

  const list=Object.keys(users).map(function(k){
    const u=users[k];

    u.id=k.slice(0,8);

    return u;
  }).sort(function(a,b){return b.opens-a.opens||b.cards-a.cards;}).slice(0,100);

  return{success:true,total:total,daily:daily.slice(-30),users:list};
}

/* Every device that opened the app (no limit), for admin/installs.html */
function getAdminUsers_(key){
  const saved=PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");

  if(!saved)return{success:false,status:500,error:"ADMIN_KEY is not set in Script properties."};
  if(String(key||"")!==saved)return{success:false,status:401,error:"Wrong admin key."};

  const users={};

  function user(id){
    if(!users[id]){
      users[id]={appId:id,name:"",opens:0,cards:0,shares:0,installed:false,installedAt:"",firstSeen:"",lastSeen:"",mode:""};
    }

    return users[id];
  }

  const dv=getDeviceSheet_().getDataRange().getValues();

  for(let i=1;i<dv.length;i++){
    const id=clean_(dv[i][0]);

    if(!id)continue;

    const u=user(id);

    u.firstSeen=String(dv[i][1]||"");
    u.lastSeen=String(dv[i][2]||"");
    u.opens=Number(dv[i][3]||0);
    u.installed=String(dv[i][4]).toLowerCase()==="true";
    u.installedAt=String(dv[i][5]||"");
    u.shares=Number(dv[i][6]||0);
    u.mode=String(dv[i][7]||"");
  }

  const ov=getOwnerSheet_().getDataRange().getValues();
  const iApp=OWNER_HEADERS.indexOf("appId");
  const iName=OWNER_HEADERS.indexOf("cardName");
  const iStatus=OWNER_HEADERS.indexOf("status");

  for(let i=1;i<ov.length;i++){
    const id=clean_(ov[i][iApp]);

    if(!id||clean_(ov[i][iStatus]||"Active")==="Deleted")continue;

    const u=user(id);

    u.cards++;

    if(!u.name)u.name=clean_(ov[i][iName]);
  }

  const list=Object.keys(users).map(function(k){return users[k];})
    .sort(function(a,b){return String(b.lastSeen).localeCompare(String(a.lastSeen));});

  return{success:true,count:list.length,users:list};
}

/* views / shares / saves for every card that belongs to this device */
function getStats_(appId){
  appId=clean_(appId);

  if(!appId)return{success:false,status:400,error:"App ID is required."};

  const owned=getOwnedGuidSet_(appId);
  const values=getStatsSheet_().getDataRange().getValues();
  const stats={};

  Object.keys(owned).forEach(function(guid){
    stats[guid]={views:0,shares:0,saves:0};
  });

  for(let i=1;i<values.length;i++){
    const guid=clean_(values[i][0]);

    if(stats[guid]){
      stats[guid]={
        views:Number(values[i][1]||0),
        shares:Number(values[i][2]||0),
        saves:Number(values[i][3]||0)
      };
    }
  }

  return{success:true,stats:stats};
}


function updateOwnerField_(p,field){
  const appId=clean_(p.appId);
  const guid=clean_(p.guid);
  if(!appId||!guid)throw new Error("App ID and card GUID are required.");
  return withLock_(function(){
  const sheet=getOwnerSheet_();
  const values=sheet.getDataRange().getValues();
  const appIndex=OWNER_HEADERS.indexOf("appId");
  const guidIndex=OWNER_HEADERS.indexOf("guid");
  const fieldIndex=OWNER_HEADERS.indexOf(field);
  for(let i=1;i<values.length;i++){
    if(clean_(values[i][appIndex])===appId&&clean_(values[i][guidIndex])===guid){
      let value=clean_(p.value);
      if(field==="isFavourite")value=String(value).toLowerCase()==="true"?"true":"false";
      if(field==="status")value=value==="Archived"?"Archived":"Active";
      sheet.getRange(i+1,fieldIndex+1).setValue(value);
      invalidateOwnedCache_(appId);
      return{success:true,guid:guid,field:field,value:value};
    }
  }
  throw new Error("Owned card not found.");
  });
}


/* normalizedCompanyName -> description, read from the sheet once and cached */
function getCompanyDescriptionMap_(){
  const cache=CacheService.getScriptCache();
  const cached=cache.get("companyMap");

  if(cached){
    return JSON.parse(cached);
  }

  const map={};
  const sheet=getCompanySheet_();
  const values=sheet.getDataRange().getValues();
  const nameIndex=COMPANY_HEADERS.indexOf("companyName");
  const descIndex=COMPANY_HEADERS.indexOf("description");

  for(let i=1;i<values.length;i++){
    const key=normalizeCompanyName_(values[i][nameIndex]);

    if(key)map[key]=String(values[i][descIndex]||"");
  }

  try{
    cache.put(
      "companyMap",
      JSON.stringify(map),
      CONFIG.COMPANY_MAP_CACHE_SECONDS
    );
  }catch(e){}

  return map;
}

function attachCompanyDescription_(record,map){
  if(!record||!record.instituteName){
    if(record)record.companyDescription="";
    return record;
  }

  map=map||getCompanyDescriptionMap_();

  record.companyDescription=
    map[normalizeCompanyName_(record.instituteName)]||"";

  return record;
}

function getCompany_(companyId){
  companyId=clean_(companyId);

  if(!companyId){
    return{
      success:false,
      status:400,
      error:"Company ID is required."
    };
  }

  const cache=CacheService.getScriptCache();
  const cached=cache.get("company:"+companyId);

  if(cached){
    return{
      success:true,
      company:JSON.parse(cached)
    };
  }

  const sheet=getCompanySheet_();
  const values=sheet.getDataRange().getValues();

  if(values.length<2){
    return{
      success:false,
      status:404,
      error:"Company not found."
    };
  }

  const idIndex=COMPANY_HEADERS.indexOf("companyId");

  for(let i=1;i<values.length;i++){
    if(String(values[i][idIndex])===companyId){
      const company=companyRowToObject_(values[i]);

      cache.put(
        "company:"+companyId,
        JSON.stringify(company),
        CONFIG.CACHE_SECONDS
      );

      return{
        success:true,
        company:company
      };
    }
  }

  return{
    success:false,
    status:404,
    error:"Company not found."
  };
}

function getSheet_(){
  if(
    !CONFIG.SPREADSHEET_ID||
    CONFIG.SPREADSHEET_ID==="YOUR_SPREADSHEET_ID"
  ){
    throw new Error("Google Sheet ID is not configured.");
  }

  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.SHEET_NAME);

  if(!sheet){
    sheet=ss.insertSheet(CONFIG.SHEET_NAME);
  }

  ensureHeaders_(sheet,HEADERS,"cards");

  return sheet;
}

function getCompanySheet_(){
  if(
    !CONFIG.SPREADSHEET_ID||
    CONFIG.SPREADSHEET_ID==="YOUR_SPREADSHEET_ID"
  ){
    throw new Error("Google Sheet ID is not configured.");
  }

  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.COMPANY_SHEET_NAME);

  if(!sheet){
    sheet=ss.insertSheet(CONFIG.COMPANY_SHEET_NAME);
  }

  ensureCompanyHeaders_(sheet);

  return sheet;
}

function getOwnerSheet_(){
  if(
    !CONFIG.SPREADSHEET_ID||
    CONFIG.SPREADSHEET_ID==="YOUR_SPREADSHEET_ID"
  ){
    throw new Error("Google Sheet ID is not configured.");
  }

  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.OWNER_SHEET_NAME);

  if(!sheet){
    sheet=ss.insertSheet(CONFIG.OWNER_SHEET_NAME);
  }

  ensureHeaders_(sheet,OWNER_HEADERS,"owners");

  return sheet;
}

function ensureHeaders_(sheet,headers,cachePrefix){
  const cache=CacheService.getScriptCache();
  const cacheKey=cachePrefix+":headers:"+sheet.getSheetId();

  if(cache.get(cacheKey)){
    return;
  }

  const range=sheet.getRange(
    1,
    1,
    1,
    headers.length
  );

  const current=range.getValues()[0];
  let matches=true;

  for(let i=0;i<headers.length;i++){
    if(String(current[i]||"")!==headers[i]){
      matches=false;
      break;
    }
  }

  if(!matches){
    const firstRowBlank=current.every(function(value){
      return String(value||"").trim()==="";
    });

    if(
      sheet.getLastRow()===0||
      firstRowBlank
    ){
      range.setValues([headers]);
    }else{
      throw new Error(
        "Header mismatch in sheet: "+sheet.getName()+
        ". Expected: "+headers.join(", ")+
        ". Found: "+current.join(", ")
      );
    }
  }

  cache.put(
    cacheKey,
    "1",
    CONFIG.HEADER_CACHE_SECONDS
  );
}

function ensureCompanyHeaders_(sheet){
  const cache=CacheService.getScriptCache();
  const cacheKey="companies:headers:"+sheet.getSheetId();

  if(cache.get(cacheKey)){
    return;
  }

  const oldHeaders=[
    "companyId",
    "companyName",
    "tagline",
    "address",
    "website",
    "logoUrl",
    "locationLink",
    "createdAt",
    "updatedAt",
    "status"
  ];

  const requiredLength=COMPANY_HEADERS.length;
  const currentLength=Math.max(
    sheet.getLastColumn(),
    requiredLength
  );

  const range=sheet.getRange(
    1,
    1,
    1,
    currentLength
  );

  const current=range.getValues()[0];

  const firstRowBlank=current.every(function(value){
    return String(value||"").trim()==="";
  });

  if(
    sheet.getLastRow()===0||
    firstRowBlank
  ){
    sheet.getRange(
      1,
      1,
      1,
      requiredLength
    ).setValues([COMPANY_HEADERS]);
  }else{
    let oldSchemaMatches=true;

    for(let i=0;i<oldHeaders.length;i++){
      if(String(current[i]||"")!==oldHeaders[i]){
        oldSchemaMatches=false;
        break;
      }
    }

    if(oldSchemaMatches){
      sheet.getRange(
        1,
        requiredLength,
        1,
        1
      ).setValue("description");
    }else{
      let newSchemaMatches=true;

      for(let i=0;i<requiredLength;i++){
        if(String(current[i]||"")!==COMPANY_HEADERS[i]){
          newSchemaMatches=false;
          break;
        }
      }

      if(!newSchemaMatches){
        throw new Error(
          "CompanyMaster header row does not match the required schema."
        );
      }
    }
  }

  cache.put(
    cacheKey,
    "1",
    CONFIG.HEADER_CACHE_SECONDS
  );
}

function rowToRecord_(row){
  const record={};

  HEADERS.forEach(function(header,index){
    record[header]=
      row[index]===undefined?
      "":
      String(row[index]);
  });

  try{
    record.customLinks=JSON.parse(
      record.customLinks||"[]"
    );
  }catch(e){
    record.customLinks=[];
  }

  return record;
}

function companyRowToObject_(row){
  const company={};

  COMPANY_HEADERS.forEach(function(header,index){
    company[header]=
      row[index]===undefined?
      "":
      String(row[index]);
  });

  return company;
}

function upsertCompany_(data){
  const sheet=getCompanySheet_();
  const values=sheet.getDataRange().getValues();

  const companyName=clean_(data.companyName);
  const normalizedName=normalizeCompanyName_(companyName);

  if(!normalizedName){
    return null;
  }

  const nameIndex=COMPANY_HEADERS.indexOf("companyName");

  for(let i=1;i<values.length;i++){
    const existingName=normalizeCompanyName_(
      values[i][nameIndex]
    );

    if(existingName===normalizedName){
      const company=companyRowToObject_(values[i]);
      const rowNumber=i+1;
      const updatedAt=new Date().toISOString();

      const updated={
        companyId:company.companyId,
        companyName:company.companyName||companyName,
        tagline:clean_(data.tagline)||company.tagline,
        address:clean_(data.address)||company.address,
        website:normalizeUrl_(data.website)||company.website,
        logoUrl:clean_(data.logoUrl)||company.logoUrl,
        locationLink:normalizeUrl_(data.locationLink)||company.locationLink,
        createdAt:company.createdAt||updatedAt,
        updatedAt:updatedAt,
        status:company.status||"Active",
        description:clean_(data.description)||company.description
      };

      sheet.getRange(
        rowNumber,
        1,
        1,
        COMPANY_HEADERS.length
      ).setValues([
        COMPANY_HEADERS.map(function(header){
          return updated[header]||"";
        })
      ]);

      CacheService.getScriptCache().put(
        "company:"+updated.companyId,
        JSON.stringify(updated),
        CONFIG.CACHE_SECONDS
      );

      return updated;
    }
  }

  const companyId=generateCompanyId_();
  const now=new Date().toISOString();

  const company={
    companyId:companyId,
    companyName:companyName,
    tagline:clean_(data.tagline),
    address:clean_(data.address),
    website:normalizeUrl_(data.website),
    logoUrl:clean_(data.logoUrl),
    locationLink:normalizeUrl_(data.locationLink),
    createdAt:now,
    updatedAt:now,
    status:"Active",
    description:clean_(data.description)
  };

  sheet.appendRow(
    COMPANY_HEADERS.map(function(header){
      return company[header]||"";
    })
  );

  CacheService.getScriptCache().put(
    "company:"+companyId,
    JSON.stringify(company),
    CONFIG.CACHE_SECONDS
  );

  return company;
}

function normalizeCompanyName_(value){
  return clean_(value)
    .toLowerCase()
    .replace(/\s+/g," ")
    .replace(/[.,]+$/,"")
    .trim();
}

function generateCompanyId_(){
  return "COMP-"+Utilities.getUuid()
    .replace(/-/g,"")
    .substring(0,12)
    .toUpperCase();
}

function parseBody_(e){
  if(
    !e||
    !e.postData||
    !e.postData.contents
  ){
    throw new Error("Empty request body.");
  }

  try{
    return JSON.parse(e.postData.contents);
  }catch(err){
    throw new Error("Invalid JSON payload.");
  }
}

function validatePayload_(p){
  const errors=[];

  if(!clean_(p.appId)){
    errors.push("App ID is required.");
  }

  if(!clean_(p.name)){
    errors.push("Full name is required.");
  }

  if(!clean_(p.phone)){
    errors.push("Phone number is required.");
  }else if(!isValidPhone_(p.phone)){
    errors.push("Phone number must be exactly 10 digits.");
  }

  if(clean_(p.whatsapp)&&!isValidPhone_(p.whatsapp)){
    errors.push("WhatsApp number must be exactly 10 digits.");
  }

  if(
    clean_(p.companyDescription).length>1000
  ){
    errors.push("Company description is too long.");
  }

  if(
    p.website&&
    !isValidUrl_(normalizeUrl_(p.website))
  ){
    errors.push("Website URL is invalid.");
  }

  if(
    p.locationLink&&
    !isValidUrl_(normalizeUrl_(p.locationLink))
  ){
    errors.push("Location URL is invalid.");
  }

  if(p.customLinks){
    try{
      normalizeCustomLinks_(p.customLinks);
    }catch(err){
      errors.push(err.message);
    }
  }

  ["logoImage","photoImage"].forEach(function(key){
    const image=p[key];

    if(image&&image.data){
      const approx=Math.ceil(
        String(image.data).length*0.75
      );

      if(approx>CONFIG.MAX_UPLOAD_BYTES){
        errors.push(
          key+" exceeds the upload limit."
        );
      }

      if(
        !String(image.type||"")
          .toLowerCase()
          .startsWith("image/")
      ){
        errors.push(
          key+" is not an image."
        );
      }
    }
  });

  return errors;
}

function handleImage_(image,kind,guid){
  if(!image||!image.data){
    return "";
  }

  if(
    !CONFIG.DRIVE_FOLDER_ID||
    CONFIG.DRIVE_FOLDER_ID==="YOUR_DRIVE_FOLDER_ID"
  ){
    throw new Error(
      "Drive image folder is not configured."
    );
  }

  const data=String(image.data);
  const comma=data.indexOf(",");

  const encoded=
    comma>0?
    data.substring(comma+1):
    data;

  let bytes;

  try{
    bytes=Utilities.base64Decode(encoded);
  }catch(err){
    throw new Error(
      kind+" image contains invalid base64 data."
    );
  }

  if(bytes.length>CONFIG.MAX_UPLOAD_BYTES){
    throw new Error(
      kind+" image is too large."
    );
  }

  const mime=String(
    image.type||"image/jpeg"
  ).toLowerCase();

  const ext=extensionForMime_(mime);

  const fileName=
    guid+
    "_"+
    kind+
    "_"+
    Date.now()+
    "."+
    ext;

  const blob=Utilities.newBlob(
    bytes,
    mime,
    fileName
  );

  const folder=DriveApp.getFolderById(
    CONFIG.DRIVE_FOLDER_ID
  );

  const file=folder.createFile(blob);

  file.setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );

  return "https://drive.google.com/uc?export=view&id="+
    file.getId();
}

function extensionForMime_(mime){
  const map={
    "image/jpeg":"jpg",
    "image/png":"png",
    "image/webp":"webp",
    "image/gif":"gif"
  };

  return map[mime]||"jpg";
}

function normalizeCustomLinks_(input){
  if(!input){
    return [];
  }

  let arr=input;

  if(typeof input==="string"){
    try{
      arr=JSON.parse(input);
    }catch(err){
      throw new Error(
        "Custom links contain invalid JSON."
      );
    }
  }

  if(!Array.isArray(arr)){
    throw new Error(
      "Custom links must be an array."
    );
  }

  return arr.map(function(item){
    const label=clean_(
      item&&item.label
    );

    const url=normalizeUrl_(
      item&&item.url
    );

    if(
      !label||
      !url||
      !isValidUrl_(url)
    ){
      throw new Error(
        "Every custom link needs a label and valid URL."
      );
    }

    return{
      label:label,
      url:url
    };
  }).slice(0,20);
}

function normalizeUrl_(value){
  let url=clean_(value);

  if(!url){
    return "";
  }

  if(!/^https?:\/\//i.test(url)){
    url="https://"+url;
  }

  return url;
}

function isValidUrl_(url){
  try{
    const value=String(url||"");

    return /^https?:\/\/[^\s]+$/i.test(
      value
    );
  }catch(e){
    return false;
  }
}

/* Accepts "+91 9876543210" or a plain 10-digit number. */
function isValidPhone_(value){
  return /^(\+\d{1,4}[\s-]?)?\d{10}$/.test(clean_(value));
}

/* Appends a row and forces the given columns to plain text so that
   Sheets does not turn "+91 9876543210" into a number. */
function appendRowAsText_(sheet,values,textHeaders,headers){
  const row=sheet.getLastRow()+1;

  textHeaders.forEach(function(header){
    const col=headers.indexOf(header)+1;
    if(col>0){
      sheet.getRange(row,col).setNumberFormat("@");
    }
  });

  sheet.getRange(row,1,1,values.length).setValues([values]);
}

function clean_(value){
  return String(
    value===undefined||value===null?
    "":
    value
  ).trim();
}

function validateConfiguration_(){
  if(
    !CONFIG.SPREADSHEET_ID||
    CONFIG.SPREADSHEET_ID==="YOUR_SPREADSHEET_ID"
  ){
    throw new Error(
      "SPREADSHEET_ID is not configured."
    );
  }

  if(
    !CONFIG.DRIVE_FOLDER_ID||
    CONFIG.DRIVE_FOLDER_ID==="YOUR_DRIVE_FOLDER_ID"
  ){
    throw new Error(
      "DRIVE_FOLDER_ID is not configured."
    );
  }

  if(
    !CONFIG.FRONTEND_BASE_URL||
    CONFIG.FRONTEND_BASE_URL===
      "https://YOUR-FRONTEND-DOMAIN/"
  ){
    throw new Error(
      "FRONTEND_BASE_URL is not configured yet."
    );
  }
}

function buildCardUrl_(guid){
  if(
    !CONFIG.FRONTEND_BASE_URL||
    CONFIG.FRONTEND_BASE_URL===
      "https://YOUR-FRONTEND-DOMAIN/"
  ){
    throw new Error(
      "FRONTEND_BASE_URL is not configured."
    );
  }

  return CONFIG.FRONTEND_BASE_URL
    .replace(/\/+$/,"/")+
    "card/?guid="+
    encodeURIComponent(guid);
}

function sendWelcomeEmail_(record,cardUrl){
  const recipients=clean_(
    record.emails
  )
    .split(",")
    .map(function(value){
      return value.trim();
    })
    .filter(Boolean);

  if(!recipients.length){
    return;
  }

  const to=recipients[0];

  if(
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)
  ){
    return;
  }

  try{
    MailApp.sendEmail({
      to:to,
      subject:"Your Digital Visiting Card is ready",
      body:
        "Hello "+record.name+",\n\n"+
        "Your digital visiting card has been created successfully.\n\n"+
        "Card URL:\n"+
        cardUrl+"\n\n"+
        "You can open, share, or save this card from the link above.\n\n"+
        "Digital Visiting Card Creator"
    });
  }catch(err){
    console.warn(
      "Email delivery failed: "+
      safeError_(err)
    );
  }
}

function safeError_(err){
  return err&&err.message?
    err.message:
    "Unexpected server error.";
}

function json_(data){
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

function testOwnerSheet(){
  const sheet=getOwnerSheet_();
  Logger.log("Owner sheet created/found: "+sheet.getName());
}



function diagnoseSheetHeaders() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  const sheets = [
    { name: CONFIG.SHEET_NAME, headers: HEADERS },
    { name: CONFIG.OWNER_SHEET_NAME, headers: OWNER_HEADERS },
    { name: CONFIG.COMPANY_SHEET_NAME, headers: COMPANY_HEADERS }
  ];

  const report = sheets.map(function (item) {
    const sheet = ss.getSheetByName(item.name);

    if (!sheet) {
      return item.name + ": SHEET NOT FOUND";
    }

    const actual = sheet
      .getRange(1, 1, 1, item.headers.length)
      .getDisplayValues()[0]
      .map(function (value) {
        return String(value).trim();
      });

    const matches = item.headers.every(function (header, index) {
      return actual[index] === header;
    });

    return [
      "Sheet: " + item.name,
      "Status: " + (matches ? "OK" : "MISMATCH"),
      "Expected: " + item.headers.join(" | "),
      "Actual: " + actual.join(" | ")
    ].join("\n");
  });

  Logger.log(report.join("\n\n--------------------\n\n"));
}