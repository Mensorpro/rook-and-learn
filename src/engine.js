// ===== Chess engine: rules, move generation, evaluation, search =====
const FILES='abcdefgh';
const NAMES={P:'pawn',N:'knight',B:'bishop',R:'rook',Q:'queen',K:'king'};
const VAL={P:100,N:320,B:330,R:500,Q:900,K:0};
const MATE=100000;
function sqName(s){return FILES[s&7]+(8-(s>>3));}
function sqIdx(n){return (8-(+n[1]))*8+FILES.indexOf(n[0]);}
function opp(c){return c==='w'?'b':'w';}
function parseFEN(fen){
  const parts=fen.trim().split(/\s+/);
  const board=new Array(64).fill(null);let r=0,f=0;
  for(const ch of parts[0]){
    if(ch==='/'){r++;f=0;}
    else if(ch>='1'&&ch<='8'){f+=+ch;}
    else{board[r*8+f]=(ch===ch.toUpperCase()?'w':'b')+ch.toUpperCase();f++;}
  }
  const c=parts[2]||'-';
  return {board,turn:parts[1]||'w',castling:{wK:c.includes('K'),wQ:c.includes('Q'),bK:c.includes('k'),bQ:c.includes('q')},
    ep:parts[3]&&parts[3]!=='-'?sqIdx(parts[3]):null,half:+(parts[4]||0),full:+(parts[5]||1)};
}
function toFEN(s){
  let out='';
  for(let r=0;r<8;r++){let e=0;for(let f=0;f<8;f++){const p=s.board[r*8+f];if(!p){e++;continue;}if(e){out+=e;e=0;}out+=p[0]==='w'?p[1]:p[1].toLowerCase();}if(e)out+=e;if(r<7)out+='/';}
  let c=(s.castling.wK?'K':'')+(s.castling.wQ?'Q':'')+(s.castling.bK?'k':'')+(s.castling.bQ?'q':'');
  return out+' '+s.turn+' '+(c||'-')+' '+(s.ep!=null?sqName(s.ep):'-')+' '+s.half+' '+s.full;
}
function posKey(s){return toFEN(s).split(' ').slice(0,4).join(' ');}
const KN=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KG=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAG=[[-1,-1],[-1,1],[1,-1],[1,1]],ORTH=[[-1,0],[1,0],[0,-1],[0,1]];
// squares of pieces of colour `by` that attack `sq`
function attackers(b,sq,by,first){
  const out=[],r=sq>>3,f=sq&7;
  const pr=by==='w'?r+1:r-1;
  if(pr>=0&&pr<8)for(const df of[-1,1]){const ff=f+df;if(ff>=0&&ff<8&&b[pr*8+ff]===by+'P'){out.push(pr*8+ff);if(first)return out;}}
  for(const[dr,df]of KN){const rr=r+dr,ff=f+df;if(rr>=0&&rr<8&&ff>=0&&ff<8&&b[rr*8+ff]===by+'N'){out.push(rr*8+ff);if(first)return out;}}
  for(const[dr,df]of DIAG){let rr=r+dr,ff=f+df;while(rr>=0&&rr<8&&ff>=0&&ff<8){const p=b[rr*8+ff];if(p){if(p===by+'B'||p===by+'Q'){out.push(rr*8+ff);if(first)return out;}break;}rr+=dr;ff+=df;}}
  for(const[dr,df]of ORTH){let rr=r+dr,ff=f+df;while(rr>=0&&rr<8&&ff>=0&&ff<8){const p=b[rr*8+ff];if(p){if(p===by+'R'||p===by+'Q'){out.push(rr*8+ff);if(first)return out;}break;}rr+=dr;ff+=df;}}
  for(const[dr,df]of KG){const rr=r+dr,ff=f+df;if(rr>=0&&rr<8&&ff>=0&&ff<8&&b[rr*8+ff]===by+'K'){out.push(rr*8+ff);if(first)return out;}}
  return out;
}
function attacked(b,sq,by){return attackers(b,sq,by,true).length>0;}
// squares attacked by the piece standing on sq
function attacksFrom(b,sq){
  const p=b[sq];if(!p)return[];const c=p[0],t=p[1],r=sq>>3,f=sq&7,out=[];
  const step=dirs=>{for(const[dr,df]of dirs){const rr=r+dr,ff=f+df;if(rr>=0&&rr<8&&ff>=0&&ff<8)out.push(rr*8+ff);}};
  const slide=dirs=>{for(const[dr,df]of dirs){let rr=r+dr,ff=f+df;while(rr>=0&&rr<8&&ff>=0&&ff<8){out.push(rr*8+ff);if(b[rr*8+ff])break;rr+=dr;ff+=df;}}};
  if(t==='P'){const d=c==='w'?-1:1;step([[d,-1],[d,1]]);}
  else if(t==='N')step(KN);else if(t==='K')step(KG);
  else{if(t!=='R')slide(DIAG);if(t!=='B')slide(ORTH);}
  return out;
}
function pseudoMoves(s){
  const b=s.board,c=s.turn,o=opp(c),mv=[];
  for(let sq=0;sq<64;sq++){
    const p=b[sq];if(!p||p[0]!==c)continue;
    const t=p[1],r=sq>>3,f=sq&7;
    const add=(to,cap,flag)=>{
      if(t==='P'&&((to>>3)===0||(to>>3)===7)){for(const pr of['Q','R','B','N'])mv.push({from:sq,to,piece:p,captured:cap||null,promo:pr,flag:null});}
      else mv.push({from:sq,to,piece:p,captured:cap||null,promo:null,flag:flag||null});
    };
    if(t==='P'){
      const d=c==='w'?-1:1,start=c==='w'?6:1,r1=r+d;
      if(r1<0||r1>7)continue;
      if(!b[r1*8+f]){add(r1*8+f);if(r===start&&!b[(r+2*d)*8+f])add((r+2*d)*8+f,null,'double');}
      for(const df of[-1,1]){const ff=f+df;if(ff<0||ff>7)continue;const to=r1*8+ff;
        if(b[to]&&b[to][0]===o)add(to,b[to]);
        else if(to===s.ep&&!b[to])add(to,o+'P','ep');}
    }else if(t==='N'||t==='K'){
      for(const[dr,df]of(t==='N'?KN:KG)){const rr=r+dr,ff=f+df;if(rr<0||rr>7||ff<0||ff>7)continue;const to=rr*8+ff;if(!b[to])add(to);else if(b[to][0]===o)add(to,b[to]);}
      if(t==='K'){
        const home=c==='w'?60:4;
        if(sq===home&&!attacked(b,home,o)){
          if(s.castling[c+'K']&&!b[home+1]&&!b[home+2]&&b[home+3]===c+'R'&&!attacked(b,home+1,o)&&!attacked(b,home+2,o))add(home+2,null,'castleK');
          if(s.castling[c+'Q']&&!b[home-1]&&!b[home-2]&&!b[home-3]&&b[home-4]===c+'R'&&!attacked(b,home-1,o)&&!attacked(b,home-2,o))add(home-2,null,'castleQ');
        }
      }
    }else{
      const dirs=t==='B'?DIAG:t==='R'?ORTH:DIAG.concat(ORTH);
      for(const[dr,df]of dirs){let rr=r+dr,ff=f+df;while(rr>=0&&rr<8&&ff>=0&&ff<8){const to=rr*8+ff;if(!b[to])add(to);else{if(b[to][0]===o)add(to,b[to]);break;}rr+=dr;ff+=df;}}
    }
  }
  return mv;
}
function makeMove(s,m){
  const b=s.board.slice(),c=s.turn;
  b[m.to]=m.promo?c+m.promo:m.piece;b[m.from]=null;
  if(m.flag==='ep')b[(m.from&~7)+(m.to&7)]=null;
  if(m.flag==='castleK'){b[m.to-1]=b[m.to+1];b[m.to+1]=null;}
  if(m.flag==='castleQ'){b[m.to+1]=b[m.to-2];b[m.to-2]=null;}
  const cs={wK:s.castling.wK,wQ:s.castling.wQ,bK:s.castling.bK,bQ:s.castling.bQ};
  if(m.piece[1]==='K'){cs[c+'K']=false;cs[c+'Q']=false;}
  for(const q of[m.from,m.to]){if(q===63)cs.wK=false;if(q===56)cs.wQ=false;if(q===7)cs.bK=false;if(q===0)cs.bQ=false;}
  return {board:b,turn:opp(c),castling:cs,ep:m.flag==='double'?(m.from+m.to)>>1:null,
    half:(m.piece[1]==='P'||m.captured)?0:s.half+1,full:s.full+(c==='b'?1:0)};
}
function legalMoves(s){
  const c=s.turn,o=opp(c);
  return pseudoMoves(s).filter(m=>{const ns=makeMove(s,m);const k=ns.board.indexOf(c+'K');return k<0||!attacked(ns.board,k,o);});
}
function inCheck(s){const k=s.board.indexOf(s.turn+'K');return k>=0&&attacked(s.board,k,opp(s.turn));}
function sameMove(a,b){return !!a&&!!b&&a.from===b.from&&a.to===b.to&&(a.promo||null)===(b.promo||null);}
function uci(m){return sqName(m.from)+sqName(m.to)+(m.promo?m.promo.toLowerCase():'');}
function moveFromUci(s,u){return legalMoves(s).find(m=>uci(m)===u.toLowerCase()||(uci(m)===u+'q'))||null;}
function san(s,m,legal){
  legal=legal||legalMoves(s);let t;
  if(m.flag==='castleK')t='O-O';else if(m.flag==='castleQ')t='O-O-O';
  else{
    const p=m.piece[1];
    if(p==='P')t=(m.captured?FILES[m.from&7]+'x':'')+sqName(m.to)+(m.promo?'='+m.promo:'');
    else{
      const others=legal.filter(x=>x.piece===m.piece&&x.to===m.to&&x.from!==m.from);let d='';
      if(others.length){const sf=others.some(x=>(x.from&7)===(m.from&7)),sr=others.some(x=>(x.from>>3)===(m.from>>3));
        d=!sf?FILES[m.from&7]:!sr?String(8-(m.from>>3)):sqName(m.from);}
      t=p+d+(m.captured?'x':'')+sqName(m.to);
    }
  }
  const ns=makeMove(s,m);if(inCheck(ns))t+=legalMoves(ns).length?'+':'#';
  return t;
}
function insufficient(b){
  const ps=b.filter(Boolean).filter(p=>p[1]!=='K');
  if(!ps.length)return true;
  if(ps.length===1&&(ps[0][1]==='N'||ps[0][1]==='B'))return true;
  return false;
}
// ---- evaluation ----
const PST={
P:[0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
N:[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
B:[-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
R:[0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
Q:[-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
K:[-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
KE:[-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50]};
function evaluate(s){ // white's point of view, centipawns
  const b=s.board;let mat=0,pos=0,npm=0,wk=-1,bk=-1;
  for(let i=0;i<64;i++){const p=b[i];if(!p)continue;const t=p[1];
    if(t==='K'){if(p[0]==='w')wk=i;else bk=i;continue;}
    if(t!=='P')npm+=VAL[t];
    const idx=p[0]==='w'?i:((7-(i>>3))*8+(i&7));
    const v=VAL[t]+PST[t][idx];
    if(p[0]==='w'){mat+=VAL[t];pos+=v;}else{mat-=VAL[t];pos-=v;}
  }
  const end=npm<=2600;const kt=end?PST.KE:PST.K;
  if(wk>=0)pos+=kt[wk];if(bk>=0)pos-=kt[(7-(bk>>3))*8+(bk&7)];
  if(end&&Math.abs(mat)>=400&&wk>=0&&bk>=0){ // help the winning side drive the king to the edge
    const lose=mat>0?bk:wk,win=mat>0?wk:bk;
    const cd=Math.max(3-(lose>>3),(lose>>3)-4)+Math.max(3-(lose&7),(lose&7)-4);
    const kd=Math.abs((lose>>3)-(win>>3))+Math.abs((lose&7)-(win&7));
    const bonus=cd*12+(14-kd)*5;pos+=mat>0?bonus:-bonus;
  }
  return pos;
}
function evalSide(s){const e=evaluate(s);return s.turn==='w'?e:-e;}
const ORDV={P:1,N:3,B:3,R:5,Q:9,K:10};
function strip(m){return m?{from:m.from,to:m.to,piece:m.piece,captured:m.captured,promo:m.promo,flag:m.flag}:null;}
// returns {move, score (side-to-move view), pv:[moves], depth}
function search(s,maxDepth,opts){
  opts=opts||{};
  const start=Date.now(),limit=opts.timeMs||1e9,noise=opts.noise||0,useQ=opts.qs!==false;
  let nodes=0,canAbort=false;const ABORT={};
  const tick=()=>{if((++nodes&1023)===0&&canAbort&&Date.now()-start>limit)throw ABORT;};
  const order=(moves,pv)=>{for(const m of moves){let sc=0;if(m.captured)sc=10000+ORDV[m.captured[1]]*100-ORDV[m.piece[1]];if(m.promo)sc+=m.promo==='Q'?9000:100;if(pv&&sameMove(m,pv))sc=1e7;m._o=sc;}moves.sort((a,b)=>b._o-a._o);};
  function qs(st,alpha,beta,qd){
    tick();const stand=evalSide(st);if(stand>=beta)return stand;if(stand>alpha)alpha=stand;if(qd>=8)return alpha;
    const c=st.turn,o=opp(c),moves=pseudoMoves(st).filter(m=>m.captured||m.promo==='Q');order(moves);
    for(const m of moves){const ns=makeMove(st,m),k=ns.board.indexOf(c+'K');if(k>=0&&attacked(ns.board,k,o))continue;
      const sc=-qs(ns,-beta,-alpha,qd+1);if(sc>=beta)return sc;if(sc>alpha)alpha=sc;}
    return alpha;
  }
  const pvTable=[];
  function nm(st,d,alpha,beta,ply){
    tick();pvTable[ply]=[];
    if(st.half>=100)return 0;
    if(d<=0)return useQ?qs(st,alpha,beta,0):evalSide(st);
    const c=st.turn,o=opp(c),moves=pseudoMoves(st);order(moves,prevPV[ply]);
    let legal=0,best=-Infinity;
    for(const m of moves){const ns=makeMove(st,m),k=ns.board.indexOf(c+'K');if(k>=0&&attacked(ns.board,k,o))continue;legal++;
      const sc=-nm(ns,d-1,-beta,-alpha,ply+1);
      if(sc>best){best=sc;if(sc>alpha){alpha=sc;pvTable[ply]=[m].concat(pvTable[ply+1]||[]);}}
      if(alpha>=beta)break;}
    if(!legal)return inCheck(st)?-MATE+ply:0;
    return best;
  }
  let prevPV=[];
  const root=legalMoves(s);
  if(!root.length)return {move:null,score:inCheck(s)?-MATE:0,pv:[],depth:0,nodes:0};
  let bestMove=root[0],bestScore=-Infinity,bestPV=[root[0]],done=0;
  for(let d=1;d<=maxDepth;d++){
    canAbort=d>1;
    try{
      order(root,bestMove);let alpha=-Infinity,cb=null,cs=-Infinity,cpv=null;
      for(const m of root){const ns=makeMove(s,m);
        let sc=noise?-nm(ns,d-1,-Infinity,Infinity,1):-nm(ns,d-1,-Infinity,-alpha,1);
        if(noise&&Math.abs(sc)<MATE-1000)sc+=(Math.random()*2-1)*noise;
        if(sc>cs){cs=sc;cb=m;cpv=[m].concat(pvTable[1]||[]);}
        if(sc>alpha)alpha=sc;}
      bestMove=cb;bestScore=cs;bestPV=cpv;done=d;prevPV=[null].concat(cpv.slice(1));
      if(cs>MATE-1000||cs<-MATE+1000)break;
      if(Date.now()-start>limit*0.6)break;
    }catch(e){if(e!==ABORT)throw e;break;}
  }
  return {move:strip(bestMove),score:Math.round(bestScore),pv:bestPV.map(strip),depth:done,nodes};
}
// score every root move (for the coach). returns [{move,score}] sorted best first
function scoreMoves(s,depth,opts){
  opts=opts||{};const res=[];const moves=legalMoves(s);
  const per=(opts.timeMs||2000)/Math.max(1,moves.length);
  for(const m of moves){const ns=makeMove(s,m);let sc;
    if(!legalMoves(ns).length)sc=inCheck(ns)?MATE-1:0;
    else{const r=search(ns,depth-1,{timeMs:per,qs:true});sc=-r.score;if(sc>MATE-1000)sc-=1;}
    res.push({move:strip(m),score:sc});}
  res.sort((a,b)=>b.score-a.score);return res;
}
