const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:v%100===0?0:2}).format(v/100);
const results=document.querySelector('#results'),status=document.querySelector('#status'),form=document.querySelector('#search');
function render(data){
  results.innerHTML=`<div class="results-heading"><h2>Compare the whole stay</h2><p>Same dates · 4 adults · USD</p></div>${data.options.map(({home:h,quote:q,assessment:a})=>{
    const lo=Math.min(...q.shareCents),hi=Math.max(...q.shareCents),available=a.status==='EXPLORATORY_ONLY';
    return `<article class="home ${available?'':'unavailable'}"><div class="home-top"><span class="home-glyph" aria-hidden="true">⌂</span><span class="tag ${available?'sage':'rust'}">${available?'Explore only':'Unavailable for comparison'}</span></div><h3>${e(h.name)}</h3><p class="home-facts">${h.bedrooms??'Unknown'} bedrooms · ${h.bathrooms??'Unknown'} bathrooms · sleeps up to ${h.maxGuests??'unknown'}</p><p class="evidence">★ ${h.rating??'Not supplied'} · ${h.reviewCount??'Unknown'} reviews <span>Fictional</span></p>
    <div class="price-row"><div><span>Your equal stay share</span><strong>${lo===hi?money(lo):money(lo)+'–'+money(hi)}</strong></div><div><span>Whole stay</span><b>${money(q.totalCents)}</b></div></div>
    ${a.reasons.length?`<ul class="reasons">${a.reasons.map(r=>`<li>${e(r)}</li>`).join('')}</ul>`:''}
    <details><summary>Price breakdown & what needs checking</summary><div class="breakdown">${q.charges.map(c=>`<div><span>${e(c.label)}</span><strong>${money(c.amountCents)}</strong></div>`).join('')}<div class="total"><span>Example stay total</span><strong>${money(q.totalCents)}</strong></div></div>
    <p class="small">Four equal shares preserve the total. Any remainder cents are shown as a range, without assigning rooms or changing your group’s allocations.</p><h4>Cancellation</h4><p>${e(h.cancellationText??'Not supplied. Do not assume a refundable booking.')}</p><h4>Still to verify</h4><ul class="limitations">${a.limitations.map(r=>`<li>${e(r)}</li>`).join('')}</ul><p class="small">Example quote expires ${e(new Date(q.expiresAt).toLocaleTimeString())}. It does not hold dates. You cannot approve or pay for this home in the preview.</p></details></article>`;
  }).join('')}<p class="end-note">No Best Value recommendation yet: full quality, merchant boundaries and everyone’s requirements need checking first.</p>`;
}
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Comparing fictional stay prices…';results.innerHTML='';
  const values=new FormData(form),maximum=String(values.get('maximum')).trim(),amount=maximum===''?null:Number(maximum);
  try{
    if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>100000||Math.abs(amount*100-Math.round(amount*100))>1e-7))throw Error('Enter a valid ceiling in USD using whole cents.');
    const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({stay:{arrival:values.get('arrival'),departure:values.get('departure'),adults:4},maximumShareCents:amount===null?null:Math.round(amount*100)})});
    const data=await response.json();if(!response.ok)throw Error(['INVALID_STAY_DATES','INVALID_STAY_LENGTH'].includes(data.error)?'Choose a stay of 1–28 nights, with departure after arrival.':'The preview could not load. Try again.');
    render(data);status.textContent='Three fictional homes compared. Nothing saved or approved.';
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
