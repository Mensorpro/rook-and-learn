// ===== App =====
const $=s=>document.querySelector(s);
const GL={K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
const OL={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
const VS='︎';
const PV={P:1,N:3,B:3,R:5,Q:9,K:100};
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function pieceSpans(p){return `<span class="fill">${GL[p[1]]}${VS}</span><span class="edge">${OL[p[1]]}${VS}</span>`;}
function glyph(t){return GL[t]+VS;}
const cap=s=>s[0].toUpperCase()+s.slice(1);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---------- profile ----------
const STORE='rook-and-learn.v1';
function freshProfile(){return {onboarded:false,rating:200,start:200,target:1000,placed:null,lessons:{},puzzles:{},items:{},games:[],log:[],coach:true,threats:true,legal:true,names:false};}
let P=freshProfile();
try{const raw=localStorage.getItem(STORE);if(raw)P=Object.assign(freshProfile(),JSON.parse(raw));}catch(e){}
function save(){try{localStorage.setItem(STORE,JSON.stringify(P));}catch(e){}}
function addRating(delta,why){
  const before=P.rating;P.rating=Math.max(100,Math.round(P.rating+delta));
  P.log.unshift({d:Date.now(),why,delta:P.rating-before,r:P.rating});P.log=P.log.slice(0,30);save();updateLevelChips();
}
function elo(my,their,score,k){const exp=1/(1+Math.pow(10,(their-my)/400));return k*(score-exp);}
function updateLevelChips(){const t=`${P.rating}`;document.querySelectorAll('[data-level]').forEach(e=>e.textContent=t);}

// ---------- engine bridge (web worker, falls back to main thread) ----------
let worker=null,wid=0;const pending=new Map();
try{
  const src=document.getElementById('engine-src').textContent+
    '\nself.onmessage=function(e){var d=e.data;var r=d.fn==="scoreMoves"?scoreMoves(d.state,d.depth,d.opts):search(d.state,d.depth,d.opts);self.postMessage({id:d.id,r:r});};';
  worker=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
  worker.onmessage=e=>{const p=pending.get(e.data.id);if(p){pending.delete(e.data.id);p.res(e.data.r);}};
  worker.onerror=()=>{worker=null;for(const[id,p]of pending){pending.delete(id);p.res(runLocal(p.args));}};
}catch(e){worker=null;}
function runLocal(a){return a.fn==='scoreMoves'?scoreMoves(a.state,a.depth,a.opts):search(a.state,a.depth,a.opts);}
function engine(fn,state,depth,opts){
  const args={fn,state,depth,opts:opts||{}};
  return new Promise(res=>{
    if(worker){const id=++wid;pending.set(id,{res,args});worker.postMessage(Object.assign({id},args));}
    else setTimeout(()=>res(runLocal(args)),15);
  });
}

// ---------- board component ----------
const BD={state:null,orient:'w',mover:null,last:null,stars:null,arrows:[],badge:null,selected:null,targets:[],
  onMove:null,onSquare:null,onSelect:null,locked:false,threatsFor:null,hintSq:null,hideNames:false};
let boardEl,drag=null;
function buildBoard(){
  boardEl=$('#board');boardEl.innerHTML='';
  for(let i=0;i<64;i++){const d=document.createElement('div');d.className='sq';d.dataset.i=i;boardEl.appendChild(d);}
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','arrows');svg.setAttribute('viewBox','0 0 800 800');svg.id='arrows';boardEl.appendChild(svg);
  boardEl.addEventListener('pointerdown',onDown);
  boardEl.addEventListener('pointermove',onMoveP);
  boardEl.addEventListener('pointerup',onUp);
  boardEl.addEventListener('pointercancel',()=>{endDrag();renderBoard();});
}
const dsq=i=>BD.orient==='w'?i:63-i;
function renderBoard(){
  const s=BD.state;if(!s)return;
  const chk=inCheck(s)?s.board.indexOf(s.turn+'K'):-1;
  const thr=BD.threatsFor&&P.threats?new Set(threats(s,BD.threatsFor).map(t=>t.sq)):null;
  const tg=new Map(BD.targets.map(m=>[m.to,m]));
  const cells=boardEl.children;
  for(let i=0;i<64;i++){
    const sq=dsq(i),r=sq>>3,f=sq&7,el=cells[i];el.dataset.sq=sq;
    let cls='sq '+(((r+f)&1)?'d':'l');
    if(BD.last&&(BD.last.from===sq||BD.last.to===sq))cls+=' last';
    if(BD.selected===sq)cls+=' sel';
    if(BD.hintSq===sq)cls+=' hintsq';
    if(sq===chk)cls+=' check';
    if(thr&&thr.has(sq))cls+=' threat';
    let h='';
    if((i&7)===0)h+=`<span class="coord rk">${8-r}</span>`;
    if(i>=56)h+=`<span class="coord fl">${FILES[f]}</span>`;
    if(P.names&&!BD.hideNames)h+=`<span class="name">${sqName(sq)}</span>`;
    if(BD.stars&&BD.stars.has(sq))h+=starSVG();
    const p=s.board[sq];
    if(p)h+=`<div class="pc ${p[0]}${drag&&drag.started&&drag.sq===sq?' dragging':''}">${pieceSpans(p)}</div>`;
    if(tg.has(sq)&&P.legal)h+=p?'<span class="ring"></span>':'<span class="dot"></span>';
    if(BD.badge&&BD.badge.sq===sq)h+=`<span class="badge-pin k-${BD.badge.kind}">${KIND[BD.badge.kind].sym}</span>`;
    el.className=cls;el.innerHTML=h;
  }
  drawArrows();
}
function starSVG(){return '<svg class="star" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="#f3c33b" stroke="#a87b12" stroke-width="1.2"/></svg>';}
function center(sq){const d=dsq(sq);return[(d&7)*100+50,(d>>3)*100+50];}
function drawArrows(){
  const svg=$('#arrows');let h='<defs>';
  const cols={green:'rgba(129,182,76,.9)',blue:'rgba(90,160,216,.9)',orange:'rgba(229,135,44,.9)'};
  for(const k in cols)h+=`<marker id="ah-${k}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L10 5L0 10z" fill="${cols[k]}"/></marker>`;
  h+='</defs>';
  for(const a of BD.arrows){const[x1,y1]=center(a.from),[x2,y2]=center(a.to);const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);
    const ex=x2-dx/L*28,ey=y2-dy/L*28;
    h+=`<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke="${cols[a.color||'green']}" stroke-width="20" stroke-linecap="round" marker-end="url(#ah-${a.color||'green'})"/>`;}
  svg.innerHTML=h;
}
function sqFromPoint(x,y){const r=boardEl.getBoundingClientRect();const c=Math.floor((x-r.left)/r.width*8),w=Math.floor((y-r.top)/r.height*8);if(c<0||c>7||w<0||w>7)return null;return dsq(w*8+c);}
function canPick(sq){const s=BD.state,p=s&&s.board[sq];return !BD.locked&&BD.mover&&p&&p[0]===BD.mover&&s.turn===BD.mover;}
function selectSq(sq){BD.selected=sq;BD.targets=legalMoves(BD.state).filter(m=>m.from===sq);if(BD.onSelect)BD.onSelect(BD.state.board[sq],BD.targets.length);renderBoard();}
function clearSel(){BD.selected=null;BD.targets=[];}
function onDown(e){
  const sq=sqFromPoint(e.clientX,e.clientY);if(sq==null)return;
  if(BD.onSquare){BD.onSquare(sq);return;}
  if(BD.locked)return;
  if(BD.selected!=null&&BD.targets.some(m=>m.to===sq)){tryMove(BD.selected,sq);return;}
  if(canPick(sq)){selectSq(sq);drag={sq,x:e.clientX,y:e.clientY,started:false,id:e.pointerId};try{boardEl.setPointerCapture(e.pointerId);}catch(_){}}
  else{clearSel();renderBoard();}
}
function onMoveP(e){
  if(!drag)return;
  if(!drag.started){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;drag.started=true;
    const g=document.createElement('div');g.className='dragghost pc '+BD.state.board[drag.sq][0];g.id='ghost';
    const size=boardEl.getBoundingClientRect().width/8;g.style.width=g.style.height=size+'px';g.style.fontSize=(size*.86)+'px';
    g.innerHTML=pieceSpans(BD.state.board[drag.sq]);document.body.appendChild(g);renderBoard();}
  const g=$('#ghost');if(g){g.style.left=e.clientX+'px';g.style.top=e.clientY+'px';}
}
function endDrag(){const g=$('#ghost');if(g)g.remove();drag=null;}
function onUp(e){
  if(!drag)return;const d=drag;endDrag();
  if(d.started){const to=sqFromPoint(e.clientX,e.clientY);if(to!=null&&to!==d.sq&&BD.targets.some(m=>m.to===to)){tryMove(d.sq,to);return;}}
  renderBoard();
}
function tryMove(from,to){
  const c=BD.targets.filter(m=>m.from===from&&m.to===to);if(!c.length)return;
  if(c.length>1){askPromo(c);return;}
  commit(c[0]);
}
function commit(m){clearSel();BD.hintSq=null;if(BD.onMove)BD.onMove(m);}
function askPromo(cands){
  const col=cands[0].piece[0];
  showOverlay(`<div class="card"><h3>Promote to</h3><div class="promo-pick">${['Q','R','B','N'].map(t=>`<button data-p="${t}" aria-label="${NAMES[t]}"><div class="pc ${col}" style="font-size:44px">${pieceSpans(col+t)}</div></button>`).join('')}</div></div>`);
  $('#overlay').querySelectorAll('button[data-p]').forEach(b=>b.onclick=()=>{hideOverlay();commit(cands.find(m=>m.promo===b.dataset.p));});
}
function showOverlay(html){const o=$('#overlay');o.innerHTML=html;o.hidden=false;}
function hideOverlay(){const o=$('#overlay');o.hidden=true;o.innerHTML='';}
function flashSq(sq,cls){const i=BD.orient==='w'?sq:63-sq;const el=boardEl.children[i];el.classList.remove('right','wrong');void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),650);}
function setEval(whiteCp){
  const bar=$('#evalbar');if(whiteCp==null){return;}
  let pct,lab;
  if(Math.abs(whiteCp)>MATE-1000){pct=whiteCp>0?100:0;lab='M'+Math.ceil((MATE-Math.abs(whiteCp))/2);}
  else{pct=50+50*(2/(1+Math.exp(-whiteCp/350))-1);pct=Math.max(4,Math.min(96,pct));lab=(Math.abs(whiteCp)/100).toFixed(1);}
  bar.querySelector('.w').style.height=pct+'%';
  bar.querySelector('.lab-w').textContent=whiteCp>=0?lab:'';bar.querySelector('.lab-b').textContent=whiteCp<0?lab:'';
}
function resetEval(){setEval(0);}

