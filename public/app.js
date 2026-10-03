let ws=null, me=null, state=null, selected=new Set(), submittedSelection=false, lastStatus=null, lastEndKey=null, manualHome=false;

function captureCardPositions(){
  const map=new Map();
  document.querySelectorAll('.card[data-card-id]').forEach(el=>{
    const r=el.getBoundingClientRect();
    map.set(el.dataset.cardId,{left:r.left,top:r.top,zone:el.dataset.zone||''});
  });
  return map;
}
function animateCardMoves(before){
  if(!before || !before.size)return;
  requestAnimationFrame(()=>{
    document.querySelectorAll('.card[data-card-id]').forEach(el=>{
      const old=before.get(el.dataset.cardId);
      if(!old)return;
      const r=el.getBoundingClientRect();
      const dx=old.left-r.left, dy=old.top-r.top;
      if(Math.abs(dx)<2 && Math.abs(dy)<2)return;

      // Use a FLIP animation for cards that remain in the Procession.
      // This makes surviving cards visibly slide into the spaces left by pickups.
      if(old.zone==='procession' && el.dataset.zone==='procession'){
        el.animate(
          [{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],
          {duration:650,easing:'cubic-bezier(.22,.8,.24,1)',fill:'none'}
        );
        return;
      }

      // Preserve the existing smooth movement for cards traveling between areas.
      el.style.transition='none';
      el.style.transform=`translate(${dx}px,${dy}px)`;
      el.style.zIndex='1200';
      requestAnimationFrame(()=>{
        el.style.transition='transform 650ms cubic-bezier(.22,.8,.24,1), box-shadow 650ms ease';
        el.style.transform='';
        setTimeout(()=>{el.style.zIndex='';el.style.transition='';},680);
      });
    });
  });
}

const $=id=>document.getElementById(id);
function connect(){ manualHome=false; ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.type==="error"){ $("lobbyError").textContent=m.message; return;} if(m.type==="joined"){me=m.playerId; $("lobbyError").textContent=""; show("room"); $("roomCodeTitle").textContent=m.code; $("roomBadge").textContent=m.code; $("roomBadge").classList.remove("hidden");} if(m.type==="state"){const previousStatus=state?.status; const before=captureCardPositions(); state=m.state; if(state.status!=="selection"){selected.clear(); submittedSelection=false;} render(); animateCardMoves(before); if(state.status==="final" && previousStatus!=="final") showEndgameAnnouncement();}};
  ws.onclose=()=>{if(!manualHome && state) setTimeout(connect,1200)};
}
function send(x){if(ws?.readyState===1)ws.send(JSON.stringify(x))}
function show(id){["lobby","room","game"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
$("createBtn").onclick=()=>{const n=$("name").value.trim()||"Player";send({type:"create",name:n})};
$("joinBtn").onclick=()=>{const n=$("name").value.trim()||"Player",c=$("code").value.trim().toUpperCase();send({type:"join",name:n,code:c})};
$("startBtn").onclick=()=>send({type:"start"});
$("addBotBtn").onclick=()=>send({type:"addBot",difficulty:$("botDifficulty").value});
$("homeBtn").onclick=()=>{
  manualHome=true;
  state=null; me=null; selected.clear(); submittedSelection=false; lastEndKey=null;
  if(ws){try{ws.close();}catch(e){} ws=null;}
  $("roomBadge").classList.add("hidden");
  $("code").value="";
  show("lobby");
};
$("howtoBtn").onclick=()=>$("howtoModal").classList.remove("hidden");
$("closeHowto").onclick=()=>$("howtoModal").classList.add("hidden");
$("closeHowto2").onclick=()=>$("howtoModal").classList.add("hidden");
$("howtoModal").addEventListener("click",e=>{if(e.target.id==="howtoModal")$("howtoModal").classList.add("hidden")});
async function copyInvite(){
  if(!state?.code)return;
  const url=new URL(location.href);
  url.searchParams.set("room",state.code);
  url.hash="";
  try{
    await navigator.clipboard.writeText(url.toString());
    const b=$("inviteBtn");
    if(b){const old=b.textContent;b.textContent="Invite link copied!";setTimeout(()=>b.textContent=old,1600);}
  }catch(e){
    const fallback=prompt("Copy this invite link:",url.toString());
    if(fallback!==null){} 
  }
}
$("inviteBtn").onclick=copyInvite;
const roomFromUrl=new URLSearchParams(location.search).get("room");
if(roomFromUrl){$("code").value=roomFromUrl.toUpperCase().slice(0,4);}
$("code").oninput=e=>e.target.value=e.target.value.replace(/[^a-z0-9]/gi,"").toUpperCase();

function suit(id){return state.suits.find(s=>s.id===id)}
function suitArt(suitId){
  const common='viewBox="0 0 120 92" aria-hidden="true" focusable="false"';
  const arts={
    red:`<svg ${common}><g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="39" cy="20" r="7" fill="currentColor" stroke="none"/><path d="M39 28l-4 19 13 8 8-13 10 9 14-4"/><path d="M40 46l-10 25M49 54l11 18"/><path d="M51 31c9-8 17-9 25-5"/><path d="M72 27c-5-10 1-17 9-14M77 29c7-9 15-6 17 2M68 25c-2-9-9-11-13-5"/></g><circle cx="43" cy="18" r="1.5" fill="#fff"/></svg>`,
    blue:`<svg ${common}><g fill="currentColor"><ellipse cx="52" cy="48" rx="27" ry="24"/><circle cx="28" cy="27" r="14"/><ellipse cx="17" cy="31" rx="9" ry="13"/><path d="M72 43c15-8 25-1 27 8-6 5-15 5-23 1z"/><rect x="43" y="45" width="22" height="15" rx="3" fill="#fff"/><text x="54" y="57" text-anchor="middle" font-size="12" font-weight="900" fill="currentColor">3</text><path d="M36 67l-5 12M58 68l5 11" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></g><circle cx="25" cy="25" r="2.5" fill="#fff"/></svg>`,
    green:`<svg ${common}><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M28 77c7-13 9-27 9-43 0-17 8-25 19-25 9 0 14 7 14 16 0 7-4 11-10 14l10 6c8 5 15 9 22 10"/><path d="M57 18c-3-9 1-15 8-18 5 5 4 11-2 16M49 15c-5-7-2-14 4-17 4 5 3 11-1 15"/><circle cx="57" cy="20" r="2" fill="currentColor" stroke="none"/><path d="M35 59l-7 18M55 61l8 17"/></g></svg>`,
    yellow:`<svg ${common}><g fill="currentColor"><circle cx="34" cy="22" r="9"/><path d="M21 35c4-8 10-10 17-10 9 0 14 6 15 14l7 7-10 6-7-7-4 14H19l5-15z"/><path d="M57 42l12 5 9-5 9 5-9 7 7 8-11 2-6-8-8 8-10-3 7-9-10-5z"/><path d="M25 58l-7 17M45 58l5 18" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M27 12c-7-5-7-11-1-15 5 3 7 8 4 13M41 13c2-7 8-9 13-5-1 7-6 10-11 8"/></g><circle cx="37" cy="20" r="2" fill="#fff"/></svg>`,
    purple:`<svg ${common}><g fill="currentColor"><circle cx="35" cy="22" r="10"/><path d="M20 37c6-8 15-11 28-9 11 2 19 9 24 19l18 5-4 11-20-4-7 12H24l5-15-14-5z"/><path d="M71 41c11-7 20-4 26 3-5 6-13 8-22 4z"/><path d="M31 60l-6 17M54 61l7 16" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g><circle cx="38" cy="20" r="2" fill="#fff"/></svg>`,
    orange:`<svg ${common}><g fill="currentColor"><path d="M16 53h67l12 8H9z"/><path d="M27 53V35h12v18M53 53V29h14v24"/><circle cx="25" cy="64" r="10"/><circle cx="75" cy="64" r="10"/><rect x="42" y="35" width="21" height="14" rx="3" fill="#fff"/><text x="52.5" y="46" text-anchor="middle" font-size="12" font-weight="900" fill="currentColor">7</text><path d="M69 29l10-6 9 7-10 7z"/></g></svg>`
  };
  return arts[suitId]||'';
}
function cardEl(c,opts={}){
  const s=suit(c.suitId), d=document.createElement("div"); d.className="card "+(opts.selectable?"selectable ":"")+(opts.selected?"selected ":"")+(opts.extraClass||"");
  d.dataset.cardId=c.id; d.dataset.suit=c.suitId; d.dataset.symbol=s.symbol;
  if(opts.zone)d.dataset.zone=opts.zone;
  d.style.setProperty('--suit-color',s.color); d.title=`${s.name} ${c.number}`;
  d.innerHTML=`<span class="corner tl" style="color:${s.color}">${c.number}</span><span class="number">${c.number}</span><span class="figure" style="color:${s.color}">${suitArt(c.suitId)}</span><span class="corner br" style="color:${s.color}">${c.number}</span>`;
  if(opts.onclick)d.onclick=opts.onclick; return d;
}
function render(){
  if(!state)return;
  if(state.status==="lobby"){show("room"); renderRoom(); return}
  show("game"); renderGame();
}
function renderRoom(){
  $("roomCodeTitle").textContent=state.code; $("roomBadge").textContent=state.code;
  const host=state.players[0]?.id===me;
  $("startBtn").disabled=state.players.length<2;
  $("addBotBtn").disabled=!host || state.players.length>=6;
  $("botControls").classList.toggle("hidden",!host);
  $("playersList").innerHTML=state.players.map((p,i)=>{
    const bot=p.isBot;
    const label=bot?`BOT · ${(p.botDifficulty||"normal").toUpperCase()}`:(i===0?"HOST":"PLAYER");
    return `<div class="player-tile ${i===0?"host":""} ${bot?"bot-tile":""}"><span class="player-dot ${bot?"bot-dot":""}"></span><b>${esc(p.name)}</b><div class="muted player-role">${label}${!p.connected&&!bot?" · DISCONNECTED":""}</div></div>`;
  }).join("");
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

  $("hand").innerHTML=""; const canPlay=(state.status==="playing"||state.status==="final")&&state.currentPlayer===me;
  mep.hand.forEach(c=>{const node=cardEl(c,{zone:"hand",selectable:canPlay,onclick:()=>canPlay&&send({type:"play",cardId:c.id})}); if(canPlay)attachHandHover(c,node); $("hand").appendChild(node);});
  $("handHint").textContent=canPlay?"HOVER TO PREVIEW · CLICK TO PLAY":state.status==="selection"?"SELECT 2 CARDS":"";

  if(state.status==="final"){
    const final=state.currentPlayer===me;
    if(final){
      $("hand").innerHTML="";
      mep.hand.forEach(c=>{const node=cardEl(c,{zone:"hand",selectable:true,onclick:()=>send({type:"finalPlay",cardId:c.id})}); attachHandHover(c,node,true); $("hand").appendChild(node);});
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
    const node=cardEl(c,{zone:"procession"}); el.appendChild(node);
  });
  const slot=document.createElement("div");
  slot.className="procession-slot";
  slot.setAttribute("aria-label","Next card enters here");
  slot.innerHTML=`<span>+</span>`;
  el.appendChild(slot);
}
function collectionPreview(played){
  const procession=state.procession;
  const existingCount=procession.length;
  const x=Math.max(Number(played.number)||0,0);
  const protectedCount=Math.min(x,existingCount);
  const protectedStart=Math.max(0,existingCount-protectedCount);
  const pickupIds=new Set();
  procession.forEach((card,index)=>{
    // The protected cards are the LAST X cards that were already in the Procession.
    // Only unprotected cards can ever be picked up.
    if(index < protectedStart && (card.suitId===played.suitId || Number(card.number)<=x)) pickupIds.add(card.id);
  });
  return {protectedCount,pickupIds,protectedStart};
}
function attachHandHover(card,node,allowFinal=false){
  node.addEventListener("mouseenter",()=>{
    if(!state || (state.status!=="playing" && !(allowFinal && state.status==="final")) || state.currentPlayer!==me)return;
    clearPreview();
    const preview=collectionPreview(card);
    const cards=Array.from(document.querySelectorAll("#procession .card"));
    cards.forEach(x=>{
      if(preview.pickupIds.has(x.dataset.cardId)) x.classList.add("preview-pickup");
    });
    if(preview.protectedCount){
      cards.slice(Math.max(0,cards.length-preview.protectedCount)).forEach(x=>x.classList.add("preview-protected"));
    }
    const key=$("previewKey");
    key.textContent=preview.protectedCount
      ? `Gold highlight = ${preview.protectedCount} protected card${preview.protectedCount===1?"":"s"} excluded by the number ${card.number}.`
      : `No cards are protected by ${card.number}; collection can consider the entire Procession.`;
    key.classList.remove("hidden");
    node.classList.add("preview-source");
    drawProtectionBracket(preview.protectedCount, card.number);
  });
  node.addEventListener("mouseleave",clearPreview);
}
function drawProtectionBracket(count, number){
  removeProtectionBracket();
  if(!count)return;
  const container=$("procession");
  const cards=[...container.querySelectorAll(".card")];
  if(!cards.length)return;
  const firstIndex=Math.max(0,cards.length-count);
  const first=cards[firstIndex], last=cards[cards.length-1];
  const cr=container.getBoundingClientRect();
  const fr=first.getBoundingClientRect(), lr=last.getBoundingClientRect();
  const bracket=document.createElement("div");
  bracket.className="protection-bracket";
  bracket.style.left=`${fr.left-cr.left-3}px`;
  bracket.style.width=`${lr.right-fr.left+6}px`;
  bracket.style.top=`${Math.max(1,fr.top-cr.top-10)}px`;
  bracket.innerHTML=`<span>${number}</span>`;
  container.appendChild(bracket);
}
function removeProtectionBracket(){
  $("procession")?.querySelector(".protection-bracket")?.remove();
}
function clearPreview(){
  document.querySelectorAll("#procession .card").forEach(x=>x.classList.remove("preview-safe","preview-collect","preview-protected","preview-pickup"));
  document.querySelectorAll("#hand .card").forEach(x=>x.classList.remove("preview-source"));
  removeProtectionBracket();
  $("previewKey").classList.add("hidden");
  $("previewKey").textContent="";
}
function renderAllTableaus(){
  const wrap=$("tableaus"); wrap.innerHTML="";
  const ordered=[...state.players].sort((a,b)=>a.id===me?-1:b.id===me?1:0);
  ordered.forEach(p=>{
    const player=document.createElement("div"); player.className=`tableau-player ${p.id===me?"my-tableau":""}`;
    player.innerHTML=`<div class="tableau-player-head"><b>${esc(p.name)}${p.id===me?" · YOU":""}</b><span>${p.tableau.length} cards · ${p.score} points</span></div>`;
    const groups=Object.fromEntries(state.suits.map(s=>[s.id,[]]));
    p.tableau.forEach(c=>groups[c.suitId].push(c));
    const grid=document.createElement("div"); grid.className="tableau-stacks";
    const controlled=new Set(Object.entries(state.controllers||{}).filter(([,ids])=>ids.includes(p.id)).map(([id])=>id));
    state.suits.forEach(s=>{
      const cards=groups[s.id], stack=document.createElement("div"); stack.className="suit-stack";
      stack.style.setProperty("--stack-count",Math.max(cards.length,1));
      const onePoint=controlled.has(s.id);
      stack.innerHTML=`<div class="stack-label" style="color:${s.color}">${s.name}<small>${cards.length}</small>${onePoint?'<em class="one-point-badge">1 PT</em>':''}</div>`;
      const pile=document.createElement("div"); pile.className="stack-cards";
      cards.forEach((c,i)=>{const n=cardEl(c,{zone:"tableau",extraClass:"stacked-card"}); n.style.setProperty("--stack-i",i); pile.appendChild(n)});
      stack.appendChild(pile); grid.appendChild(stack);
    });
    player.appendChild(grid); wrap.appendChild(player);
  });
}
function suitPointsForPlayer(p){
  const controlled=new Set(Object.entries(state.controllers||{}).filter(([,ids])=>ids.includes(p.id)).map(([id])=>id));
  return Object.fromEntries(state.suits.map(s=>{
    const cards=p.tableau.filter(c=>c.suitId===s.id);
    const points=controlled.has(s.id)?cards.length:cards.reduce((sum,c)=>sum+Number(c.number),0);
    return [s.id,{count:cards.length,points,controlled:controlled.has(s.id)}];
  }));
}
function renderSelection(mep){
  $("hand").innerHTML="";
  mep.hand.forEach(c=>{
    const sel=selected.has(c.id);
    $("hand").appendChild(cardEl(c,{zone:"hand",selectable:true,selected:sel,onclick:()=>{
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
  const minScore=Math.min(...state.players.map(p=>p.score));
  const ordered=[...state.players].sort((a,b)=>a.score-b.score || (a.id===me?-1:b.id===me?1:0));
  const rows=ordered.map((p,index)=>{
    const winner=p.score===minScore;
    const isMe=p.id===me;
    const points=suitPointsForPlayer(p);
    const n=index+1;
    const placement=n===1?"1st":n===2?"2nd":n===3?"3rd":`${n}th`;
    const result=isMe
      ? `<div class="result-banner ${winner?"winner-banner":"rough-banner"}">${winner?"WINNER!":"THAT'S ROUGH, BUDDY"}</div>`
      : `<div class="placement-label">${placement}</div>`;
    const suitRows=state.suits.map(s=>{
      const d=points[s.id];
      return `<div class="final-suit-row ${d.controlled?"controlled":""}"><span class="final-suit-name" style="color:${s.color}">${s.symbol} ${s.name}</span><span>${d.controlled?"WON · ":""}${d.points} pts</span></div>`;
    }).join("");
    return `<div class="gameover-player ${winner?"is-winner":""} ${isMe?"my-result":""}">${result}<div class="final-player-head"><b>${esc(p.name)}${isMe?" · YOU":""}</b><strong>${p.score} TOTAL</strong></div><div class="final-suits"><div class="final-suits-title">SUIT POINTS</div>${suitRows}</div></div>`;
  }).join("");
  const panel=$("gameOverPanel");
  panel.innerHTML=`<h3>Final Score</h3><p>Winning a suit makes every card of that suit worth 1 point.</p><div class="gameover-scores">${rows}</div><div class="modal-actions"><button onclick="location.reload()">New game</button></div>`;
  panel.classList.remove("hidden");
}

function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderSuits(){ $("suits").innerHTML=[["red","Red","◆"],["blue","Blue","●"],["green","Green","▲"],["yellow","Yellow","★"],["purple","Purple","⬟"],["orange","Orange","✚"]].map(x=>`<div class="suit-chip"><span class="sym">${x[2]}</span><span>${x[1]}</span></div>`).join("")}
connect();
