
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "..", "public");

const SUITS = [
  { id:"red", name:"Red", color:"#ef4444", symbol:"◆" },
  { id:"blue", name:"Blue", color:"#3b82f6", symbol:"●" },
  { id:"green", name:"Green", color:"#22c55e", symbol:"▲" },
  { id:"yellow", name:"Yellow", color:"#eab308", symbol:"★" },
  { id:"purple", name:"Purple", color:"#a855f7", symbol:"⬟" },
  { id:"orange", name:"Orange", color:"#f97316", symbol:"✚" }
];

const rooms = new Map();

function card(id, suitId, number) { return { id, suitId, number }; }

function newDeck() {
  const d = [];
  for (const s of SUITS) for (let n=0; n<=10; n++) d.push(card(`${s.id}-${n}`, s.id, n));
  for (let i=d.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]];
  }
  return d;
}

function makeCode() {
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;
  do { c=""; for(let i=0;i<4;i++) c+=chars[Math.floor(Math.random()*chars.length)]; } while(rooms.has(c));
  return c;
}

function freshRoom() {
  return { code: makeCode(), status:"lobby", players:[], procession:[], deck:[], currentPlayer:null,
    turnNumber:0, endGame:null, winner:null, message:"Waiting for players.", botTimers:new Map() };
}

function publicCard(c) { return c ? {id:c.id,suitId:c.suitId,number:c.number} : null; }

function suitCounts(p) {
  const m=Object.fromEntries(SUITS.map(s=>[s.id,0]));
  for(const c of p.tableau) m[c.suitId]++;
  return m;
}

function controllers(room) {
  const counts=room.players.map(p=>suitCounts(p));
  const out={};
  for(const s of SUITS) {
    const max=Math.max(...counts.map(x=>x[s.id]));
    out[s.id]=room.players.filter((p,i)=>counts[i][s.id]===max && max>0).map(p=>p.id);
  }
  return out;
}

function scores(room) {
  const ctrl=controllers(room);
  return Object.fromEntries(room.players.map(p=>{
    let total=0;
    for(const c of p.tableau) total += ctrl[c.suitId].includes(p.id) ? 1 : c.number;
    return [p.id,total];
  }));
}

function allSix(p) {
  const have=new Set(p.tableau.map(c=>c.suitId));
  return SUITS.every(s=>have.has(s.id));
}