// ---------- chess knowledge for the coach ----------
function threats(s,color){
  const out=[],o=opp(color),b=s.board;
  for(let sq=0;sq<64;sq++){const p=b[sq];if(!p||p[0]!==color||p[1]==='K')continue;
    const att=attackers(b,sq,o);if(!att.length)continue;const def=attackers(b,sq,color);
    const minAtt=Math.min(...att.map(a=>PV[b[a][1]]));
    if((!def.length&&!(att.length===1&&b[att[0]][1]==='K'&&false))||minAtt<PV[p[1]])out.push({sq,piece:p,by:att,defended:def.length>0});}
  return out;
}
function forkTargets(s,sq){
  const b=s.board,p=b[sq];if(!p)return[];const o=opp(p[0]);
  return attacksFrom(b,sq).filter(t=>b[t]&&b[t][0]===o&&(b[t][1]==='K'||PV[b[t][1]]>PV[p[1]]||!attackers(b,t,o).length));
}
function isBackHome(sq,c,t){const home=c==='w'?{N:[57,62],B:[58,61]}:{N:[1,6],B:[2,5]};return (home[t]||[]).includes(sq);}
const CENTER=new Set([27,28,35,36]);
const NEARCENTER=new Set([18,19,20,21,26,29,34,37,42,43,44,45]);
function pName(p){return NAMES[p[1]];}
function describe(s,m){
  const c=s.turn,ns=makeMove(s,m),t=m.promo||m.piece[1],r=[];
  const chk=inCheck(ns),mate=chk&&!legalMoves(ns).length;
  if(mate)r.push('delivers checkmate');
  if(m.flag==='castleK'||m.flag==='castleQ')r.push('castles, tucking your king away safely and bringing the rook toward the center');
  if(m.promo)r.push(`promotes the pawn to a ${NAMES[m.promo]}`);
  if(m.captured){const free=!attackers(ns.board,m.to,opp(c)).length;r.push(`captures the ${NAMES[m.captured[1]]} on ${sqName(m.to)}${free?' for free':''}`);}
  if(chk&&!mate)r.push('gives check');
  const wasThreat=threats(s,c).some(x=>x.sq===m.from);
  if(wasThreat&&!threats(ns,c).some(x=>x.sq===m.to))r.push(`moves the ${NAMES[t]} out of danger`);
  if(!m.captured&&(t==='N'||t==='B')&&s.full<=14&&isBackHome(m.from,c,t))r.push(`develops the ${NAMES[t]}`);
  if(t==='P'&&CENTER.has(m.to)&&s.full<=12)r.push('grabs space in the center');
  else if(t!=='P'&&t!=='K'&&(CENTER.has(m.to)||NEARCENTER.has(m.to))&&s.full<=16&&!r.some(x=>x.startsWith('develops')))r.push('puts the piece on an active central square');
  const ft=forkTargets(ns,m.to).filter(q=>ns.board[q][1]!=='K'||!mate);
  if(ft.length>=2)r.push(`forks ${ft.map(q=>`the ${pName(ns.board[q])} on ${sqName(q)}`).join(' and ')}`);
  else if(ft.length===1&&ns.board[ft[0]][1]!=='K')r.push(`attacks the ${pName(ns.board[ft[0]])} on ${sqName(ft[0])}`);
  // protects a threatened friend
  const before=threats(s,c).filter(x=>x.sq!==m.from).map(x=>x.sq),after=new Set(threats(ns,c).map(x=>x.sq));
  const saved=before.filter(q=>!after.has(q)&&ns.board[q]);
  if(saved.length&&!r.some(x=>x.includes('out of danger')))r.push(`protects your ${pName(ns.board[saved[0]])} on ${sqName(saved[0])}`);
  return r;
}
function joinR(r){if(!r.length)return'';if(r.length===1)return r[0];return r.slice(0,-1).join(', ')+' and '+r[r.length-1];}
function fmtLine(s,pv,max){
  let st=s,out=[];const n=Math.min(max||6,pv.length);
  for(let i=0;i<n;i++){const m=legalMoves(st).find(x=>sameMove(x,pv[i]));if(!m)break;
    const num=st.turn==='w'?`${st.full}.`:(i===0?`${st.full}...`:'');out.push((num?num+' ':'')+san(st,m));st=makeMove(st,m);}
  return out.join(' ');
}
const KIND={
  best:{t:'Best move',sym:'★'},excellent:{t:'Excellent',sym:'!'},good:{t:'Good move',sym:'✓'},book:{t:'Book move',sym:'≡'},
  inacc:{t:'Inaccuracy',sym:'?!'},mistake:{t:'Mistake',sym:'?'},blunder:{t:'Blunder',sym:'??'},missed:{t:'Missed win',sym:'×'},forced:{t:'Only move',sym:'→'},info:{t:'',sym:'i'}};
const wp=cp=>1/(1+Math.pow(10,-cp/400));
function norm(sc){if(sc>MATE-1000)return 3000+(MATE-sc)*-10+1000;if(sc<-(MATE-1000))return -4000;return Math.max(-2500,Math.min(2500,sc));}
function mateIn(sc){return Math.ceil((MATE-Math.abs(sc))/2);}
function article(w){return /^[aeiou]/i.test(w)?'an':'a';}
// Build the coach's verdict on the user's move
function judge(before,m,best,reply,nLegal){
  const c=before.turn,them=c==='w'?'Black':'White',legal=legalMoves(before);
  const mSan=san(before,m,legal),after=makeMove(before,m);
  const afterMoves=legalMoves(after);
  let userScore;
  if(!afterMoves.length)userScore=inCheck(after)?MATE-1:0;else userScore=-reply.score;
  const bestScore=Math.max(best.score,userScore);
  const isBest=sameMove(m,best.move)||userScore>=best.score;
  const lossWP=Math.max(0,wp(norm(bestScore))-wp(norm(userScore)));
  const lossCp=Math.max(0,norm(bestScore)-norm(userScore));
  let kind;
  if(nLegal===1)kind='forced';
  else if(isBest)kind='best';
  else if(bestScore>MATE-1000&&userScore<MATE-1000)kind=userScore>300?'inacc':'missed';
  else if(lossCp<=12||lossWP<=0.02)kind='excellent';
  else if(lossWP<=0.055)kind='good';
  else if(lossWP<=0.11)kind='inacc';
  else if(lossWP<=0.2)kind='mistake';
  else kind='blunder';
  if((kind==='best'||kind==='excellent'||kind==='good')&&before.full<=4&&lossCp<=35)kind=kind==='best'?'best':'book';
  if(kind==='missed'&&bestScore>MATE-1000&&userScore>MATE-1000)kind='excellent';
  const bSan=best.move?san(before,legal.find(x=>sameMove(x,best.move))||best.move,legal):'';
  const parts=[];
  const does=describe(before,m);
  parts.push(`<p><b class="mv">${esc(mSan)}</b> ${does.length?esc(joinR(does)):`moves your ${NAMES[m.promo||m.piece[1]]} to ${sqName(m.to)}`}.</p>`);
  const reasons=[];
  if(!isBest&&kind!=='forced'&&kind!=='book'){
    // what the move allows
    const rp=reply.pv&&reply.pv[0];
    if(rp&&(kind==='inacc'||kind==='mistake'||kind==='blunder'||kind==='missed')){
      const rm=afterMoves.find(x=>sameMove(x,rp));
      if(rm){const rSan=san(after,rm,afterMoves);const after2=makeMove(after,rm);
        if(reply.score>MATE-1000)reasons.push(`<strong>It allows checkmate.</strong> ${them} mates in ${mateIn(reply.score)}: <b class="mv">${esc(fmtLine(after,reply.pv,6))}</b>.`);
        else if(rm.captured){
          const nm=NAMES[rm.captured[1]],sq=sqName(rm.to);
          const wasThreat=threats(before,c).some(x=>x.sq===rm.to);
          if(rm.to===m.to)reasons.push(`<strong>The ${NAMES[m.promo||m.piece[1]]} you just moved isn't safe on ${sqName(m.to)}.</strong> ${attackers(after.board,m.to,c).length?'It is attacked more times than it is defended, or by a cheaper piece, so':'Nothing protects it, so'} ${them} plays <b class="mv">${esc(rSan)}</b> and wins it.`);
          else if(wasThreat)reasons.push(`<strong>Your ${nm} on ${sq} was already under attack</strong>, and this move did nothing about it. ${them} takes it with <b class="mv">${esc(rSan)}</b>.`);
          else reasons.push(`<strong>It leaves your ${nm} on ${sq} hanging.</strong> ${them} takes it with <b class="mv">${esc(rSan)}</b>.`);
        }else{
          const ft=forkTargets(after2,rm.to);
          if(ft.length>=2)reasons.push(`<strong>It allows a fork.</strong> ${them} plays <b class="mv">${esc(rSan)}</b>, attacking ${ft.map(q=>`your ${pName(after2.board[q])} on ${sqName(q)}`).join(' and ')} at the same time.`);
          else if(inCheck(after2))reasons.push(`${them} has a strong reply with check: <b class="mv">${esc(rSan)}</b>, and gets the upper hand.`);
          else reasons.push(`${them}'s best answer is <b class="mv">${esc(rSan)}</b>, which ${esc(joinR(describe(after,rm))||'improves their position')}.`);
        }
      }
    }
    // what was missed
    const bm=best.move&&legal.find(x=>sameMove(x,best.move));
    if(bm){
      const bns=makeMove(before,bm);
      if(bestScore>MATE-1000)reasons.push(`<strong>You had a forced checkmate</strong>${mateIn(bestScore)>1?` in ${mateIn(bestScore)}`:''}, starting with <b class="mv">${esc(bSan)}</b>.`);
      else if(bm.captured&&(!attackers(bns.board,bm.to,opp(c)).length||PV[bm.captured[1]]>PV[bm.piece[1]])&&lossCp>=80)
        reasons.push(`<strong>You missed a free ${NAMES[bm.captured[1]]}.</strong> <b class="mv">${esc(bSan)}</b> ${!attackers(bns.board,bm.to,opp(c)).length?`wins it because nothing protects it`:`wins it, since it's worth more than your ${NAMES[bm.piece[1]]}`}.`);
      else{const ft=forkTargets(bns,bm.to);
        if(ft.length>=2&&lossCp>=80)reasons.push(`<strong>You missed a fork.</strong> <b class="mv">${esc(bSan)}</b> attacks ${ft.map(q=>`the ${pName(bns.board[q])} on ${sqName(q)}`).join(' and ')} at once.`);
        else{const bd=describe(before,bm);reasons.push(`<b class="mv">${esc(bSan)}</b> was ${kind==='excellent'||kind==='good'||kind==='book'?'slightly more precise':'stronger'}${bd.length?`: it ${esc(joinR(bd))}`:''}.`);}
      }
    }
  }
  let head;
  if(kind==='best')head=nLegal>1?'That\'s the best move here.':'';
  else if(kind==='excellent')head='Excellent. Practically as good as the top choice.';
  else if(kind==='good')head='Not a bad move at all, but there was something a bit better.';
  else if(kind==='book')head='A well-known opening move. Good start.';
  else if(kind==='forced')head='This was your only legal move.';
  else if(kind==='inacc')head='Playable, but you let some of your advantage slip.';
  else if(kind==='mistake')head='This makes your position noticeably worse. Here\'s why:';
  else if(kind==='blunder')head='Ouch. This loses a lot. Here\'s what went wrong:';
  else if(kind==='missed')head='You had a winning shot here and missed it.';
  let tl;
  if(['best','excellent','book','forced'].includes(kind))tl=`${does.length?cap(esc(joinR(does)))+'.':''}`;
  else if(kind==='good')tl=`${does.length?cap(esc(joinR(does)))+'. ':''}Slightly better: <b class="mv">${esc(bSan)}</b>.`;
  else tl=(reasons[0]||'')+(bSan&&!/You had|You missed|was stronger/.test(reasons[0]||'')?` Better: <b class="mv">${esc(bSan)}</b>.`:'');
  let html=`<div class="verdict"><span class="bdg k-${kind}">${KIND[kind].sym}</span><span class="t-${kind}">${esc(mSan)} is ${kind==='best'?'the best move':article(KIND[kind].t)+' '+KIND[kind].t.toLowerCase()}</span></div>`;
  if(tl)html+=`<p class="tldr sum">${tl}</p>`;
  if(head)html+=`<p class="why">${head}</p>`;
  html+=parts.join('');
  if(reasons.length)html+='<ul>'+reasons.map(x=>`<li>${x}</li>`).join('')+'</ul>';
  if(!isBest&&best.pv&&best.pv.length&&kind!=='forced'&&kind!=='excellent'&&kind!=='book')html+=`<div class="line">Best line: ${esc(fmtLine(before,best.pv,6))}</div>`;
  if(kind==='mistake'||kind==='blunder'||kind==='missed')html+='<p class="small">Tap <strong>Take back</strong> to try the better move yourself.</p>';
  const acc=Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*lossWP*100)-3.1669));
  return {kind,html,san:mSan,best:best.move,bestSan:bSan,userScore,lossCp,acc,whiteScore:c==='w'?userScore:-userScore};
}

