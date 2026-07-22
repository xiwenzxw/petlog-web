import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithRedirect, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDiu-6FY1u6tegbsMYJlm1v_Yn2QVvUubM',
  authDomain: 'petlog-backup.firebaseapp.com',
  projectId: 'petlog-backup',
  storageBucket: 'petlog-backup.firebasestorage.app',
  messagingSenderId: '1003436567426',
  appId: '1:1003436567426:web:3e98fea18dcdfdcaf3fd9b'
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

const kinds = {
  vomit:['🤢','呕吐'], diarrhea:['💩','拉稀'], vet:['🏥','看医生'], deworming:['💊','内驱'],
  flea:['🦟','外驱'], vaccine:['💉','疫苗'], weight:['⚖️','体重'], bath:['🛁','洗澡'],
  grooming:['✂️','美容'], appetite:['🍖','食欲'], mood:['😊','精神状态'], other:['📝','其他']
};
const careKinds = ['deworming','flea','vaccine','bath','grooming'];
const defaultReminders = () => ({ deworming:{interval:30,last:''}, flea:{interval:30,last:''}, vaccine:{interval:365,last:''}, bath:{interval:21,last:''}, grooming:{interval:45,last:''} });
const blankState = () => ({version:1, selectedPetId:'', pets:[{id:crypto.randomUUID(),name:'Vinvin',breed:'马尔济斯',sex:'',birthday:'',chip:'',avatar:'',reminders:defaultReminders()},{id:crypto.randomUUID(),name:'果冻',breed:'马尔济斯',sex:'',birthday:'',chip:'',avatar:'',reminders:defaultReminders()}],records:[]});
let state, page='home', editingPetId=null, editingReminder=null;
let cloudUser=null, cloudReady=false, cloudSyncTimer=null, cloudStatus='未登录';

