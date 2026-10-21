/* NUS Kitchen offline shell v1. API data stays in browser localStorage, never in shared Git. */
'use strict';
const CACHE_NAME='nus-kitchen-shell-v1';
const SHELL=new URL('./index.html',self.registration.scope).href;
const LOGO=new URL('../logo-nha-ung-sinh.png',self.registration.scope).href;
const wait=ms=>new Promise((_,reject)=>setTimeout(()=>reject(new Error('network timed out')),ms));

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    try{
      const response=await fetch(new Request(SHELL,{cache:'reload'}));
      if(response.ok)await cache.put(SHELL,response.clone());
    }catch(error){ /* First install may be offline. Online navigation will retry. */ }
    try{
      const logo=await fetch(LOGO);
      if(logo.ok)await cache.put(LOGO,logo.clone());
    }catch(error){ /* Logo is optional for offline use. */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('nus-kitchen-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      try{
        const response=await Promise.race([fetch(request),wait(7000)]);
        if(!response.ok)throw new Error('Page unavailable');
        // Keep the last successfully downloaded app shell for the next offline launch.
        await cache.put(SHELL,response.clone());
        return response;
      }catch(error){
        return (await cache.match(SHELL))||
          new Response('Không thể mở màn hình nhà bếp ngoại tuyến. Hãy mở trang một lần khi có Internet.',{
            status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}
          });
      }
    })());
  }else if(url.href===LOGO){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      const cached=await cache.match(LOGO);
      if(cached)return cached;
      const response=await fetch(request);
      if(response.ok)await cache.put(LOGO,response.clone());
      return response;
    })());
  }
});
