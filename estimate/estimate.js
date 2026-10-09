'use strict';
// Autumn Refresh offer. Change the wording, choices or end date here only: the banner, the per-vehicle choice and the notes
// tag all disappear on their own after `ends`, evaluated in Central time (a plain 'YYYY-MM-DD' means through that Chicago day).
const PROMO={id:'autumn-refresh-2026',ends:'2026-11-30T23:59:59-06:00',title:'Autumn Refresh',text:'a free leather treatment, spray wax or ceramic spray sealant with your detail — book by November 30.',label:'Your free Autumn Refresh add-on',note:'Autumn Refresh free add-on',later:'Decide later',choices:['Leather treatment','Spray wax','Ceramic spray sealant']};
// Google Analytics 4 + Google Ads. An empty Ads ID or label turns that conversion into a no-op; GA4 keeps working.
const GA4_ID='G-8ZBE3LNX5E',GOOGLE_ADS_ID='AW-17685937498',GOOGLE_ADS_LABELS={quote:'EZMACKe9voUdENr6p_FB',booked:'HM-5CKG9voUdENr6p_FB',call:'jQ_fCKq9voUdENr6p_FB'};
const POPULAR_MAKES=['ACURA','AUDI','BMW','BUICK','CADILLAC','CHEVROLET','CHRYSLER','DODGE','FORD','GENESIS','GMC','HONDA','HYUNDAI','JEEP','KIA','LAND ROVER','LEXUS','LINCOLN','MAZDA','MERCEDES-BENZ','NISSAN','PORSCHE','RAM','SUBARU','TESLA','TOYOTA','VOLKSWAGEN','VOLVO'];
const ESTIMATE_API=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?location.origin:'https://sneaky-clean-field-sync.sneaky-clean-tn.workers.dev';
// Captured before the Google tag loads, so adding the private #token to the address never reaches its history listener.
const replaceURL=History.prototype.replaceState;
const app=document.getElementById('app'),notice=document.getElementById('notice');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const serviceLabel=key=>({interior:'Interior Only',refresh:'Refresh',reset:'Reset'})[key]??key;
const displayPrice=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(cents/100);
const serviceTotal=id=>{const cents=config.services.find(s=>s.id===id)?.priceCents;return Number.isSafeInteger(cents)&&cents>0?cents:null;};
// Preview prices are the catalog subtotal. The itemized quote shows tax separately.
function selectionTotal(ids){
  const prices=ids.map(serviceTotal);return prices.some(cents=>cents===null)?null:prices.reduce((n,cents)=>n+cents,0);
}
const when=iso=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'}).format(new Date(iso));
const angleLabels={'front-seats':'Front seats','rear-seats':'Rear seats','front-floor':'Front floor & mats','rear-floor':'Rear floor & mats',cargo:'Trunk / cargo area',exterior:'Full exterior',problem:'Problem close-up'};
let token=/^[a-f0-9]{64}$/.test(location.hash.slice(1))?location.hash.slice(1):null,config,makes=[],count=1,state,busy=false,formStage=0;
const images=new Map(),bookSelections=new Map(),vehicleSizes=new Map(),sizeRequests=new Map();
// Google tag. Every hit carries page_location without the #fragment plus only the whitelisted values below, so names,
// contact details, addresses, notes, photos and the private estimate token are never sent to Google.
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
const pageURL=()=>location.origin+location.pathname+location.search,measured=new Set();
const TAG_PARAMS={estimate_start:[],estimate_details_started:[],estimate_customize_opened:[],generate_lead:[],estimate_quoted:['value','currency'],quote_accepted:['value','currency'],appointment_booked:['value','currency','transaction_id'],click_call_now:[],conversion:['value','currency','transaction_id']};
const SAFE={value:v=>Number.isFinite(v)&&v>=0,currency:v=>v==='USD',transaction_id:v=>/^est-[0-9a-f-]{36}$/.test(v)};
function track(name,params={},sendTo){if(!TAG_PARAMS[name])return;const safe={};for(const key of TAG_PARAMS[name])if(SAFE[key](params[key]))safe[key]=params[key];gtag('event',name,{...safe,...(sendTo?{send_to:sendTo}:{}),page_location:pageURL()});}
function adsConversion(kind,params){if(GOOGLE_ADS_ID&&GOOGLE_ADS_LABELS[kind])track('conversion',params,GOOGLE_ADS_ID+'/'+GOOGLE_ADS_LABELS[kind]);}
function once(key,session,fn){if(measured.has(key))return;measured.add(key);try{const store=session?sessionStorage:localStorage;if(store.getItem(key))return;store.setItem(key,'1');}catch{}fn();}
function loadTag(){
  if(!/^(www\.)?sneakycleantn\.com$/.test(location.hostname))return; // Previews and the worker origin keep events in dataLayer only.
  const page={page_location:pageURL()};gtag('js',new Date());gtag('set',{...page,allow_google_signals:false,allow_ad_personalization_signals:false});gtag('config',GA4_ID,page);if(GOOGLE_ADS_ID)gtag('config',GOOGLE_ADS_ID,page);
  const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+GA4_ID;document.head.appendChild(script);
}
const promoTag=pick=>`[${PROMO.note}: ${pick}]`,promoOptions=[PROMO.later,...PROMO.choices];
// Characters kept free under the server's 2,000 / 3,000 note limits for the tags added to each vehicle's and the general notes.
const PROMO_ROOM=Math.max(...promoOptions.map(c=>promoTag(c).length))+1,PROMO_SUMMARY_ROOM=PROMO.note.length+2*(190+Math.max(...promoOptions.map(c=>c.length)))+10;
function promoActive(now=Date.now()){const end=PROMO.ends;return /^\d{4}-\d{2}-\d{2}$/.test(end)?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)<=end:now<=Date.parse(end);}
const promoBanner=()=>`<p class="promo-banner"><strong>${esc(PROMO.title)}:</strong> ${esc(PROMO.text)}</p>`;
function tagNotes(pick,text,max,what){const notes=pick?promoTag(pick)+(text?'\n'+text:''):text;if(notes.length>max)throw Error(`Please shorten ${what} by ${notes.length-max} characters.`);return notes;}
function untagNotes(notes){const head=`[${PROMO.note}: `,line=notes.split('\n')[0];return notes.startsWith(head)&&line.endsWith(']')?{pick:line.slice(head.length,-1),text:notes.slice(line.length+1)}:{pick:'',text:notes};}
function message(text,error=false){notice.hidden=!text;notice.textContent=text;notice.classList.toggle('error',error);}
async function api(action,body={},auth=true){
  const r=await fetch(ESTIMATE_API+'/estimates/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(auth&&token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Please try again.');return data;
}
const options=(values,selected)=>values.map(([v,label])=>`<option value="${esc(v)}" ${String(selected)===String(v)?'selected':''}>${esc(label)}</option>`).join('');
function makeOptions(selected=''){
  let chosen=false;const option=m=>{const on=!chosen&&String(selected)===String(m.id);chosen||=on;return `<option value="${esc(m.id)}" ${on?'selected':''}>${esc(m.name)}</option>`;};
  const popular=makes.filter(m=>POPULAR_MAKES.includes(String(m.name).trim().toUpperCase()));
  return '<option value="">Choose make</option>'+(popular.length?`<optgroup label="Popular makes">${popular.map(option).join('')}</optgroup><optgroup label="All makes">${makes.map(option).join('')}</optgroup>`:makes.map(option).join(''));
}
function field(label,name,type='text',extra=''){return `<div><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" required ${extra}></div>`;}
function addonChoices(i){
  return `<details class="customize-detail" id="customize-${i}"><summary>Customize your detail <span id="customize-summary-${i}">Optional add-ons</span></summary><div class="addons"><h3>Choose your add-ons</h3><p class="hint">Optional. Add only the extra work you want. Your price updates as you choose.</p><div class="addon-grid">${Object.entries(config.extras).map(([key,tiers])=>{
    const detail=config.extraDetails?.[key]??{label:{hair:'Pet hair removal',extraction:'Carpet / seat extraction',odor:'Odor treatment'}[key]??key,tiers:{}};
    const prices=Object.values(tiers).map(id=>serviceTotal(id)).filter(price=>Number.isSafeInteger(price)&&price>0),priceTag=prices.length?`${Object.keys(tiers).length>1?'from ':''}${displayPrice(Math.min(...prices))}`:'Team quote';
    return `<div class="addon-option"><div class="addon-heading"><label for="${key}-${i}">${esc(detail.label)}</label><span class="addon-price">${priceTag}</span></div>${detail.description?`<p class="hint">${esc(detail.description)}</p>`:''}<select name="${key}-${i}" id="${key}-${i}" data-addon="${i}"><option value="none">No thanks</option>${options(Object.entries(tiers).map(([tier,id])=>{const service=config.services.find(s=>s.id===id),price=service?.priceCents,label=detail.tiers?.[tier]??tier[0].toUpperCase()+tier.slice(1);return [tier,`${label} — ${Number.isSafeInteger(price)&&price>0?displayPrice(price):'team quote required'}`];}))}</select></div>`;
  }).join('')}</div></div></details>`;
}
function vehicleCard(i){
  const years=Array.from({length:new Date().getFullYear()+2-1900+1},(_,n)=>new Date().getFullYear()+2-n),promo=promoActive();
  return `<section class="card vehicle" data-vehicle="${i}"><div class="card-heading"><div><span class="section-num">Vehicle ${i+1}</span><h2>What are we cleaning?</h2></div>${i?'<button type="button" class="quiet" id="remove-vehicle">Remove vehicle</button>':''}</div>
  <div class="vehicle-basics"><div class="grid three"><div><label for="year-${i}">Year</label><select id="year-${i}" name="year-${i}" required><option value="">Choose year</option>${options(years.map(y=>[y,y]))}</select></div><div><label for="make-${i}">Make</label><select id="make-${i}" name="make-${i}">${makeOptions()}</select><input class="hidden" id="manual-make-${i}" name="manual-make-${i}" aria-label="Vehicle make" maxlength="80" placeholder="e.g. Toyota"></div><div><label for="model-${i}">Model</label><select id="model-${i}" name="model-${i}"><option value="">Choose year & make</option></select><input class="hidden" id="manual-model-${i}" name="manual-model-${i}" aria-label="Vehicle model" maxlength="100" placeholder="e.g. RAV4"></div></div>
  <button type="button" class="small-link manual-toggle" data-index="${i}">Can’t find it? Enter make and model</button>
  <div class="grid service-grid"><div class="full"><label for="service-${i}">Choose your detail</label><select id="service-${i}" name="service-${i}">${options([['interior','Interior Only Detail'],['refresh','Refresh Detail'],['reset','Reset Detail'],['auto','Help me choose']],'interior')}</select></div></div>
  </div><div class="vehicle-summary" id="vehicle-summary-${i}" hidden></div><button type="button" class="edit-vehicle" data-edit-vehicle="${i}" hidden>Edit vehicle or service</button>
  <div class="service-note" id="price-note-${i}">Refresh is for vehicles already in good shape. Reset is for a more thorough clean.</div>
  <a class="small-link compare-services" href="#packages" data-scroll="packages">Compare Interior Only, Refresh & Full Reset</a>
  <div class="selection-price" id="selection-price-${i}" role="status" aria-live="polite"></div>
  ${addonChoices(i)}
  ${promo?`<div class="promo-pick"><label for="promo-${i}">${esc(PROMO.label)} <span>(optional)</span></label><select id="promo-${i}" name="promo-${i}">${options(promoOptions.map(c=>[c,c]),PROMO.later)}</select></div>`:''}
  <details class="vehicle-options" hidden><summary>Concerns & photos <span>(optional)</span></summary><label class="check"><input type="checkbox" name="rear-${i}" id="rear-${i}" checked> This vehicle has rear seats</label>
  <div class="grid"><div><label for="odor-source-${i}">Any odors we should know about?</label><select name="odor-source-${i}" id="odor-source-${i}">${options([['none','No noticeable odor'],['smoke','Smoke'],['pet','Pet odor'],['spill','Food / drink / spill'],['other','Other or unsure']],'none')}</select></div><div><label for="vehicle-notes-${i}">Anything else about this vehicle? <span>(optional)</span></label><textarea name="vehicle-notes-${i}" id="vehicle-notes-${i}" maxlength="${2000-(promo?PROMO_ROOM:0)}" placeholder="Stains, concerns, delicate surfaces…"></textarea></div></div>
  <details class="condition-options"><summary>Add condition photos <span>(optional)</span></summary><h3>Help us see what you see</h3><p class="hint">${config.automaticPhotoReview?'Add clear photos in daylight for an automatic assessment.':'Add clear photos in daylight so our team can check the condition before service.'} Show the whole area, including the floor under the mats. You can submit without photos for a team review.</p>
  <div class="photos">${Object.entries(angleLabels).map(([angle,label])=>`<label class="photo" id="photo-${i}-${angle}" ${angle.startsWith('rear')?'data-rear="'+i+'"':''}><span class="icon" aria-hidden="true">＋</span><span>${label}${angle==='problem'?' (optional)':''}</span><input type="file" accept="image/*" data-photo="${i}:${angle}" aria-label="Add ${label.toLowerCase()} photo for vehicle ${i+1}"></label>`).join('')}</div></details></details></section>`;
}
function renderForm(){
  const promo=promoActive();formStage=0;count=1;progress(0);document.body.classList.remove('quote-view');
  app.innerHTML=`<form id="estimate-form" novalidate method="post" action="${esc(location.pathname)}"><div id="vehicles">${vehicleCard(0)}</div><button type="button" id="add-vehicle" class="secondary add-vehicle">＋ Add another vehicle</button><div id="vehicle-next"><div class="zip-field"><label for="zip">Service ZIP code</label><input id="zip" name="zip" autocomplete="postal-code" inputmode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" maxlength="10" placeholder="e.g. 37129" required><p class="hint">Just your ZIP for now. Street address comes when you book.</p></div><div class="stage-actions"><button type="button" class="primary" id="continue-details">Continue to my free quote →</button><p>Book online after reviewing your quote. No card required.</p></div></div><div class="details-stage" id="details-stage" hidden><button type="button" class="small-link form-back" id="back-to-vehicle">← Back to my vehicle</button>${promo?promoBanner():''}<details class="optional-notes"><summary>Anything else we should know? <span>(optional)</span></summary><label for="notes">Other notes or timing preferences <span>(optional)</span></label><textarea id="notes" name="notes" maxlength="${3000-(promo?PROMO_SUMMARY_ROOM:0)}" placeholder="Anything that would help us prepare…"></textarea></details><section class="card contact-card"><div class="card-heading"><div><span class="section-num">Almost done</span><h2>How can we reach you about your quote?</h2></div></div><p class="hint">Your itemized quote appears next. You can accept it and choose an appointment online. Choose one contact method for appointment updates. No marketing signup.</p><div class="grid">${field('Full name','name','text','autocomplete="name" maxlength="200"')}<div><label for="contactMethod">Contact me by</label><select id="contactMethod" name="contactMethod">${options([['text','Text message'],['call','Phone call'],['email','Email']],'text')}</select></div><div id="phone-field">${field('Mobile phone','phone','tel','autocomplete="tel" maxlength="40"')}</div><div id="email-field" hidden>${field('Email','email','email','autocomplete="email" maxlength="254"')}</div></div><div class="trap" aria-hidden="true"><label for="website">Website</label><input name="website" id="website" tabindex="-1" autocomplete="off"></div></section><div class="submit-bar"><label class="check consent"><input type="checkbox" id="consent" required><span>I agree to Sneaky Clean using these details and photos to prepare my quote${config.automaticPhotoReview?", including automated photo review":""}, and contacting me about this request using my preferred method. This does not sign me up for marketing messages.</span></label><div class="actions"><button type="submit" class="primary" id="submit">Get my free quote →</button><p class="hint">See your itemized price next. Booking is completely optional.</p></div></div></div></form>`;
  const form=document.getElementById('estimate-form');form.onsubmit=e=>{e.preventDefault();if(formStage===0){advanceDetails();return;}if(!validateVehicles())return;if(form.reportValidity&&!form.reportValidity())return;sendForm();};
  document.getElementById('continue-details').onclick=advanceDetails;document.getElementById('back-to-vehicle').onclick=()=>setFormStage(0,true);
  for(const type of ['focusin','input','change'])form.addEventListener(type,()=>once('sc-tag-start',true,()=>track('estimate_start')));
  bindVehicle(0);document.getElementById('add-vehicle').onclick=()=>{
    if(count>=2)return;document.getElementById('vehicles').insertAdjacentHTML('beforeend',vehicleCard(1));count=2;bindVehicle(1);document.getElementById('add-vehicle').hidden=true;
    document.getElementById('remove-vehicle').onclick=()=>{document.querySelector('[data-vehicle="1"]').remove();count=1;vehicleSizes.delete(1);sizeRequests.delete(1);for(const [key,value]of images)if(key.startsWith('1:')){URL.revokeObjectURL(value.url);images.delete(key);}document.getElementById('add-vehicle').hidden=false;};
  };
  document.getElementById('contactMethod').onchange=updateContactFields;
  restoreDraft();if(!token&&new URLSearchParams(location.search).get('service')==='interior'){document.getElementById('service-0').value='interior';showVehiclePrice(0);}updateContactFields();setFormStage(formStage);
  try{const saved=localStorage.getItem('sneaky-estimate');if(!token&&/^[a-f0-9]{64}$/.test(saved??''))app.insertAdjacentHTML('afterbegin',`<p class="saved-estimate">Already requested a quote? <a href="#${saved}" data-private>Open your saved estimate</a>.</p>`);}catch{}
}
function updateContactFields(){
  const email=document.getElementById('contactMethod').value==='email';
  for(const kind of ['phone','email']){const selected=(kind==='email')===email;document.getElementById(kind+'-field').hidden=!selected;document.getElementById(kind).required=selected;document.getElementById(kind).disabled=!selected;}
}
function setFormStage(stage,focus=false){
  formStage=stage;progress(stage);
  document.querySelectorAll('.vehicle-basics').forEach(el=>el.hidden=stage===1);
  document.querySelectorAll('.vehicle-summary,.edit-vehicle,.vehicle-options').forEach(el=>el.hidden=stage===0);
  document.getElementById('details-stage').hidden=stage===0;document.getElementById('vehicle-next').hidden=stage===1;
  document.getElementById('add-vehicle').hidden=stage===1||count===2;
  for(let i=0;i<count;i++){const v=vehicleIdentity(i);document.getElementById(`vehicle-summary-${i}`).textContent=`${v.year} ${v.make} ${v.model}`;}
  if(focus){const target=stage===1?document.getElementById('details-stage'):document.getElementById('vehicles');target.scrollIntoView?.({behavior:'instant',block:'start'});(stage===1?document.getElementById('name'):document.getElementById('year-0')).focus({preventScroll:true});}
}
function validateVehicles(){
  for(let i=0;i<count;i++){const v=vehicleIdentity(i);if(!v.year||!v.make||!v.model){setFormStage(0);message(`Choose the year, make and model for vehicle ${i+1}, or enter the make and model manually.`,true);document.getElementById(`year-${i}`).scrollIntoView?.({block:'center'});const key=!v.year?'year':!v.make?'make':'model',manualField=document.getElementById(`manual-${key}-${i}`);(manualField&&!manualField.classList.contains('hidden')?manualField:document.getElementById(`${key}-${i}`)).focus();return false;}}
  return true;
}
function advanceDetails(){if(!validateVehicles())return;const zip=document.getElementById('zip');if(!/^\d{5}(?:-\d{4})?$/.test(zip.value.trim())){message('Enter your 5-digit service ZIP code.',true);zip.focus();return;}message('');setFormStage(1,true);once('sc-tag-details',true,()=>track('estimate_details_started'));}
function bindVehicle(i){
  document.querySelector(`[data-edit-vehicle="${i}"]`).onclick=()=>setFormStage(0,true);
  for(const type of ['year','make'])document.getElementById(`${type}-${i}`).onchange=()=>loadModels(i);
  document.getElementById(`service-${i}`).onchange=()=>showVehiclePrice(i);
  const customize=document.getElementById(`customize-${i}`);customize.ontoggle=()=>{if(customize.hasAttribute('open'))once('sc-tag-customize-'+i,true,()=>track('estimate_customize_opened'));};
  document.querySelectorAll(`[data-addon="${i}"]`).forEach(el=>el.onchange=()=>{syncPromo(i);showVehiclePrice(i);});
  const promo=document.getElementById(`promo-${i}`);if(promo)promo.onchange=()=>{syncPromo(i);showVehiclePrice(i);};
  showVehiclePrice(i);
  document.getElementById(`model-${i}`).onchange=()=>lookupVehicleSize(i);
  for(const key of ['make','model'])document.getElementById(`manual-${key}-${i}`).onchange=()=>lookupVehicleSize(i);
  document.querySelector(`.manual-toggle[data-index="${i}"]`).onclick=()=>manual(i);
  document.getElementById(`rear-${i}`).onchange=e=>document.querySelectorAll(`[data-rear="${i}"]`).forEach(el=>el.classList.toggle('hidden',!e.target.checked));
  document.querySelectorAll(`[data-vehicle="${i}"] [data-photo]`).forEach(el=>el.onchange=()=>loadPhoto(el));
}
function vehicleIdentity(i){
  const useManual=!document.getElementById(`manual-make-${i}`).classList.contains('hidden');
  return {year:document.getElementById(`year-${i}`).value,make:useManual?document.getElementById(`manual-make-${i}`).value.trim():(document.getElementById(`make-${i}`).value?document.getElementById(`make-${i}`).selectedOptions[0]?.textContent:''),model:useManual?document.getElementById(`manual-model-${i}`).value.trim():document.getElementById(`model-${i}`).value};
}
function showVehiclePrice(i){
  const note=document.getElementById(`price-note-${i}`);if(!note)return;
  const size=vehicleSizes.get(i)?.size,service=document.getElementById(`service-${i}`).value,matched=[0,1,2].includes(size);
  const select=document.getElementById(`service-${i}`);
  for(const key of ['interior','refresh','reset']){const values=(matched?[config.packages[key][size]]:config.packages[key]).map(serviceTotal).filter(Number.isSafeInteger),option=Array.from(select.options).find(o=>o.value===key);if(option&&values.length)option.textContent=`${serviceLabel(key)} — ${matched?'':'from '}${displayPrice(Math.min(...values))}`;}
  syncPromo(i);
  showSelectionPrice(i,size,service);
  document.getElementById(`photo-${i}-exterior`).hidden=service==='interior';
  note.textContent=service==='interior'?'Interior Only: thorough vacuum, mats, surfaces, inside glass and light spot treatment. Heavy pet hair, extraction and odor treatment are separate add-ons. No exterior wash.':service==='auto'?'Interior Only cares for the cabin. Refresh maintains a vehicle already in good shape. Reset gives the interior and exterior a more thorough clean.':service==='refresh'?'Refresh: exterior wash, wheels and tires, light interior vacuum and wipe-down, and glass. For vehicles already in good shape.':'Reset: thorough interior vacuum and surface cleaning, exterior wash, wheels, glass and spray protection. Extraction, heavy pet hair and odor treatment are optional add-ons.';
}
function syncPromo(i){
  const promo=document.getElementById(`promo-${i}`),leather=document.getElementById(`leather-${i}`);
  if(promo){const interior=document.getElementById(`service-${i}`).value==='interior';for(const option of promo.options){const excluded=interior&&!['Decide later','Leather treatment'].includes(option.value);option.disabled=excluded;option.hidden=excluded;}if(interior&&!['Decide later','Leather treatment'].includes(promo.value))promo.value=PROMO.later;}
  if(promo?.value==='Leather treatment'&&leather?.value==='regular'){leather.value='none';message('Leather treatment is included free with your Autumn Refresh choice. The paid leather add-on was removed.');}
}
function showSelectionPrice(i,size,service){
  const panel=document.getElementById(`selection-price-${i}`);if(!panel)return;
  const extraIDs=[],requests=[];
  for(const [key,tiers] of Object.entries(config.extras)){const pick=document.getElementById(`${key}-${i}`).value;if(pick==='none')continue;const cents=serviceTotal(tiers[pick]);if(cents!==null)extraIDs.push(tiers[pick]);else requests.push(config.extraDetails?.[key]?.label??key);}
  const customization=document.getElementById(`customize-summary-${i}`),selected=extraIDs.length+requests.length;if(customization)customization.textContent=selected?`${selected} add-on${selected===1?'':'s'} selected`:'Optional add-ons';
  const matched=[0,1,2].includes(size),keys=service==='auto'?['refresh','reset']:[service],baseIDs=keys.map(key=>matched?[config.packages[key][size]]:config.packages[key]),bases=baseIDs.map(ids=>ids.map(serviceTotal)),totals=baseIDs.map(ids=>ids.map(id=>selectionTotal([id,...extraIDs]))),extra=selectionTotal(extraIDs);
  if(bases.some(values=>values.some(cents=>cents===null))||totals.some(values=>values.some(cents=>cents===null))){panel.textContent='The team will confirm your price before you book.';return;}
  const v=vehicleIdentity(i),hasVehicle=v.year&&v.make&&v.model;
  panel.classList.toggle('needs-quote',requests.length>0);panel.classList.toggle('is-range',!matched);
  panel.innerHTML=`<span class="price-caption">${requests.length?'Priced services':matched?'Your price':'Starting price'}</span>${keys.map((key,n)=>`<div class="selection-subtotal"><span>${serviceLabel(key)}</span><strong>${matched?'':'from '}${displayPrice(Math.min(...totals[n]))}</strong></div>`).join('')}<p class="selection-breakdown">${matched&&keys.length===1?`Base detail ${displayPrice(bases[0][0])} · Add-ons ${displayPrice(totals[0][0]-bases[0][0])}`:`Selected add-ons ${displayPrice(extra)}`}</p><p class="hint">Prices before tax. Tax is shown in your itemized quote.</p>${requests.length?`<p class="price-review"><strong>Team quote required:</strong> ${esc(requests.join(', '))} is not included above. We’ll confirm your full total before you accept or book.</p>`:!matched?`<p class="price-review">${hasVehicle?'We’ll confirm your vehicle’s size and exact total.':'Choose your vehicle for your price.'}</p>`:''}${document.getElementById(`promo-${i}`)?.value==='Leather treatment'?'<p class="price-review">Your Autumn Refresh leather treatment is free.</p>':''}`;
}
async function lookupVehicleSize(i){
  const request=crypto.randomUUID();sizeRequests.set(i,request);vehicleSizes.delete(i);showVehiclePrice(i);
  const vehicle=vehicleIdentity(i);if(!vehicle.year||!vehicle.make||!vehicle.model)return;
  try{const r=await fetch(ESTIMATE_API+'/estimates/api/vehicle-size?'+new URLSearchParams(vehicle)),data=await r.json();if(sizeRequests.get(i)!==request||!document.getElementById(`service-${i}`))return;if(r.ok)vehicleSizes.set(i,data);showVehiclePrice(i);}catch{if(sizeRequests.get(i)===request)showVehiclePrice(i);}
}
function manual(i){for(const key of ['make','model']){document.getElementById(`${key}-${i}`).classList.add('hidden');document.getElementById(`manual-${key}-${i}`).classList.remove('hidden');document.getElementById(`manual-${key}-${i}`).required=true;}document.getElementById(`manual-make-${i}`).focus();lookupVehicleSize(i);}
async function loadModels(i){
  const year=document.getElementById(`year-${i}`).value,make=document.getElementById(`make-${i}`).value,select=document.getElementById(`model-${i}`);select.innerHTML='<option value="">Choose model</option>';lookupVehicleSize(i);if(!year||!make)return;
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
  const form=new FormData(document.getElementById('estimate-form')),get=k=>String(form.get(k)??'').trim(),picks=[];
  const vehicles=Array.from({length:count},(_,i)=>{
    const useManual=!document.getElementById(`manual-make-${i}`).classList.contains('hidden');
    const make=useManual?get(`manual-make-${i}`):document.getElementById(`make-${i}`).selectedOptions[0]?.textContent,model=useManual?get(`manual-model-${i}`):get(`model-${i}`);
    if(!make||!model||(!useManual&&!get(`make-${i}`)))throw Error('Choose the make and model for each vehicle, or enter them manually.');
    // The free add-on travels to the team as a tag on the notes the API already accepts; price and schema are unchanged.
    const pick=get(`promo-${i}`);if(pick)picks.push(count>1?`${get(`year-${i}`)} ${make} ${model} — ${pick}`:pick);
    return {year:Number(get(`year-${i}`)),make,model,service:get(`service-${i}`),rearSeats:form.has(`rear-${i}`),extras:Object.fromEntries(Object.keys(config.extras).filter(key=>['hair','extraction','odor'].includes(key)||get(`${key}-${i}`)!=='none').map(key=>[key,get(`${key}-${i}`)])),odorSource:get(`odor-source-${i}`),notes:tagNotes(pick,get(`vehicle-notes-${i}`),2000,`the notes for vehicle ${i+1}`)};
  });
  return {name:get('name'),phone:get('phone'),email:get('email'),zip:get('zip'),contactMethod:get('contactMethod'),notes:tagNotes(picks.join('; '),get('notes'),3000,'your other notes'),vehicles,consent:document.getElementById('consent').checked,website:get('website')};
}
function restoreDraft(){
  if(!token)return;let draft;try{draft=JSON.parse(sessionStorage.getItem('estimate-'+token));}catch{}if(!draft)return;
  if(draft.vehicles.length===2)document.getElementById('add-vehicle').click();
  // While the offer runs, its tags are rebuilt from the choices on submit, so only the customer's own text is restored.
  const promo=!!document.getElementById('promo-0');
  for(const key of ['name','phone','email','zip','contactMethod','notes'])document.getElementById(key).value=key==='notes'&&promo?untagNotes(draft.notes).text:(draft[key]??(key==='zip'?draft.address?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]:'')??'');
  draft.vehicles.forEach((v,i)=>{manual(i);const select=document.getElementById(`promo-${i}`),{pick,text}=untagNotes(v.notes),tagged=!!select&&promoOptions.includes(pick);for(const [key,value]of Object.entries({year:v.year,'manual-make':v.make,'manual-model':v.model,service:v.service,hair:v.extras.hair,extraction:v.extras.extraction,odor:v.extras.odor,'odor-source':v.odorSource,'vehicle-notes':tagged?text:v.notes}))document.getElementById(`${key}-${i}`).value=value;for(const key of Object.keys(config.extras))document.getElementById(`${key}-${i}`).value=v.extras[key]??'none';if(tagged)select.value=pick;syncPromo(i);document.getElementById(`rear-${i}`).checked=v.rearSeats;document.getElementById(`rear-${i}`).dispatchEvent(new Event('change'));lookupVehicleSize(i);});
  formStage=/^\d{5}(?:-\d{4})?$/.test(document.getElementById('zip').value)?1:0;
  for(const p of state?.photos??[]){const label=document.getElementById(`photo-${p.vehicle}-${p.angle}`);if(label){label.classList.add('saved');label.querySelector('.icon').textContent='✓';label.querySelector('input').disabled=true;label.querySelector('span:last-of-type').textContent=angleLabels[p.angle]+' · uploaded';}}
}
async function sendForm(){
  if(busy)return;let data;try{data=inputData();}catch(error){message(error.message,true);return;}
  busy=true;document.getElementById('submit').disabled=true;
  try{
    if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');replaceURL.call(history,null,'','#'+token);}
    sessionStorage.setItem('estimate-'+token,JSON.stringify(data));await api('start',{token,website:data.website},false);
    let n=0;for(const [key,p]of images){const [vehicle,angle]=key.split(':');if(Number(vehicle)>=count)continue;message(`Saving photo ${++n} of ${images.size}… Keep this page open.`);await api('photo',{vehicle:Number(vehicle),angle,jpeg:p.jpeg});}
    message('Saving your request…');state=await api('submit',data);if(state?.id)once('sc-tag-lead-'+state.id,false,()=>track('generate_lead'));try{localStorage.setItem('sneaky-estimate',token);}catch{}sessionStorage.removeItem('estimate-'+token);renderState();state=await api('quote');renderState();message(state.quote?'Your quote is ready. Accept your quote to choose an appointment.':'Your request is saved. Booking opens once we confirm your vehicle and price.');const section=document.getElementById('estimate');section?.scrollIntoView?.({behavior:'instant',block:'start'});section?.focus?.({preventScroll:true});
  }catch(error){message(error.message,true);}finally{busy=false;const submit=document.getElementById('submit');if(submit)submit.disabled=false;}
}
function progress(step){const booking=document.getElementById('step-book');if(booking)booking.hidden=step<2;for(const [i,key]of ['vehicle','details','quote','book'].entries()){const el=document.getElementById('step-'+key);if(!el)continue;el.classList.toggle('active',i<=step);if(i===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');}}
const CANCELLED=['CANCELLED_BY_CUSTOMER','CANCELLED_BY_SELLER','DECLINED','NO_SHOW'];
function confirmedBooking(index){const saved=(state.bookings??[]).find(b=>b.vehicle===index),deposit=activeDeposit(index);return !!saved?.booking&&!CANCELLED.includes(saved.booking.status)&&(!deposit||deposit.state==='paid');}
// Funnel events fire once per estimate on this browser, so reloads and return visits never count twice.
function measure(){
  if(state.externalBooking)return;
  const q=state.quote;if(!state.id||!q||!['quoted','accepted','booked'].includes(state.state))return;
  const value=q.totalCents/100,currency='USD';
  once('sc-tag-quoted-'+state.id,false,()=>{track('estimate_quoted',{value,currency});adsConversion('quote',{value,currency});});
  if(state.state!=='quoted')once('sc-tag-accepted-'+state.id,false,()=>track('quote_accepted',{value,currency}));
  if(q.vehicles.some(v=>confirmedBooking(v.index)))once('sc-tag-booked-'+state.id,false,()=>{const booked={value,currency,transaction_id:'est-'+state.id};track('appointment_booked',booked);adsConversion('booked',booked);});
}
function renderState(){
  for(const card of depositCards.values())card.destroy().catch(()=>{});depositCards.clear();
  if(!state?.input){renderForm();return;}
  document.body.classList.add('quote-view');
  if(state.externalBooking){
    const b=state.externalBooking,scheduled=b.status==='scheduled',handled=b.status==='owner_confirmed',cancelled=b.status==='cancelled';
    const title=document.getElementById('estimate-title'),intro=document.getElementById('form-intro'),eyebrow=document.getElementById('form-eyebrow');
    if(title)title.textContent=scheduled?'Your appointment is scheduled.':handled?'Your request is already handled.':'Your appointment update.';
    if(intro)intro.textContent='Your booking is being handled directly with Sneaky Clean.';
    if(eyebrow)eyebrow.textContent=scheduled?'WE’LL SEE YOU SOON':'YOUR APPOINTMENT';
    progress(3);
    app.innerHTML=`<section class="card status-card"><span class="pill">${scheduled?'Scheduled with the team':handled?'Handled by the team':cancelled?'Appointment no longer active':b.status==='pending'?'Appointment awaiting confirmation':'Scheduling check'}</span><h2>${scheduled?'You’re on our schedule.':handled?'You’ve already connected with us.':'Let’s confirm your next step.'}</h2>${b.startAt?`<p>${esc(when(b.startAt))} Central</p>`:''}<p>${scheduled?'There’s no need to book again through this estimate. Refer to the appointment confirmation from our team for your services, price and payment arrangements.':handled?'Our team has marked this request as handled. There’s no need to book again through this estimate. Contact us if you need another appointment or have questions about your service.':cancelled?'Please contact us about rescheduling or any payment questions.':'We found an appointment or scheduling update that needs a team check. Please contact us before making another booking.'}</p><p class="hint">Need to change anything? Call or text us and we’ll help.</p><a class="primary" href="sms:+17178709439">Text Sneaky Clean</a><a class="small-link" href="tel:+17178709439">Call (717) 870-9439</a></section><button class="secondary" id="refresh-status">Refresh appointment status</button>`;
    document.getElementById('refresh-status').onclick=()=>refresh({retryQuote:true});addPrivateLinkButton();return;
  }
  const eyebrow=document.getElementById('form-eyebrow');if(eyebrow)eyebrow.textContent=state.state==='booked'?'WE’LL SEE YOU SOON':'YOUR NEXT STEP';
  const title=document.getElementById('estimate-title'),intro=document.getElementById('form-intro');if(title)title.textContent=state.state==='booked'?'Your appointment. All set.':'Your personal estimate.';if(intro)intro.textContent='Your quote is saved. Take a look—choose a time only if you’re ready to book.';
  try{measure();}catch{} // Measurement must never block the quote or booking screens.
  const q=state.pendingQuote??state.quote,awaitingAcceptance=state.state==='quoted'||!!state.pendingQuote,quoted=q&&['quoted','accepted','booked'].includes(state.state);progress(quoted?(awaitingAcceptance?2:3):1);
  const contact=`<div class="summary-contact">${esc(state.input.name)} · ${esc(state.input.contactMethod==='email'?state.input.email:state.input.phone)}<br>${esc(state.input.address||'Service ZIP: '+state.input.zip)}</div>`;
  if(!quoted){app.innerHTML=`<section class="card status-card"><span class="pill">${state.state==='processing'?'Reviewing your photos':'Request received'}</span><h2>${state.state==='processing'?'Finding the right clean.':'Your request is with the team.'}</h2><p class="hint">${esc(state.error||'We’re checking your photos and service selections. Your details are saved.')}</p><p class="hint">We’ll contact you by ${esc(state.input.contactMethod)} if we need anything else. Keep this private link to return to your estimate.</p><p><strong>Booking opens after your vehicle and price are confirmed.</strong> If the vehicle details are incorrect, start a new estimate below. Otherwise, text us and we’ll help you finish your quote and book.</p><a class="primary" href="sms:+17178709439?body=Hi%20Sneaky%20Clean%2C%20my%20estimate%20needs%20review.%20Can%20you%20help%20me%20finish%20my%20quote%20and%20book%3F">Text us to finish &amp; book</a><a class="small-link" href="${esc(location.pathname)}">Correct my vehicle — start a new estimate</a><a class="small-link" href="tel:+17178709439">Call (717) 870-9439</a></section><section class="card">${contact}<p class="hint">${state.input.vehicles.map(v=>esc(`${v.year} ${v.make} ${v.model}`)).join(' · ')}</p><button class="secondary" id="refresh-status">Check estimate status</button></section>`;document.getElementById('refresh-status').onclick=()=>refresh({retryQuote:true});addPrivateLinkButton();return;}
  app.innerHTML=`${promoActive()&&state.state!=='booked'?promoBanner():''}<section class="card"><div class="card-heading"><div><span class="section-num">${state.pendingQuote?'Updated quote — approval needed':awaitingAcceptance?'Your quote is ready':'Quote accepted'}</span><h2>Your itemized quote</h2></div><span class="pill">${q.vehicles.length} vehicle${q.vehicles.length>1?'s':''}</span></div>${contact}${awaitingAcceptance?'<button type="button" class="primary" id="show-booking-step">Choose an appointment →</button><p class="hint">Review and accept your total below, then choose an available time.</p>':''}${state.pendingQuote?`<p class="hint">Photo review changed the recommended work. Your previous accepted total is ${money(state.quote.totalCents)}. Review the revised services and price below. Additional work requires your approval.</p>`:state.needsPhotoReview?'<p class="hint">This quote is based on your vehicle and selected services. You can accept and book now. Our team will review the photos and contact you before service if anything changes. Additional work or charges require your approval.</p>':'<p class="hint">Your team photo review is complete.</p>'}${state.needsScheduleReview?'<p class="hint">Your updated services need an appointment timing check. The team will confirm this with you before service.</p>':''}</section>${q.vehicles.map(v=>`<section class="card"><div class="quote-title"><h2>${esc(v.name)}</h2><span class="pill">${serviceLabel(v.service)} Detail</span></div>${v.reasons.length?`<ul class="reason">${v.reasons.map(r=>'<li>'+esc(r)+'</li>').join('')}</ul>`:''}${v.services.map(s=>`<div class="quote-line"><span>${esc(s.name)}</span><strong>${money(s.priceCents)}</strong></div>`).join('')}<div class="quote-line"><span>Tax</span><strong>${money(v.taxCents)}</strong></div><div class="total"><span>Vehicle total</span><strong>${money(v.totalCents)}</strong></div></section>`).join('')}<section class="card" id="quote-booking-step"><div class="total"><div><span class="section-num">All vehicles</span><h2>Total</h2></div><strong>${money(q.totalCents)}</strong></div><p class="hint">Valid through ${new Date(q.expiresAt).toLocaleDateString()}. This price covers the listed services and the condition shown or described. Any additional work requires your approval.</p>${awaitingAcceptance?'<p class="hint">Happy with your quote? Booking is optional. You can return using your private link.</p><label class="check"><input type="checkbox" id="accept-check">I accept these services and this total.</label><button class="primary" id="accept-quote" disabled>Accept quote &amp; choose appointment →</button>':(config.deposit?.enabled?'<p class="hint">Choose an appointment for each vehicle below. Your deposit and remaining balance will be shown with the appointment.</p>':'<p class="hint">Choose an appointment for each vehicle below. No card or payment is required to reserve. Pay after your service.</p>')}</section>${awaitingAcceptance?'':bookingAddressCard()+q.vehicles.map(bookingCard).join('')}<button class="small-link" id="refresh-status">Refresh status</button>`;
  document.getElementById('refresh-status').onclick=()=>refresh({retryQuote:true});addPrivateLinkButton();
  if(awaitingAcceptance){
    document.getElementById('show-booking-step').onclick=()=>{document.getElementById('quote-booking-step').scrollIntoView?.({behavior:'instant',block:'start'});document.getElementById('accept-check').focus({preventScroll:true});};
    document.getElementById('accept-check').onchange=e=>document.getElementById('accept-quote').disabled=!e.target.checked;
    document.getElementById('accept-quote').onclick=()=>perform(async()=>{state=await api('accept',{quoteHash:q.hash,accept:true});renderState();});
  }else bindBookings();
}
function addPrivateLinkButton(){
  app.insertAdjacentHTML('beforeend','<button type="button" class="small-link save-private-link" id="copy-estimate-link">Copy my private estimate link</button>');
  document.getElementById('copy-estimate-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'#'+token);message('Private estimate link copied. Keep it to return to your quote.');}catch{message('Keep the address in your browser to return to this estimate.');}};
}
const depositCards=new Map();
let squareLoader;
function activeDeposit(index){return (state.deposits??[]).find(d=>d.vehicle===index&&!['failed','cancelled','refunded'].includes(d.state));}
function bookingAddressCard(){
  if(state.input.address)return '';
  return `<form id="booking-address-form" class="card"><span class="section-num">Ready to book?</span><h2>Where should we come?</h2><p class="hint">Your appointment will be at this address. Service ZIP: ${esc(state.input.zip)}.</p><label for="booking-address">Street, city, state & ZIP</label><input id="booking-address" autocomplete="street-address" maxlength="300" minlength="10" required placeholder="123 Main St, Murfreesboro, TN 37129"><button type="submit" class="secondary address-save">Save address & choose a time →</button></form>`;
}
function bookingCard(v){
  const saved=state.bookings.find(b=>b.vehicle===v.index),deposit=activeDeposit(v.index),credited=deposit?deposit.amountCents-(deposit.payment?.refundedCents??0):0,cancelled=saved?.booking&&CANCELLED.includes(saved.booking.status);
  if(deposit&&deposit.state!=='paid')return `<section class="card"><span class="pill">Checking payment and appointment</span><h3>${esc(v.name)}</h3><p>${esc(when(deposit.startAt))} Central</p><p>${esc(deposit.error||'We’re confirming your deposit and appointment. Please do not start another payment.')}</p><button class="secondary deposit-refresh">Check payment status</button></section>`;
  if(saved?.booking)return `<section class="card"><span class="pill">Appointment ${esc(saved.booking.status.toLowerCase())}</span><h3>${esc(v.name)}</h3><p>${esc(when(saved.booking.startAt))} Central</p>${deposit?`<div class="deposit-totals"><p>Deposit credited <strong>${money(credited)}</strong></p>${cancelled?'<p>This appointment is no longer scheduled.</p>':`<p>Remaining after service <strong>${money(v.totalCents-credited)}</strong></p>`}</div>${deposit.payment?.receiptURL?`<a href="${esc(deposit.payment.receiptURL)}" target="_blank" rel="noopener noreferrer" data-private>Square receipt</a>`:''}<details><summary>Deposit & cancellation policy</summary><p class="hint">${esc(deposit.terms)}</p></details>`:''}<p class="hint">${cancelled?'Contact (717) 870-9439 about a refund or a new appointment.':state.needsScheduleReview?'Your revised services are approved. The team is checking the appointment timing and will contact you before service.':'Your appointment is on the Sneaky Clean schedule. Call or text (717) 870-9439 to cancel or reschedule.'}</p></section>`;
  if(!state.input.address)return '';
  const failed=(state.deposits??[]).filter(d=>d.vehicle===v.index&&['failed','refunded'].includes(d.state)).at(-1);
  return `<section class="card" data-booking="${v.index}"><span class="section-num">Schedule vehicle ${v.index+1}</span><h2>${esc(v.name)}</h2>${failed?`<p class="hint">${esc(failed.error)}</p>`:''}<p class="hint">Choose Monday through Friday. All times are Central. For weekend appointments, call or text us.</p><div class="booking-date"><label for="day-${v.index}">Appointment date</label><input type="date" id="day-${v.index}" min="${new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000))}"></div><div class="slots" id="slots-${v.index}"></div><button class="primary" id="book-${v.index}" disabled>${saved?'Check / retry appointment':config.deposit?.enabled?'Continue to deposit':'Book this appointment'}</button><div id="deposit-${v.index}"></div><p class="hint" id="book-note-${v.index}">${saved?'Your previous appointment request is still being verified. Contact the team if it does not confirm.':config.deposit?.enabled?'A 50% deposit reserves your time. The remaining balance is due after service.':'No card required. Payment is due after service.'}</p></section>`;
}
async function loadSquare(){
  if(window.Square)return;
  if(!squareLoader)squareLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=(config.deposit.sandbox?'https://sandbox.web.squarecdn.com':'https://web.squarecdn.com')+'/v1/square.js';script.onload=resolve;script.onerror=()=>{squareLoader=null;script.remove();reject(Error('The secure card form could not load. Please try again or call us.'));};document.head.appendChild(script);});
  await squareLoader;if(!window.Square){squareLoader=null;throw Error('The secure card form is unavailable. Please try again.');}
}
async function openDeposit(v,startAt){
  const panel=document.getElementById('deposit-'+v.index),amount=Math.round(v.totalCents/2);
  if(depositCards.has(v.index)){await depositCards.get(v.index).destroy();depositCards.delete(v.index);}
  panel.innerHTML=`<div class="deposit-panel"><span class="section-num">Reserve your appointment</span><h3>${esc(when(startAt))} Central</h3><div class="deposit-totals"><p>Total including tax <strong>${money(v.totalCents)}</strong></p><p>50% deposit today <strong>${money(amount)}</strong></p><p>Remaining after service <strong>${money(v.totalCents-amount)}</strong></p></div><h3>24-hour cancellation policy</h3><p class="hint">${esc(config.deposit.terms)}</p><div id="card-${v.index}" aria-label="Secure card details"></div><label class="consent"><input id="deposit-consent-${v.index}" type="checkbox"><span>I agree to the deposit and cancellation policy above and authorize a one-time ${money(amount)} deposit for this appointment.</span></label><button class="primary" id="pay-${v.index}" disabled>Loading secure card form…</button><p class="hint">Card details are handled securely by Square. Your card is not saved for automatic future charges.</p></div>`;
  await loadSquare();const payments=window.Square.payments(config.deposit.applicationId,config.deposit.locationId),card=await payments.card();await card.attach('#card-'+v.index);depositCards.set(v.index,card);
  const pay=document.getElementById('pay-'+v.index),consent=document.getElementById('deposit-consent-'+v.index);pay.textContent='Pay '+money(amount)+' & reserve';consent.onchange=()=>pay.disabled=!consent.checked;
  pay.onclick=()=>perform(async()=>{
    if(!consent.checked)throw Error('Please agree to the cancellation policy before paying.');
    if(bookSelections.get(v.index)!==startAt)throw Error('Your selected time changed. Continue with the new time.');
    pay.disabled=true;
    const frozen=[...document.querySelectorAll('[data-booking] input[type=date],[data-booking] .slot,[data-booking] button[id^=book-],[data-booking] input[id^=deposit-consent-]')].map(element=>({element,disabled:element.disabled}));
    frozen.forEach(({element})=>element.disabled=true);
    try{
      const key='estimate-deposit-'+token+'-'+v.index;let requestId=localStorage.getItem(key);
      if(requestId){const checked=await api('deposit/status');if((checked.deposits??[]).some(d=>d.id===requestId)){state=checked;localStorage.removeItem(key);bookSelections.clear();renderState();return;}}
      const [givenName,...rest]=state.input.name.split(/\s+/),result=await card.tokenize({amount:(amount/100).toFixed(2),currencyCode:'USD',intent:'CHARGE',customerInitiated:true,sellerKeyedIn:false,billingContact:{givenName,familyName:rest.join(' '),...(state.input.email?{email:state.input.email}:{}),...(state.input.phone?{phone:state.input.phone}:{}),countryCode:'US'}});
      if(result.status!=='OK')throw Error('Check your card details and try again.');
      requestId=requestId||crypto.randomUUID();localStorage.setItem(key,requestId);message('Confirming your deposit and appointment…');
      try{state=await api('deposit/pay',{vehicle:v.index,startAt,quoteHash:state.quote.hash,requestId,sourceId:result.token,policyVersion:config.deposit.policyVersion,consent:true});}
      catch(error){const checked=await api('deposit/status');if(!(checked.deposits??[]).some(d=>d.id===requestId))throw error;state=checked;}
      const saved=(state.deposits??[]).find(d=>d.id===requestId);if(saved&&['paid','failed','refunded','cancelled'].includes(saved.state))localStorage.removeItem(key);
      bookSelections.clear();message(saved?.state==='paid'?'Your deposit is paid and your appointment is reserved.':saved?.error||'Check payment status before trying again.');renderState();
    }finally{frozen.forEach(({element,disabled})=>{if(element.isConnected)element.disabled=disabled;});if(pay.isConnected)pay.disabled=!consent.checked;}
  });
}
function bindBookings(){
  const addressForm=document.getElementById('booking-address-form');
  if(addressForm)addressForm.onsubmit=e=>{e.preventDefault();if(addressForm.reportValidity&&!addressForm.reportValidity())return;perform(async()=>{state=await api('booking-details',{address:document.getElementById('booking-address').value.trim()});renderState();document.getElementById('day-0')?.focus();});};
  document.querySelectorAll('.deposit-refresh').forEach(button=>button.onclick=()=>perform(async()=>{state=await api('deposit/status');renderState();}));
  for(const v of state.quote.vehicles){const date=document.getElementById('day-'+v.index),button=document.getElementById('book-'+v.index);if(!date)continue;
    if(state.needsScheduleReview){date.disabled=true;button.disabled=true;document.getElementById('book-note-'+v.index).textContent='The team is confirming appointment timing for the revised services.';continue;}
    const pending=state.bookings.find(b=>b.vehicle===v.index&&!b.booking);if(pending?.requestedStartAt){bookSelections.set(v.index,pending.requestedStartAt);button.disabled=false;date.disabled=true;document.getElementById('book-note-'+v.index).textContent='Check / retry '+when(pending.requestedStartAt)+' Central. The saved request cannot create a second appointment.';}
    date.onchange=()=>perform(async()=>{button.disabled=true;bookSelections.delete(v.index);document.getElementById('deposit-'+v.index).innerHTML='';const day=date.value;document.getElementById('slots-'+v.index).textContent='Checking openings…';const data=await api('availability',{vehicle:v.index,day});if(date.value!==day)return;const slots=document.getElementById('slots-'+v.index);slots.innerHTML=data.slots.length?data.slots.map(s=>`<button type="button" class="slot" data-start="${esc(s.startAt)}">${new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',timeStyle:'short'}).format(new Date(s.startAt))}</button>`).join(''):'<p class="hint">No opening fits these services that day. Try another date or contact us.</p>';slots.querySelectorAll('button').forEach(b=>b.onclick=()=>{bookSelections.set(v.index,b.dataset.start);slots.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));document.getElementById('deposit-'+v.index).innerHTML='';button.disabled=false;});});
    button.onclick=()=>perform(async()=>{const startAt=bookSelections.get(v.index);if(!startAt)return;if(config.deposit?.enabled&&!pending){await openDeposit(v,startAt);return;}button.disabled=true;message('Confirming the appointment…');try{state=await api('book',{vehicle:v.index,startAt,quoteHash:state.quote.hash});message('Your appointment is saved.');renderState();}catch(error){button.disabled=false;throw error;}});
  }
}
async function perform(fn){if(busy)return;busy=true;message('');try{await fn();}catch(error){message(error.message,true);}finally{busy=false;}}
async function refresh({retryQuote=false}={}){await perform(async()=>{let next=await api('deposit/status');if(!next.externalBooking&&(next.state==='processing'||retryQuote&&next.state==='review'&&!next.quote))next=await api('quote');if(JSON.stringify(next)!==JSON.stringify(state)){state=next;renderState();}});}
async function init(){
  try{const r=await fetch(ESTIMATE_API+'/estimates/api/config?addons=1');config=await r.json();if(!r.ok)throw Error(config.error||'Service pricing is temporarily unavailable. Please call or text us.');document.querySelectorAll('[data-package-price]').forEach(el=>{const prices=config.packages[el.dataset.packagePrice].map(id=>serviceTotal(id)).filter(Number.isInteger);if(prices.length)el.textContent='from '+displayPrice(Math.min(...prices));});if(token){state=await api('deposit/status');renderState();if(!state.externalBooking&&(state.state==='processing'||state.state==='review'&&!state.quote)){state=await api('quote');renderState();}}else renderForm();
    try{const r=await fetch(ESTIMATE_API+'/estimates/api/vehicles?kind=makes');const d=await r.json();if(r.ok){makes=d.options;document.querySelectorAll('[id^="make-"]').forEach(s=>{s.innerHTML=makeOptions(s.value);});}}catch{}
  }catch(error){message(error.message,true);app.innerHTML='<section class="card"><h2>Let’s get you a quote.</h2><p>Call or text <a href="tel:+17178709439">(717) 870-9439</a>, or <a href="'+esc(location.pathname)+'">start a new estimate</a>.</p></section>';}
}
loadTag();
init();
setInterval(()=>{if(token&&state?.input&&!busy&&!document.hidden&&(['review','processing'].includes(state.state)||state.needsPhotoReview||state.pendingQuote||(state.deposits??[]).some(d=>!['paid','failed','cancelled','refunded'].includes(d.state)))&&!bookSelections.size)refresh();},30000);

window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if((/^[a-f0-9]{64}$/.test(next)&&next!==token)||(!next&&token))location.reload();});
// Section links scroll without changing the private estimate fragment or generating a second page view.
document.addEventListener('click',e=>{const link=e.target.closest?.('[data-scroll],[data-choose-service]');if(!link)return;e.preventDefault();const service=link.dataset.chooseService;if(service&&document.getElementById('service-0')){setFormStage(0);document.getElementById('service-0').value=service;showVehiclePrice(0);}const target=document.getElementById(link.dataset.scroll||'estimate');target?.scrollIntoView?.({behavior:'instant',block:'start'});target?.focus?.({preventScroll:true});});
// Every call link on the page (header, footer, status and error cards) counts as a call click.
document.addEventListener('click',e=>{if(e.target.closest?.('a[href^="tel:"]')){track('click_call_now');adsConversion('call');}});
// Links that carry the private estimate token or a payment receipt are hidden from automatic link tracking. This
// first window capture listener runs before any listener the Google tag adds later; the link still opens normally.
for(const type of ['click','auxclick'])window.addEventListener(type,e=>{if(e.target.closest?.('[data-private]'))e.stopImmediatePropagation();},true);