const db = (() => new Promise((resolve,reject) => { const r=indexedDB.open('petlog-web',1); r.onupgradeneeded=()=>r.result.createObjectStore('store'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }))();
async function load(){ const database=await db; const value=await new Promise((resolve,reject)=>{const r=database.transaction('store','readonly').objectStore('store').get('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}); state=value||blankState(); if(!state.selectedPetId) state.selectedPetId=state.pets[0]?.id||''; render(); }
async function saveLocal(){ const database=await db; await new Promise((resolve,reject)=>{const r=database.transaction('store','readwrite').objectStore('store').put(state,'state');r.onsuccess=resolve;r.onerror=()=>reject(r.error)}); }
async function save(){ await saveLocal(); queueCloudSync(); }
const pet=()=>state.pets.find(x=>x.id===state.selectedPetId);
const records=()=>state.records.filter(x=>x.petId===pet()?.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
const weights=()=>records().filter(x=>x.kind==='weight'&&Number.isFinite(x.weight));
const localDate=d=>new Date(d).toLocaleDateString('zh-CN',{month:'long',day:'numeric'});
const dateTime=d=>new Date(d).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const dayStart=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const avatar=(p,size='')=>`<span class="avatar ${size}">${p?.avatar?`<img src="${p.avatar}" alt="${escape(p.name)}">`:'🐾'}</span>`;
const escape=s=>String(s||'').replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));

function nav(){ return `<nav class="tabs">${[['home','⌂','日记'],['reminders','◷','提醒'],['stats','⌁','统计'],['pets','♙','宠物']].map(([id,icon,label])=>`<button class="tab ${page===id?'active':''}" data-page="${id}"><span>${icon}</span>${label}</button>`).join('')}</nav>` }
function recordRows(list){if(!list.length)return '<div class="empty">还没有记录。点击右上角 + 开始记录。</div>';return list.map(r=>`<div class="record"><span class="record-icon">${kinds[r.kind][0]}</span><div class="record-main"><div class="record-title">${kinds[r.kind][1]}${r.kind==='weight'?` · ${r.weight.toFixed(2)} kg`:''}</div>${r.note?`<div class="record-note">${escape(r.note)}</div>`:''}</div>${r.photo?`<img class="record-photo" src="${r.photo}" alt="记录照片">`:''}<div class="record-meta">${dateTime(r.date)}</div></div>`).join('')}
function home(){const p=pet();if(!p)return noPets();const ws=weights(), latest=ws[0], prev=ws[1];const today=records().some(r=>dayStart(r.date).getTime()===dayStart(new Date()).getTime());const change=latest&&prev?latest.weight-prev.weight:null;return `<header class="topbar"><div class="pet-switcher">${avatar(p)}<select id="pet-select">${state.pets.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${escape(x.name)}</option>`).join('')}</select></div><button id="add-record" class="icon-button" aria-label="新增记录">＋</button></header><section class="hero"><div class="status">${latest&&dayStart(latest.date).getTime()===dayStart(new Date()).getTime()?`今日体重：${latest.weight.toFixed(2)} kg`:today?'今天已有健康记录':'😊 今天一切正常'}</div><p class="subtle">为 ${escape(p.name)} 留住每一个健康细节</p></section>${latest?`<button class="weight-card" data-page="stats"><span class="weight-icon">⚖️</span><div><div class="subtle">最新体重 · ${localDate(latest.date)}</div><div class="weight-number">${latest.weight.toFixed(2)} kg</div></div><div class="push">${change===null?'<span class="subtle">首次记录</span>':`<span class="subtle">较上次</span><br><strong class="change ${change>0?'up':change<0?'down':''}">${change>0?'+':''}${change.toFixed(2)} kg</strong>`}</div></button>`:''}<div class="section-head"><h2>最近记录</h2><button class="text-button" data-page="stats">查看体重趋势</button></div><section class="timeline">${recordRows(records().slice(0,8))}</section>`}
function reminderPage(){const p=pet();if(!p)return noPets();const rs=p.reminders||defaultReminders();return `<header class="topbar"><div class="brand">提醒</div></header><p class="subtle">点击项目可设置周期和上次完成日期。</p><section class="card-list">${careKinds.map(k=>{const r=rs[k], next=r.last?new Date(new Date(r.last+'T12:00:00').getTime()+r.interval*86400000):null, days=next?Math.ceil((dayStart(next)-dayStart(new Date()))/86400000):null;const detail=!next?'完成后会自动计算':days<0?`已逾期 ${-days} 天`:days===0?'今天到期':`还有 ${days} 天`;return `<button class="reminder" data-reminder="${k}"><span class="reminder-icon">${kinds[k][0]}</span><div class="reminder-main"><strong>${kinds[k][1]}</strong><div class="due">${detail} · 每 ${r.interval} 天</div></div>${days!==null&&days<=0?'<span class="tag">到期</span>':next?`<span class="subtle">${localDate(next)}</span>`:'<span class="subtle">未设置</span>'}</button>`}).join('')}</section>`}
function stats(){const ws=weights().slice().reverse(), counts=['vomit','diarrhea','vet'].map(k=>records().filter(r=>r.kind===k).length);const max=Math.max(...ws.map(x=>x.weight),1), min=Math.min(...ws.map(x=>x.weight),0);return `<header class="topbar"><div class="brand">健康统计</div></header><div class="section-head"><h2>今年</h2></div><section class="stats">${[['🤢','呕吐',counts[0]],['💩','拉稀',counts[1]],['🏥','医生',counts[2]]].map(x=>`<div class="stat"><span>${x[0]}</span><b>${x[2]}</b><small>${x[1]}</small></div>`).join('')}</section><div class="section-head"><h2>体重趋势</h2>${ws.length?`<span class="subtle">${ws.length} 次记录</span>`:''}</div>${ws.length?`<section class="chart-row">${ws.map(w=>`<div class="bar-wrap" title="${localDate(w.date)} ${w.weight}kg"><div class="bar" style="height:${Math.max(8,((w.weight-min)/(max-min||1))*100)}%"></div></div>`).join('')}</section><div class="section-head"><h2>称重记录</h2></div><section class="timeline">${recordRows(weights().slice(0,30))}</section>`:'<section class="timeline"><div class="empty">添加第一条体重记录后，这里会显示变化趋势。</div></section>'}`}
function petsPage(){const p=pet();return `<header class="topbar"><div class="brand">宠物</div><button id="add-pet" class="icon-button">＋</button></header><section class="card-list">${state.pets.map(x=>`<button class="pet-card" data-edit-pet="${x.id}">${avatar(x)}<div><strong>${escape(x.name)}</strong><span class="subtle">${escape(x.breed||'我的毛孩子')}</span></div><span class="push subtle">编辑 ›</span></button>`).join('')}</section>${p?`<div class="section-head"><h2>资料与备份</h2></div><section class="settings-card"><button id="export">导出备份文件</button><button id="import">导入备份文件</button><button id="delete-pet" class="delete">删除当前宠物</button></section><p class="hint">记录仅保存在这台手机。建议不时导出备份文件到“文件”或 iCloud Drive。</p>`:''}`}
function noPets(){return '<header class="topbar"><div class="brand">PetLog</div></header><div class="empty"><p>还没有宠物资料。</p><button id="add-pet" class="text-button primary">添加第一只宠物</button></div>'}
function cloudBar(){return cloudUser?`<div class="cloud-bar"><span class="cloud-name">☁️ ${cloudStatus} · ${escape(cloudUser.email||'Google 账号')}</span><button id="logout">退出</button></div>`:`<div class="cloud-bar"><span>☁️ 登录后自动备份，不怕换手机</span><button id="login">登录同步</button></div>`}
function render(){const body=page==='home'?home():page==='reminders'?reminderPage():page==='stats'?stats():petsPage();document.querySelector('#app').innerHTML=`<div class="app">${cloudBar()}${body}${nav()}</div>`;bindPage()}

function bindPage(){document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render()});document.querySelector('#pet-select')?.addEventListener('change',async e=>{state.selectedPetId=e.target.value;await save();render()});document.querySelector('#add-record')?.addEventListener('click',openRecord);document.querySelector('#add-pet')?.addEventListener('click',()=>openPet());document.querySelectorAll('[data-edit-pet]').forEach(b=>b.onclick=()=>openPet(b.dataset.editPet));document.querySelectorAll('[data-reminder]').forEach(b=>b.onclick=()=>openReminder(b.dataset.reminder));document.querySelector('#export')?.addEventListener('click',exportData);document.querySelector('#import')?.addEventListener('click',()=>document.querySelector('#import-file').click());document.querySelector('#delete-pet')?.addEventListener('click',deletePet);document.querySelector('#login')?.addEventListener('click',login);document.querySelector('#logout')?.addEventListener('click',logout)}
const $=s=>document.querySelector(s);
function setupDialogs(){document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#record-kind').innerHTML=Object.entries(kinds).map(([id,v])=>`<option value="${id}">${v[0]} ${v[1]}</option>`).join('');$('#record-kind').onchange=()=>{$('#weight-field').hidden=$('#record-kind').value!=='weight'};$('#record-form').onsubmit=saveRecord;$('#pet-form').onsubmit=savePet;$('#reminder-form').onsubmit=saveReminder;$('#pet-form [name=avatar]').onchange=e=>fileData(e.target.files[0]).then(d=>{if(d){$('#avatar-preview').innerHTML=`<img src="${d}" alt="头像">`;$('#avatar-preview').dataset.value=d}});$('#import-file').onchange=importData}
function openRecord(){const form=$('#record-form');form.reset();$('#record-date').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);$('#weight-field').hidden=true;$('#record-dialog').showModal()}
async function saveRecord(e){e.preventDefault();const f=new FormData(e.target),kind=f.get('kind'),weight=Number(String(f.get('weight')).replace(',','.'));if(kind==='weight'&&(!Number.isFinite(weight)||weight<=0)){alert('请填写正确的体重，例如 5.30');return}const photo=await fileData(f.get('photo'));state.records.push({id:crypto.randomUUID(),petId:pet().id,kind,date:f.get('date'),weight:kind==='weight'?weight:null,note:f.get('note').trim(),photo:photo||''});await save();$('#record-dialog').close();render()}
function openPet(id=null){editingPetId=id;const p=id?state.pets.find(x=>x.id===id):null,f=$('#pet-form');f.reset();$('#pet-dialog-title').textContent=p?'编辑宠物':'添加宠物';['name','breed','sex','birthday','chip'].forEach(k=>f.elements[k].value=p?.[k]||'');$('#avatar-preview').dataset.value=p?.avatar||'';$('#avatar-preview').innerHTML=p?.avatar?`<img src="${p.avatar}" alt="头像">`:'🐾';$('#pet-dialog').showModal()}
async function savePet(e){e.preventDefault();const f=new FormData(e.target), p=editingPetId?state.pets.find(x=>x.id===editingPetId):{id:crypto.randomUUID(),reminders:defaultReminders()};Object.assign(p,{name:f.get('name').trim(),breed:f.get('breed').trim(),sex:f.get('sex').trim(),birthday:f.get('birthday'),chip:f.get('chip'),avatar:$('#avatar-preview').dataset.value||''});if(!editingPetId){state.pets.push(p);state.selectedPetId=p.id}await save();$('#pet-dialog').close();render()}
function openReminder(kind){editingReminder=kind;const r=pet().reminders[kind],f=$('#reminder-form');$('#reminder-title').textContent=`${kinds[kind][1]}提醒`;f.elements.interval.value=r.interval;f.elements.last.value=r.last||'';$('#reminder-dialog').showModal()}
async function saveReminder(e){e.preventDefault();const f=new FormData(e.target),r=pet().reminders[editingReminder];r.interval=Math.max(1,Number(f.get('interval'))||30);r.last=f.get('last');await save();$('#reminder-dialog').close();render()}
async function deletePet(){const p=pet();if(!p||!confirm(`确定删除 ${p.name} 和它的所有记录吗？`))return;state.records=state.records.filter(r=>r.petId!==p.id);state.pets=state.pets.filter(x=>x.id!==p.id);state.selectedPetId=state.pets[0]?.id||'';await save();render()}
function fileData(file){return new Promise(resolve=>{if(!file)return resolve('');const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file)})}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`PetLog-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)}
async function importData(e){const file=e.target.files[0];if(!file)return;try{const imported=JSON.parse(await file.text());if(!Array.isArray(imported.pets)||!Array.isArray(imported.records))throw Error();if(!confirm('导入会替换目前手机上的所有 PetLog 资料，确定继续吗？'))return;state=imported;state.selectedPetId||=state.pets[0]?.id||'';await save();render()}catch{alert('这不是有效的 PetLog 备份文件。')}finally{e.target.value=''}}

async function login(){
  try { await signInWithRedirect(auth, provider); }
  catch (error) { alert(`无法开始 Google 登录：${error.message}`); }
}
async function logout(){
  await signOut(auth);
  cloudUser=null; cloudReady=false; cloudStatus='未登录'; render();
}
function cloudRef(){ return doc(firestore, 'users', cloudUser.uid, 'app', 'petlog'); }
function queueCloudSync(){
  if(!cloudUser || !cloudReady) return;
  cloudStatus='正在备份…'; render();
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(syncCloud, 700);
}
async function syncCloud(){
  if(!cloudUser || !cloudReady) return;
  try {
    await setDoc(cloudRef(), { payload: state, updatedAt: serverTimestamp() });
    cloudStatus='已自动备份'; render();
  } catch (error) {
    cloudStatus='等待网络'; render();
    console.warn('PetLog cloud sync failed', error);
  }
}
async function connectCloud(user){
  cloudUser=user; cloudStatus='正在读取备份…'; render();
  try {
    const snapshot=await getDoc(cloudRef());
    if(snapshot.exists() && snapshot.data().payload?.pets) {
      state=snapshot.data().payload;
      state.selectedPetId||=state.pets[0]?.id||'';
      await saveLocal();
      cloudStatus='已从云端恢复';
    } else {
      cloudStatus='正在创建第一份备份';
      cloudReady=true;
      await syncCloud();
      return;
    }
    cloudReady=true;
  } catch (error) {
    cloudReady=false; cloudStatus='云端暂时不可用';
    console.warn('PetLog cloud restore failed', error);
  }
  render();
}
function setupCloud(){
  onAuthStateChanged(auth, user => {
    if(user) connectCloud(user);
    else { cloudUser=null; cloudReady=false; cloudStatus='未登录'; render(); }
  });
}

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');setupDialogs();load().then(setupCloud);