// ---------- routing & shell ----------
const ROUTES=['home','learn','puzzles','play'];
let route='home';
function go(r){if(!ROUTES.includes(r))r='home';if(location.hash!=='#'+r)history.replaceState(null,'','#'+r);show(r);}
window.addEventListener('hashchange',()=>show(location.hash.slice(1)||'home'));
function show(r){
  if(!ROUTES.includes(r))r='home';
  if(!P.onboarded&&r!=='home'&&!ASS.active){r='home';}
  route=r;
  document.querySelectorAll('.nav[data-r]').forEach(b=>b.setAttribute('aria-current',b.dataset.r===r?'page':'false'));
  $('#home').hidden=r!=='home';$('#boardScreen').hidden=r==='home';
  if(r==='home')renderHome();
  else if(r==='learn')openLearn();
  else if(r==='puzzles')openPuzzles();
  else if(r==='play')openPlay();
  setSheet(false);fit();window.scrollTo(0,0);
}
function setPanel(html){$('#panel').innerHTML=html;}
function setStrips(top,bottom){$('#stripTop').innerHTML=top||'';$('#stripBottom').innerHTML=bottom||'';}
function stripHTML(kind,name,sub,capsHTML,thinking){
  return `<div class="avatar ${kind}">${kind==='bot'?glyph(sub.icon||'N'):glyph('K')}</div><div class="who"><b>${esc(name)}</b><span class="caps">${capsHTML||''}</span></div>${thinking?'<div class="thinking"><i></i><i></i><i></i></div>':''}`;
}
function setBoardOpts(o){Object.assign(BD,{mover:null,last:null,stars:null,arrows:[],badge:null,onMove:null,onSquare:null,onSelect:null,locked:false,threatsFor:null,hintSq:null,hideNames:false},o);clearSel();hideOverlay();}
function boardToolsHTML(extra){
  return `<label class="toggle"><input type="checkbox" id="tgLegal" ${P.legal?'checked':''}> Show moves</label>
  <label class="toggle"><input type="checkbox" id="tgNames" ${P.names?'checked':''}> Square names</label>${extra||''}`;
}
function wireTools(){
  const l=$('#tgLegal'),n=$('#tgNames'),t=$('#tgThreats'),c=$('#tgCoach');
  if(l)l.onchange=()=>{P.legal=l.checked;save();renderBoard();};
  if(n)n.onchange=()=>{P.names=n.checked;save();renderBoard();};
  if(t)t.onchange=()=>{P.threats=t.checked;save();renderBoard();};
  if(c)c.onchange=()=>{P.coach=c.checked;save();};
}
function pieceInfoHTML(p,n){if(!p)return'';return `<div class="pieceinfo"><span class="pc-ico">${glyph(p[1])}</span><span>${PIECE_INFO[p[1]]} ${n!=null?`<strong>${n} legal move${n===1?'':'s'}</strong> right now.`:''}</span></div>`;}

// ---------- HOME ----------
let onboardStep=0;
function stageProgress(st){const done=st.items.filter(it=>itemDone(it)).length;return{done,total:st.items.length};}
function itemKey(it){return it.k==='lesson'?'l:'+it.id:it.k==='puzzles'?'z:'+it.id:'g:'+it.bot+(it.nocoach?'n':'')+(it.win?'w':'');}
function itemDone(it){if(it.k==='lesson')return!!P.lessons[it.id];if(it.k==='puzzles')return it.set.every(id=>P.puzzles[id]==='solved');return!!P.items[itemKey(it)];}
function itemLabel(it){return it.k==='lesson'?LESSONS[it.id].title:it.title;}
function itemKind(it){return it.k==='lesson'?'Lesson':it.k==='puzzles'?`Puzzles · ${it.set.filter(id=>P.puzzles[id]==='solved').length}/${it.set.length}`:`Game · ${BOTS[it.bot].name} (${BOTS[it.bot].rating})`;}
function currentStage(){
  for(const st of STAGES){const pr=stageProgress(st);if(pr.done<pr.total&&!(P.placed&&st.max<=P.placed))return st;}
  return STAGES[STAGES.length-1];
}
function nextItem(){const st=currentStage();return {st,it:st.items.find(it=>!itemDone(it))||st.items[st.items.length-1]};}
function renderHome(){
  const h=$('#home');
  if(!P.onboarded){h.innerHTML=onboardHTML();wireOnboard();return;}
  const tgt=TARGETS.find(t=>t.r===P.target)||TARGETS[2];
  const pct=Math.max(2,Math.min(100,(P.rating-P.start)/Math.max(1,P.target-P.start)*100));
  const {st,it}=nextItem();
  const reached=P.rating>=P.target;
  h.innerHTML=`<div class="home">
   <div class="path">
    <section class="hero-card"><span class="bigpiece" aria-hidden="true">${glyph('N')}</span>
      <p class="eyebrow">Your level</p>
      <h1>${reached?'Goal reached!':`${P.rating} on the way to ${P.target}`}</h1>
      <div class="levelmeter"><div class="bar"><i style="width:${pct}%"></i></div><div class="ends"><span>Start ${P.start}</span><span>Now ${P.rating}</span><span>Goal ${P.target} · ${esc(tgt.t)}</span></div></div>
      <div class="goalrow"><span class="g">Goal: <b>${P.target}</b> · ${esc(tgt.t)}</span><button class="btn sm" id="chgGoal">Change goal</button><button class="btn sm ghost" id="chgLevel">Set my level</button></div>
      <div class="targets" id="goalPick" hidden>${TARGETS.map(t=>`<button class="target" data-t="${t.r}" aria-pressed="${t.r===P.target}"><b>${t.r}</b><span>${esc(t.t)}</span></button>`).join('')}</div>
      <div id="levelPick" hidden>${levelInputHTML()}</div>
      <p class="small desk-only" style="color:var(--ink-2)">Your level is an estimate that moves with every puzzle, lesson, and game. It is this app's own scale, not an official rating.</p>
    </section>
    <section class="nextup"><div class="ico">${glyph(it.k==='game'?BOTS[it.bot].icon:st.icon)}</div><div class="txt"><span class="eyebrow">Up next · ${esc(st.title)}</span><b>${esc(itemLabel(it))}</b><span class="small">${esc(itemKind(it))}</span></div><button class="btn go big" id="goNext">Start</button></section>
    ${STAGES.map((s,i)=>{const pr=stageProgress(s);const isCur=s===st;const tested=P.placed&&s.max<=P.placed&&pr.done<pr.total;const done=pr.done===pr.total;
      return `<section class="stage ${done?'done':''} ${isCur?'current':''}"><button class="stage-head" data-stage="${i}" aria-expanded="${isCur}"><span class="num">${done?'✓':i+1}</span><span class="t"><b>${esc(s.title)}</b><span>Level ${s.min}–${s.max}${tested?' · placed above this stage':''}${P.target>s.min&&P.target<=s.max?' · your goal':''}</span></span><span class="pct">${pr.done}/${pr.total}</span></button>
      <div class="stage-items" ${isCur?'':'hidden'}>${s.items.map((x,j)=>`<button class="item ${itemDone(x)?'done':''}" data-s="${i}" data-j="${j}"><span class="chk">${itemDone(x)?'✓':''}</span><span class="lbl">${esc(itemLabel(x))}<br><span class="kind">${esc(itemKind(x))}</span></span></button>`).join('')}</div></section>`;}).join('')}
   </div>
   <div class="side-stack">
    <section class="card desk-only"><h3>Your goal</h3><div class="targets">${TARGETS.map(t=>`<button class="target" data-t="${t.r}" aria-pressed="${t.r===P.target}"><b>${t.r}</b><span>${esc(t.t)}</span></button>`).join('')}</div><p class="small">${esc(tgt.d)}</p></section>
    <section class="card"><h3>Quick start</h3><div class="row"><button class="btn" data-goto="play">Play the coach</button><button class="btn" data-goto="puzzles">Puzzles</button><button class="btn" data-goto="learn">Lessons</button></div></section>
    <section class="card"><h3>Recent progress</h3><div class="history">${P.log.length?P.log.slice(0,8).map(l=>`<div><span>${esc(l.why)}</span><b>${l.delta>=0?'+':''}${l.delta}</b></div>`).join(''):'<p class="small">Finish a lesson, puzzle, or game to see your level move.</p>'}</div></section>
    <section class="card"><h3>Placement</h3><p class="small">Not sure your level is right? Retake the placement test any time.</p><div class="row"><button class="btn sm" id="retest">Retake placement test</button><button class="btn sm ghost" id="resetAll">Reset all progress</button></div><div id="resetConfirm"></div></section>
   </div></div>`;
  $('#goNext').onclick=()=>openItem(it);
  $('#chgGoal').onclick=()=>{const g=$('#goalPick');g.hidden=!g.hidden;$('#levelPick').hidden=true;};
  $('#chgLevel').onclick=()=>{const g=$('#levelPick');g.hidden=!g.hidden;$('#goalPick').hidden=true;};
  wireLevelInput(()=>renderHome());
  h.querySelectorAll('.stage-head').forEach(b=>b.onclick=()=>{const items=b.nextElementSibling;items.hidden=!items.hidden;b.setAttribute('aria-expanded',!items.hidden);});
  h.querySelectorAll('.item').forEach(b=>b.onclick=()=>openItem(STAGES[+b.dataset.s].items[+b.dataset.j]));
  h.querySelectorAll('.target').forEach(b=>b.onclick=()=>{P.target=+b.dataset.t;save();renderHome();});
  h.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>go(b.dataset.goto));
  $('#retest').onclick=()=>startAssessment();
  $('#resetAll').onclick=()=>{$('#resetConfirm').innerHTML='<div class="row" style="margin-top:6px"><span class="small">Erase your level, lessons, and games?</span><button class="btn sm" id="resetYes" style="background:var(--blunder)">Erase</button></div>';$('#resetYes').onclick=()=>{P=freshProfile();save();onboardStep=0;updateLevelChips();renderHome();};};
}
function onboardHTML(){
  if(onboardStep===0)return `<div class="onboard"><section class="hero-card"><span class="bigpiece" aria-hidden="true">${glyph('N')}</span><p class="eyebrow">Welcome</p><h1>Learn chess from your first move to club level</h1><p style="color:var(--ink-2);max-width:52ch">Short lessons, puzzles, and games against a coach who explains every move you make: what was good, what you missed, and what would have been better.</p></section>
   <h2>Where are you starting?</h2>
   <div class="choice"><button id="obNew"><b>I'm brand new</b><span>Start from how the pieces move. Takes about 10 minutes to play your first game.</span></button>
   <button id="obTest"><b>I know the rules</b><span>Take an 8-puzzle placement test so the app can skip what you already know.</span></button>
   <button id="obKnow"><b>I know my rating</b><span>Type in your rating from a chess site or club and start from there.</span></button></div>
   <div id="levelPick" hidden>${levelInputHTML()}</div></div>`;
  return `<div class="onboard"><h2>Where do you want to get to?</h2><p style="color:var(--ink-2)">Pick a goal. Your path and recommendations will build toward it. You can change it later.</p>
   <div class="targets">${TARGETS.map(t=>`<button class="target" data-t="${t.r}" aria-pressed="${t.r===P.target}"><b>${t.r}</b><span>${esc(t.t)}</span><span class="small">${esc(t.d)}</span></button>`).join('')}</div>
   <div class="row"><button class="btn go big" id="obDone">Build my path</button></div></div>`;
}
function wireOnboard(){
  if(onboardStep===0){$('#obNew').onclick=()=>{P.rating=200;P.start=200;P.placed=null;onboardStep=1;save();renderHome();};$('#obTest').onclick=()=>startAssessment();$('#obKnow').onclick=()=>{$('#levelPick').hidden=false;$('#lvlIn').focus();};wireLevelInput(()=>{onboardStep=1;renderHome();});}
  else{document.querySelectorAll('.target').forEach(b=>b.onclick=()=>{P.target=+b.dataset.t;document.querySelectorAll('.target').forEach(x=>x.setAttribute('aria-pressed',x===b));});
    $('#obDone').onclick=()=>{if(P.target<=P.rating)P.target=(TARGETS.find(t=>t.r>P.rating)||TARGETS[TARGETS.length-1]).r;P.onboarded=true;save();updateLevelChips();renderHome();};}
}
function levelInputHTML(){return `<div class="card" style="background:var(--panel-2);margin-top:8px"><label for="lvlIn"><b>Your current rating</b></label>
  <div class="row"><input id="lvlIn" type="number" inputmode="numeric" min="100" max="2500" step="10" value="${P.onboarded?P.rating:800}" style="width:120px;font:inherit;font-size:20px;font-weight:800;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink)"><button class="btn go" id="lvlSet">Start from here</button></div>
  <p class="small">Use your rating from any chess site or club. Lessons and stages below it are marked as skippable, but you can still open them.</p><p class="small" id="lvlErr"></p></div>`;}
