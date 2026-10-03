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
  // Re-establish a fresh WebSocket so Create room / Join work immediately after returning home.
  setTimeout(connect, 50);
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
  const common='viewBox="0 0 120 100" aria-hidden="true" focusable="false"';
  const arts={
    red:`<svg ${common}>
      <g stroke="#7f2b28" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="48" cy="23" r="10" fill="#f3b08c"/>
        <path d="M40 22c2-10 16-14 22-5-5-1-9 1-13 5z" fill="#c9433d"/>
        <path d="M43 34l-5 27 12 3 8-22 10 14 9-4-16-24z" fill="#d94b43"/>
        <path d="M49 63l-7 22M59 64l8 21" fill="none" stroke="#4d3b35" stroke-width="5"/>
        <path d="M40 40l-14 13M67 38l12 8" fill="none" stroke="#d94b43" stroke-width="7"/>
        <path d="M25 18c-8-9-18-5-20 3 8-1 13 2 18 8" fill="#ef4444"/>
        <circle cx="11" cy="12" r="6" fill="#ef4444"/><circle cx="20" cy="7" r="5" fill="#f5b52e"/><circle cx="27" cy="13" r="5" fill="#3b82f6"/>
      </g>
    </svg>`,
    yellow:`<svg ${common}>
      <g stroke="#8a5b13" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M58 20c-10-8-22-3-25 8-3 10 3 20 12 23l-2 30h-10v9h20l5-27 9 27h19v-9H74l-6-31c8-2 14-9 14-18 0-9-7-14-15-12l-9 1z" fill="#f0c84b"/>
        <path d="M39 25c7-5 14-4 19 0M43 36c7-4 13-3 19 1M48 48c5-3 11-2 16 2" fill="none" stroke="#9a6816"/>
        <circle cx="70" cy="22" r="2" fill="#111" stroke="none"/>
        <path d="M78 19c8-4 12-1 15 3-5 4-10 4-14 2M57 14c-1-8 4-12 9-12 2 5 0 9-4 13" fill="#f0c84b"/>
      </g>
    </svg>`,
    blue:`<svg ${common}>
      <g stroke="#164a83" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M39 20c-9 0-17 8-17 19v30c0 13 9 20 23 20h18c9 0 17-6 17-16V43c0-11-8-18-18-18H57c-4-4-10-5-18-5z" fill="#4c93df"/>
        <path d="M27 46c-13-7-24-1-24 10 0 9 9 14 19 10l10-5-5-9-10 5c-3 1-6 0-6-2 0-3 4-4 8-1z" fill="#4c93df"/>
        <path d="M73 39c12-3 19 3 19 11 0 8-6 13-14 13h-9v-8h8c3 0 5-2 5-5 0-3-3-5-6-4z" fill="#4c93df"/>
        <circle cx="43" cy="30" r="3" fill="#fff" stroke="none"/><circle cx="44" cy="30" r="1.2" fill="#164a83" stroke="none"/>
        <path d="M48 58h22v15H48z" fill="#ef4444"/><text x="59" y="69" text-anchor="middle" font-size="11" font-weight="900" fill="#fff" stroke="none">3</text>
      </g>
    </svg>`,
    green:`<svg ${common}>
      <g stroke="#236b2a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 68c9-7 13-17 13-30 0-12 9-20 23-20 18 0 31 10 31 24 0 10-7 18-18 22l12 18H59l-9-13-8 13H22z" fill="#54a94d"/>
        <path d="M24 45c-9-8-20-5-22 3 5 1 10 4 15 10l14-1-2-10z" fill="#54a94d"/>
        <circle cx="69" cy="30" r="3" fill="#fff" stroke="none"/><circle cx="70" cy="30" r="1.2" fill="#236b2a" stroke="none"/>
        <path d="M61 18c8-6 17-3 20 3-6 2-12 1-17-1z" fill="#2f7d34"/>
        <path d="M51 72h24" fill="none" stroke="#2b5c2b" stroke-width="5"/>
      </g>
    </svg>`,
    purple:`<svg ${common}>
      <g stroke="#5a3979" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="48" cy="22" r="10" fill="#f0bd92"/>
        <path d="M37 21c2-11 17-14 24-4-7-2-14 0-19 5z" fill="#7f55a8"/>
        <path d="M40 35l-8 46h39l-10-46z" fill="#8e5bb4"/>
        <path d="M38 39c9 7 19 7 30 0" fill="none" stroke="#d7c0e8" stroke-width="6"/>
        <path d="M31 48l-14 16M63 47l16 15" fill="none" stroke="#8e5bb4" stroke-width="7"/>
        <path d="M39 9l9-7 9 7-9 7z" fill="#f0c84b"/>
        <circle cx="52" cy="22" r="2" fill="#111" stroke="none"/>
      </g>
    </svg>`,
    orange:`<svg ${common}>
      <g stroke="#123b42" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 62h78l-7-17H43L31 34H17z" fill="#0f6670"/>
        <path d="M34 45l11-16h27l13 16z" fill="#0f6670"/>
        <circle cx="35" cy="64" r="10" fill="#e8e3d7"/><circle cx="35" cy="64" r="5" fill="#27474d"/>
        <circle cx="83" cy="64" r="10" fill="#e8e3d7"/><circle cx="83" cy="64" r="5" fill="#27474d"/>
        <path d="M53 35c-8-6-15-2-17 5 6 1 11 4 15 8h15V38z" fill="#d07a2f"/>
        <circle cx="44" cy="35" r="2" fill="#111" stroke="none"/>
        <path d="M60 32h13v10H60z" fill="#f4eee3"/><text x="66.5" y="40" text-anchor="middle" font-size="9" font-weight="900" fill="#0f6670" stroke="none">1</text>
        <path d="M18 61h-8" fill="none" stroke="#f97316" stroke-width="4"/>
      </g>
    </svg>`
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
  const currentId=state.currentPlayer;
  $("headerPlayers").innerHTML=state.players.map(p=>{
    const active=p.id===currentId;
    const mine=p.id===me;
    const bot=p.isBot;
    return `<div class="header-player ${active?"active-turn":""} ${mine?"is-me":""}" title="${active?(mine?"Your turn":"Their turn"):""}">` +
      `<span class="header-player-indicator">${active?"▶":""}</span>` +
      `<span class="header-player-dot ${bot?"bot":""}">${bot?"🤖":"●"}</span>` +
      `<span class="header-player-name">${esc(p.name)}${mine?" · YOU":""}</span>` +
      `<span class="header-player-score">${p.score}</span>` +
      `${active?`<span class="turn-label">${mine?"YOUR TURN":"TURN"}</span>`:""}</div>`;
  }).join("");
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
