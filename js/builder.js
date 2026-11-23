/* РельсЛаб · конструктор путей */
/* ---- BUILDER: конструктор путей на сетке ---- */
(function builder(){
  const RL = window.RL;
  const {NS,$,el$,svgEl,mmss,clamp}=RL;
  const FX=()=>RL.RailFX;

  const MAX_CARS=8;
  const CS=50,COLS=16,ROWS=9,W=COLS*CS,H=ROWS*CS;
  const DX=[0,1,0,-1],DY=[-1,0,1,0];
  const MX=[25,50,25,0],MY=[0,25,50,25];
  const NAMES=['С','В','Ю','З'];
  const QL=25*Math.PI/2;
  const LOOK=120,STEP=2,GAP=10,TRAILN=MAX_CARS*GAP+16,DISP=8;
  const tailLen=tr=>(tr.len-1)*GAP+12;
  const effAcc=tr=>110/(1+(tr.len-1)*0.11);
  const effDec=tr=>190/(1+(tr.len-1)*0.08);

  const DEFS=[
    {id:'А',name:'Поезд А',auto:false,vmax:120,color:'var(--accent)'},
    {id:'Б',name:'Поезд Б',auto:true,vmax:90,color:'var(--t-a)'},
    {id:'В',name:'Поезд В',auto:true,vmax:75,color:'var(--t-b)'}
  ];

  /* ---- tabs ---- */
  const tabP=el$('tab-preset'),tabB=el$('tab-build'),simP=el$('sim-preset'),simB=el$('sim-build'),txtP=el$('sim-text-p'),txtB=el$('sim-text-b');
  let pausedByTab=false;
  function showTab(b){
    const pb=el$('play');
    simP.hidden=b;simB.hidden=!b;txtP.hidden=b;txtB.hidden=!b;
    tabP.classList.toggle('on',!b);tabB.classList.toggle('on',b);
    tabP.setAttribute('aria-selected',String(!b));tabB.setAttribute('aria-selected',String(b));
    if(b&&pb.textContent==='Пауза'){pb.click();pausedByTab=true}
    if(!b&&pausedByTab){pb.click();pausedByTab=false}
  }
  tabP.addEventListener('click',()=>showTab(false));
  tabB.addEventListener('click',()=>showTab(true));

  /* ---- track data ---- */
  const ehor=new Uint8Array(ROWS*COLS),ever=new Uint8Array(ROWS*COLS);
  const swSt={};let cells=[],swList=[],total=0,blkEls=[];

  function has(r,c,s){
    if(s===0)return r>0&&!!ever[(r-1)*COLS+c];
    if(s===2)return r<ROWS-1&&!!ever[r*COLS+c];
    if(s===1)return c<COLS-1&&!!ehor[r*COLS+c];
    return c>0&&!!ehor[r*COLS+c-1];
  }
  function setEdge(r1,c1,r2,c2,v){if(r1===r2)ehor[r1*COLS+Math.min(c1,c2)]=v;else ever[Math.min(r1,r2)*COLS+c1]=v}
  function eraseCell(r,c){for(let s=0;s<4;s++)if(has(r,c,s))setEdge(r,c,r+DY[s],c+DX[s],0)}
  function clearAll(){ehor.fill(0);ever.fill(0);for(const k in swSt)delete swSt[k]}
  function line(r1,c1,r2,c2){
    const dr=r2>r1?1:(r2<r1?-1:0),dc=c2>c1?1:(c2<c1?-1:0);let r=r1,c=c1;
    while(r!==r2||c!==c2){setEdge(r,c,r+dr,c+dc,1);r+=dr;c+=dc}
  }
  function loadSample(){
    clearAll();
    line(1,1,1,14);line(1,14,7,14);line(7,14,7,1);line(7,1,1,1);
    line(3,4,3,11);line(3,11,5,11);line(5,11,5,4);line(5,4,3,4);
    line(1,6,3,6);line(7,9,5,9);
  }

  /* routing */
  function route(cell,f){
    if(!cell.op[f])return -2;
    if(cell.deg===1)return -1;
    if(cell.deg===2){for(let s=0;s<4;s++)if(s!==f&&cell.op[s])return s;return -2}
    if(cell.deg===4)return (f+2)%4;
    if(cell.deg===3){
      const{a,b,cc,st}=cell;
      if(st===0)return f===a?b:(f===b?a:-2);
      if(st===1)return f===cc?a:(f===a?cc:-2);
      return f===cc?b:(f===b?cc:-2);
    }
    return -2;
  }
  function plen(f,t){return t<0?25:(t===(f+2)%4?CS:QL)}
  function lpt(f,t,u){
    let k,dx,dy;
    if(t<0){k=Math.min(1,u/25);return{x:MX[f]+(25-MX[f])*k,y:MY[f]+(25-MY[f])*k,a:Math.atan2(25-MY[f],25-MX[f])*180/Math.PI}}
    if(t===(f+2)%4){k=Math.min(1,u/CS);dx=MX[t]-MX[f];dy=MY[t]-MY[f];return{x:MX[f]+dx*k,y:MY[f]+dy*k,a:Math.atan2(dy,dx)*180/Math.PI}}
    const cx=(f===1||t===1)?CS:0,cy=(f===2||t===2)?CS:0;
    const a0=Math.atan2(MY[f]-cy,MX[f]-cx),a1=Math.atan2(MY[t]-cy,MX[t]-cx);let d=a1-a0;
    while(d>Math.PI)d-=2*Math.PI;
    while(d<=-Math.PI)d+=2*Math.PI;
    const ang=a0+d*Math.min(1,u/QL),sg=d>0?1:-1;
    return{x:cx+25*Math.cos(ang),y:cy+25*Math.sin(ang),a:(ang+sg*Math.PI/2)*180/Math.PI};
  }
  function gsample(st){const q=lpt(st.f,st.t,st.u);return{x:st.c*CS+q.x,y:st.r*CS+q.y,a:q.a,k:st.r*COLS+st.c,s:{r:st.r,c:st.c,f:st.f,t:st.t,u:st.u}}}
  function segD(r,c,f,t){
    const ox=c*CS,oy=r*CS;
    if(t<0)return 'M'+(ox+MX[f])+' '+(oy+MY[f])+'L'+(ox+25)+' '+(oy+25);
    if(t===(f+2)%4)return 'M'+(ox+MX[f])+' '+(oy+MY[f])+'L'+(ox+MX[t])+' '+(oy+MY[t]);
    const cx=(f===1||t===1)?CS:0,cy=(f===2||t===2)?CS:0;
    const a0=Math.atan2(MY[f]-cy,MX[f]-cx),a1=Math.atan2(MY[t]-cy,MX[t]-cx);let d=a1-a0;
    while(d>Math.PI)d-=2*Math.PI;
    while(d<=-Math.PI)d+=2*Math.PI;
    return 'M'+(ox+MX[f])+' '+(oy+MY[f])+'A25 25 0 0 '+(d>0?1:0)+' '+(ox+MX[t])+' '+(oy+MY[t]);
  }
  function conns(ce){
    const o=[];
    if(ce.deg===1){for(let s=0;s<4;s++)if(ce.op[s])o.push([s,-1])}
    else if(ce.deg===2){let s1=-1,s2=-1;for(let s=0;s<4;s++)if(ce.op[s]){if(s1<0)s1=s;else s2=s}o.push([s1,s2])}
    else if(ce.deg===3)o.push([ce.a,ce.b],[ce.cc,ce.a],[ce.cc,ce.b]);
    else if(ce.deg===4)o.push([0,2],[1,3]);
    return o;
  }

  /* ---- SVG layers ---- */
  const svg=el$('cstage');
  const gGrid=svgEl('g',{},svg);
  let gd='';
  for(let i=0;i<=COLS;i++)gd+='M'+(i*CS)+' 0V'+H;
  for(let i=0;i<=ROWS;i++)gd+='M0 '+(i*CS)+'H'+W;
  svgEl('path',{d:gd,'class':'gridl'},gGrid);
  const bedP=svgEl('path',{'class':'bed','stroke-linecap':'round'},svg);
  const tieP=svgEl('path',{'class':'tie'},svg);
  const clP=svgEl('path',{'class':'cl'},svg);
  const bufP=svgEl('path',{'class':'buf'},svg);
  const gBlk=svgEl('g',{},svg);
  const routeP=svgEl('path',{'class':'route on'},svg);
  const hov=svgEl('rect',{width:CS,height:CS,'class':'hov',visibility:'hidden'},svg);
  const gTr=svgEl('g',{},svg);
  const gCv=svgEl('g',{hidden:'true'},svg);
  const crashEl=svgEl('circle',{'class':'crash',r:18,cx:0,cy:0},svg);
  const gSw=svgEl('g',{},svg);

  svgEl('text',{x:16,y:24,'class':'cv-hud'},gCv).textContent='CAM_GRID · YOLOv8-RAIL · ДЕТЕКЦИЯ СОСТАВОВ';
  const tgs=[],cvItems=[];
  DEFS.forEach(d=>{
    const g=svgEl('g',{},gTr),cars=[];
    const beam=svgEl('use',{href:'#c-beam-shape','class':'headlight'},g);
    for(let k=0;k<MAX_CARS;k++){
      const cg=svgEl('g',{},g);
      svgEl('rect',{x:-9,y:-4.5,width:18,height:9,rx:2,'class':'car',style:'fill:'+d.color+(k===0?'':';fill-opacity:.72')},cg);
      if(k===0)svgEl('rect',{x:2,y:-3,width:5,height:6,rx:1,'class':'cab'},cg);
      else svgEl('rect',{x:-5,y:-2.5,width:10,height:5,rx:1,'class':'cargo-stripe'},cg);
      cars.push(cg);
    }
    const hornRing=svgEl('circle',{r:10,'class':'horn-ring'},g);
    const tg=svgEl('g',{},g);
    svgEl('rect',{x:-8,y:-9,width:16,height:15,rx:3,'class':'tagbg'},tg);
    const tx=svgEl('text',{y:2,'class':'tag'},tg);tx.textContent=d.id;
    g.setAttribute('display','none');
    tgs.push({g,cars,tag:tg,beam,hornRing});
    const cg2=svgEl('g',{display:'none'},gCv);
    cvItems.push({g:cg2,box:svgEl('rect',{x:0,y:0,width:20,height:20,rx:3,'class':'cv-box'},cg2),bg:svgEl('rect',{x:0,y:0,width:118,height:15,rx:2,'class':'cv-lbl-bg'},cg2),tx:svgEl('text',{x:0,y:0,'class':'cv-lbl'},cg2)});
  });

  /* ---- state ---- */
  let trains=[],mode='build',tool='draw',drawing=false,lastC=null,initLen=3,cvOn=false;
  let running=!RL.reducedMotion(),crashed=false,simT=0,dispT=2,uiT=1,stuckT=0,dlShown=false,failK=-1,failF=-1;
  const logs=[];
  const spd=el$('c-spd'),lenA=el$('c-lenA'),initLenEl=el$('c-init-len'),atp=el$('c-atp'),disp=el$('c-disp');
  const cLog=el$('c-log'),cAlert=el$('c-alert'),cStatus=el$('c-status'),liveBuild=el$('live-build');
  const cLenAv=el$('c-lenAv'),cLenADec=el$('c-lenA-dec'),cLenAInc=el$('c-lenA-inc');

  function log(msg){
    logs.unshift(mmss(simT)+'  '+msg);
    if(logs.length>5)logs.pop();
    cLog.textContent='';
    for(const l of logs){const li=document.createElement('li');li.textContent=l;cLog.appendChild(li)}
  }
  function showAlert(t){cAlert.textContent=t;cAlert.hidden=false}
  function hideAlert(){cAlert.hidden=true}
  function lab(k){return 'блок '+(Math.floor(k/COLS)+1)+'·'+(k%COLS+1)}

  function setTrainLen(idx,newLen,silent){
    const tr=trains[idx];if(!tr)return;
    newLen=clamp(newLen,1,MAX_CARS);if(tr.len===newLen)return;
    tr.len=newLen;
    const tg=tgs[idx];
    for(let k=0;k<MAX_CARS;k++)tg.cars[k].setAttribute('display',k<newLen?'inline':'none');
    if(idx===0){
      lenA.value=String(newLen);cLenAv.textContent=newLen+' ваг.';
      cLenADec.disabled=(newLen<=1);cLenAInc.disabled=(newLen>=MAX_CARS);
    }
    if(!silent){log(tr.name+': длина состава '+newLen+' ваг.');FX().relay()}
    ui();
  }

  /* ---- rebuild grid ---- */
  function rebuild(){
    cells=[];swList=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      const k=r*COLS+c;
      const op=[has(r,c,0),has(r,c,1),has(r,c,2),has(r,c,3)];let deg=0;
      for(let s=0;s<4;s++)if(op[s])deg++;
      const ce={r,c,k,op,deg,a:-1,b:-1,cc:-1,st:0,num:0,mk:null,btn:null};
      if(deg===3){
        let m=0;for(let s=0;s<4;s++)if(!op[s])m=s;
        const p1=(m+1)%4,p2=(m+3)%4;
        ce.a=Math.min(p1,p2);ce.b=Math.max(p1,p2);ce.cc=(m+2)%4;
        ce.st=swSt[k]||0;ce.num=swList.length+1;swList.push(ce);
      }
      cells[k]=ce;
    }
    drawTrack();
  }
  function swText(ce){const pr=ce.st===0?[ce.a,ce.b]:(ce.st===1?[ce.cc,ce.a]:[ce.cc,ce.b]);return NAMES[pr[0]]+'–'+NAMES[pr[1]]}
  function drawTrack(){
    let dAll='',dBuf='';
    gBlk.textContent='';blkEls=[];total=0;
    for(let i=0;i<cells.length;i++){
      const ce=cells[i];if(ce.deg<1)continue;
      total++;
      let dd='';const cs=conns(ce);
      cs.forEach(p=>{dd+=segD(ce.r,ce.c,p[0],p[1])});
      dAll+=dd;
      if(ce.deg===1){
        let s=0;while(!ce.op[s])s++;
        const cx=ce.c*CS+25,cy=ce.r*CS+25;
        dBuf+=(s===0||s===2)?('M'+(cx-8)+' '+cy+'H'+(cx+8)):('M'+cx+' '+(cy-8)+'V'+(cy+8));
      }
      blkEls.push({k:ce.k,el:svgEl('path',{d:dd,'class':'blk'},gBlk)});
    }
    bedP.setAttribute('d',dAll);tieP.setAttribute('d',dAll);clP.setAttribute('d',dAll);bufP.setAttribute('d',dBuf);
    gSw.textContent='';
    const list=el$('c-swl');list.textContent='';
    swList.forEach(ce=>{
      const g=svgEl('g',{'class':'swm',role:'button',tabindex:'0','aria-label':'Стрелка '+ce.num},gSw);
      const tt=svgEl('title',{},g);tt.textContent='Стрелка '+ce.num+': переключить';
      svgEl('circle',{cx:ce.c*CS+25,cy:ce.r*CS+25,r:11},g);
      const tx=svgEl('text',{x:ce.c*CS+25,y:ce.r*CS+29},g);tx.textContent=String(ce.num);
      g.addEventListener('click',()=>userSw(ce));
      g.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();userSw(ce)}});
      ce.mk=g;
      const b=document.createElement('button');b.type='button';b.className='btn';
      b.addEventListener('click',()=>userSw(ce));
      list.appendChild(b);ce.btn=b;
    });
    if(!swList.length){
      const p=document.createElement('p');p.className='hint';
      p.textContent='Стрелок пока нет. Подведите ответвление к любому пути, и на развилке появится стрелка.';
      list.appendChild(p);
    }
    paintSw();
  }
  function paintSw(){
    let d='';
    swList.forEach(ce=>{
      const pr=ce.st===0?[ce.a,ce.b]:(ce.st===1?[ce.cc,ce.a]:[ce.cc,ce.b]);
      d+=segD(ce.r,ce.c,pr[0],pr[1]);
      ce.mk.classList.toggle('on',ce.st!==0);
      ce.btn.textContent='Стрелка '+ce.num+' · '+NAMES[pr[0]]+'–'+NAMES[pr[1]];
    });
    routeP.setAttribute('d',d);
  }
  function setSw(ce,s,by){
    ce.st=s;swSt[ce.k]=s;paintSw();
    if(mode==='run'){
      if(by==='user')FX().relay();
      log('Стрелка '+ce.num+(by==='auto'?' (диспетчер)':'')+': '+swText(ce));
    }
  }
  function unionOcc(){const o={};trains.forEach(t=>{const x=occ(t);for(const k in x)o[k]=1});return o}
  function userSw(ce){
    if(mode==='run'){
      if(unionOcc()[ce.k]){log('Стрелка '+ce.num+' занята составом, переключить нельзя');return}
      if(disp.checked){disp.checked=false;log('Автодиспетчер выключен, стрелки ваши')}
    }
    setSw(ce,(ce.st+1)%3,'user');
  }
  function fixSw(k,f){
    const ce=cells[k];
    if(!ce||ce.deg!==3||unionOcc()[k])return false;
    const opts=[];const save=ce.st;
    for(let s=0;s<3;s++){ce.st=s;if(route(ce,f)>=0)opts.push(s)}
    ce.st=save;
    if(!opts.length)return false;
    setSw(ce,opts[Math.floor(Math.random()*opts.length)],'auto');
    return true;
  }

  /* ---- movement ---- */
  function adv(st,ds){
    let u=st.u+ds;
    for(let g=0;g<8;g++){
      const L=plen(st.f,st.t);
      if(st.t<0){if(u>=L){st.u=L;return 1}st.u=u;return 0}
      if(u<L){st.u=u;return 0}
      const nr=st.r+DY[st.t],nc=st.c+DX[st.t];
      if(nr<0||nc<0||nr>=ROWS||nc>=COLS){st.u=L;return 1}
      const nf=(st.t+2)%4,nt=route(cells[nr*COLS+nc],nf);
      if(nt===-2){failK=nr*COLS+nc;failF=nf;st.u=L;return 2}
      u-=L;st.r=nr;st.c=nc;st.f=nf;st.t=nt;
    }
    st.u=u;return 0;
  }
  function back(st,ds){
    let u=st.u-ds;
    for(let g=0;g<8;g++){
      if(u>=0){st.u=u;return true}
      const pr=st.r+DY[st.f],pc=st.c+DX[st.f];
      if(pr<0||pc<0||pr>=ROWS||pc>=COLS)return false;
      const pt=(st.f+2)%4,pcell=cells[pr*COLS+pc];let pf=-1;
      for(let s=0;s<4;s++)if(s!==pt&&pcell.op[s]&&route(pcell,s)===pt){pf=s;break}
      if(pf<0)return false;
      st.r=pr;st.c=pc;st.f=pf;st.t=pt;u+=plen(pf,pt);
    }
    return false;
  }
  const occ=tr=>{const o={},a=tr.trail,n=a.length,tl=tailLen(tr);for(let i=Math.max(0,n-tl);i<n;i++)o[a[i].k]=1;return o};
  function pushTrail(tr){tr.trail.push(gsample(tr.st));if(tr.trail.length>TRAILN+4)tr.trail.shift()}
  function blocked(i,k,occs,plans){
    for(let j=0;j<trains.length;j++){
      if(j===i)continue;
      if(occs[j][k])return true;
      if(j<i&&plans[j]&&plans[j].claims[k])return true;
    }
    return false;
  }
  function plan(i,occs,plans,ignoreBlocks){
    const tr=trains[i],own=occs[i],claims={};
    const st={r:tr.st.r,c:tr.st.c,f:tr.st.f,t:tr.st.t,u:tr.st.u};
    const res={db:Infinity,bk:-1,dt:Infinity,why:'',sw:-1,swf:-1,claims};
    let d=0,rc,k;
    const maxLook=LOOK+(tr.len-1)*10;
    while(d<maxLook){
      rc=adv(st,STEP);d+=STEP;
      if(rc){res.dt=d;res.why=rc===1?'тупик':'стрелка';res.sw=failK;res.swf=failF;break}
      k=st.r*COLS+st.c;
      if(!own[k]&&res.db===Infinity){
        if(blocked(i,k,occs,plans)){res.db=d;res.bk=k;if(!ignoreBlocks)break}
        else claims[k]=1;
      }
    }
    return res;
  }

  /* ---- spawn ---- */
  function pickStart(){
    const comp=new Array(ROWS*COLS).fill(undefined),sizes=[];
    for(let k=0;k<cells.length;k++){
      if(cells[k].deg<1||comp[k]!==undefined)continue;
      const id=sizes.length;sizes.push(0);const q=[k];comp[k]=id;
      while(q.length){
        const x=q.pop();sizes[id]++;const ce=cells[x];
        for(let s=0;s<4;s++)if(ce.op[s]){const nk=(ce.r+DY[s])*COLS+ce.c+DX[s];if(comp[nk]===undefined){comp[nk]=id;q.push(nk)}}
      }
    }
    let best=-1;
    for(let i=0;i<sizes.length;i++)if(best<0||sizes[i]>sizes[best])best=i;
    if(best<0)return null;
    for(let k=0;k<cells.length;k++){
      const ce=cells[k];
      if(comp[k]===best&&ce.deg===2){
        let f=-1,t=-1;
        for(let s=0;s<4;s++)if(ce.op[s]){if(f<0)f=s;else t=s}
        return{r:ce.r,c:ce.c,f,t,u:25};
      }
    }
    return null;
  }
  function trace(start){
    const out=[],seen={};let st={r:start.r,c:start.c,f:start.f,t:start.t},g=0;
    while(g++<400){
      const key=st.r+','+st.c+','+st.f;
      if(seen[key])break;
      seen[key]=1;out.push({r:st.r,c:st.c,f:st.f,t:st.t,u:25});
      if(st.t<0)break;
      const nr=st.r+DY[st.t],nc=st.c+DX[st.t];
      if(nr<0||nc<0||nr>=ROWS||nc>=COLS)break;
      const nf=(st.t+2)%4,nt=route(cells[nr*COLS+nc],nf);
      if(nt===-2)break;
      st={r:nr,c:nc,f:nf,t:nt};
    }
    return out;
  }
  const eligible=s=>{const d=cells[s.r*COLS+s.c].deg;return d===2||d===4};
  function pickIndex(tr,want,used){
    const offs=[0,1,-1,2,-2,3,-3];
    for(const o of offs){
      const idx=want+o;
      if(idx<0||idx>=tr.length||!eligible(tr[idx]))continue;
      if(used.every(u=>Math.abs(u-idx)>=3))return idx;
    }
    return clamp(want,0,tr.length-1);
  }
  function mkTrail(st0){
    const s={r:st0.r,c:st0.c,f:st0.f,t:st0.t,u:st0.u};
    const arr=[gsample(s)];
    for(let i=1;i<TRAILN;i++){if(!back(s,STEP))break;arr.unshift(gsample(s))}
    while(arr.length<TRAILN)arr.unshift(arr[0]);
    return arr;
  }
  function spawnAll(){
    const st0=pickStart();if(!st0)return false;
    const tr=trace(st0),n=tr.length,m=Math.min(3,Math.floor(n/4));
    if(m<1)return false;
    const picks=[0];
    for(let j=1;j<m;j++)picks.push(pickIndex(tr,Math.floor(j*n/m),picks));
    trains=[];
    for(let j=0;j<m;j++){
      const s=tr[picks[j]],d=DEFS[j];
      trains.push({def:d,name:d.name,auto:d.auto,vmax:d.vmax,len:initLen,
        st:{r:s.r,c:s.c,f:s.f,t:s.t,u:25},trail:mkTrail(s),
        v:d.auto?d.vmax*0.7:(+spd.value/100*d.vmax),acc:0,jointAcc:0,hornT:0,wait:false,why:'',by:-1,waitT:0});
    }
    tgs.forEach((t,i)=>{
      const active=i<trains.length;
      t.g.setAttribute('display',active?'inline':'none');
      cvItems[i].g.setAttribute('display',active?'inline':'none');
      if(active)for(let k=0;k<MAX_CARS;k++)t.cars[k].setAttribute('display',k<trains[i].len?'inline':'none');
    });
    lenA.value=String(trains[0].len);cLenAv.textContent=trains[0].len+' ваг.';
    cLenADec.disabled=(trains[0].len<=1);cLenAInc.disabled=(trains[0].len>=MAX_CARS);
    return true;
  }
  function reverseTrain(tr){
    const a=tr.trail,n=a.length,out=[];
    for(let i=0;i<n;i++)if(a[i].s.t<0)return false;
    for(let i=n-1;i>=0;i--){
      const q=a[i].s;
      out.push(gsample({r:q.r,c:q.c,f:q.t,t:q.f,u:plen(q.f,q.t)-q.u}));
    }
    const h=out[out.length-1].s;
    tr.trail=out;tr.st={r:h.r,c:h.c,f:h.f,t:h.t,u:h.u};tr.v=0;tr.acc=0;tr.waitT=0;
    return true;
  }
  function crash(a,b,x,y){
    crashed=true;trains.forEach(t=>{t.v=0});
    crashEl.setAttribute('cx',x.toFixed(1));crashEl.setAttribute('cy',y.toFixed(1));crashEl.classList.add('on');
    showAlert('Столкновение. Включите защиту и нажмите «Сброс».');
    FX().chime(true);log('СТОЛКНОВЕНИЕ: '+a.name+' и '+b.name);
  }
  function resetScene(){
    crashed=false;crashEl.classList.remove('on');hideAlert();
    swList.forEach(ce=>{ce.st=0;swSt[ce.k]=0});paintSw();
    dispT=2;stuckT=0;dlShown=false;
    if(!spawnAll()){setMode('build');showAlert('Путь изменился: поезда негде поставить.');return}
    log('Сцена сброшена');
  }

  /* ---- update ---- */
  function update(dt){
    simT+=dt;
    const n=trains.length,occs=trains.map(occ),plans=[],claimed={};
    for(let i=0;i<n;i++)plans[i]=plan(i,occs,plans,!trains[i].auto&&!atp.checked);
    for(let i=0;i<n;i++){
      const tr=trains[i],pl=plans[i],man=!tr.auto,dec=effDec(tr),acc=effAcc(tr);
      if(tr.hornT>0)tr.hornT=Math.max(0,tr.hornT-dt);
      for(const k in pl.claims)claimed[k]=1;
      const lim=(!man||atp.checked)?Math.min(pl.db,pl.dt):pl.dt;
      const vAll=Math.min(tr.vmax,Math.sqrt(2*dec*0.7*Math.max(0,lim-12)));
      const want=man?(+spd.value/100*tr.vmax):tr.vmax;
      const wait=lim<Infinity&&vAll<3&&(!man||want>3);
      const vT=man?Math.min(want,vAll):vAll;
      if(tr.v<vT)tr.v=Math.min(vT,tr.v+acc*dt);else tr.v=Math.max(vT,tr.v-dec*dt);
      let why='';
      if(wait)why=(lim===pl.dt)?(pl.why==='тупик'?'впереди тупик':'стрелка закрыта'):(lab(pl.bk)+' занят');
      if(wait&&!tr.wait)log(tr.name+' остановлен: '+why);
      if(!wait&&tr.wait)log(tr.name+' продолжил движение');
      tr.wait=wait;tr.why=why;tr.by=-1;
      if(wait&&lim!==pl.dt&&pl.bk>=0)for(let jj=0;jj<n;jj++)if(jj!==i&&occs[jj][pl.bk]){tr.by=jj;break}
      if(wait&&disp.checked&&lim===pl.dt&&pl.why==='стрелка'&&pl.sw>=0)fixSw(pl.sw,pl.swf);
      tr.acc+=tr.v*dt;
      if(i===0&&tr.v>8){tr.jointAcc+=tr.v*dt;if(tr.jointAcc>=95){tr.jointAcc=0;FX().clack(tr.len)}}
      while(tr.acc>=STEP){tr.acc-=STEP;adv(tr.st,STEP);pushTrail(tr)}
    }
    for(const tw of trains){if(tw.wait&&tw.by>=0)tw.waitT+=dt;else tw.waitT=0}
    // deadlock → разворот
    for(let i=0;i<n;i++){
      const t1=trains[i];
      if(t1.waitT>4&&t1.by>=0&&trains[t1.by].waitT>4){
        const b1=t1.by;let pick=-1;
        if(t1.auto&&(!trains[b1].auto||i>b1))pick=i;else if(trains[b1].auto)pick=b1;
        if(pick>=0&&reverseTrain(trains[pick]))log(trains[pick].name+' развёрнут: встречное движение');
        else t1.waitT=0;
        break;
      }
    }
    if(!atp.checked&&!crashed&&n>1){
      const m=trains[0],h=m.trail[m.trail.length-1];
      for(let j=1;j<n&&!crashed;j++){
        const oLen=tailLen(trains[j]),o=trains[j].trail.slice(-oLen);
        for(let q=0;q<o.length;q++)if(Math.hypot(h.x-o[q].x,h.y-o[q].y)<12){crash(m,trains[j],(h.x+o[q].x)/2,(h.y+o[q].y)/2);break}
        const mLen=tailLen(m),mTail=m.trail.slice(-mLen),jh=trains[j].trail[trains[j].trail.length-1];
        for(let q2=0;q2<mTail.length&&!crashed;q2++)if(Math.hypot(jh.x-mTail[q2].x,jh.y-mTail[q2].y)<12){crash(trains[j],m,(jh.x+mTail[q2].x)/2,(jh.y+mTail[q2].y)/2);break}
      }
    }
    if(disp.checked&&!crashed&&swList.length){
      dispT+=dt;
      if(dispT>=DISP){
        dispT=0;
        const oc=unionOcc();
        const cand=swList.filter(ce=>!oc[ce.k]&&!claimed[ce.k]);
        if(cand.length){const ce2=cand[Math.floor(Math.random()*cand.length)];setSw(ce2,(ce2.st+1+Math.floor(Math.random()*2))%3,'auto')}
      }
    }
    const allWait=n>1&&trains.every(t=>t.wait);
    stuckT=allWait?stuckT+dt:0;
    if(stuckT>5&&!dlShown&&!crashed){dlShown=true;showAlert('Все поезда стоят. Проверьте стрелки и тупики или нажмите «Сброс».')}
    if(stuckT===0&&dlShown){dlShown=false;hideAlert()}
  }

  /* ---- draw ---- */
  function draw(){
    const all={};
    const day=document.documentElement.getAttribute('data-theme')==='light';
    trains.forEach((tr,ti)=>{
      const g=tgs[ti];let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
      for(let k=0;k<tr.len;k++){
        const idx=Math.max(0,tr.trail.length-1-k*GAP),p=tr.trail[idx];
        g.cars[k].setAttribute('transform','translate('+p.x.toFixed(1)+' '+p.y.toFixed(1)+') rotate('+p.a.toFixed(1)+')');
        if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
        if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
      }
      const h=tr.trail[tr.trail.length-1];
      g.beam.setAttribute('transform','translate('+h.x.toFixed(1)+' '+h.y.toFixed(1)+') rotate('+h.a.toFixed(1)+')');
      g.beam.setAttribute('visibility',(!day&&tr.v>1)?'visible':'hidden');
      if(tr.hornT>0){
        const prog=1-(tr.hornT/0.65);
        g.hornRing.setAttribute('cx',h.x.toFixed(1));g.hornRing.setAttribute('cy',h.y.toFixed(1));
        g.hornRing.setAttribute('r',(10+prog*32).toFixed(1));g.hornRing.style.opacity=String((1-prog)*0.85);
      }else g.hornRing.style.opacity='0';
      g.tag.setAttribute('transform','translate('+h.x.toFixed(1)+' '+(h.y-17).toFixed(1)+')');
      if(cvOn){
        const cv=cvItems[ti],bx=minX-12,by=minY-12,bw=(maxX-minX)+24,bh=(maxY-minY)+24;
        cv.box.setAttribute('x',bx.toFixed(1));cv.box.setAttribute('y',by.toFixed(1));
        cv.box.setAttribute('width',bw.toFixed(1));cv.box.setAttribute('height',bh.toFixed(1));
        cv.box.classList.toggle('warn',tr.wait);
        const lbl=tr.def.id+' · '+tr.len+' ваг · '+Math.round(tr.v*0.8)+' км/ч';
        const lw=lbl.length*6.1+8,lx=bx,ly=Math.max(16,by-17);
        cv.bg.setAttribute('x',lx.toFixed(1));cv.bg.setAttribute('y',ly.toFixed(1));cv.bg.setAttribute('width',lw.toFixed(1));
        cv.bg.classList.toggle('warn',tr.wait);
        cv.tx.setAttribute('x',(lx+4).toFixed(1));cv.tx.setAttribute('y',(ly+11).toFixed(1));
        cv.tx.classList.toggle('warn',tr.wait);cv.tx.textContent=lbl;
      }
      const o=occ(tr);for(const k in o)all[k]=1;
    });
    for(const b of blkEls)b.el.classList.toggle('on',!!all[b.k]);
  }
  function clearBlk(){for(const b of blkEls)b.el.classList.remove('on')}

  /* ---- ui ---- */
  const cTstate=el$('c-tstate');
  let cRows=[];
  function rebuildRows(){
    cTstate.textContent='';cRows=[];
    trains.forEach((tr,idx)=>{
      const li=document.createElement('li');
      const sw=document.createElement('i');sw.className='sw';sw.style.background=tr.def.color;
      const box=document.createElement('div');
      const b=document.createElement('b');b.textContent=tr.name;
      const s=document.createElement('span');s.className='s';
      box.appendChild(b);box.appendChild(s);
      const stp=document.createElement('div');stp.className='stepper';
      const bDec=document.createElement('button');bDec.type='button';bDec.className='step-btn';bDec.textContent='−';
      bDec.setAttribute('aria-label','Уменьшить '+tr.name);
      bDec.addEventListener('click',()=>setTrainLen(idx,trains[idx].len-1,false));
      const num=document.createElement('span');num.className='step-num';
      const bInc=document.createElement('button');bInc.type='button';bInc.className='step-btn';bInc.textContent='+';
      bInc.setAttribute('aria-label','Увеличить '+tr.name);
      bInc.addEventListener('click',()=>setTrainLen(idx,trains[idx].len+1,false));
      stp.appendChild(bDec);stp.appendChild(num);stp.appendChild(bInc);
      li.appendChild(sw);li.appendChild(box);li.appendChild(stp);cTstate.appendChild(li);
      cRows.push({s,num,bDec,bInc});
    });
  }
  function ui(){
    if(cRows.length!==trains.length)rebuildRows();
    trains.forEach((tr,idx)=>{
      const row=cRows[idx];
      row.num.textContent=tr.len+' ваг.';
      row.bDec.disabled=(tr.len<=1);row.bInc.disabled=(tr.len>=MAX_CARS);
      const pct=Math.round(tr.v/tr.vmax*100);
      const st=crashed?'авария':(tr.wait?('ждёт: '+tr.why):(tr.v<2?'стоит':'идёт'));
      row.s.textContent=(tr.auto?'авто':'ручн.')+' · '+pct+'% · '+st;
    });
    let cnt=0;const o=unionOcc();for(const k in o)cnt++;
    cStatus.textContent=mode==='run'
      ?('Блоков занято: '+cnt+' из '+total+' · стрелок: '+swList.length)
      :('Клеток пути: '+total+' · стрелок: '+swList.length);
  }

  /* ---- modes ---- */
  const cModeBtn=el$('c-mode');
  function setMode(m){
    mode=m;
    const run=m==='run';
    el$('c-edit').hidden=run;el$('c-run').hidden=!run;el$('c-run2').hidden=!run;
    cModeBtn.textContent=run?'Править путь':'Запустить поезда';
    svg.style.touchAction=run?'auto':'none';
    svg.style.cursor=run?'default':'crosshair';
    hov.setAttribute('visibility','hidden');
    gGrid.setAttribute('opacity',run?'0.3':'0.9');
    liveBuild.hidden=!run;
    if(!run){
      trains=[];crashed=false;crashEl.classList.remove('on');
      tgs.forEach((t,idx)=>{t.g.setAttribute('display','none');cvItems[idx].g.setAttribute('display','none')});
      clearBlk();stuckT=0;dlShown=false;
    }
    hideAlert();ui();
  }
  function tryRun(){
    if(!spawnAll()){showAlert('Нужен путь минимум из четырёх клеток без развилки на старте. Лучше всего замкнуть его в кольцо.');return}
    simT=0;logs.length=0;cLog.textContent='';dispT=2;stuckT=0;dlShown=false;
    running=!RL.reducedMotion();
    el$('c-play').textContent=running?'Пауза':'Запустить';el$('c-play').classList.toggle('pri',running);
    liveBuild.classList.toggle('paused',!running);
    setMode('run');
    log('Диспетчерская запущена. Составы по '+initLen+' ваг.');
    draw();
  }
  function setTool(t){
    tool=t;
    el$('c-draw').classList.toggle('pri',t==='draw');el$('c-erase').classList.toggle('pri',t==='erase');
    el$('c-draw').setAttribute('aria-pressed',String(t==='draw'));el$('c-erase').setAttribute('aria-pressed',String(t==='erase'));
  }

  /* ---- pointer drawing ---- */
  function cellAt(ev){
    const rc=svg.getBoundingClientRect();
    const x=(ev.clientX-rc.left)/rc.width*W,y=(ev.clientY-rc.top)/rc.height*H;
    const c=Math.floor(x/CS),r=Math.floor(y/CS);
    if(c<0||r<0||c>=COLS||r>=ROWS)return null;
    return{r,c};
  }
  function showHover(p){
    if(!p||mode!=='build'){hov.setAttribute('visibility','hidden');return}
    hov.setAttribute('x',p.c*CS);hov.setAttribute('y',p.r*CS);hov.setAttribute('visibility','visible');
  }
  function walkTo(p){
    let ch=false,guard=0;
    while((lastC.r!==p.r||lastC.c!==p.c)&&guard++<40){
      const dr=p.r-lastC.r,dc=p.c-lastC.c;let nr=lastC.r,nc=lastC.c;
      if(Math.abs(dc)>=Math.abs(dr))nc+=dc>0?1:-1;else nr+=dr>0?1:-1;
      if(tool==='draw')setEdge(lastC.r,lastC.c,nr,nc,1);else eraseCell(nr,nc);
      lastC={r:nr,c:nc};ch=true;
    }
    if(ch){rebuild();hideAlert();ui()}
  }
  svg.addEventListener('pointerdown',ev=>{
    if(mode!=='build')return;
    if(ev.target.closest&&ev.target.closest('.swm'))return;
    const p=cellAt(ev);if(!p)return;
    drawing=true;lastC=p;
    try{svg.setPointerCapture(ev.pointerId)}catch(e){}
    ev.preventDefault();
    if(tool==='erase'){eraseCell(p.r,p.c);rebuild();hideAlert();ui()}
  });
  svg.addEventListener('pointermove',ev=>{const p=cellAt(ev);showHover(p);if(drawing&&p)walkTo(p)});
  const endDraw=()=>{drawing=false};
  svg.addEventListener('pointerup',endDraw);
  svg.addEventListener('pointercancel',endDraw);
  svg.addEventListener('pointerleave',()=>hov.setAttribute('visibility','hidden'));

  /* ---- controls ---- */
  el$('c-draw').addEventListener('click',()=>setTool('draw'));
  el$('c-erase').addEventListener('click',()=>setTool('erase'));
  el$('c-sample').addEventListener('click',()=>{loadSample();rebuild();hideAlert();ui()});
  el$('c-clear').addEventListener('click',()=>{clearAll();rebuild();hideAlert();ui()});
  cModeBtn.addEventListener('click',()=>{if(mode==='build')tryRun();else setMode('build')});
  initLenEl.addEventListener('input',()=>{initLen=+initLenEl.value;el$('c-init-lenv').textContent=initLen+' ваг.'});
  spd.addEventListener('input',()=>{el$('c-spdv').textContent=spd.value+'%'});
  lenA.addEventListener('input',()=>setTrainLen(0,+lenA.value,false));
  cLenADec.addEventListener('click',()=>{if(trains[0])setTrainLen(0,trains[0].len-1,false)});
  cLenAInc.addEventListener('click',()=>{if(trains[0])setTrainLen(0,trains[0].len+1,false)});
  el$('c-horn').addEventListener('click',()=>{if(trains[0]){trains[0].hornT=0.65;FX().horn();log('Поезд А: подан звуковой сигнал')}});
  const cCvBtn=el$('c-cv-btn');
  cCvBtn.addEventListener('click',()=>{
    cvOn=!cvOn;
    if(cvOn)gCv.removeAttribute('hidden');else gCv.setAttribute('hidden','true');
    cCvBtn.classList.toggle('active-cv',cvOn);cCvBtn.setAttribute('aria-pressed',String(cvOn));
    FX().relay();log(cvOn?'Камера ИИ (CV) включена':'Камера ИИ (CV) выключена');
  });
  el$('c-stop').addEventListener('click',()=>{spd.value=0;el$('c-spdv').textContent='0%'});
  const cPlay=el$('c-play');
  cPlay.addEventListener('click',()=>{
    running=!running;
    cPlay.textContent=running?'Пауза':'Запустить';cPlay.classList.toggle('pri',running);
    liveBuild.classList.toggle('paused',!running);
  });
  el$('c-reset').addEventListener('click',resetScene);
  atp.addEventListener('change',()=>log(atp.checked?'Защита от столкновений включена':'Защита отключена: поезд А едет без блокировки'));

  /* ---- loop (skips when hidden) ---- */
  let last=0;
  function frame(ts){
    if(simB.hidden){last=0;requestAnimationFrame(frame);return}
    if(!last)last=ts;
    const dt=Math.min(0.05,(ts-last)/1000);last=ts;
    if(mode==='run'){if(running&&!crashed)update(dt);draw()}
    uiT+=dt;if(uiT>0.2){uiT=0;ui()}
    requestAnimationFrame(frame);
  }

  loadSample();rebuild();setTool('draw');setMode('build');
  requestAnimationFrame(frame);
})();