function wireLevelInput(after){
  const b=$('#lvlSet');if(!b)return;
  b.onclick=()=>{const v=Math.round(+$('#lvlIn').value);
    if(!(v>=100&&v<=2500)){$('#lvlErr').textContent='Enter a number between 100 and 2500.';return;}
    const old=P.rating;P.rating=v;P.start=v;P.placed=v;
    P.log.unshift({d:Date.now(),why:'Set level by hand',delta:v-old,r:v});
    if(P.target<=v)P.target=(TARGETS.find(t=>t.r>v)||TARGETS[TARGETS.length-1]).r;
    save();updateLevelChips();after();};
}
function openItem(it){
  if(it.k==='lesson'){LS.pending=it.id;go('learn');}
  else if(it.k==='puzzles'){PZ.pendingSet=it;go('puzzles');}
  else{PL.pending=it;go('play');}
}

// ---------- LESSONS ----------
const LS={id:null,pending:null,state:null,stars:null,moves:0,done:false,last:null,quiz:null,found:null,msg:null,busy:false,accept:null};
function lessonOrder(){const out=[];for(const st of STAGES)for(const it of st.items)if(it.k==='lesson')out.push({id:it.id,stage:st});return out;}
function openLearn(){
  const ord=lessonOrder();
  let id=LS.pending||LS.id||(ord.find(x=>!P.lessons[x.id])||ord[0]).id;LS.pending=null;
  loadLesson(id);
}
function loadLesson(id){
  const L=LESSONS[id];
  Object.assign(LS,{id,state:parseFEN(L.fen),stars:L.stars?new Set(L.stars.map(sqIdx)):null,moves:0,done:false,last:null,quiz:null,found:new Set(),msg:null,busy:false,accept:null});
  setStrips('','');
  setBoardOpts({state:LS.state,orient:'w',mover:L.type==='find'?null:'w',stars:LS.stars,onMove:lessonMove,onSelect:(p,n)=>{$('#pinfo').innerHTML=pieceInfoHTML(p,n);}});
  if(L.type==='find'){BD.hideNames=true;BD.onSquare=quizClick;newQuiz();}
  if(L.type==='engine'){BD.locked=true;engine('scoreMoves',LS.state,3,{timeMs:2500}).then(sm=>{if(LS.id!==id)return;const best=sm[0].score;LS.accept=new Set(sm.filter(x=>x.score>=best-80).map(x=>uci(x.move)));BD.locked=false;});}
  $('#boardTools').innerHTML=boardToolsHTML();wireTools();
  resetEval();$('#evalbar').hidden=true;
  renderLessonPanel();renderBoard();
}
function lessonGoalProgress(){
  const L=LESSONS[LS.id];
  if(L.type==='stars')return `${LS.stars.size} star${LS.stars.size===1?'':'s'} left · ${LS.moves} move${LS.moves===1?'':'s'} (best: ${L.par})`;
  if(L.type==='capture-all')return `${LS.state.board.filter(p=>p&&p[0]==='b').length} black pieces left · ${LS.moves} moves`;
  if(L.type==='find')return `Streak: ${LS.quiz?LS.quiz.streak:0} / 6`;
  if(L.type==='escape')return `Found ${LS.found.size} of 3: ${['move','block','capture'].map(k=>LS.found.has(k)?k+' ✓':k).join(' · ')}`;
  if(L.type==='practice')return `Move ${LS.moves} of ${L.limit}`;
  return '';
}
function renderLessonPanel(){
  const L=LESSONS[LS.id],ord=lessonOrder(),idx=ord.findIndex(x=>x.id===LS.id),st=ord[idx].stage;
  const doneCount=ord.filter(x=>P.lessons[x.id]).length;
  const msg=LS.msg?`<div class="feedback ${LS.msg.k}">${LS.msg.h}</div>`:'';
  const quizTarget=L.type==='find'&&LS.quiz&&!LS.done?`<div class="goal" style="align-items:center;text-align:center"><span class="eyebrow">Find this square</span><b style="font-size:44px;font-family:var(--f-mono)">${sqName(LS.quiz.target)}</b></div>`:'';
  setPanel(`<div class="panel-head"><div style="flex:1;min-width:0"><p class="eyebrow">${esc(st.title)} · Lesson ${idx+1} of ${ord.length}</p><h2>${esc(L.title)}</h2></div></div>
   <div class="panel-body">
    <div class="lesson-text">${L.text.map((t,i)=>`<p class="${i?'m-more':''}">${t}</p>`).join('')}</div>
    ${quizTarget}
    <div class="goal"><b>${esc(L.goal)}</b><span class="prog" id="lprog">${lessonGoalProgress()}</span></div>
    ${msg}
    <div id="pinfo" class="m-more"></div>
    <div class="row">${LS.done?`<button class="btn go" id="lNext">${idx<ord.length-1?'Next lesson':'Back to your path'}</button>`:`<button class="btn" id="lHint">Hint</button>`}<button class="btn ghost" id="lReset">Restart</button></div>
    <details class="m-more"><summary class="small" style="cursor:pointer">All lessons (${doneCount}/${ord.length} done)</summary><div class="puzzle-list" style="margin-top:8px">${ord.map(x=>`<button class="item ${P.lessons[x.id]?'done':''}" data-l="${x.id}"><span class="chk">${P.lessons[x.id]?'✓':''}</span><span class="lbl">${esc(LESSONS[x.id].title)}<br><span class="kind">${esc(x.stage.title)}</span></span></button>`).join('')}</div></details>
   </div>`);
  setHandle(L.text.length>1?'Read more & all lessons':'All lessons');
  $('#lReset').onclick=()=>loadLesson(LS.id);
  if($('#lHint'))$('#lHint').onclick=lessonHint;
  if($('#lNext'))$('#lNext').onclick=()=>{if(idx<ord.length-1)loadLesson(ord[idx+1].id);else go('home');};
  document.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>loadLesson(b.dataset.l));
}
function lessonMsg(k,h){LS.msg={k,h};renderLessonPanel();}
function lessonHint(){
  const L=LESSONS[LS.id];let extra='';
  if(L.sol){const m=moveFromUci(LS.state,L.sol[0]);if(m){BD.hintSq=m.from;renderBoard();}}
  else if(['mate','check','castle','promote','ep'].includes(L.type)){
    const ms=legalMoves(LS.state);const good=ms.find(m=>{const ns=makeMove(LS.state,m);
      if(L.type==='mate')return inCheck(ns)&&!legalMoves(ns).length;if(L.type==='check')return inCheck(ns);if(L.type==='castle')return m.flag&&m.flag.startsWith('castle');if(L.type==='promote')return !!m.promo;return m.flag==='ep';});
    if(good){BD.hintSq=good.from;renderBoard();extra=' The highlighted piece is the one to move.';}
  }
  lessonMsg('info',esc(L.hint)+extra);
}
function completeLesson(text){
  LS.done=true;BD.locked=true;
  const first=!P.lessons[LS.id];P.lessons[LS.id]=Date.now();save();
  if(first)addRating(P.rating<600?12:5,`Lesson: ${LESSONS[LS.id].title}`);
  lessonMsg('ok',`<strong>Lesson complete.</strong> ${text}`);renderBoard();
}
function revertAfter(before,ms){LS.busy=true;BD.locked=true;setTimeout(()=>{LS.state=before;BD.state=before;BD.last=null;LS.busy=false;if(!LS.done)BD.locked=false;renderBoard();},ms);}
function lessonMove(m){
  const L=LESSONS[LS.id],before=LS.state,legal=legalMoves(before),mSan=san(before,m,legal);
  let ns=makeMove(before,m);
  const showMove=()=>{LS.state=ns;BD.state=ns;BD.last={from:m.from,to:m.to};renderBoard();};
  switch(L.type){
    case 'stars':case 'capture-all':{
      ns.turn='w';ns.ep=null;showMove();LS.moves++;
      if(LS.stars){LS.stars.delete(m.to);if(!LS.stars.size){completeLesson(LS.moves<=L.par?`All stars in ${LS.moves} moves. That's the fewest possible!`:`All stars collected in ${LS.moves} moves. It can be done in ${L.par}; try Restart if you like a challenge.`);return;}}
      if(L.type==='capture-all'&&!ns.board.some(p=>p&&p[0]==='b')){completeLesson(`Board cleared in ${LS.moves} moves.`);return;}
      if(m.captured&&L.type==='capture-all')lessonMsg('ok',`Captured the ${NAMES[m.captured[1]]}.`);else{const pr=$('#lprog');if(pr)pr.textContent=lessonGoalProgress();}
      return;}
    case 'check':showMove();if(inCheck(ns))completeLesson(`<b class="mv">${esc(mSan)}</b> attacks the king. That's check!`);else{lessonMsg('bad','That move does not attack the king. Try again.');revertAfter(before,900);}return;
    case 'mate':{showMove();const lm=legalMoves(ns);
      if(inCheck(ns)&&!lm.length){completeLesson(`<b class="mv">${esc(mSan)}</b> is checkmate. The king is attacked and has no escape.`);return;}
      if(!lm.length)lessonMsg('bad','<strong>Stalemate!</strong> Black is not in check but has no legal move, so the game would be a draw. Try again.');
      else if(inCheck(ns))lessonMsg('bad',`Check, but not mate: Black escapes with <b class="mv">${esc(san(ns,lm[0],lm))}</b>. Try again.`);
      else lessonMsg('bad','That is not checkmate. Look for a check the king cannot escape. Try again.');
      revertAfter(before,1300);return;}
    case 'escape':{showMove();const kind=m.captured?'capture':m.piece[1]==='K'?'move':'block';
      const t={capture:'You captured the attacking rook.',move:'You moved the king out of the line of fire.',block:'You blocked the check by putting a piece in the way.'}[kind];
      LS.found.add(kind);
      if(LS.found.size===3){completeLesson(`${t} You found all three ways out of check: move, block, capture.`);return;}
      lessonMsg('ok',`${t} ${LS.found.size} of 3 found. The board resets so you can find another.`);revertAfter(before,1200);return;}
    case 'castle':showMove();if(m.flag==='castleK'||m.flag==='castleQ')completeLesson(`${m.flag==='castleK'?'Kingside':'Queenside'} castling: king safe, rook active.`);else{lessonMsg('bad','That is not castling. Move the king two squares toward a rook.');revertAfter(before,1000);}return;
    case 'promote':showMove();if(m.promo)completeLesson(`Your pawn became a ${NAMES[m.promo]}!${m.promo!=='Q'?' (A queen is usually the best choice.)':''}`);else{lessonMsg('bad','Move the pawn to the last rank.');revertAfter(before,900);}return;
    case 'ep':showMove();if(m.flag==='ep')completeLesson('En passant! Your pawn captured the d-pawn as it passed by.');else{lessonMsg('bad','Not quite. Capture the d5 pawn by moving diagonally to d6.');revertAfter(before,1000);}return;
    case 'moves':{showMove();const u=uci(m);
      if(L.sol.includes(u)){completeLesson(esc(L.success||'Correct!'));return;}
      if(L.ok&&L.ok.includes(u)){completeLesson(`<b class="mv">${esc(mSan)}</b> is a good move too. ${esc(L.success||'')}`);return;}
      lessonMsg('bad',esc((L.wrong&&L.wrong[u])||L.wrongDefault||'Not quite. Try again.'));revertAfter(before,1300);return;}
    case 'engine':{showMove();if(!LS.accept){lessonMsg('info','The coach is still thinking, try again in a second.');revertAfter(before,600);return;}
      if(LS.accept.has(uci(m))){completeLesson(`<b class="mv">${esc(mSan)}</b>. ${esc(L.success)}`);return;}
      engine('search',ns,3,{timeMs:900}).then(r=>{const rm=r.move&&legalMoves(ns).find(x=>sameMove(x,r.move));
        lessonMsg('bad',rm?`After <b class="mv">${esc(mSan)}</b>, Black plays <b class="mv">${esc(san(ns,rm))}</b>${rm.captured?` and wins your ${NAMES[rm.captured[1]]}`:''}. Try again.`:'Not safe. Try again.');});
      revertAfter(before,1400);return;}
    case 'practice':{showMove();LS.moves++;BD.locked=true;
      if(endCheck(ns,'w'))return;
      engine('search',ns,4,{timeMs:900}).then(r=>{if(LS.id!==L.id&&LESSONS[LS.id]!==L)return;
        const rm=legalMoves(ns).find(x=>sameMove(x,r.move));const ns2=makeMove(ns,rm);LS.state=ns2;BD.state=ns2;BD.last={from:rm.from,to:rm.to};
        if(endCheck(ns2,'b'))return;
        if(LS.moves>=L.limit){lessonMsg('bad',`Out of moves. Restart and try to box the king in faster.`);BD.locked=true;renderBoard();return;}
        BD.locked=false;renderBoard();const pr=$('#lprog');if(pr)pr.textContent=lessonGoalProgress();});
      return;}
  }
  function endCheck(st,who){const lm=legalMoves(st);
    if(!lm.length){if(inCheck(st)&&who==='w'){completeLesson(`Checkmate in ${LS.moves} moves. Well done!`);}else{lessonMsg('bad','Stalemate: the king has no moves but is not in check. That\'s a draw. Restart and leave it a square.');BD.locked=true;renderBoard();}return true;}
    if(!st.board.some(p=>p&&p[0]==='w'&&p[1]!=='K')){lessonMsg('bad','Your piece was captured. Restart and keep it protected or far from the enemy king.');BD.locked=true;renderBoard();return true;}
    return false;}
}
function newQuiz(){const q=LS.quiz||{streak:0};let t;do{t=Math.floor(Math.random()*64);}while(q.target===t);q.target=t;LS.quiz=q;}
function quizClick(sq){
  if(LS.done)return;
  if(sq===LS.quiz.target){flashSq(sq,'right');LS.quiz.streak++;if(LS.quiz.streak>=6){completeLesson('Six in a row. You can read the board!');return;}LS.msg={k:'ok',h:`Yes, that's ${sqName(sq)}.`};}
  else{flashSq(sq,'wrong');flashSq(LS.quiz.target,'right');LS.msg={k:'bad',h:`That was ${sqName(sq)}. ${sqName(LS.quiz.target)} is the one flashing green. Streak reset.`};LS.quiz.streak=0;}
  newQuiz();renderLessonPanel();
}