function send(ws, payload) {
  if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function snapshot(room, meId) {
  return {
    code:room.code, status:room.status, turnNumber:room.turnNumber,
    currentPlayer:room.currentPlayer, procession:room.procession.map(publicCard),
    deckCount:room.deck.length, endGame:room.endGame, winner:room.winner,
    message:room.message,
    suits:SUITS,
    selectionCount:room.players.filter(p=>p.selected?.length===2).length,
    players:room.players.map(p=>({
      id:p.id,name:p.name,connected:p.connected,isBot:!!p.isBot,botDifficulty:p.botDifficulty||null,handCount:p.hand.length,
      hand:p.id===meId?p.hand.map(publicCard):undefined,
      tableau:p.tableau.map(publicCard),
      cardsCollected:p.tableau.length,
      score:scores(room)[p.id],
      selectionSubmitted:p.selected?.length===2
    })),
    controllers:controllers(room)
  };
}

function broadcast(room) {
  for(const p of room.players) send(p.ws,{type:"state",state:snapshot(room,p.id)});
}

function activePlayers(room) { return room.players.filter(p=>p.connected); }

function scheduleBot(room, playerId, delay=850) {
  const old=room.botTimers.get(playerId);
  if(old) clearTimeout(old);
  const timer=setTimeout(()=>{
    room.botTimers.delete(playerId);
    const p=room.players.find(x=>x.id===playerId);
    if(!p || !p.isBot) return;
    if(room.status==="playing" && room.currentPlayer===p.id) {
      const cardId=chooseBotCard(room,p);
      if(cardId) { resolvePlay(room,p,cardId); broadcast(room); }
    } else if(room.status==="final" && room.currentPlayer===p.id) {
      const cardId=chooseBotCard(room,p);
      if(cardId) { finalPlay(room,p,cardId); broadcast(room); }
    } else if(room.status==="selection" && !p.selected?.length) {
      chooseBotSelection(room,p); broadcast(room);
    }
  }, delay);
  room.botTimers.set(playerId,timer);
}

function simulatePickup(room, played) {
  const existing=room.procession.length;
  const x=played.number;
  const protectedCount=Math.min(x,existing);
  const protectedStart=Math.max(0,existing-protectedCount);
  const collected=room.procession.slice(0,protectedStart).filter(c=>c.suitId===played.suitId || c.number<=x);
  return {collected, protectedCount};
}

function projectedBotScore(room, p, collected) {
  const tableaux = new Map(room.players.map(x => [x.id, x.tableau.slice()]));
  tableaux.set(p.id, [...p.tableau, ...collected]);
  const counts = new Map();
  for (const x of room.players) {
    const m = Object.fromEntries(SUITS.map(s => [s.id, 0]));
    for (const c of tableaux.get(x.id)) m[c.suitId]++;
    counts.set(x.id, m);
  }
  const ctrl = Object.fromEntries(SUITS.map(s => [s.id, []]));
  for (const s of SUITS) {
    const max = Math.max(...room.players.map(x => counts.get(x.id)[s.id]));
    if (max > 0) ctrl[s.id] = room.players.filter(x => counts.get(x.id)[s.id] === max).map(x => x.id);
  }
  let total = 0;
  for (const c of tableaux.get(p.id)) total += ctrl[c.suitId].includes(p.id) ? 1 : c.number;
  return total;
}

function suitControlSavings(room, p, collected) {
  if (!collected.length) return 0;
  const before = projectedBotScore(room, p, []);
  const after = projectedBotScore(room, p, collected);
  const printed = collected.reduce((sum, c) => sum + c.number, 0);
  return printed - (after - before);
}

function opponentPickupRisk(room, played) {
  const sim = simulatePickup(room, played);
  const protectedStart = Math.max(0, room.procession.length - sim.protectedCount);
  const exposed = room.procession.slice(0, protectedStart)
    .filter(c => !sim.collected.some(x => x.id === c.id));
  return exposed.reduce((sum, c) => sum + c.number, 0);
}

function botMoveValue(room, p, card, difficulty) {
  const sim = simulatePickup(room, card);
  const collected = sim.collected;
  const count = collected.length;
  const printed = collected.reduce((sum, c) => sum + c.number, 0);
  const savings = suitControlSavings(room, p, collected);

  if (difficulty === "easy") {
    return count === 0
      ? 100000 + Math.random() * 500
      : -count * 1000 - printed * 20 + savings * 3 + Math.random() * 5;
  }

  if (count === 0) {
    let value = 1000000;
    // Among safe plays, favor stronger protection and avoid leaving valuable
    // exposed cards for the next player when possible.
    value += Math.min(card.number, room.procession.length) * 120;
    value += opponentPickupRisk(room, card) * 2;
    value += (10 - card.number) * 0.5;
    return value;
  }

  let value = -count * 100000;
  value -= printed * 1000;
  value += savings * (difficulty === "hard" ? 220 : 90);

  const suitCountsPicked = Object.fromEntries(SUITS.map(s => [s.id, 0]));
  for (const c of collected) suitCountsPicked[c.suitId]++;
  const concentration = Math.max(...Object.values(suitCountsPicked));
  value += concentration * (difficulty === "hard" ? 70 : 25);
  value -= card.number * (difficulty === "hard" ? 2 : 0.8);
  return value;
}
function chooseBotCard(room,p) {
  if(!p.hand.length) return null;
  const difficulty=p.botDifficulty||"normal";
  if(difficulty==="easy" && Math.random()<0.2) return p.hand[Math.floor(Math.random()*p.hand.length)].id;
  let best=p.hand[0], bestValue=-Infinity;
  for(const card of p.hand) {
    const v=botMoveValue(room,p,card,difficulty);
    if(v>bestValue){bestValue=v;best=card;}
  }
  return best.id;
}

function chooseBotSelection(room,p) {
  if(p.selected?.length===2) return;
  const difficulty=p.botDifficulty||"normal";
  const ranked=[...p.hand].sort((a,b)=>{
    const va=botMoveValue(room,p,a,difficulty), vb=botMoveValue(room,p,b,difficulty);
    return vb-va;
  });
  p.selected=ranked.slice(0,2).map(c=>c.id);
  if(room.players.every(x=>x.selected?.length===2)) {
    for(const x of room.players) for(const id of x.selected) {
      const i=x.hand.findIndex(c=>c.id===id); if(i>=0) x.tableau.push(x.hand.splice(i,1)[0]);
    }
    const sc=scores(room), min=Math.min(...Object.values(sc));
    const minCards=Math.min(...room.players.filter(x=>sc[x.id]===min).map(x=>x.tableau.length));
    room.winner=room.players.filter(x=>sc[x.id]===min && x.tableau.length===minCards).map(x=>x.name);
    room.status="gameover"; room.message=`Game over. Lowest score: ${min}.`;
  }
}

function beginGame(room) {
  if(room.players.length<2 || room.players.length>6) return;
  const deck=newDeck();
  room.deck=deck;
  room.procession=deck.splice(0,6);
  for(const p of room.players) { p.hand=deck.splice(0,5); p.tableau=[]; }
  room.status="playing";
  const firstIndex=Math.floor(Math.random()*room.players.length);
  const firstPlayer=room.players[firstIndex];
  room.currentPlayer=firstPlayer.id; room.turnNumber=1;
  room.message=`${firstPlayer.name}'s turn.`;
  broadcast(room);
  if(firstPlayer.isBot) scheduleBot(room,firstPlayer.id);
}

function restartGame(room, p) {
  if(p.id!==room.players[0].id) return "Only the host can start a new game.";
  for(const timer of room.botTimers.values()) clearTimeout(timer);
  room.botTimers.clear();
  room.players.forEach(x=>{ x.hand=[]; x.tableau=[]; x.selected=[]; });
  room.endGame=null;
  room.winner=null;
  room.message="Starting a new game...";
  beginGame(room);
  return null;
}

function nextNormalPlayer(room, afterId) {
  const idx=room.players.findIndex(p=>p.id===afterId);
  for(let k=1;k<=room.players.length;k++){
    const p=room.players[(idx+k)%room.players.length];
    if(p.connected) return p.id;
  }
  return null;
}

function triggerEnd(room, reason, triggerId) {
  room.status="final";
  room.endGame={reason,triggerId, finalTurnPlayers:room.players.filter(p=>p.id!==triggerId).map(p=>p.id), done:[]};
  room.currentPlayer=room.endGame.finalTurnPlayers[0] || null;
  room.message=`End game: ${reason==="SIX_SUITS"?"six suits collected":"draw pile exhausted"}.`;
  if(room.currentPlayer) { const first=room.players.find(x=>x.id===room.currentPlayer); if(first?.isBot) scheduleBot(room,first.id,1000); }
  else finishFinalTurns(room);
}

function finishFinalTurns(room) {
  room.status="selection";
  room.currentPlayer=null;
  room.players.forEach(p=>p.selected=[]);
  room.message="Choose 2 cards. Selections are revealed simultaneously.";
  room.players.filter(p=>p.isBot).forEach(p=>scheduleBot(room,p.id,700));
}

function resolvePlay(room, p, cardId) {
  const idx=p.hand.findIndex(c=>c.id===cardId);
  if(idx<0) return "That card is not in your hand.";
  const played=p.hand.splice(idx,1)[0];
  const existingCount=room.procession.length;
  room.procession.push(played);

  let collected=[];
  if(played.number < existingCount) {
    const protectedStart=Math.max(0, existingCount-played.number);
    const unprotected=room.procession.slice(0, protectedStart);
    const protectedCards=room.procession.slice(protectedStart, existingCount);
    const keep=[];
    for(const c of unprotected) {
      if(c.suitId===played.suitId || c.number<=played.number) collected.push(c);
      else keep.push(c);
    }
    room.procession=[...keep,...protectedCards,played];
  }
  p.tableau.push(...collected);

  if(allSix(p)) {
    triggerEnd(room,"SIX_SUITS",p.id);
    return null;
  }

  const need=5-p.hand.length;
  if(need>0) {
    if(room.deck.length===0) {
      triggerEnd(room,"DECK_EXHAUSTED",p.id);
      return null;
    }
    const take=Math.min(need,room.deck.length);
    p.hand.push(...room.deck.splice(0,take));
    if(p.hand.length<5) {
      // The player who could not fully refill is the trigger and does not get a final turn.
      triggerEnd(room,"DECK_EXHAUSTED",p.id);
      return null;
    }
  }

  room.currentPlayer=nextNormalPlayer(room,p.id);
  room.turnNumber++;
  room.message=`${room.players.find(x=>x.id===room.currentPlayer).name}'s turn.`;
  const next=room.players.find(x=>x.id===room.currentPlayer);
  if(next?.isBot) scheduleBot(room,next.id);
  return null;
}

function finalPlay(room,p,cardId) {
  const idx=p.hand.findIndex(c=>c.id===cardId);
  if(idx<0) return "That card is not in your hand.";
  const played=p.hand.splice(idx,1)[0];
  const existingCount=room.procession.length;
  room.procession.push(played);

  if(played.number < existingCount) {
    const protectedStart=Math.max(0, existingCount-played.number);
    const unprotected=room.procession.slice(0,protectedStart);
    const protectedCards=room.procession.slice(protectedStart,existingCount);
    const keep=[];
    const collected=[];
    for(const c of unprotected) {
      if(c.suitId===played.suitId || c.number<=played.number) collected.push(c);
      else keep.push(c);
    }
    p.tableau.push(...collected);
    room.procession=[...keep,...protectedCards,played];
  }
  room.endGame.done.push(p.id);
  const remaining=room.endGame.finalTurnPlayers.filter(id=>!room.endGame.done.includes(id));
  if(remaining.length) {
    room.currentPlayer=remaining[0];
    room.message=`Final turn: ${room.players.find(x=>x.id===room.currentPlayer).name}.`;
    const next=room.players.find(x=>x.id===room.currentPlayer);
    if(next?.isBot) scheduleBot(room,next.id);
  } else finishFinalTurns(room);
}

function addBot(room, p, difficulty) {
  if(p.id!==room.players[0].id) return "Only the host can add bots.";
  if(room.status!=="lobby") return "Bots can only be added before the game starts.";
  if(room.players.length>=6) return "Room is full.";
  const level=["easy","normal","hard"].includes(difficulty)?difficulty:"normal";
  let n=1; while(room.players.some(x=>x.name===`Bot ${n}`)) n++;
  room.players.push({id:crypto.randomUUID(),name:`Bot ${n}`,ws:null,hand:[],tableau:[],connected:true,selected:[],isBot:true,botDifficulty:level});
  room.message=`Bot ${n} added.`;
  return null;
}

function handle(room, p, msg) {
  if(msg.type==="addBot") return addBot(room,p,msg.difficulty);
  if(msg.type==="start") {
    if(p.id!==room.players[0].id) return "Only the host can start.";
    if(room.players.length<2) return "Need at least 2 players.";
    beginGame(room); return null;
  }
  if(msg.type==="restart") {
    if(room.players.length<2) return "Need at least 2 players.";
    return restartGame(room,p);
  }
  if(msg.type==="play") {
    if(room.status!=="playing" || room.currentPlayer!==p.id) return "It is not your turn.";
    return resolvePlay(room,p,msg.cardId);
  }
  if(msg.type==="finalPlay") {
    if(room.status!=="final" || room.currentPlayer!==p.id) return "It is not your final turn.";
    return finalPlay(room,p,msg.cardId);
  }
  if(msg.type==="select") {
    if(room.status!=="selection") return "Selection phase has not started.";
    if(!Array.isArray(msg.cardIds) || msg.cardIds.length!==2) return "Select exactly 2 cards.";
    const unique=[...new Set(msg.cardIds)];
    if(unique.length!==2 || unique.some(id=>!p.hand.some(c=>c.id===id))) return "Invalid selection.";
    p.selected=unique;
    if(room.players.every(x=>x.selected?.length===2)) {
      for(const x of room.players) {
        for(const id of x.selected) {
          const i=x.hand.findIndex(c=>c.id===id);
          if(i>=0) x.tableau.push(x.hand.splice(i,1)[0]);
        }
      }
      const sc=scores(room);
      const min=Math.min(...Object.values(sc));
      const minCards=Math.min(...room.players.filter(x=>sc[x.id]===min).map(x=>x.tableau.length));
      room.winner=room.players.filter(x=>sc[x.id]===min && x.tableau.length===minCards).map(x=>x.name);
      room.status="gameover"; room.message=`Game over. Lowest score: ${min}.`;
    } else room.message=`${room.players.filter(x=>x.selected?.length===2).length}/${room.players.length} players selected.`;
    return null;
  }
  return "Unknown action.";
}

const server=http.createServer((req,res)=>{
  let url=req.url.split("?")[0];
  if(url==="/") url="/index.html";
  const file=path.normalize(path.join(PUBLIC,url));
  if(!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end("Not found");}
    const ext=path.extname(file);
    const type={".html":"text/html",".css":"text/css",".js":"text/javascript",".svg":"image/svg+xml"}[ext]||"application/octet-stream";
    res.writeHead(200,{"Content-Type":type,"Cache-Control":"no-store"});res.end(data);
  });
});
const wss=new WebSocket.Server({server});

