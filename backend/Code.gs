const CONFIG={
  SPREADSHEET_ID:"1qSvVyxwHFVfJCtc2cZXHYiCbmk_NjRZqBeUZkJ6O9OA",
  SHEET_NAME:"Cards",
  COMPANY_SHEET_NAME:"CompanyMaster",
  OWNER_SHEET_NAME:"CardOwners",
  RESPONSE_SHEET_NAME:"ViewerResponses",
  DRIVE_FOLDER_ID:"1nBH0EkyB4_Dj0LLEkYne-YdP4iJkABVo",
  FRONTEND_BASE_URL:"https://siddhartha1209.github.io/Visiting_Card_v2.0.0/",
  MAX_UPLOAD_BYTES:9000000,
  CACHE_SECONDS:21600,
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
  "appId","guid","createdAt","status","isFavourite"
];
const RESPONSE_HEADERS=[
  "responseId","cardGuid","appId","viewerName","phone","whatsapp","email","company","message","createdAt"
];

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

    if(action==="responses"){
      return json_(getViewerResponses_(p.appId,p.guid));
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
      actions:["submit","submitResponse","card","company","ownedCards","responses","favourite","status","health"]
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
    if(action==="submitresponse")return json_(submitViewerResponse_(body));
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

  let company=null;

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

  sheet.appendRow(
    HEADERS.map(function(header){
      return record[header]||"";
    })
  );

  ownerSheet.appendRow([
    appId,
    guid,
    createdAt,
    "Active",
    "false"
  ]);

  CacheService.getScriptCache().put(
    "card:"+guid,
    JSON.stringify(record),
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
    attachCompanyDescription_(record);

    return{
      success:true,
      record:record
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

  const responseCounts=getResponseCounts_();
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

    if(!guid||!cardsByGuid[guid]){
      continue;
    }

    const card=cardsByGuid[guid];

    attachCompanyDescription_(card);

    cards.push({
      ...card,
      ownerStatus:status,
      isFavourite:
        String(row[ownerFavouriteIndex]||"false")
          .toLowerCase()==="true",
      responseCount:responseCounts[guid]||0
    });
  }

  return{
    success:true,
    appId:appId,
    count:cards.length,
    cards:cards
  };
}


function getViewerResponses_(appId,guid){
  appId=clean_(appId);
  guid=clean_(guid);
  if(!appId)return{success:false,status:400,error:"App ID is required."};
  const owned=getOwnedGuidSet_(appId);
  const sheet=getResponseSheet_();
  const values=sheet.getDataRange().getValues();
  const records=[];
  if(values.length<2)return{success:true,appId:appId,count:0,responses:[]};
  const indexes={};
  RESPONSE_HEADERS.forEach(function(header,index){indexes[header]=index;});
  for(let i=1;i<values.length;i++){
    const rowGuid=clean_(values[i][indexes.cardGuid]);
    if(!owned[rowGuid])continue;
    if(guid&&rowGuid!==guid)continue;
    records.push({
      responseId:clean_(values[i][indexes.responseId]),
      cardGuid:rowGuid,
      appId:clean_(values[i][indexes.appId]),
      viewerName:clean_(values[i][indexes.viewerName]),
      phone:clean_(values[i][indexes.phone]),
      whatsapp:clean_(values[i][indexes.whatsapp]),
      email:clean_(values[i][indexes.email]),
      company:clean_(values[i][indexes.company]),
      message:clean_(values[i][indexes.message]),
      createdAt:values[i][indexes.createdAt] instanceof Date?values[i][indexes.createdAt].toISOString():clean_(values[i][indexes.createdAt])
    });
  }
  records.reverse();
  return{success:true,appId:appId,count:records.length,responses:records};
}

function submitViewerResponse_(p){
  const guid=clean_(p.cardGuid||p.guid);
  const errors=[];
  if(!guid)errors.push("Card GUID is required.");
  if(!clean_(p.viewerName))errors.push("Name is required.");
  const email=clean_(p.email);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push("Email address is invalid.");
  if(clean_(p.message).length>1000)errors.push("Message is too long.");
  if(errors.length)throw new Error(errors.join(" "));
  const owner=getOwnerForGuid_(guid);
  if(!owner)throw new Error("Card owner not found.");
  getCard_(guid);
  const sheet=getResponseSheet_();
  const responseId=Utilities.getUuid();
  const createdAt=new Date().toISOString();
  const record={
    responseId:responseId,
    cardGuid:guid,
    appId:owner.appId,
    viewerName:clean_(p.viewerName),
    phone:clean_(p.phone),
    whatsapp:clean_(p.whatsapp),
    email:email,
    company:clean_(p.company),
    message:clean_(p.message),
    createdAt:createdAt
  };
  sheet.appendRow(RESPONSE_HEADERS.map(function(header){return record[header]||"";}));
  return{success:true,responseId:responseId,cardGuid:guid,createdAt:createdAt};
}

function getOwnerForGuid_(guid){
  const sheet=getOwnerSheet_();
  const values=sheet.getDataRange().getValues();
  const guidIndex=OWNER_HEADERS.indexOf("guid");
  const appIdIndex=OWNER_HEADERS.indexOf("appId");
  const statusIndex=OWNER_HEADERS.indexOf("status");
  for(let i=1;i<values.length;i++){
    if(clean_(values[i][guidIndex])===guid&&clean_(values[i][statusIndex]||"Active")==="Active"){
      return{appId:clean_(values[i][appIdIndex]),guid:guid};
    }
  }
  return null;
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
      if(guid)result[guid]=true;
    }
  }
  return result;
}

function getResponseCounts_(){
  const sheet=getResponseSheet_();
  const values=sheet.getDataRange().getValues();
  const result={};
  if(values.length<2)return result;
  const guidIndex=RESPONSE_HEADERS.indexOf("cardGuid");
  for(let i=1;i<values.length;i++){
    const guid=clean_(values[i][guidIndex]);
    if(guid)result[guid]=(result[guid]||0)+1;
  }
  return result;
}

function updateOwnerField_(p,field){
  const appId=clean_(p.appId);
  const guid=clean_(p.guid);
  if(!appId||!guid)throw new Error("App ID and card GUID are required.");
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
      return{success:true,guid:guid,field:field,value:value};
    }
  }
  throw new Error("Owned card not found.");
}

function getResponseSheet_(){
  if(!CONFIG.SPREADSHEET_ID||CONFIG.SPREADSHEET_ID==="YOUR_SPREADSHEET_ID")throw new Error("Google Sheet ID is not configured.");
  const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet=ss.getSheetByName(CONFIG.RESPONSE_SHEET_NAME);
  if(!sheet)sheet=ss.insertSheet(CONFIG.RESPONSE_SHEET_NAME);
  ensureHeaders_(sheet,RESPONSE_HEADERS,"responses");
  return sheet;
}

function attachCompanyDescription_(record){
  if(!record||!record.instituteName){
    record.companyDescription="";
    return record;
  }

  const sheet=getCompanySheet_();
  const values=sheet.getDataRange().getValues();

  if(values.length<2){
    record.companyDescription="";
    return record;
  }

  const nameIndex=COMPANY_HEADERS.indexOf("companyName");
  const normalizedName=normalizeCompanyName_(
    record.instituteName
  );

  for(let i=1;i<values.length;i++){
    const existingName=normalizeCompanyName_(
      values[i][nameIndex]
    );

    if(existingName===normalizedName){
      const company=companyRowToObject_(values[i]);

      record.companyDescription=
        company.description||"";

      return record;
    }
  }

  record.companyDescription="";

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
        "Sheet header row does not match the required schema."
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