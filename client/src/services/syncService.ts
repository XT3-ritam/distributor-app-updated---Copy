import api from './api';
const KEY='pending_orders_v2'; const CACHE='master_cache_v2';
export type PendingOrder={customerId:string;clientIdempotencyKey:string;items:Array<{productId:string;quantity:number;ratePerKg:number;discountPercent:number}>;createdAt:string};
export const SyncService={
  saveOfflineOrder(order:PendingOrder){const all=this.getPendingOrders(); all.push(order); localStorage.setItem(KEY,JSON.stringify(all));},
  getPendingOrders():PendingOrder[]{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}},
  async syncOrders(){const pending=this.getPendingOrders(); const remaining:PendingOrder[]=[]; for(const order of pending){try{await api.post('/orders',order);}catch{remaining.push(order);}} localStorage.setItem(KEY,JSON.stringify(remaining)); return {synced:pending.length-remaining.length,remaining:remaining.length};},
  cache(name:string,data:unknown){const all=JSON.parse(localStorage.getItem(CACHE)||'{}'); all[name]=data; localStorage.setItem(CACHE,JSON.stringify(all));},
  getCache<T>(name:string):T|undefined{try{return JSON.parse(localStorage.getItem(CACHE)||'{}')[name] as T}catch{return undefined;}},
  pendingCount(){return this.getPendingOrders().length;}
};
window.addEventListener('online',()=>{void SyncService.syncOrders();});
