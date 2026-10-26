// Notifications only: never cache budgets, login pages or financial responses.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Ignore any former card reminders still queued by a push provider.
self.addEventListener('push',()=>{});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const target=new URL('/?card-update=1',self.location.origin).href;for(const w of windows)if(new URL(w.url).origin===self.location.origin){await w.navigate(target);return w.focus();}return self.clients.openWindow(target);})());});
