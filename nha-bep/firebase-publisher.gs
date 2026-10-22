/**
 * NUS KITCHEN — FIREBASE RTDB PUBLISHER V1
 *
 * Standalone Apps Script. Does NOT alter CODE MASTER 1.2.8, CODE #8,
 * either existing Web App, or Google Sheets.
 *
 * Script Properties (Project Settings → Script Properties):
 * NUS_FIREBASE_DATABASE_URL = https://YOUR-DB.REGION.firebasedatabase.app
 * NUS_FIREBASE_SERVICE_ACCOUNT_JSON = contents of service-account JSON
 *
 * Security: NEVER place credentials or private keys in GitHub or the
 * browser's firebase-config.js. Do not paste secrets into public chats.
 *
 * In standalone mode, the maximum Apps Script timer resolution is 1 minute.
 * RTDB listeners react instantly AFTER this publisher writes an update.
 * For truly immediate source-to-screen updates, the code that writes Sheets
 * must explicitly publish on successful commit (a later integration step).
 */
const NUS_FIREBASE_PUBLISHER={
  v7:'https://script.google.com/macros/s/AKfycbw0hY2qecbDLcRkzHbP-t3Ed4lkeQBiXycY511OznIVibqN-fqAN0-iptcXGlufBy2POQ/exec',
  code8:'https://script.google.com/macros/s/AKfycbzbs_Fb-Q_Zr7YuCi2vIEFeWebLL4hbWvWj7SR5YaJgcbMr4V8Co4I74X1TSqZR3Xx7Tg/exec',
  callback:'NUS_FB_MIRROR'
};

function nusFirebasePublish(){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(3000))return;
  try{
    const properties=PropertiesService.getScriptProperties();
    const databaseURL=String(properties.getProperty('NUS_FIREBASE_DATABASE_URL')||'').trim().replace(/\/+$/,'');
    const serviceJSON=properties.getProperty('NUS_FIREBASE_SERVICE_ACCOUNT_JSON');
    if(!/^https:\/\/[a-z0-9.-]+(?:firebaseio\.com|firebasedatabase\.app)$/i.test(databaseURL))
      throw new Error('Set a valid NUS_FIREBASE_DATABASE_URL Script Property');
    if(!serviceJSON)throw new Error('Missing NUS_FIREBASE_SERVICE_ACCOUNT_JSON Script Property');
    const service=JSON.parse(serviceJSON);
    if(!service.client_email||!service.private_key)throw new Error('Invalid service account fields');
    const token=nusFirebaseOAuthToken_(service);
    let changed=0;

    try{
      const source=nusFirebaseReadJsonp_(NUS_FIREBASE_PUBLISHER.v7);
      if(!source||source.ok!==true||!source.today||!source.tomorrow)throw new Error('V7 payload invalid');
      for(const day of [source.today,source.tomorrow]){
        if(!Array.isArray(day.columns)||day.columns.length!==8)throw new Error('V7 columns invalid');
      }
      // Never mirror volatile readAt/checkedAt fields: avoids repeat writes.
      const payload={
        ok:true,title:String(source.title||''),note:String(source.note||''),
        today:source.today,tomorrow:source.tomorrow
      };
      if(nusFirebaseWriteChanged_(properties,databaseURL,token,'snapshotJson',payload))changed++;
    }catch(err){console.error('Firebase roster publish error:',err)}

    try{
      const source=nusFirebaseReadJsonp_(NUS_FIREBASE_PUBLISHER.code8);
      if(!source||source.ok!==true||source.schema!==1||!Array.isArray(source.events))
        throw new Error('CODE #8 payload invalid');
      // These are approved+successfully applied events only, as filtered by CODE #8 API.
      // Deliberately exclude email addresses, approval tokens, reasons and hashes.
      const events=source.events.filter(e=>e&&e.eventId).map(e=>({
        eventId:String(e.eventId),
        requestId:String(e.requestId||''),
        name:String(e.name||''),
        serviceDate:String(e.serviceDate||''),
        from:String(e.from||''),
        to:String(e.to||''),
        approvedAt:String(e.approvedAt||''),
        updatedAt:String(e.updatedAt||'')
      }));
      const payload={ok:true,schema:1,source:'NUS_CODE8_APPROVED',
        day:String(source.day||''),count:events.length,events};
      if(nusFirebaseWriteChanged_(properties,databaseURL,token,'code8Json',payload))changed++;
    }catch(err){console.error('Firebase CODE #8 publish error:',err)}
    console.log('NUS Firebase publish finished. Changed nodes: '+changed);
  }finally{lock.releaseLock()}
}

