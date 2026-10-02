
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
    turnNumber:0, endGame:null, winner:null, message:"Waiting for players." };
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
    players:room.players.map(p=>({
      id:p.id,name:p.name,connected:p.connected,handCount:p.hand.length,
      hand:p.id===meId?p.hand.map(publicCard):undefined,
      tableau:p.tableau.map(publicCard),
      score:scores(room)[p.id]
    })),
    controllers:controllers(room)
  };
}

function broadcast(room) {
  for(const p of room.players) send(p.ws,{type:"state",state:snapshot(room,p.id)});
}

function activePlayers(room) { return room.players.filter(p=>p.connected); }

function beginGame(room) {
  if(room.players.length<2 || room.players.length>6) return;
  const deck=newDeck();
  room.deck=deck;
  room.procession=deck.splice(0,6);
  for(const p of room.players) { p.hand=deck.splice(0,5); p.tableau=[]; }
  room.status="playing"; room.currentPlayer=room.players[0].id; room.turnNumber=1;
  room.message=`${room.players[0].name}'s turn.`;
  broadcast(room);
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
  if(!room.currentPlayer) finishFinalTurns(room);
}

function finishFinalTurns(room) {
  room.status="selection";
  room.currentPlayer=null;
  room.players.forEach(p=>p.selected=[]);
  room.message="Choose 2 cards. Selections are revealed simultaneously.";
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
  } else finishFinalTurns(room);
}

function handle(room, p, msg) {
  if(msg.type==="start") {
    if(p.id!==room.players[0].id) return "Only the host can start.";
    if(room.players.length<2) return "Need at least 2 players.";
    beginGame(room); return null;
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
      room.winner=room.players.filter(x=>sc[x.id]===min).map(x=>x.name);
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
      room=freshRoom(); player={id:crypto.randomUUID(),name:String(msg.name||"Player").slice(0,20),ws,hand:[],tableau:[],connected:true,selected:[]};
      room.players.push(player); rooms.set(room.code,room); send(ws,{type:"joined",code:room.code,playerId:player.id}); broadcast(room); return;
    }
    if(msg.type==="join") {
      const code=String(msg.code||"").toUpperCase(); room=rooms.get(code);
      if(!room) return send(ws,{type:"error",message:"Room not found."});
      if(room.status!=="lobby") return send(ws,{type:"error",message:"Game already started."});
      if(room.players.length>=6) return send(ws,{type:"error",message:"Room is full."});
      player={id:crypto.randomUUID(),name:String(msg.name||"Player").slice(0,20),ws,hand:[],tableau:[],connected:true,selected:[]};
      room.players.push(player); send(ws,{type:"joined",code:room.code,playerId:player.id}); broadcast(room); return;
    }
    if(!room||!player) return send(ws,{type:"error",message:"Join a room first."});
    const err=handle(room,player,msg); if(err) send(ws,{type:"error",message:err});
    broadcast(room);
  });
  ws.on("close",()=>{
    if(player&&room){player.connected=false; player.ws=null; broadcast(room);}
  });
});

server.listen(PORT,()=>console.log(`Procession running at http://localhost:${PORT}`));
