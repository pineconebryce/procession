let ws=null, me=null, state=null, selected=new Set(), submittedSelection=false, lastStatus=null, lastEndKey=null;

const $=id=>document.getElementById(id);
function connect(){ ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.type==="error"){ $("lobbyError").textContent=m.message; return;} if(m.type==="joined"){me=m.playerId; $("lobbyError").textContent=""; show("room"); $("roomCodeTitle").textContent=m.code; $("roomBadge").textContent=m.code; $("roomBadge").classList.remove("hidden");} if(m.type==="state"){const previousStatus=state?.status; state=m.state; if(state.status!=="selection"){selected.clear(); submittedSelection=false;} render(); if(state.status==="final" && previousStatus!=="final") showEndgameAnnouncement();}};
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
  const s=suit(c.suitId), d=document.createElement("div"); d.className="card "+(opts.selectable?"selectable ":"")+(opts.selected?"selected ":"")+(opts.extraClass||"");
  d.style.borderTop=`5px solid ${s.color}`; d.title=`${s.name} ${c.number}`;
  d.innerHTML=`<span class="corner tl" style="color:${s.color}">${c.number}</span><span class="number">${c.number}</span><span class="symbol" style="color:${s.color}">${s.symbol}</span><span class="corner br" style="color:${s.color}">${c.number}</span>`;
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
  const oldConfirm=document.getElementById("confirmSelect");
  if(state.status!=="selection" && oldConfirm) oldConfirm.remove();
  const current=state.players.find(p=>p.id===state.currentPlayer);
  $("statusBar").textContent=state.message+(current?` — ${current.name}`:"");
  $("deckCount").textContent=`DRAW PILE ${state.deckCount}`;
  $("scoreboard").innerHTML=state.players.map(p=>`<div class="score-row ${p.id===state.currentPlayer?"active":""}"><span>${esc(p.name)}${p.id===me?" · YOU":""}</span><span class="score">${p.score}</span></div>`).join("");
  const mep=state.players.find(p=>p.id===me); if(!mep)return;

  $("processionCount").textContent=`${state.procession.length} CARDS`;
  renderProcession();
  renderAllTableaus();

  $("hand").innerHTML=""; const canPlay=state.status==="playing"&&state.currentPlayer===me;
  mep.hand.forEach(c=>{const node=cardEl(c,{selectable:canPlay,onclick:()=>canPlay&&send({type:"play",cardId:c.id})}); if(canPlay)attachHandHover(c,node); $("hand").appendChild(node);});
  $("handHint").textContent=canPlay?"HOVER TO PREVIEW · CLICK TO PLAY":state.status==="selection"?"SELECT 2 CARDS":"";

  if(state.status==="final"){
    const final=state.currentPlayer===me;
    if(final){
      $("hand").innerHTML="";
      mep.hand.forEach(c=>$ ("hand").appendChild(cardEl(c,{selectable:true,onclick:()=>send({type:"finalPlay",cardId:c.id})})));
      $("handHint").textContent="FINAL TURN · CLICK A CARD TO PLAY";
    } else {
      $("handHint").textContent="WAITING FOR FINAL TURNS";
    }
  }
  if(state.status==="selection") renderSelection(mep);
  if(state.status==="gameover") showGameOver();
  else $("gameOverPanel").classList.add("hidden");
}
function renderProcession(){
  const el=$("procession"); el.innerHTML="";
  state.procession.forEach(c=>{
    const node=cardEl(c); node.dataset.cardId=c.id; el.appendChild(node);
  });
}
function collectionPreview(played){
  const existingCount=state.procession.length;
  const safe=new Set(), collect=new Set(), protectedByNumber=new Set();
  const protectedCount=Math.min(Math.max(played.number,0),existingCount);
  const protectedStart=existingCount-protectedCount;
  state.procession.forEach((c,i)=>{
    if(i>=protectedStart && protectedCount>0){
      safe.add(c.id);
      protectedByNumber.add(c.id);
    } else if(c.suitId===played.suitId || c.number<=played.number) collect.add(c.id);
    else safe.add(c.id);
  });
  return {safe,collect,protectedByNumber,protectedCount};
}
function attachHandHover(card,node){
  node.addEventListener("mouseenter",()=>{
    if(state.status!=="playing" || state.currentPlayer!==me)return;
    const preview=collectionPreview(card);
    document.querySelectorAll("#procession .card").forEach(x=>{
      x.classList.remove("preview-safe","preview-collect","preview-protected");
      if(preview.collect.has(x.dataset.cardId))x.classList.add("preview-collect");
      else if(preview.safe.has(x.dataset.cardId))x.classList.add("preview-safe");
      if(preview.protectedByNumber.has(x.dataset.cardId))x.classList.add("preview-protected");
    });
    const key=$("previewKey");
    key.textContent=preview.protectedCount?`Underlined numbers = ${preview.protectedCount} card${preview.protectedCount===1?"":"s"} excluded by ${card.number}.`:`No cards are excluded by ${card.number}; collection can consider the entire Procession.`;
    key.classList.remove("hidden");
    node.classList.add("preview-source");
  });
  node.addEventListener("mouseleave",clearPreview);
}
function clearPreview(){
  document.querySelectorAll("#procession .card").forEach(x=>x.classList.remove("preview-safe","preview-collect","preview-protected"));
  document.querySelectorAll("#hand .card").forEach(x=>x.classList.remove("preview-source"));
  $("previewKey").classList.add("hidden");
  $("previewKey").textContent="";
}
function renderAllTableaus(){
  const wrap=$("tableaus"); wrap.innerHTML="";
  state.players.forEach(p=>{
    const player=document.createElement("div"); player.className="tableau-player";
    player.innerHTML=`<div class="tableau-player-head"><b>${esc(p.name)}${p.id===me?" · YOU":""}</b><span>${p.tableau.length} cards · ${p.score} points</span></div>`;
    const groups=Object.fromEntries(state.suits.map(s=>[s.id,[]]));
    p.tableau.forEach(c=>groups[c.suitId].push(c));
    const grid=document.createElement("div"); grid.className="tableau-stacks";
    state.suits.forEach(s=>{
      const cards=groups[s.id], stack=document.createElement("div"); stack.className="suit-stack";
      stack.innerHTML=`<div class="stack-label" style="color:${s.color}"><span>${s.symbol}</span>${s.name}<small>${cards.length}</small></div>`;
      const pile=document.createElement("div"); pile.className="stack-cards";
      cards.forEach((c,i)=>{const n=cardEl(c,{extraClass:"stacked-card"}); n.style.setProperty("--stack-i",i); pile.appendChild(n)});
      stack.appendChild(pile); grid.appendChild(stack);
    });
    player.appendChild(grid); wrap.appendChild(player);
  });
}
function renderSelection(mep){
  $("hand").innerHTML="";
  mep.hand.forEach(c=>{
    const sel=selected.has(c.id);
    $("hand").appendChild(cardEl(c,{selectable:true,selected:sel,onclick:()=>{
      if(submittedSelection)return;
      if(selected.has(c.id))selected.delete(c.id); else if(selected.size<2)selected.add(c.id);
      renderGame();
    }}));
  });
  const count=state.selectionCount||0;
  if(mep.selectionSubmitted)submittedSelection=true;
  $("handHint").textContent=submittedSelection?`WAITING FOR OTHER PLAYERS · ${count}/${state.players.length} READY`:`${selected.size}/2 SELECTED`;
  let btn=document.getElementById("confirmSelect");
  if(!btn){btn=document.createElement("button");btn.id="confirmSelect";btn.className="primary";$ ("hand").after(btn);}
  if(submittedSelection){btn.textContent="Waiting for other players";btn.disabled=true;btn.classList.remove("primary");}
  else {btn.textContent="Reveal my 2 cards";btn.disabled=selected.size!==2;btn.classList.add("primary");btn.onclick=()=>{if(selected.size===2){submittedSelection=true;send({type:"select",cardIds:[...selected]});renderGame();}};}
}
function showEndgameAnnouncement(){
  const reason=state.endGame?.reason==="SIX_SUITS"?"A player has collected all six suits.":"The draw pile has been exhausted.";
  const trigger=state.players.find(p=>p.id===state.endGame?.triggerId);
  const key=`${state.code}:${state.endGame?.reason}:${state.endGame?.triggerId}`;
  if(lastEndKey===key)return; lastEndKey=key;
  $("modalTitle").innerHTML="End game has begun";
  $("modalBody").innerHTML=`<p>${reason}</p><p>${trigger?`<b>${esc(trigger.name)}</b> triggered the end game.`:"The end game has started."} Every other player gets exactly one final turn. After that, everyone selects two cards to reveal simultaneously.</p>`;
  $("modalActions").innerHTML=`<button class="primary" id="continueEndgame">Continue</button>`;
  $("modal").classList.remove("hidden");
  $("continueEndgame").onclick=()=>$("modal").classList.add("hidden");
}
function showGameOver(){
  $("modal").classList.add("hidden");
  const rows=state.players.map(p=>`<div class="score-row"><span>${esc(p.name)}${p.id===me?" · YOU":""}</span><span class="score">${p.score}</span></div>`).join("");
  const panel=$("gameOverPanel");
  panel.innerHTML=`<h3>Game over</h3><p>Final scores — lowest total wins.</p><div class="gameover-scores">${rows}</div><div class="modal-actions"><button onclick="location.reload()">New game</button></div>`;
  panel.classList.remove("hidden");
}
function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderSuits(){ $("suits").innerHTML=[["red","Red","◆"],["blue","Blue","●"],["green","Green","▲"],["yellow","Yellow","★"],["purple","Purple","⬟"],["orange","Orange","✚"]].map(x=>`<div class="suit-chip"><span class="sym">${x[2]}</span><span>${x[1]}</span></div>`).join("")}
renderSuits(); connect();
