/* Presentation and delivery only. This worker has no business mutation capability. */
const CACHE='commit-shell-v6-1';
const STATIC=['/offline.html','/styles.css','/icons/commit-192.png','/icons/commit-512.png','/icons/commit-maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('commit-shell-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // Never cache APIs, dynamic pages, private data, PayPal return URLs, or POSTs.
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));return;}
 if(STATIC.includes(url.pathname)&&!url.search)event.respondWith(fetch(request).catch(()=>caches.match(url.pathname)));
});
function safeLink(value){try{const url=new URL(value,self.location.origin);return url.origin===self.location.origin&&['/proposal','/commit','/waiting','/group','/activity'].includes(url.pathname)?url.href:new URL('/activity',self.location.origin).href;}catch{return new URL('/activity',self.location.origin).href;}}
self.addEventListener('push',event=>event.waitUntil((async()=>{let data={};try{data=event.data?.json()??{};}catch{}const badge=Number.isInteger(data.badge)&&data.badge>=0?Math.min(data.badge,999):0;if(self.navigator.setAppBadge)try{badge?await self.navigator.setAppBadge(badge):await self.navigator.clearAppBadge();}catch{}await self.registration.showNotification('Commit update',{body:'Open Commit to review the latest update.',icon:'/icons/commit-192.png',badge:'/icons/commit-192.png',tag:typeof data.activityId==='string'?data.activityId.slice(0,80):'commit-update',data:{url:safeLink(data.deepLink)}});})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const url=safeLink(event.notification.data?.url);for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){if(new URL(client.url).origin===self.location.origin&&'navigate' in client){await client.navigate(url);return client.focus();}}return self.clients.openWindow(url);})());});
