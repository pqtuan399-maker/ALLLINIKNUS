/* NUS Kitchen Firebase RTDB listener (opt-in).
 * Firebase pushes only after the publisher has written to RTDB.
 * Existing Apps Script APIs remain a fallback and are NOT modified.
 * Requires firebase-config.js to contain a real project and enabled:true.
 */
(async function(){
  'use strict';
  const config=window.NUS_FIREBASE_CONFIG;
  if(!config||config.enabled!==true)return;
  const bridge=window.NUSKitchenRealtime;
  if(!bridge){
    console.error('[NUS Firebase] Kitchen runtime bridge not found; retaining API mode.');
    return;
  }
  const required=['apiKey','databaseURL','projectId','appId'];
  if(required.some(key=>typeof config[key]!=='string'||!config[key].trim())){
    console.warn('[NUS Firebase] Missing public Firebase web settings; API fallback remains active.');
    return;
  }
  let stopStreams=[];
  let stopped=false;
  function stop(){
    stopStreams.forEach(fn=>{try{fn()}catch(_){}});
    stopStreams=[];
    bridge.disconnected();
  }
  function problem(source,error){
    console.warn('[NUS Firebase]',source,error);
    if(source==='snapshot'||source==='code8')bridge.fault(source);
    else bridge.disconnected();
  }
  try{
    const base='https://www.gstatic.com/firebasejs/13.1.0/';
    const [{initializeApp},{getDatabase,ref,onValue},authApi]=await Promise.all([
      import(base+'firebase-app.js'),
      import(base+'firebase-database.js'),
      config.requireGoogleSignIn===false
        ?Promise.resolve(null):import(base+'firebase-auth.js')
    ]);
    const app=initializeApp({
      apiKey:config.apiKey,
      authDomain:config.authDomain||undefined,
      databaseURL:config.databaseURL,
      projectId:config.projectId,
      appId:config.appId
    },'nus-kitchen-live');
    const database=getDatabase(app);
    function listen(path,source,handle){
      const unsubscribe=onValue(ref(database,path),snapshot=>{
        if(!snapshot.exists()){
          problem(source,'No published data at '+path);
          return;
        }
        try{
          handle(snapshot.val());
        }catch(err){
          problem(source,err&&err.message||err);
        }
      },error=>problem(source,error&&error.message||error));
      stopStreams.push(unsubscribe);
    }
    function start(){
      if(stopped)return;
      stop();
      listen('.info/connected','connection',connected=>{
        bridge.connection(!!connected);
      });
      listen(config.snapshotPath||'nusKitchen/snapshotJson','snapshot',payload=>{
        bridge.snapshot(typeof payload==='string'?JSON.parse(payload):payload);
      });
      listen(config.code8Path||'nusKitchen/code8Json','code8',payload=>{
        bridge.code8(typeof payload==='string'?JSON.parse(payload):payload);
      });
    }
    if(!authApi){start();return}
    const {getAuth,GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signInWithRedirect}=authApi;
    const auth=getAuth(app);
    const button=document.createElement('button');
    button.type='button';
    button.className='button';
    button.id='nus-firebase-login';
    button.textContent='🔐 Kết nối Gmail';
    button.title='Đăng nhập tài khoản được cấp quyền xem dữ liệu Firebase';
    const toolbar=document.querySelector('.toolbar');
    if(toolbar)toolbar.appendChild(button);
    else{problem('connection','Toolbar not found');return}
    button.addEventListener('click',async()=>{
      button.disabled=true;button.textContent='Đang xác thực...';
      try{
        await signInWithPopup(auth,new GoogleAuthProvider());
      }catch(error){
        const code=String(error&&error.code||'');
        if(code==='auth/popup-blocked'||code==='auth/operation-not-supported-in-this-environment'){
          try{await signInWithRedirect(auth,new GoogleAuthProvider())}
          catch(redirectError){problem('connection',redirectError);button.title=String(redirectError.message||redirectError)}
        }else{
          problem('connection',error&&error.message||error);
          button.title=String(error&&error.message||error);
        }
      }finally{
        button.disabled=false;button.textContent='🔐 Kết nối Gmail';
      }
    });
    onAuthStateChanged(auth,user=>{
      button.hidden=!!user;
      if(user){stopped=false;start()}
      else{stop();stopped=false}
    },err=>problem('connection',err));
  }catch(err){
    problem('connection',err&&err.message||err);
  }
})();
