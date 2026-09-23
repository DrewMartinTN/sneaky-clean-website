'use strict';
const ESTIMATE_API=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?location.origin:'https://sneaky-clean-field-sync.sneaky-clean-tn.workers.dev';
const app=document.getElementById('app'),notice=document.getElementById('notice');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const when=iso=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'}).format(new Date(iso));
const angleLabels={'front-seats':'Front seats','rear-seats':'Rear seats','front-floor':'Front floor & mats','rear-floor':'Rear floor & mats',cargo:'Trunk / cargo area',exterior:'Full exterior',problem:'Problem close-up'};
let token=/^[a-f0-9]{64}$/.test(location.hash.slice(1))?location.hash.slice(1):null,config,makes=[],count=1,state,busy=false;
const images=new Map(),bookSelections=new Map();
function message(text,error=false){notice.hidden=!text;notice.textContent=text;notice.classList.toggle('error',error);}
async function api(action,body={},auth=true){
  const r=await fetch(ESTIMATE_API+'/estimates/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(auth&&token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Please try again.');return data;
}
const options=(values,selected)=>values.map(([v,label])=>`<option value="${esc(v)}" ${String(selected)===String(v)?'selected':''}>${esc(label)}</option>`).join('');
function field(label,name,type='text',extra=''){return `<div><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" required ${extra}></div>`;}
function vehicleCard(i){
  const years=Array.from({length:new Date().getFullYear()+2-1900+1},(_,n)=>new Date().getFullYear()+2-n);
  return `<section class="card vehicle" data-vehicle="${i}"><div class="card-heading"><div><span class="section-num">Vehicle ${i+1}</span><h2>What are we cleaning?</h2></div>${i?'<button type="button" class="quiet" id="remove-vehicle">Remove vehicle</button>':''}</div>
  <div class="grid three"><div><label for="year-${i}">Year</label><select id="year-${i}" name="year-${i}" required><option value="">Choose year</option>${options(years.map(y=>[y,y]))}</select></div><div><label for="make-${i}">Make</label><select id="make-${i}" name="make-${i}"><option value="">Choose make</option>${options(makes.map(m=>[m.id,m.name]))}</select><input class="hidden" id="manual-make-${i}" name="manual-make-${i}" aria-label="Vehicle make" maxlength="80" placeholder="e.g. Toyota"></div><div><label for="model-${i}">Model</label><select id="model-${i}" name="model-${i}"><option value="">Choose year & make</option></select><input class="hidden" id="manual-model-${i}" name="manual-model-${i}" aria-label="Vehicle model" maxlength="100" placeholder="e.g. RAV4"></div></div>
  <button type="button" class="small-link manual-toggle" data-index="${i}">Can’t find it? Enter make and model</button>
  <div class="grid"><div><label for="size-${i}">Vehicle size</label><select id="size-${i}" name="size-${i}" required><option value="">Choose size</option>${options(config.sizes.map((s,n)=>[n,s]))}</select></div><div><label for="service-${i}">Main service</label><select id="service-${i}" name="service-${i}">${options([['auto',config.automaticPhotoReview?'Help me choose — photo assessment':'Help me choose — team review'],['refresh','Refresh Detail'],['reset','Reset Detail']],'auto')}</select></div></div>
  <label class="check"><input type="checkbox" name="rear-${i}" id="rear-${i}" checked> This vehicle has rear seats</label>
  <div class="service-note" id="price-note-${i}">Refresh is for vehicles already in good shape. Reset is for a more thorough clean. Photos help us recommend the right level.</div>
  <h3>Additional services</h3><p class="hint">Choose any extra work you want included. Each selection appears separately on your quote.</p><div class="grid three">${Object.entries(config.extras).map(([key,tiers])=>`<div><label for="${key}-${i}">${{hair:'Pet hair removal',extraction:'Carpet / seat extraction',odor:'Odor treatment'}[key]}</label><select name="${key}-${i}" id="${key}-${i}"><option value="none">None</option>${options(Object.entries(tiers).map(([tier,id])=>[tier,`${tier[0].toUpperCase()+tier.slice(1)} — ${money(config.services.find(s=>s.id===id)?.priceCents??0)}`]))}</select></div>`).join('')}</div>
  <div class="grid"><div><label for="odor-source-${i}">Any odors we should know about?</label><select name="odor-source-${i}" id="odor-source-${i}">${options([['none','No noticeable odor'],['smoke','Smoke'],['pet','Pet odor'],['spill','Food / drink / spill'],['other','Other or unsure']],'none')}</select></div><div><label for="vehicle-notes-${i}">Anything else about this vehicle? <span>(optional)</span></label><textarea name="vehicle-notes-${i}" id="vehicle-notes-${i}" maxlength="2000" placeholder="Stains, concerns, delicate surfaces…"></textarea></div></div>
  <h3>Show us the condition</h3><p class="hint">${config.automaticPhotoReview?'Add clear photos in daylight for an automatic assessment.':'Add clear photos in daylight so our team can confirm your exact quote.'} Show the whole area, including the floor under the mats. You can submit without photos for a team review.</p>
  <div class="photos">${Object.entries(angleLabels).map(([angle,label])=>`<label class="photo" id="photo-${i}-${angle}" ${angle.startsWith('rear')?'data-rear="'+i+'"':''}><span class="icon" aria-hidden="true">＋</span><span>${label}${angle==='problem'?' (optional)':''}</span><input type="file" accept="image/*" data-photo="${i}:${angle}" aria-label="Add ${label.toLowerCase()} photo for vehicle ${i+1}"></label>`).join('')}</div></section>`;
}
function renderForm(){
  app.innerHTML=`<form id="estimate-form"><section class="card"><div class="card-heading"><div><span class="section-num">Your details</span><h2>Who’s the clean for?</h2></div></div><div class="grid">${field('Full name','name','text','autocomplete="name" maxlength="200"')}${field('Mobile phone','phone','tel','autocomplete="tel" maxlength="40"')}${field('Email','email','email','autocomplete="email" maxlength="254"')}<div><label for="contactMethod">Preferred contact</label><select id="contactMethod" name="contactMethod">${options([['text','Text me'],['call','Call me'],['email','Email me']],'text')}</select></div><div class="full">${field('Service address','address','text','autocomplete="street-address" maxlength="300" placeholder="Street, city, state & ZIP"')}</div></div><div class="trap" aria-hidden="true"><label for="website">Website</label><input name="website" id="website" tabindex="-1" autocomplete="off"></div></section><div id="vehicles">${vehicleCard(0)}</div><button type="button" id="add-vehicle" class="secondary add-vehicle">＋ Add another vehicle</button><section class="card"><label for="notes">Other notes or timing preferences <span>(optional)</span></label><textarea id="notes" name="notes" maxlength="3000" placeholder="Anything that would help us prepare…"></textarea></section><div class="submit-bar"><label class="check consent"><input type="checkbox" id="consent" required><span>I agree to Sneaky Clean using these details and photos to prepare my quote, including automated photo review, and contacting me about this request using my preferred method. This does not sign me up for marketing messages.</span></label><div class="actions"><button type="submit" class="primary" id="submit">Get my estimate →</button><p class="hint">No payment required. Review and accept your itemized quote before booking.</p></div></div></form>`;
  bindVehicle(0);document.getElementById('add-vehicle').onclick=()=>{
    if(count>=2)return;document.getElementById('vehicles').insertAdjacentHTML('beforeend',vehicleCard(1));count=2;bindVehicle(1);document.getElementById('add-vehicle').hidden=true;
    document.getElementById('remove-vehicle').onclick=()=>{document.querySelector('[data-vehicle="1"]').remove();count=1;for(const [key,value]of images)if(key.startsWith('1:')){URL.revokeObjectURL(value.url);images.delete(key);}document.getElementById('add-vehicle').hidden=false;};
  };
  document.getElementById('estimate-form').onsubmit=e=>{e.preventDefault();sendForm();};
  restoreDraft();
  try{const saved=localStorage.getItem('sneaky-estimate');if(!token&&/^[a-f0-9]{64}$/.test(saved??''))app.insertAdjacentHTML('afterbegin',`<p class="hint">Already requested a quote? <a href="#${saved}">Open your saved estimate</a>.</p>`);}catch{}
}
function bindVehicle(i){
  for(const type of ['year','make'])document.getElementById(`${type}-${i}`).onchange=()=>loadModels(i);
  for(const type of ['size','service'])document.getElementById(`${type}-${i}`).onchange=()=>{
    const size=document.getElementById(`size-${i}`).value,service=document.getElementById(`service-${i}`).value;if(size==='')return;
    const price=key=>money(config.services.find(s=>s.id===config.packages[key][Number(size)])?.priceCents??0);
    document.getElementById(`price-note-${i}`).textContent=service==='auto'?`For this size: Refresh ${price('refresh')} · Reset ${price('reset')}, before extras and tax. Your photos help us choose.`:`${service==='refresh'?'Refresh':'Reset'} for this size: ${price(service)}, before extras and tax. We’ll explain any recommended change after the photo assessment.`;
  };
  document.querySelector(`.manual-toggle[data-index="${i}"]`).onclick=()=>manual(i);
  document.getElementById(`rear-${i}`).onchange=e=>document.querySelectorAll(`[data-rear="${i}"]`).forEach(el=>el.classList.toggle('hidden',!e.target.checked));
  document.querySelectorAll(`[data-vehicle="${i}"] [data-photo]`).forEach(el=>el.onchange=()=>loadPhoto(el));
}
function manual(i){for(const key of ['make','model']){document.getElementById(`${key}-${i}`).classList.add('hidden');document.getElementById(`manual-${key}-${i}`).classList.remove('hidden');document.getElementById(`manual-${key}-${i}`).required=true;}document.getElementById(`manual-make-${i}`).focus();}
async function loadModels(i){
  const year=document.getElementById(`year-${i}`).value,make=document.getElementById(`make-${i}`).value,select=document.getElementById(`model-${i}`);select.innerHTML='<option value="">Choose model</option>';if(!year||!make)return;
  select.disabled=true;
  try{const r=await fetch(ESTIMATE_API+`/estimates/api/vehicles?kind=models&make=${encodeURIComponent(make)}&year=${encodeURIComponent(year)}`),data=await r.json();if(!r.ok)throw Error();if(document.getElementById(`year-${i}`)?.value!==year||document.getElementById(`make-${i}`)?.value!==make)return;select.innerHTML='<option value="">Choose model</option>'+options(data.options.map(m=>[m.name,m.name]));if(!data.options.length)manual(i);}
  catch{message('Vehicle lookup is unavailable. Please type the make and model.');manual(i);}finally{select.disabled=false;}
}
async function loadPhoto(el){
  const file=el.files[0];if(!file)return;
  if(file.size>25000000){message('Choose a photo smaller than 25 MB.',true);el.value='';return;}
  try{
    const bitmap=await createImageBitmap(file),scale=Math.min(1,1500/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    let data=canvas.toDataURL('image/jpeg',.78);if(data.length>1150000)data=canvas.toDataURL('image/jpeg',.55);if(data.length>1200000)throw Error('This photo is too large. Try a smaller image.');
    const key=el.dataset.photo,old=images.get(key);if(old)URL.revokeObjectURL(old.url);
    const jpeg=data.split(',')[1],blob=new Blob([Uint8Array.from(atob(jpeg),c=>c.charCodeAt(0))],{type:'image/jpeg'}),url=URL.createObjectURL(blob);images.set(key,{jpeg,url});const label=el.closest('label');label.querySelector('img')?.remove();const img=document.createElement('img');img.src=url;img.alt='Selected '+angleLabels[key.split(':')[1]];label.prepend(img);label.classList.add('has-image');message('');
  }catch(error){message(error.message||'This photo format could not be opened. Try a JPEG or take a new photo.',true);el.value='';}
}
function inputData(){
  const form=new FormData(document.getElementById('estimate-form')),get=k=>String(form.get(k)??'').trim();
  const vehicles=Array.from({length:count},(_,i)=>{
    const useManual=!document.getElementById(`manual-make-${i}`).classList.contains('hidden');
    const make=useManual?get(`manual-make-${i}`):document.getElementById(`make-${i}`).selectedOptions[0]?.textContent,model=useManual?get(`manual-model-${i}`):get(`model-${i}`);
    if(!make||!model||(!useManual&&!get(`make-${i}`)))throw Error('Choose the make and model for each vehicle, or enter them manually.');
    return {year:Number(get(`year-${i}`)),make,model,size:Number(get(`size-${i}`)),service:get(`service-${i}`),rearSeats:form.has(`rear-${i}`),extras:{hair:get(`hair-${i}`),extraction:get(`extraction-${i}`),odor:get(`odor-${i}`)},odorSource:get(`odor-source-${i}`),notes:get(`vehicle-notes-${i}`)};
  });
  return {name:get('name'),phone:get('phone'),email:get('email'),address:get('address'),contactMethod:get('contactMethod'),notes:get('notes'),vehicles,consent:document.getElementById('consent').checked,website:get('website')};
}
function restoreDraft(){
  if(!token)return;let draft;try{draft=JSON.parse(sessionStorage.getItem('estimate-'+token));}catch{}if(!draft)return;
  if(draft.vehicles.length===2)document.getElementById('add-vehicle').click();
  for(const key of ['name','phone','email','address','contactMethod','notes'])document.getElementById(key).value=draft[key];
  draft.vehicles.forEach((v,i)=>{manual(i);for(const [key,value]of Object.entries({year:v.year,'manual-make':v.make,'manual-model':v.model,size:v.size,service:v.service,hair:v.extras.hair,extraction:v.extras.extraction,odor:v.extras.odor,'odor-source':v.odorSource,'vehicle-notes':v.notes}))document.getElementById(`${key}-${i}`).value=value;document.getElementById(`rear-${i}`).checked=v.rearSeats;document.getElementById(`rear-${i}`).dispatchEvent(new Event('change'));});
  for(const p of state?.photos??[]){const label=document.getElementById(`photo-${p.vehicle}-${p.angle}`);if(label){label.classList.add('saved');label.querySelector('.icon').textContent='✓';label.querySelector('input').disabled=true;label.querySelector('span:last-of-type').textContent=angleLabels[p.angle]+' · uploaded';}}
}
async function sendForm(){
  if(busy)return;let data;try{data=inputData();}catch(error){message(error.message,true);return;}
  busy=true;document.getElementById('submit').disabled=true;
  try{
    if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');history.replaceState(null,'','#'+token);}
    sessionStorage.setItem('estimate-'+token,JSON.stringify(data));await api('start',{token,website:data.website},false);
    let n=0;for(const [key,p]of images){const [vehicle,angle]=key.split(':');if(Number(vehicle)>=count)continue;message(`Saving photo ${++n} of ${images.size}… Keep this page open.`);await api('photo',{vehicle:Number(vehicle),angle,jpeg:p.jpeg});}
    message('Saving your request…');state=await api('submit',data);try{localStorage.setItem('sneaky-estimate',token);}catch{}sessionStorage.removeItem('estimate-'+token);renderState();await processPhotos();
  }catch(error){message(error.message,true);}finally{busy=false;const submit=document.getElementById('submit');if(submit)submit.disabled=false;}
}
async function processPhotos(){
  if(!state?.input||!['processing','review'].includes(state.state))return;
  for(let i=0;i<state.input.vehicles.length;i++){
    if(state.assessments.some(a=>a.vehicle===i&&['complete','failed'].includes(a.status)))continue;
    message(`Reviewing vehicle ${i+1} of ${state.input.vehicles.length}… This may take a minute.`);
    try{state=await api('analyze',{vehicle:i});renderState();}catch(error){message(error.message,true);return;}
  }
  if(state.assessments.filter(a=>a.status==='complete').length===state.input.vehicles.length){try{state=await api('quote');}catch(error){message(error.message,true);return;}}
  message('');renderState();
}
function progress(step){for(const [i,key]of ['details','quote','book'].entries())document.getElementById('step-'+key).classList.toggle('active',i<=step);}
function renderState(){
  if(!state?.input){renderForm();return;}
  const q=state.quote,quoted=q&&['quoted','accepted','booked'].includes(state.state);progress(quoted?(state.state==='quoted'?1:2):0);
  const contact=`<div class="summary-contact">${esc(state.input.name)} · ${esc(state.input.phone)}<br>${esc(state.input.address)}</div>`;
  if(!quoted){app.innerHTML=`<section class="card status-card"><span class="pill">${state.state==='processing'?'Reviewing your photos':'Request received'}</span><h2>${state.state==='processing'?'Finding the right clean.':'Your request is with the team.'}</h2><p class="hint">${esc(state.error||'We’re checking your photos and service selections. Your details are saved.')}</p><p class="hint">We’ll contact you by ${esc(state.input.contactMethod)} if we need anything else. Keep this private link to return to your estimate.</p><a href="tel:+17178709439">Call (717) 870-9439</a></section><section class="card">${contact}<p class="hint">${state.input.vehicles.map(v=>esc(`${v.year} ${v.make} ${v.model}`)).join(' · ')}</p><button class="secondary" id="refresh-status">Check estimate status</button></section>`;document.getElementById('refresh-status').onclick=refresh;addPrivateLinkButton();return;}
  app.innerHTML=`<section class="card"><div class="card-heading"><div><span class="section-num">${state.state==='quoted'?'Ready for your review':'Quote accepted'}</span><h2>Your itemized quote</h2></div><span class="pill">${q.vehicles.length} vehicle${q.vehicles.length>1?'s':''}</span></div>${contact}</section>${q.vehicles.map(v=>`<section class="card"><div class="quote-title"><h2>${esc(v.name)}</h2><span class="pill">${v.service==='reset'?'Reset':'Refresh'} Detail</span></div>${v.reasons.length?`<ul class="reason">${v.reasons.map(r=>'<li>'+esc(r)+'</li>').join('')}</ul>`:''}${v.services.map(s=>`<div class="quote-line"><span>${esc(s.name)}</span><strong>${money(s.priceCents)}</strong></div>`).join('')}<div class="quote-line"><span>Tax</span><strong>${money(v.taxCents)}</strong></div><div class="total"><span>Vehicle total</span><strong>${money(v.totalCents)}</strong></div></section>`).join('')}<section class="card"><div class="total"><div><span class="section-num">All vehicles · tax included</span><h2>Total</h2></div><strong>${money(q.totalCents)}</strong></div><p class="hint">Valid through ${new Date(q.expiresAt).toLocaleDateString()}. This price covers the listed services and the condition shown or described. Any additional work requires your approval.</p>${state.state==='quoted'?'<label class="check"><input type="checkbox" id="accept-check">I accept these services and this total.</label><button class="primary" id="accept-quote" disabled>Accept quote & choose a time →</button>':'<p class="hint">No payment collected. Choose an appointment for each vehicle below.</p>'}</section>${state.state==='quoted'?'':q.vehicles.map(bookingCard).join('')}<button class="small-link" id="refresh-status">Refresh status</button>`;
  document.getElementById('refresh-status').onclick=refresh;addPrivateLinkButton();
  if(state.state==='quoted'){
    document.getElementById('accept-check').onchange=e=>document.getElementById('accept-quote').disabled=!e.target.checked;
    document.getElementById('accept-quote').onclick=()=>perform(async()=>{state=await api('accept',{quoteHash:q.hash,accept:true});renderState();});
  }else bindBookings();
}
function addPrivateLinkButton(){
  app.insertAdjacentHTML('beforeend','<button type="button" class="small-link save-private-link" id="copy-estimate-link">Copy my private estimate link</button>');
  document.getElementById('copy-estimate-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'#'+token);message('Private estimate link copied. Keep it to return to your quote.');}catch{message('Keep the address in your browser to return to this estimate.');}};
}
function bookingCard(v){
  const saved=state.bookings.find(b=>b.vehicle===v.index);
  if(saved?.booking)return `<section class="card"><span class="pill">Appointment ${esc(saved.booking.status.toLowerCase())}</span><h3>${esc(v.name)}</h3><p>${esc(when(saved.booking.startAt))} Central</p><p class="hint">Your appointment is on the Sneaky Clean schedule. Call or text us if you need to make a change.</p></section>`;
  return `<section class="card" data-booking="${v.index}"><span class="section-num">Schedule vehicle ${v.index+1}</span><h2>${esc(v.name)}</h2><p class="hint">Choose a Monday, Wednesday or Friday. All times are Central. For other days, call or text us.</p><div class="booking-date"><label for="day-${v.index}">Appointment date</label><input type="date" id="day-${v.index}" min="${new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000))}"></div><div class="slots" id="slots-${v.index}"></div><button class="primary" id="book-${v.index}" disabled>${saved?'Check / retry appointment':'Book this appointment'}</button><p class="hint" id="book-note-${v.index}">${saved?'Your previous appointment request is still being verified. Contact the team if it does not confirm.':''}</p></section>`;
}
function bindBookings(){
  for(const v of state.quote.vehicles){const date=document.getElementById('day-'+v.index),button=document.getElementById('book-'+v.index);if(!date)continue;
    const pending=state.bookings.find(b=>b.vehicle===v.index&&!b.booking);if(pending?.requestedStartAt){bookSelections.set(v.index,pending.requestedStartAt);button.disabled=false;date.disabled=true;document.getElementById('book-note-'+v.index).textContent='Check / retry '+when(pending.requestedStartAt)+' Central. The saved request cannot create a second appointment.';}
    date.onchange=()=>perform(async()=>{button.disabled=true;bookSelections.delete(v.index);const day=date.value;document.getElementById('slots-'+v.index).textContent='Checking openings…';const data=await api('availability',{vehicle:v.index,day});if(date.value!==day)return;const slots=document.getElementById('slots-'+v.index);slots.innerHTML=data.slots.length?data.slots.map(s=>`<button type="button" class="slot" data-start="${esc(s.startAt)}">${new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',timeStyle:'short'}).format(new Date(s.startAt))}</button>`).join(''):'<p class="hint">No opening fits these services that day. Try another date or contact us.</p>';slots.querySelectorAll('button').forEach(b=>b.onclick=()=>{bookSelections.set(v.index,b.dataset.start);slots.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));button.disabled=false;});});
    button.onclick=()=>perform(async()=>{const startAt=bookSelections.get(v.index);if(!startAt)return;button.disabled=true;message('Confirming the appointment…');try{state=await api('book',{vehicle:v.index,startAt,quoteHash:state.quote.hash});message('Your appointment is saved.');renderState();}catch(error){button.disabled=false;throw error;}});
  }
}
async function perform(fn){if(busy)return;busy=true;message('');try{await fn();}catch(error){message(error.message,true);}finally{busy=false;}}
async function refresh(){await perform(async()=>{state=await api('status');renderState();});}
async function init(){
  try{const r=await fetch(ESTIMATE_API+'/estimates/api/config');config=await r.json();if(!r.ok)throw Error(config.error||'Service pricing is temporarily unavailable. Please call or text us.');if(token){state=await api('status');renderState();if(state.state==='processing')await processPhotos();}else renderForm();
    try{const r=await fetch(ESTIMATE_API+'/estimates/api/vehicles?kind=makes');const d=await r.json();if(r.ok){makes=d.options;document.querySelectorAll('[id^="make-"]').forEach(s=>{const value=s.value;s.innerHTML='<option value="">Choose make</option>'+options(makes.map(m=>[m.id,m.name]),value);});}}catch{}
  }catch(error){message(error.message,true);app.innerHTML='<section class="card"><h2>Let’s get you a quote.</h2><p>Call or text <a href="tel:+17178709439">(717) 870-9439</a>, or <a href="'+esc(location.pathname)+'">start a new estimate</a>.</p></section>';}
}
init();
setInterval(()=>{if(token&&state?.input&&!busy&&!document.hidden&&['review','processing'].includes(state.state))refresh();},30000);

window.addEventListener('hashchange',()=>location.reload());