function nusFirebaseReadJsonp_(endpoint){
  const cb=NUS_FIREBASE_PUBLISHER.callback;
  const query='callback='+encodeURIComponent(cb)+'&t='+Date.now();
  const response=UrlFetchApp.fetch(endpoint+'?'+query,{
    followRedirects:true,muteHttpExceptions:true,headers:{'User-Agent':'NUS-Kitchen-Firebase-Publisher/1.0'}
  });
  if(response.getResponseCode()!==200)
    throw new Error('Source API HTTP '+response.getResponseCode());
  const content=response.getContentText().trim();
  const match=content.match(/^NUS_FB_MIRROR\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*$/);
  if(!match)throw new Error('Source API did not return JSONP');
  return JSON.parse(match[1]);
}

function nusFirebaseWriteChanged_(properties,databaseURL,token,node,payload){
  const json=JSON.stringify(payload);
  const hash=nusFirebaseHash_(json);
  const key='NUS_FIREBASE_HASH_'+node;
  if(properties.getProperty(key)===hash)return false;
  // Write a JSON *string*. RTDB native objects drop empty arrays used by the
  // eight-column roster, so keep payload shape lossless.
  const response=UrlFetchApp.fetch(databaseURL+'/nusKitchen/'+node+'.json',{
    method:'put',
    contentType:'application/json',
    headers:{'Authorization':'Bearer '+token},
    payload:JSON.stringify(json),
    muteHttpExceptions:true
  });
  if(response.getResponseCode()<200||response.getResponseCode()>=300)
    throw new Error('Firebase '+node+' HTTP '+response.getResponseCode()+': '+response.getContentText().slice(0,160));
  properties.setProperty(key,hash);
  return true;
}

function nusFirebaseHash_(text){
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text)
    .map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');
}

function nusFirebaseOAuthToken_(service){
  const cache=CacheService.getScriptCache();
  const cached=cache.get('NUS_FIREBASE_GOOGLE_OAUTH_TOKEN');
  if(cached)return cached;
  const now=Math.floor(Date.now()/1000);
  const base64url=text=>Utilities.base64EncodeWebSafe(text,Utilities.Charset.UTF_8).replace(/=+$/,'');
  const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=base64url(JSON.stringify({
    iss:service.client_email,
    scope:'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database',
    aud:'https://oauth2.googleapis.com/token',
    iat:now,exp:now+3500
  }));
  const body=header+'.'+claim;
  const signature=Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(body,service.private_key)
  ).replace(/=+$/,'');
  const reply=UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{
    method:'post',muteHttpExceptions:true,
    payload:{
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:body+'.'+signature
    }
  });
  if(reply.getResponseCode()!==200)
    throw new Error('OAuth service account refused: HTTP '+reply.getResponseCode());
  const tokens=JSON.parse(reply.getContentText());
  if(!tokens.access_token)throw new Error('No Firebase access token received');
  cache.put('NUS_FIREBASE_GOOGLE_OAUTH_TOKEN',tokens.access_token,
    Math.max(60,Math.min(3000,Number(tokens.expires_in||3600)-120)));
  return tokens.access_token;
}

function nusFirebaseInstallMinuteTrigger(){
  // Call manually ONCE after configuring the Script Properties.
  const handler='nusFirebasePublish';
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler)
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(1).create();
  nusFirebasePublish();
  console.log('NUS Firebase publisher installed: every minute');
}

function nusFirebaseUninstallMinuteTrigger(){
  const handler='nusFirebasePublish';
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler)
    .forEach(t=>ScriptApp.deleteTrigger(t));
  console.log('NUS Firebase scheduled publisher disabled');
}