wss.on("connection",(ws)=>{
  let room=null, player=null;
  ws.on("message",(raw)=>{
    let msg; try{msg=JSON.parse(raw)}catch{return send(ws,{type:"error",message:"Invalid message."});}
    if(msg.type==="create") {
      room=freshRoom(); player={id:crypto.randomUUID(),name:String(msg.name||"Player").slice(0,20),ws,hand:[],tableau:[],connected:true,selected:[],isBot:false};
      room.players.push(player); rooms.set(room.code,room); send(ws,{type:"joined",code:room.code,playerId:player.id}); broadcast(room); return;
    }
    if(msg.type==="join") {
      const code=String(msg.code||"").toUpperCase(); const name=String(msg.name||"Player").trim().slice(0,20); room=rooms.get(code);
      if(!room) return send(ws,{type:"error",message:"Room not found."});
      const existing=room.players.find(x=>!x.isBot && x.name.toLowerCase()===name.toLowerCase() && !x.connected);
      if(existing) {
        existing.ws=ws; existing.connected=true; player=existing;
        send(ws,{type:"joined",code:room.code,playerId:player.id,rejoined:true}); broadcast(room);
        if(room.currentPlayer===player.id) setTimeout(()=>{ if(room.currentPlayer===player.id && room.status!=="gameover") broadcast(room); },50);
        return;
      }
      if(room.status!=="lobby") return send(ws,{type:"error",message:"Game already started. Rejoin using the same name."});
      if(room.players.length>=6) return send(ws,{type:"error",message:"Room is full."});
      if(room.players.some(x=>!x.isBot && x.connected && x.name.toLowerCase()===name.toLowerCase())) return send(ws,{type:"error",message:"That name is already in the room."});
      player={id:crypto.randomUUID(),name:name||"Player",ws,hand:[],tableau:[],connected:true,selected:[],isBot:false};
      room.players.push(player); send(ws,{type:"joined",code:room.code,playerId:player.id}); broadcast(room); return;
    }
    if(!room||!player) return send(ws,{type:"error",message:"Join a room first."});
    const err=handle(room,player,msg); if(err) send(ws,{type:"error",message:err});
    broadcast(room);
  });
  ws.on("close",()=>{
    if(player&&room&&!player.isBot){player.connected=false; player.ws=null; broadcast(room);}
  });
});

server.listen(PORT,()=>console.log(`Procession running at http://localhost:${PORT}`));