// ---------- PUZZLES (also used for the placement test) ----------
const PZ={pendingSet:null,set:null,i:0,p:null,state:null,done:0,accept:null,failed:false,solved:false,msg:null,mode:'free',results:[],thinking:false};
const ASS={active:false};
function puzzleQueue(){return PUZZLES.slice().sort((a,b)=>Math.abs(a.rating-P.rating-100)-Math.abs(b.rating-P.rating-100));}
function openPuzzles(){
  if(ASS.active&&PZ.mode==='assess'){renderPuzzle();return;}
  if(PZ.pendingSet){PZ.set=PZ.pendingSet.set.slice();PZ.setTitle=PZ.pendingSet.title;PZ.pendingSet=null;PZ.mode='set';
    PZ.i=Math.max(0,PZ.set.findIndex(id=>P.puzzles[id]!=='solved'));}
  else if(!PZ.set||PZ.mode==='assess'){PZ.mode='free';PZ.set=puzzleQueue().map(p=>p.id);PZ.setTitle='Rated puzzles';PZ.i=Math.max(0,PZ.set.findIndex(id=>P.puzzles[id]!=='solved'));}
  loadPuzzle();
}
function startAssessment(){
  ASS.active=true;PZ.mode='assess';PZ.set=ASSESS.slice();PZ.setTitle='Placement test';PZ.i=0;PZ.results=[];
  location.hash='#puzzles';show('puzzles');loadPuzzle();
}
function loadPuzzle(){
  const p=PUZZLES.find(x=>x.id===PZ.set[PZ.i]);
  Object.assign(PZ,{p,state:parseFEN(p.fen),done:0,accept:null,failed:false,solved:false,msg:null,thinking:true,history:[]});
  setStrips('','');$('#evalbar').hidden=true;
  setBoardOpts({state:PZ.state,orient:PZ.state.turn,mover:PZ.state.turn,onMove:puzzleMove,locked:true,onSelect:(pc,n)=>{const e=$('#pinfo');if(e)e.innerHTML=pieceInfoHTML(pc,n);}});
  $('#boardTools').innerHTML=boardToolsHTML();wireTools();
  renderPuzzle();renderBoard();computeAccept();
}
function movesLeft(){return (PZ.p.moves||1)-PZ.done;}
function computeAccept(){
  const st=PZ.state,id=PZ.p.id;PZ.thinking=true;
  engine('scoreMoves',st,movesLeft()>1?4:3,{timeMs:3000}).then(sm=>{
    if(PZ.p.id!==id||PZ.state!==st)return;
    const best=sm[0].score,left=movesLeft();
    PZ.scores=sm;
    if(best>MATE-1000)PZ.accept=new Set(sm.filter(x=>x.score>=MATE-(2*left-1)).map(x=>uci(x.move)));
    else PZ.accept=new Set(sm.filter(x=>x.score>=best-60).map(x=>uci(x.move)));
    PZ.thinking=false;if(!PZ.solved&&!(PZ.failed&&PZ.mode==='assess'))BD.locked=false;renderBoard();renderPuzzle();
  });
}
function renderPuzzle(){
  const p=PZ.p;if(!p)return;const side=PZ.state.turn==='w'?'White':'Black';
  const n=PZ.set.length;
  const solvedCount=PZ.set.filter(id=>P.puzzles[id]==='solved').length;
  const msg=PZ.msg?`<div class="feedback ${PZ.msg.k}">${PZ.msg.h}</div>`:'';
  let actions='';
  if(PZ.mode==='assess'){actions=(PZ.solved||PZ.failed)?`<button class="btn go" id="pzNext">${PZ.i<n-1?'Next puzzle':'See my result'}</button>`:`<button class="btn ghost" id="pzSkip">I don't know</button>`;}
  else actions=PZ.solved?`<button class="btn go" id="pzNext">Next puzzle</button>`:PZ.failed?`<button class="btn" id="pzRetry">Try again</button><button class="btn ghost" id="pzShow">Show solution</button><button class="btn ghost" id="pzNext">Skip</button>`:`<button class="btn" id="pzHint">Hint</button><button class="btn ghost" id="pzNext">Skip</button>`;
  setPanel(`<div class="panel-head"><div style="flex:1;min-width:0"><p class="eyebrow">${esc(PZ.setTitle)} · ${PZ.i+1} of ${n}</p><h2>${PZ.mode==='assess'?'Find the best move':esc(p.theme)}</h2></div>${PZ.mode!=='assess'?`<span class="small">Puzzle ${p.rating}</span>`:''}</div>
   <div class="panel-body">
    ${PZ.mode==='assess'&&PZ.i===0&&!PZ.solved&&!PZ.failed?'<p class="lesson-text m-more">Eight puzzles, getting harder. Do your best, and pick "I don\'t know" rather than guessing. Your answers set your starting level.</p>':''}
    <div class="goal"><b>${side} to move. ${p.moves>1?`Find checkmate in ${p.moves}.`:'Find the best move.'}</b><span class="prog">${PZ.thinking?'Setting up the puzzle…':PZ.mode==='assess'?'One try per puzzle':`Your level ${P.rating}`}</span></div>
    ${msg}<div id="pinfo" class="m-more"></div>
    <div class="row">${actions}</div>
    ${PZ.mode!=='assess'?`<p class="small m-more">${solvedCount} of ${n} in this set solved. Puzzles are picked near your level.</p>`:''}
   </div>`);
  setHandle('Details & settings');
  const b=id=>$(id);
  if(b('#pzNext'))b('#pzNext').onclick=nextPuzzle;
  if(b('#pzSkip'))b('#pzSkip').onclick=()=>{PZ.failed=true;BD.locked=true;recordPuzzle(false);showSolution();};
  if(b('#pzRetry'))b('#pzRetry').onclick=()=>{const keep=PZ.failed;loadPuzzleKeepFail();};
  if(b('#pzShow'))b('#pzShow').onclick=showSolution;
  if(b('#pzHint'))b('#pzHint').onclick=()=>{const m=moveFromUci(PZ.state,PZ.p.sol[PZ.done*2]);if(m){BD.hintSq=m.from;renderBoard();}PZ.msg={k:'info',h:`Theme: <strong>${esc(p.theme)}</strong>. The highlighted piece makes the key move.`};PZ.hinted=true;renderPuzzle();};
}
function loadPuzzleKeepFail(){const f=PZ.failed;loadPuzzle();PZ.wasFailed=f;}
function showSolution(){
  const m=moveFromUci(PZ.state,PZ.p.sol[PZ.done*2]);
  if(m){BD.arrows=[{from:m.from,to:m.to,color:'green'}];renderBoard();}
  PZ.msg={k:'info',h:`The answer is <b class="mv">${m?esc(san(PZ.state,m)):''}</b>. ${esc(PZ.p.why)}`};renderPuzzle();
}
function recordPuzzle(ok){
  const p=PZ.p;
  if(PZ.mode==='assess'){PZ.results.push({r:p.rating,ok});return;}
  if(PZ.wasFailed||PZ.hinted){if(ok&&P.puzzles[p.id]!=='solved'){P.puzzles[p.id]='solved';save();}return;}
  const prev=P.puzzles[p.id];
  if(ok){P.puzzles[p.id]='solved';}else if(prev!=='solved')P.puzzles[p.id]='failed';
  save();
  if(!prev)addRating(elo(P.rating,p.rating,ok?1:0,ok?24:16),`Puzzle ${p.rating}: ${ok?'solved':'missed'}`);
}
function puzzleMove(m){
  if(PZ.thinking||!PZ.accept)return;
  const before=PZ.state,u=uci(m),mSan=san(before,m),ns=makeMove(before,m);
  PZ.state=ns;BD.state=ns;BD.last={from:m.from,to:m.to};BD.arrows=[];BD.hintSq=null;
  if(PZ.accept.has(u)){
    flashSq(m.to,'right');PZ.done++;
    if(PZ.done>=(PZ.p.moves||1)||!legalMoves(ns).length){PZ.solved=true;BD.locked=true;recordPuzzle(true);
      PZ.msg={k:'ok',h:`<strong>Correct!</strong> <b class="mv">${esc(mSan)}</b>. ${esc(PZ.p.why)}`};renderBoard();renderPuzzle();return;}
    PZ.msg={k:'ok',h:`<b class="mv">${esc(mSan)}</b> is right. Keep going…`};BD.locked=true;renderBoard();renderPuzzle();
    engine('search',ns,4,{timeMs:800}).then(r=>{const rm=legalMoves(ns).find(x=>sameMove(x,r.move));const ns2=makeMove(ns,rm);
      setTimeout(()=>{PZ.state=ns2;BD.state=ns2;BD.last={from:rm.from,to:rm.to};renderBoard();PZ.msg={k:'info',h:`Opponent replied <b class="mv">${esc(san(ns,rm))}</b>. Your move.`};renderPuzzle();computeAccept();},350);});
    return;
  }
  flashSq(m.to,'wrong');PZ.failed=true;BD.locked=true;recordPuzzle(false);renderBoard();
  PZ.msg={k:'bad',h:`<b class="mv">${esc(mSan)}</b> isn't it. Checking why…`};renderPuzzle();
  const lm=legalMoves(ns);
  const finish=txt=>{PZ.msg={k:'bad',h:txt};if(PZ.mode==='assess'){const sm=moveFromUci(before,PZ.p.sol[PZ.done*2]);PZ.msg.h+=` The answer was <b class="mv">${sm?esc(san(before,sm)):''}</b>. ${esc(PZ.p.why)}`;}renderPuzzle();};
  if(!lm.length){finish(inCheck(ns)?'That is checkmate too, nice!':'That is stalemate, a draw. Not what we want.');if(inCheck(ns)){PZ.failed=false;PZ.solved=true;}return;}
  engine('search',ns,3,{timeMs:900}).then(r=>{const rm=lm.find(x=>sameMove(x,r.move));
    let why=`<b class="mv">${esc(mSan)}</b> isn't the best.`;
    if(rm){const rs=san(ns,rm,lm);
      if(r.score>MATE-1000)why+=` Your opponent would answer <b class="mv">${esc(rs)}</b> and mate you.`;
      else if(rm.captured)why+=` Your opponent replies <b class="mv">${esc(rs)}</b> and takes your ${NAMES[rm.captured[1]]}.`;
      else if(inCheck(ns))why+=` It is check, but the king escapes with <b class="mv">${esc(rs)}</b>.`;
      else why+=` Your opponent answers <b class="mv">${esc(rs)}</b> and you have gained nothing.`;}
    finish(why);});
}
function nextPuzzle(){
  if(PZ.mode==='assess'&&!PZ.solved&&!PZ.failed){PZ.results.push({r:PZ.p.rating,ok:false});}
  if(PZ.i<PZ.set.length-1){PZ.i++;PZ.wasFailed=false;PZ.hinted=false;loadPuzzle();return;}
  if(PZ.mode==='assess'){finishAssessment();return;}
  PZ.i=0;PZ.wasFailed=false;PZ.hinted=false;
  if(PZ.mode==='set'){go('home');return;}
  PZ.set=puzzleQueue().map(p=>p.id);loadPuzzle();
}
function finishAssessment(){
  const n=PZ.results.length,w=PZ.results.filter(x=>x.ok).length;
  const avg=PZ.results.reduce((a,x)=>a+x.r,0)/n;
  let est=Math.round((avg+400*(2*w-n)/n)/10)*10;est=Math.max(250,Math.min(1400,est));
  if(w===0)est=250;
  P.rating=est;P.start=est;P.placed=est;
  P.log.unshift({d:Date.now(),why:`Placement test: ${w}/${n} solved`,delta:0,r:est});
  for(const x of PZ.results)if(x.ok){const p=PUZZLES.find(q=>q.rating===x.r);}
  ASS.active=false;PZ.mode='free';PZ.set=null;
  if(P.target<=est)P.target=(TARGETS.find(t=>t.r>est)||TARGETS[TARGETS.length-1]).r;
  save();updateLevelChips();
  onboardStep=P.onboarded?0:1;
  location.hash='#home';show('home');
  const h=$('#home');h.insertAdjacentHTML('afterbegin',`<section class="card" style="margin-bottom:16px;border:2px solid var(--go)"><p class="eyebrow">Placement result</p><h2>You solved ${w} of ${n}. Your starting level is ${est}.</h2><p class="small">${P.onboarded?'Your path has been updated.':'Now pick a goal and we\'ll build your path.'} Stages below your level are marked so you can skip them, or review them any time.</p></section>`);
}

