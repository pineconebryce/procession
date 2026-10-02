
let ws=null, me=null, state=null, selected=new Set();

const $=id=>document.getElementById(id);
function connect(){ ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.type==="error"){ $("lobbyError").textContent=m.message; return;} if(m.type==="joined"){me=m.playerId; $("lobbyError").textContent=""; show("room"); $("roomCodeTitle").textContent=m.code; $("roomBadge").textContent=m.code; $("roomBadge").classList.remove("hidden");} if(m.type==="state"){state=m.state; render();}};
  ws.onclose=()=>{if(state) setTimeout(connect,1200)};
}
function send(x){if(ws?.readyState===1)ws.send(JSON.stringify(x))}
function show(id){["lobby","room","game"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
$("createBtn").onclick=()=>{const n=$("name").value.trim()||"Player";send({type:"create",name:n})};
$("joinBtn").onclick=()=>{const n=$("name").value.trim()||"Player",c=$("code").value.trim().toUpperCase();send({type:"join",name:n,code:c})};
$("startBtn").onclick=()=>send({type:"start"});
$("code").oninput=e=>e.target.value=e.target.value.replace(/[^a-z0-9]/gi,"").toUpperCase();

function suit(id){return state.suits.find(s=>s.id===id)}
function cardEl(c,opts={}){
  const s=suit(c.suitId), d=document.createElement("div"); d.className="card "+(opts.selectable?"selectable":"")+(opts.selected?" selected":"");
  d.style.borderTop=`5px solid ${s.color}`; d.title=`${s.name} ${c.number}`;
  d.innerHTML=`<span class="corner tl" style="color:${s.color}">${c.number}</span><span class="symbol" style="color:${s.color}">${s.symbol}</span><span class="number">${c.number}</span><span class="symbol bottom" style="color:${s.color}">${s.symbol}</span><span class="corner br" style="color:${s.color}">${c.number}</span>`;
  if(opts.onclick)d.onclick=opts.onclick; return d;
}
function render(){
  if(!state)return;
  if(state.status==="lobby"){show("room"); renderRoom(); return}
  show("game"); renderGame();
}
function renderRoom(){
  $("roomCodeTitle").textContent=state.code; $("roomBadge").textContent=state.code;
  $("startBtn").disabled=state.players.length<2;
  $("playersList").innerHTML=state.players.map((p,i)=>`<div class="player-tile ${i===0?"host":""}"><span class="player-dot"></span><b>${esc(p.name)}</b>${i===0?"<div class='muted' style='padding:5px 0 0'>Host</div>":""}</div>`).join("");
}
function renderGame(){
  const current=state.players.find(p=>p.id===state.currentPlayer);
  $("statusBar").textContent=state.message+(current?` — ${current.name}`:"");
  $("deckCount").textContent=`DRAW PILE ${state.deckCount}`;
  $("scoreboard").innerHTML=state.players.map(p=>`<div class="score-row ${p.id===state.currentPlayer?"active":""}"><span>${esc(p.name)}${p.id===me?" · YOU":""}</span><span class="score">${p.score}</span></div>`).join("");
  const mep=state.players.find(p=>p.id===me); if(!mep)return;
  $("tableauScore").textContent=`${mep.score} POINTS`;
  $("procession").innerHTML=""; state.procession.forEach(c=>$("procession").appendChild(cardEl(c)));
  $("tableau").innerHTML=""; mep.tableau.forEach(c=>$("tableau").appendChild(cardEl(c)));
  $("hand").innerHTML=""; const canPlay=state.status==="playing"&&state.currentPlayer===me;
  mep.hand.forEach(c=>$("hand").appendChild(cardEl(c,{selectable:canPlay,onclick:()=>canPlay&&send({type:"play",cardId:c.id})})));
  $("handHint").textContent=canPlay?"SELECT A CARD TO PLAY":state.status==="selection"?"SELECT 2 CARDS":"";
  if(state.status==="final") {
    const final=state.currentPlayer===me;
    mep.hand.forEach(()=>{}); 
    if(final){ $("hand").innerHTML=""; mep.hand.forEach(c=>$("hand").appendChild(cardEl(c,{selectable:true,onclick:()=>send({type:"finalPlay",cardId:c.id})}))); }
  }
  if(state.status==="selection") renderSelection(mep);
  if(state.status==="gameover") showGameOver();
}
function renderSelection(mep){
  $("hand").innerHTML="";
  mep.hand.forEach(c=>{
    const sel=selected.has(c.id);
    $("hand").appendChild(cardEl(c,{selectable:true,selected:sel,onclick:()=>{
      if(selected.has(c.id))selected.delete(c.id); else if(selected.size<2)selected.add(c.id);
      renderGame();
    }}));
  });
  $("handHint").textContent=`${selected.size}/2 SELECTED`;
  let btn=document.getElementById("confirmSelect");
  if(!btn){btn=document.createElement("button");btn.id="confirmSelect";btn.className="primary";btn.textContent="Reveal my 2 cards";btn.onclick=()=>{if(selected.size===2){send({type:"select",cardIds:[...selected]});btn.remove();}};$("hand").after(btn)}
}
function showGameOver(){
  const sc=Object.fromEntries(state.players.map(p=>[p.id,p.score]));
  const rows=state.players.slice().sort((a,b)=>a.score-b.score).map(p=>`<div class="score-row"><span>${esc(p.name)}</span><span class="score">${p.score}</span></div>`).join("");
  $("modalTitle").innerHTML="Game over"; $("modalBody").innerHTML=`<p>Lowest score: <b>${Math.min(...Object.values(sc))}</b>.</p>${rows}`;
  $("modalActions").innerHTML=`<button onclick="location.reload()">New game</button>`; $("modal").classList.remove("hidden");
}
function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderSuits(){ $("suits").innerHTML=[["red","Red","◆"],["blue","Blue","●"],["green","Green","▲"],["yellow","Yellow","★"],["purple","Purple","⬟"],["orange","Orange","✚"]].map(x=>`<div class="suit-chip"><span class="sym">${x[2]}</span><span>${x[1]}</span></div>`).join("")}
renderSuits(); connect();
