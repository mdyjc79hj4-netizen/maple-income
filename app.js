
const KEY='maple-income-vercel-v1';
const items={
  hunt:['메소','솔 에르다 조각','코어 젬스톤'],
  gather:['쥬니퍼베리 씨앗','쥬니퍼베리 꽃','히솝 꽃','페퍼민트 꽃'],
  drop:['보스 드랍','기타 아이템']
};
const bosses=[
  '스우','데미안','가디언 엔젤 슬라임','루시드','윌','더스크','듄켈',
  '진 힐라','검은 마법사','세렌','칼로스','카링'
];
const difficulties=['노멀','하드','카오스','익스트림'];

let state=JSON.parse(localStorage.getItem(KEY)||'null')||{
  characters:[{id:crypto.randomUUID(),name:'본캐',bosses:{}}],
  incomes:[],
  saleState:'acquired'
};
function save(){localStorage.setItem(KEY,JSON.stringify(state));render();}
function n(v){return Number(v||0)}
function won(v){return Math.floor(n(v)).toLocaleString('ko-KR')}
function weekRange(date=new Date()){
  const d=new Date(date); d.setHours(0,0,0,0);
  const day=d.getDay(); const diff=(day>=4?day-4:day+3);
  const start=new Date(d); start.setDate(d.getDate()-diff);
  const end=new Date(start); end.setDate(start.getDate()+6);
  const f=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  return {start:f(start),end:f(end)}
}
function currentWeekKey(){const w=weekRange();return `${w.start}~${w.end}`}
function incomeValue(x){
  if(x.item==='메소') return n(x.amount);
  if(x.saleState!=='sold') return 0;
  return n(x.qty)*n(x.price);
}
function catTotal(cat){return state.incomes.filter(x=>x.category===cat).reduce((a,b)=>a+incomeValue(b),0)}
function bossTotal(){
  let t=0;
  for(const c of state.characters){
    for(const b of Object.values(c.bosses||{})) if(b.done) t+=n(b.price)
  }
  return t;
}
function renderWeek(){
  const w=weekRange(); document.querySelector('#weekLabel').textContent=`${w.start} ~ ${w.end}`;
  const sel=document.querySelector('#weekSelect');
  sel.innerHTML=`<option>이번 주 · ${w.start} ~ ${w.end}</option>`;
}
function renderSummary(){
  const bt=bossTotal(), ht=catTotal('hunt'), gt=catTotal('gather'), dt=catTotal('drop');
  const total=bt+ht+gt+dt;
  document.querySelector('#totalIncome').textContent=won(total);
  document.querySelector('#totalIncomeText').textContent=`${won(total)} 메소`;
  [['bossIncome',bt],['huntIncome',ht],['gatherIncome',gt],['dropIncome',dt]].forEach(([id,v])=>{
    document.querySelector('#'+id).textContent=won(v)
    document.querySelector('#'+id).nextElementSibling.textContent=`${won(v)} 메소`
  });
  const list=document.querySelector('#characterList');
  list.innerHTML=state.characters.map(c=>{
    const vals=Object.values(c.bosses||{}); const done=vals.filter(x=>x.done).length; const sum=vals.filter(x=>x.done).reduce((a,b)=>a+n(b.price),0);
    return `<div class="character">
      <div class="char-row">
        <div><div class="char-name">${escapeHtml(c.name)}</div><div class="muted">주간 ${done} / ${bosses.length} 완료 · ${Math.round(done/bosses.length*100)||0}%</div><div style="margin-top:5px">전체 보스 수익 ${won(sum)} 메소</div></div>
        <div class="pill">${won(sum)}<small>메소</small></div>
      </div>
      <div class="muted" style="margin-top:12px">해당 주에 기록된 월간 보스 0 메소 · 일간 보스 0 메소</div>
    </div>`
  }).join('');
}
function renderBosses(){
  const host=document.querySelector('#bossEditor');
  host.innerHTML=state.characters.map(c=>`<div class="boss-char"><h3>${escapeHtml(c.name)}</h3>`+
  bosses.map(name=>{
    const b=c.bosses?.[name]||{difficulty:'노멀',price:0,done:false};
    return `<div class="boss-line" data-char="${c.id}" data-boss="${name}">
      <span>${name}</span>
      <select class="boss-diff">${difficulties.map(d=>`<option ${d===b.difficulty?'selected':''}>${d}</option>`).join('')}</select>
      <label style="display:flex;gap:7px;align-items:center"><input class="boss-done" type="checkbox" ${b.done?'checked':''}> 완료</label>
      <input class="boss-price" type="number" inputmode="numeric" min="0" value="${n(b.price)}" placeholder="결정석 가격">
    </div>`
  }).join('')+`</div>`).join('');
  host.querySelectorAll('.boss-line').forEach(line=>{
    const cid=line.dataset.char,bn=line.dataset.boss;
    const update=()=>{
      const c=state.characters.find(x=>x.id===cid); c.bosses ||= {};
      c.bosses[bn]={
        difficulty:line.querySelector('.boss-diff').value,
        price:n(line.querySelector('.boss-price').value),
        done:line.querySelector('.boss-done').checked
      }; save();
    };
    line.querySelectorAll('select,input').forEach(el=>el.addEventListener('change',update));
  });
}
function renderIncomeForm(){
  const cat=document.querySelector('#incomeCategory').value;
  const itemSel=document.querySelector('#incomeItem');
  const prev=itemSel.value;
  itemSel.innerHTML=items[cat].map(x=>`<option>${x}</option>`).join('');
  if(items[cat].includes(prev)) itemSel.value=prev;
  const meso=itemSel.value==='메소';
  document.querySelector('#mesoWrap').classList.toggle('hidden',!meso);
  document.querySelector('#qtyWrap').classList.toggle('hidden',meso);
  document.querySelector('#priceWrap').classList.toggle('hidden',meso);
  document.querySelector('#saleStateWrap').classList.toggle('hidden',meso);
}
function renderIncomeHistory(){
  const host=document.querySelector('#incomeHistory');
  host.innerHTML=state.incomes.slice().reverse().map(x=>{
    const value=incomeValue(x);
    const detail=x.item==='메소'?`${won(x.amount)} 메소`:`${won(x.qty)}개 · ${x.saleState==='sold'?'판매 완료':'획득 기록'}${x.price?` · 개당 ${won(x.price)}`:''}`;
    return `<div class="history-item"><div><b>${escapeHtml(x.item)}</b><div class="meta">${escapeHtml(x.categoryLabel)} · ${detail}</div></div><div>${won(value)} 메소</div></div>`
  }).join('')||'<div class="muted" style="margin-top:14px">아직 기록이 없습니다.</div>';
}
function renderPriceList(){
  document.querySelector('#priceList').innerHTML=[...items.hunt.slice(1),...items.gather,...items.drop].map(x=>`<div class="history-item"><span>${x}</span><span class="muted">입력 시 개당 판매가 기록</span></div>`).join('');
}
function render(){renderWeek();renderSummary();renderBosses();renderIncomeHistory();renderPriceList();}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
  ['summary','boss','income','price','settings'].forEach(t=>document.querySelector('#'+t+'Tab').classList.toggle('hidden',t!==btn.dataset.tab));
}));
document.querySelectorAll('[data-open-income]').forEach(b=>b.addEventListener('click',()=>document.querySelector('[data-tab="income"]').click()));
document.querySelector('#addCharacter').addEventListener('click',()=>document.querySelector('#characterDialog').showModal());
document.querySelector('#characterForm').addEventListener('submit',e=>{
  e.preventDefault(); const name=document.querySelector('#characterName').value.trim(); if(!name)return;
  state.characters.push({id:crypto.randomUUID(),name,bosses:{}}); document.querySelector('#characterName').value=''; document.querySelector('#characterDialog').close(); save();
});
document.querySelector('#incomeCategory').addEventListener('change',renderIncomeForm);
document.querySelector('#incomeItem').addEventListener('change',renderIncomeForm);
document.querySelectorAll('[data-sale]').forEach(b=>b.addEventListener('click',()=>{
  state.saleState=b.dataset.sale;
  document.querySelectorAll('[data-sale]').forEach(x=>x.classList.toggle('active',x===b));
}));
document.querySelector('#incomeForm').addEventListener('submit',e=>{
  e.preventDefault();
  const category=document.querySelector('#incomeCategory').value;
  const item=document.querySelector('#incomeItem').value;
  const labels={hunt:'재획',gather:'채집',drop:'드랍·기타'};
  if(item==='메소'){
    const amount=n(document.querySelector('#mesoAmount').value); if(!amount)return;
    state.incomes.push({id:crypto.randomUUID(),category,categoryLabel:labels[category],item,amount,saleState:'direct',createdAt:Date.now()});
    document.querySelector('#mesoAmount').value='';
  }else{
    const qty=n(document.querySelector('#incomeQty').value),price=n(document.querySelector('#incomePrice').value);
    state.incomes.push({id:crypto.randomUUID(),category,categoryLabel:labels[category],item,qty,price,saleState:state.saleState,createdAt:Date.now()});
  }
  save();
});
document.querySelector('#resetAll').addEventListener('click',()=>{
  if(confirm('모든 저장 데이터를 초기화할까요?')){localStorage.removeItem(KEY);location.reload()}
});
renderIncomeForm(); render();