// ---------- PLAY vs coach ----------
const PL={pending:null,phase:'setup',bot:null,color:'w',states:[],moves:[],sans:[],an:[],gen:0,thinking:false,over:null,view:null,hint:0,hintMove:null,item:null,lastMsg:null,nocoach:false};
function openPlay(){
  if(PL.pending){const it=PL.pending;PL.pending=null;PL.item=it;PL.bot=it.bot;PL.nocoach=!!it.nocoach;PL.phase='setup';}
  if(PL.bot==null){const best=BOTS.reduce((a,b,i)=>Math.abs(b.rating-P.rating)<Math.abs(BOTS[a].rating-P.rating)?i:a,0);PL.bot=best;}
  if(PL.phase==='setup'){renderPlaySetup();return;}
  setupPlayBoard();renderPlay();
}
function renderPlaySetup(){
  $('#evalbar').hidden=false;resetEval();
  PL.states=[parseFEN(START_FEN)];
  setBoardOpts({state:PL.states[0],orient:PL.color==='b'?'b':'w',mover:null});
  $('#evalbar').classList.toggle('flip',BD.orient==='b');
  setStrips(stripHTML('bot',`${BOTS[PL.bot].name} (${BOTS[PL.bot].rating})`,BOTS[PL.bot]),stripHTML('me',`You (${P.rating})`,{}));
  $('#boardTools').innerHTML=boardToolsHTML();wireTools();renderBoard();
  setPanel(`<div class="panel-head"><h2>Play the coach</h2></div><div class="panel-body">
   ${PL.item?`<div class="goal"><b>${esc(PL.item.title)}</b><span class="prog">Part of your path${PL.item.win?' · win to complete':''}</span></div>`:''}
   <div><p class="eyebrow" style="margin-bottom:6px">Opponent</p><div class="bots">${BOTS.map((b,i)=>`<button class="bot" data-b="${i}" aria-pressed="${i===PL.bot}"><b>${glyph(b.icon)} ${b.name}</b><span>Level ${b.rating}</span></button>`).join('')}</div><p class="small" style="margin-top:6px">${esc(BOTS[PL.bot].blurb)}</p></div>
   <div><p class="eyebrow" style="margin-bottom:6px">Play as</p><div class="seg"><button data-c="w" aria-pressed="${PL.color==='w'}">White</button><button data-c="b" aria-pressed="${PL.color==='b'}">Black</button><button data-c="r" aria-pressed="false">Random</button></div></div>
   <label class="toggle" style="align-self:flex-start"><input type="checkbox" id="tgCoachSetup" ${!PL.nocoach&&P.coach?'checked':''}> Coach explains every move</label>
   <button class="btn go big" id="startGame">Play</button>
   <p class="small m-more">The coach grades each of your moves (best, good, inaccuracy, mistake, blunder), shows what would have been better, and explains why. You can take moves back any time.</p>
  </div>`);
  document.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>{PL.bot=+b.dataset.b;renderPlaySetup();});
  document.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{PL.color=b.dataset.c==='r'?(Math.random()<.5?'w':'b'):b.dataset.c;renderPlaySetup();});
  $('#tgCoachSetup').onchange=e=>{if(PL.nocoach){PL.nocoach=false;}P.coach=e.target.checked;save();};
  $('#startGame').onclick=startGame;setHandle('Settings');
}
function startGame(){
  PL.gen++;Object.assign(PL,{phase:'playing',states:[parseFEN(START_FEN)],moves:[],sans:[],an:[],thinking:false,over:null,view:null,hint:0,hintMove:null,lastMsg:null,keys:[]});
  PL.keys=[posKey(PL.states[0])];
  setupPlayBoard();
  PL.lastMsg={kind:'info',html:`<div class="verdict"><span class="bdg k-info">i</span><span class="t-info">Game on vs ${esc(BOTS[PL.bot].name)}</span></div><p class="tldr">Tap or drag a piece to move. Dots show where it can go${P.threats?', and red rings warn you about pieces that are under attack':''}. ${coachOn()?'After each move I\'ll tell you how good it was and why.':''}</p>`};
  renderPlay();
  if(curState().turn!==PL.color)aiTurn();
}
function coachOn(){return P.coach&&!PL.nocoach;}
function curState(){return PL.states[PL.states.length-1];}
function setupPlayBoard(){
  $('#evalbar').hidden=false;$('#evalbar').classList.toggle('flip',PL.color==='b');
  setBoardOpts({state:curState(),orient:PL.color,mover:PL.color,onMove:userPlay,threatsFor:PL.color,onSelect:(p,n)=>{const e=$('#pinfo');if(e)e.innerHTML=pieceInfoHTML(p,n);}});
  if(PL.moves.length){const lm=PL.moves[PL.moves.length-1];BD.last={from:lm.from,to:lm.to};}
  $('#boardTools').innerHTML=boardToolsHTML(`<label class="toggle"><input type="checkbox" id="tgThreats" ${P.threats?'checked':''}> Warn about attacked pieces</label><label class="toggle"><input type="checkbox" id="tgCoach" ${coachOn()?'checked':''} ${PL.nocoach?'disabled':''}> Coach</label>`);wireTools();
  renderBoard();
}
function material(s){const cnt={w:{},b:{}};for(const p of s.board)if(p&&p[1]!=='K')cnt[p[0]][p[1]]=(cnt[p[0]][p[1]]||0)+1;return cnt;}
function capsHTML(s,color){ // pieces captured BY color
  const start={P:8,N:2,B:2,R:2,Q:1},cnt=material(s)[opp(color)];let h='',lost=0,gain=0;
  for(const t of['P','N','B','R','Q']){const n=Math.max(0,start[t]-(cnt[t]||0));h+=glyph(t).repeat(n);}
  const sum=c=>Object.entries(material(s)[c]).reduce((a,[t,n])=>a+PV[t]*n,0);const d=sum(color)-sum(opp(color));
  return h+(d>0?`<span class="adv">+${d}</span>`:'');
}
function renderStrips(){
  const s=PL.view!=null?PL.states[PL.view]:curState(),bot=BOTS[PL.bot];
  setStrips(stripHTML('bot',`${bot.name} (${bot.rating})`,bot,capsHTML(s,opp(PL.color)),PL.thinking),stripHTML('me',`You (${P.rating})`,{},capsHTML(s,PL.color)));
}
function moveListHTML(){
  let rows='';const st0=PL.states[0];
  for(let i=0;i<PL.sans.length;i++){
    const s=PL.states[i];if(s.turn==='w'||i===0)rows+=`<tr><td class="n">${s.full}.</td>`+(s.turn==='b'?'<td>…</td>':'');
    const a=PL.an[i];const cur=(PL.view==null?PL.sans.length-1:PL.view-1)===i;
    rows+=`<td><button class="mvbtn ${cur?'cur':''}" data-ply="${i+1}">${a?`<span class="bdg k-${a.kind}">${KIND[a.kind].sym}</span>`:''}${esc(PL.sans[i])}</button></td>`;
    if(s.turn==='b'||i===PL.sans.length-1)rows+='</tr>';
  }
  return `<div class="moves" id="moveList"><table>${rows||'<tr><td class="small" style="padding:10px">No moves yet.</td></tr>'}</table></div>`;
}
function reviewSummaryHTML(){
  const mine=PL.an.filter(Boolean);if(!mine.length)return'';
  const acc=Math.round(mine.reduce((a,x)=>a+x.acc,0)/mine.length);
  const order=['best','excellent','good','book','inacc','mistake','blunder','missed'];
  const cnt={};for(const a of mine)cnt[a.kind]=(cnt[a.kind]||0)+1;
  return `<div class="stat-row"><div class="stat"><b>${acc}%</b><span>Your accuracy</span></div><div class="stat"><b>${mine.length}</b><span>Moves graded</span></div></div>
  <div class="tally">${order.filter(k=>cnt[k]).map(k=>`<div><span class="bdg k-${k}">${KIND[k].sym}</span>${KIND[k].t}<b>${cnt[k]}</b></div>`).join('')}</div>`;
}
function renderPlay(){
  renderStrips();
  const live=PL.view==null;const over=PL.over;
  let bubble=PL.lastMsg;
  if(!live){const a=PL.an[PL.view-1];bubble=a?{kind:a.kind,html:a.html}:{kind:'info',html:`<p class="tldr">${PL.view===0?'Starting position.':`${esc(BOTS[PL.bot].name)} played <b class="mv">${esc(PL.sans[PL.view-1])}</b>.`}</p>`};}
  const keyMoments=over?PL.an.map((a,i)=>a&&['mistake','blunder','missed'].includes(a.kind)?i:null).filter(x=>x!=null):[];
  setPanel(`<div class="panel-head ${over||!live?'':'m-more'}"><h2 style="flex:1">${over?'Game review':`vs ${esc(BOTS[PL.bot].name)}`}</h2>${!live?'<button class="btn sm go" id="backLive">Back to game</button>':''}</div>
   <div class="panel-body">
    ${over?`<div class="feedback ${over.score===1?'ok':over.score===0?'bad':'info'}"><strong>${esc(over.title)}</strong> ${esc(over.text)}</div>`:''}
    <div class="m-more">${over?reviewSummaryHTML():''}</div>
    ${bubble?`<div class="coach"><div class="face">${glyph('N')}</div><div class="bubble">${bubble.html}</div></div>`:''}
    ${over&&keyMoments.length?`<div class="m-more"><p class="eyebrow" style="margin-bottom:6px">Key moments to review</p><div class="row">${keyMoments.map(i=>`<button class="btn sm" data-ply="${i+1}"><span class="bdg k-${PL.an[i].kind}" style="width:16px;height:16px;font-size:8px">${KIND[PL.an[i].kind].sym}</span>${esc(PL.sans[i])}</button>`).join('')}</div></div>`:''}
    <div id="pinfo" class="m-more"></div>
    <div class="m-more">${moveListHTML()}</div>
    <div class="navbtns m-more"><button class="btn sm" id="navFirst" aria-label="First move">⏮</button><button class="btn sm" id="navPrev" aria-label="Previous move">◀</button><button class="btn sm" id="navNext" aria-label="Next move">▶</button><button class="btn sm" id="navLast" aria-label="Last move">⏭</button></div>
    <div class="row">${over?`<button class="btn go" id="newGame">New game</button><button class="btn" id="rematch">Rematch</button>`:`<button class="btn go" id="hintBtn" ${PL.thinking||curState().turn!==PL.color?'disabled':''}>${PL.hint===1?'Show the move':'Hint'}</button><button class="btn" id="takeBack" ${PL.moves.length?'':'disabled'}>Take back</button><button class="btn ghost" id="flip">Flip</button><button class="btn ghost" id="resign">Resign</button>`}</div>
    <div id="resignConfirm"></div>
   </div>`);
  setHandle(over?'Review & moves':'Full explanation & moves');
  const ml=$('#moveList');if(ml)ml.scrollTop=ml.scrollHeight;
  document.querySelectorAll('[data-ply]').forEach(b=>b.onclick=()=>viewPly(+b.dataset.ply));
  const on=(id,f)=>{const e=$(id);if(e)e.onclick=f;};
  on('#backLive',()=>viewPly(null));
  on('#navFirst',()=>viewPly(0));on('#navLast',()=>viewPly(null));
  on('#navPrev',()=>{const v=PL.view==null?PL.states.length-1:PL.view;viewPly(Math.max(0,v-1));});
  on('#navNext',()=>{const v=PL.view==null?PL.states.length-1:PL.view;viewPly(v+1>=PL.states.length-1?null:v+1);});
  on('#hintBtn',giveHint);on('#takeBack',takeBack);
  on('#flip',()=>{BD.orient=opp(BD.orient);$('#evalbar').classList.toggle('flip',BD.orient==='b');renderBoard();});
  on('#resign',()=>{$('#resignConfirm').innerHTML='<div class="row"><span class="small">Resign this game?</span><button class="btn sm" id="resignYes" style="background:var(--blunder)">Resign</button><button class="btn sm ghost" id="resignNo">Keep playing</button></div>';
    $('#resignYes').onclick=()=>endGame({score:0,title:'You resigned.',text:'Look through the review below to see where it turned.'});$('#resignNo').onclick=()=>{$('#resignConfirm').innerHTML='';};});
  on('#newGame',()=>{PL.phase='setup';PL.item=null;renderPlaySetup();});
  on('#rematch',()=>{startGame();});
}
function viewPly(k){
  if(k!=null&&k>=PL.states.length-1&&!PL.over)k=null;
  if(k!=null&&k>PL.states.length-1)k=PL.states.length-1;
  PL.view=k;const idx=k==null?PL.states.length-1:k;
  BD.state=PL.states[idx];clearSel();BD.hintSq=null;
  const lm=PL.moves[idx-1];BD.last=lm?{from:lm.from,to:lm.to}:null;
  BD.mover=(k==null&&!PL.over)?PL.color:null;
  const a=PL.an[idx-1];
  BD.badge=a&&lm?{sq:lm.to,kind:a.kind}:null;
  BD.arrows=a&&a.best&&!sameMove(a.best,lm)&&!['best','book','forced'].includes(a.kind)?[{from:a.best.from,to:a.best.to,color:'green'}]:[];
  if(a)setEval(a.whiteScore);
  renderBoard();renderPlay();
}
function pushMove(m){
  const s=curState(),legal=legalMoves(s);const sn=san(s,m,legal);const ns=makeMove(s,m);
  PL.states.push(ns);PL.moves.push(m);PL.sans.push(sn);PL.an.push(null);PL.keys.push(posKey(ns));
  BD.state=ns;BD.last={from:m.from,to:m.to};BD.arrows=[];BD.badge=null;BD.hintSq=null;PL.hint=0;PL.hintMove=null;
  return {before:s,after:ns,san:sn,nLegal:legal.length};
}
function gameStatus(s){
  const lm=legalMoves(s);
  if(!lm.length)return inCheck(s)?{mate:true,winner:opp(s.turn)}:{draw:'stalemate'};
  if(s.half>=100)return{draw:'50-move rule'};
  if(insufficient(s.board))return{draw:'insufficient material'};
  const k=posKey(s);if(PL.keys.filter(x=>x===k).length>=3)return{draw:'threefold repetition'};
  return null;
}
async function userPlay(m){
  if(PL.thinking||PL.over||PL.view!=null)return;
  const gen=PL.gen;
  const {before,after,san:sn,nLegal}=pushMove(m);
  PL.thinking=true;renderBoard();
  const st=gameStatus(after);
  if(coachOn()){PL.lastMsg={kind:'info',html:`<p class="small tldr">Looking at <b class="mv">${esc(sn)}</b>…</p>`};}
  renderPlay();
  let analysis=null;
  if(coachOn()||true){
    const best=await engine('search',before,4,{timeMs:1400});if(gen!==PL.gen)return;
    let reply={score:0,pv:[]};
    if(!st){reply=await engine('search',after,3,{timeMs:1000});if(gen!==PL.gen)return;}
    analysis=judge(before,m,best,reply,nLegal);
    PL.an[PL.an.length-1]=analysis;setEval(analysis.whiteScore);
    if(coachOn()){PL.lastMsg={kind:analysis.kind,html:analysis.html};BD.badge={sq:m.to,kind:analysis.kind};
      if(!['best','book','forced','excellent'].includes(analysis.kind)&&analysis.best)BD.arrows=[{from:analysis.best.from,to:analysis.best.to,color:'green'}];}
  }
  if(st){PL.thinking=false;finishByStatus(st);return;}
  renderBoard();renderPlay();
  await aiTurn(gen);
}
async function aiTurn(gen){
  if(gen==null)gen=PL.gen;
  PL.thinking=true;renderStrips();
  const bot=BOTS[PL.bot],t0=Date.now();
  const r=await engine('search',curState(),bot.depth,{timeMs:bot.timeMs,noise:bot.noise,qs:bot.qs});
  if(gen!==PL.gen)return;
  const wait=Math.max(0,550-(Date.now()-t0));if(wait)await sleep(wait);if(gen!==PL.gen)return;
  const s=curState();const m=legalMoves(s).find(x=>sameMove(x,r.move));if(!m)return;
  const {after,san:sn}=pushMove(m);PL.thinking=false;
  if(!coachOn())setEval(PL.color==='w'?-r.score:r.score);
  // commentary about the opponent's move: keep the last verdict visible, add warnings
  const notes=[];const d=describe(s,m);
  notes.push(`${esc(bot.name)} played <b class="mv">${esc(sn)}</b>${d.length?`, which ${esc(joinR(d))}`:''}.`);
  if(inCheck(after)&&legalMoves(after).length)notes.push('<strong>You are in check.</strong> Move your king, block, or capture the attacker.');
  const th=threats(after,PL.color).filter(x=>!threats(s,PL.color).some(y=>y.sq===x.sq));
  if(th.length&&P.threats)notes.push(`Watch out: your ${th.map(x=>`${pName(x.piece)} on ${sqName(x.sq)}`).join(' and ')} ${th.length>1?'are':'is'} under attack.`);
  if(coachOn()&&PL.lastMsg&&PL.lastMsg.kind!=='info'){PL.lastMsg={kind:PL.lastMsg.kind,html:PL.lastMsg.html+`<hr style="border:0;border-top:1px solid var(--line);margin:4px 0"><p class="why tldr">${notes.join(' ')}</p>`};}
  else PL.lastMsg={kind:'info',html:`<p class="tldr">${notes.join(' ')}</p>`};
  BD.badge=null;BD.arrows=[];
  const st=gameStatus(after);
  renderBoard();renderPlay();
  if(st)finishByStatus(st);
}
function finishByStatus(st){
  if(st.mate){const won=st.winner===PL.color;endGame({score:won?1:0,title:won?'Checkmate. You won!':'Checkmate. You lost this one.',text:won?'Great finish. Check the review to see what went well.':'Look at the key moments below to see what to do differently.'});}
  else endGame({score:.5,title:'Draw.',text:`The game is drawn by ${st.draw}.`});
}
function endGame(res){
  PL.gen++;PL.over=res;PL.thinking=false;BD.mover=null;
  const bot=BOTS[PL.bot];
  const graded=PL.an.filter(Boolean);
  const acc=graded.length?Math.round(graded.reduce((a,x)=>a+x.acc,0)/graded.length):null;
  P.games.unshift({d:Date.now(),bot:PL.bot,score:res.score,acc,moves:PL.sans.length});P.games=P.games.slice(0,50);
  if(PL.sans.length>=4||res.score===1)addRating(elo(P.rating,bot.rating,res.score,32),`Game vs ${bot.name}: ${res.score===1?'win':res.score===0?'loss':'draw'}`);
  if(PL.item){const it=PL.item;if(!it.win||res.score===1){P.items[itemKey(it)]=Date.now();save();}}
  else{for(const st of STAGES)for(const it of st.items)if(it.k==='game'&&it.bot===PL.bot&&(!it.win||res.score===1)&&(!it.nocoach||!coachOn()))P.items[itemKey(it)]=Date.now();save();}
  PL.view=null;renderBoard();renderPlay();
}
async function giveHint(){
  if(PL.thinking||PL.over||curState().turn!==PL.color)return;
  const s=curState();const gen=PL.gen;
  if(!PL.hintMove){const r=await engine('search',s,4,{timeMs:1200});if(gen!==PL.gen)return;PL.hintMove=legalMoves(s).find(x=>sameMove(x,r.move));}
  const m=PL.hintMove;if(!m)return;
  if(PL.hint===0){PL.hint=1;BD.hintSq=m.from;PL.lastMsg={kind:'info',html:`<div class="verdict"><span class="bdg k-info">i</span><span class="t-info">Hint</span></div><p class="tldr">Look at your <strong>${NAMES[m.piece[1]]} on ${sqName(m.from)}</strong>. ${threats(s,PL.color).length?'Also check: is anything of yours under attack?':'Where could it do the most damage?'}</p>`};}
  else{PL.hint=2;BD.hintSq=null;BD.arrows=[{from:m.from,to:m.to,color:'blue'}];const d=describe(s,m);
    PL.lastMsg={kind:'info',html:`<div class="verdict"><span class="bdg k-info">i</span><span class="t-info">Suggested move: ${esc(san(s,m))}</span></div><p class="tldr">${d.length?`It ${esc(joinR(d))}.`:'It improves your position quietly.'}</p>`};}
  renderBoard();renderPlay();
}
function takeBack(){
  if(!PL.moves.length)return;
  PL.gen++;PL.thinking=false;
  const wasOver=!!PL.over;PL.over=null;
  const popOne=()=>{PL.states.pop();PL.moves.pop();PL.sans.pop();PL.an.pop();PL.keys.pop();};
  popOne();
  while(PL.moves.length&&curState().turn!==PL.color)popOne();
  if(curState().turn!==PL.color&&!PL.moves.length){/* bot moves first as white */}
  PL.view=null;setupPlayBoard();
  const prev=PL.an.filter(Boolean).slice(-1)[0];if(prev)setEval(prev.whiteScore);else resetEval();
  PL.lastMsg={kind:'info',html:'<p class="tldr">Move taken back. Your turn: try the better idea.</p>'};
  renderPlay();
  if(curState().turn!==PL.color)aiTurn();
}

// ---------- phone sheet & sizing ----------
let sheetOpen=false;
function setHandle(t){const l=$('#handleLbl');if(l)l.dataset.t=t;updHandle();}
function updHandle(){const l=$('#handleLbl');if(!l)return;l.textContent=sheetOpen?'Close':(l.dataset.t||'Show details');$('#sheetHandle').setAttribute('aria-expanded',sheetOpen);}
function setSheet(o){sheetOpen=o;$('#sheet').classList.toggle('open',o);if(!o)$('#sheet').scrollTop=0;updHandle();}
function isPhone(){return matchMedia('(max-width:760px)').matches;}
function fit(){
  const phone=isPhone();document.body.classList.toggle('boardmode',phone&&route!=='home');
  const col=document.querySelector('.board-col');
  if(!phone){col.style.removeProperty('--bsz');return;}
  const tab=document.querySelector('.tabbar');document.documentElement.style.setProperty('--apph',(window.innerHeight-(tab?tab.offsetHeight:0))+'px');
  if(route==='home')return;
  // Sizes depend only on the screen and the mode, never on panel content, so nothing jumps.
  const H=window.innerHeight-(tab?tab.offsetHeight:0)-8;
  const W=document.querySelector('main').clientWidth-2*Math.max(16,0);
  const strips=route==='play'?2*(32+4):0;
  const ev=route==='play'?14:0;
  const sheetMin=route==='play'?236:250;
  const bsz=Math.max(220,Math.min(W,H-strips-sheetMin-8+ev));
  const colh=bsz-ev+strips;
  col.style.setProperty('--bsz',bsz+'px');col.style.setProperty('--colh',colh+'px');
  $('#sheet').style.setProperty('--sheeth',Math.max(160,H-colh-8)+'px');
}
function wireSheet(){
  const h=$('#sheetHandle');let y0=null;
  h.addEventListener('pointerdown',e=>{y0=e.clientY;});
  h.addEventListener('pointerup',e=>{if(y0==null)return;const dy=e.clientY-y0;y0=null;if(dy<-25)setSheet(true);else if(dy>25)setSheet(false);else setSheet(!sheetOpen);});
  window.addEventListener('resize',fit);
  $('#board').addEventListener('pointerdown',()=>{if(sheetOpen&&isPhone())setSheet(false);},true);
}

// ---------- boot ----------
function boot(){
  buildBoard();wireSheet();updateLevelChips();
  document.querySelectorAll('.nav[data-r]').forEach(b=>b.onclick=()=>go(b.dataset.r));
  const r=location.hash.slice(1);show(ROUTES.includes(r)?r:'home');
  if(!worker)console.warn('Engine running on main thread');
}
boot();
