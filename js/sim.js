/* РельсЛаб · симуляция готового макета */
/* ---- SIM: движок готового макета (preset) ---- */
(function sim(){
  const RL = window.RL;
  const {NS,$,el$,svgEl,mmss,clamp}=RL;
  const FX=()=>RL.RailFX;

  const MAX_CARS=8;
  const LOOK=120,ACC=110,DEC=190,STEP=2,GAP=10,DISP=6;
  const tailLen=tr=>(tr.len-1)*GAP+12;
  const effAcc=tr=>ACC/(1+(tr.len-1)*0.11);
  const effDec=tr=>DEC/(1+(tr.len-1)*0.08);

  /* ---- геометрия путей ---- */
  const T={};
  // интерполяция угла по кратчайшей дуге (в градусах)
  const wrapA=a=>{while(a>180)a-=360;while(a<-180)a+=360;return a};
  // Путь разбивается в таблицу один раз при старте. Дальше все позиции —
  // чтение из массива, без дорогих getPointAtLength() на каждый кадр.
  const TS=2;
  function mk(id,path,n){
    const len=path.getTotalLength();
    const m=Math.max(1,Math.ceil(len/TS)+1);
    const xs=new Float32Array(m),ys=new Float32Array(m),as=new Float32Array(m);
    const loop=(id==='O'||id==='I');
    for(let i=0;i<m;i++){
      const p=path.getPointAtLength(Math.min(len,i*TS));
      xs[i]=p.x;ys[i]=p.y;
      const q=path.getPointAtLength(loop?(i+1)*TS%len:Math.min(len,(i+1)*TS));
      const dxa=q.x-p.x,dya=q.y-p.y;
      // на последнем индексе нециклического пути точки совпадают (оба = len) — берём предыдущий угол
      as[i]=(dxa===0&&dya===0&&i>0)?as[i-1]:Math.atan2(dya,dxa)*180/Math.PI;
    }
    T[id]={id,el:path,len,n,bl:len/n,loop,xs,ys,as,ts:TS};
  }
  mk('O',$('p-outer'),8);mk('I',$('p-inner'),6);mk('C1',$('p-c1'),1);mk('C2',$('p-c2'),1);
  function nearest(tr,x,y){
    const N=Math.floor(tr.len/tr.ts)+1;let best=0,bd=1e12;
    for(let i=0;i<N;i++){
      const dx=tr.xs[i]-x,dy=tr.ys[i]-y,d=dx*dx+dy*dy;
      if(d<bd){bd=d;best=i}
    }
    return best*tr.ts;
  }
  const S={sA:nearest(T.O,330,40),sB:nearest(T.I,470,130),sC:nearest(T.I,470,290),sD:nearest(T.O,330,380)};
  const SW={1:{div:false,x:330,y:40},2:{div:false,x:470,y:290}};

  const key=st=>{const tr=T[st.t];const s=(st.s%tr.len+tr.len)%tr.len;return st.t+':'+Math.min(tr.n-1,Math.floor(s/tr.bl))};
  const lab=k=>{const a=k.split(':');if(a[0]==='O')return 'О'+(+a[1]+1);if(a[0]==='I')return 'В'+(+a[1]+1);return 'перемычка '+a[0].charAt(1)};

  function adv(st,ds){
    const tr=T[st.t],n=st.s+ds;
    if(ds>=0){
      if(st.t==='O'){if(SW[1].div&&st.s<S.sA&&n>=S.sA){st.t='C1';st.s=n-S.sA;return st}}
      else if(st.t==='I'){if(SW[2].div&&st.s<S.sC&&n>=S.sC){st.t='C2';st.s=n-S.sC;return st}}
      else if(st.t==='C1'){if(n>=tr.len){st.t='I';st.s=(S.sB+(n-tr.len))%T.I.len}else st.s=n;return st}
      else if(st.t==='C2'){if(n>=tr.len){st.t='O';st.s=(S.sD+(n-tr.len))%T.O.len}else st.s=n;return st}
      st.s=n>=tr.len?n-tr.len:n;return st;
    }
    if(st.t==='C1'){if(n<0){st.t='O';st.s=(S.sA+n+T.O.len)%T.O.len}else st.s=n;return st}
    if(st.t==='C2'){if(n<0){st.t='I';st.s=(S.sC+n+T.I.len)%T.I.len}else st.s=n;return st}
    if(st.t==='I'){if(SW[1].div&&st.s>=S.sB&&n<S.sB){st.t='C1';st.s=Math.max(0,T.C1.len-(S.sB-n));return st}}
    if(st.t==='O'){if(SW[2].div&&st.s>=S.sD&&n<S.sD){st.t='C2';st.s=Math.max(0,T.C2.len-(S.sD-n));return st}}
    st.s=n<0?n+tr.len:n;return st;
  }

  // Заполняет готовый объект instead of creating a new one per call (hot loop).
  function samplePt(out,t,s){
    const tr=T[t],len=tr.len;
    if(s<0)s=(s%len+len)%len;
    if(s>=len&&tr.loop)s=s%len;
    if(s>len)s=len;
    const f=s/tr.ts;let i=Math.floor(f);
    if(i>tr.xs.length-2)i=tr.xs.length-2;
    if(i<0)i=0;
    const u=f-i;
    out.x=tr.xs[i]+(tr.xs[i+1]-tr.xs[i])*u;
    out.y=tr.ys[i]+(tr.ys[i+1]-tr.ys[i])*u;
    out.a=wrapA(tr.as[i]+wrapA(tr.as[i+1]-tr.as[i])*u);
    out.k=tr.id+':'+Math.min(tr.n-1,Math.floor(((s%len+len)%len)/tr.bl));
    out.t=t;out.s=s;
    return out;
  }
  function sample(t,s){
    return samplePt({x:0,y:0,a:0,k:'',t:'',s:0},t,s);
  }

  /* ---- слои (создаются один раз) ---- */
  const gTies=$('g-ties'),gBlk=$('g-blk'),gRoute=$('g-route'),gLamp=$('g-lamp'),gObs=$('g-obs'),gTr=$('g-trains'),gCv=$('g-cv'),gLaser=$('g-laser');
  const ids=['O','I','C1','C2'];
  ids.forEach(id=>{const d=T[id].el.getAttribute('d');svgEl('path',{d,'class':'tie'},gTies);svgEl('path',{d,'class':'cl'},gTies)});
  const blkEls=[];
  ids.forEach(id=>{
    const tr=T[id],d=tr.el.getAttribute('d');
    for(let i=0;i<tr.n;i++){
      const p=svgEl('path',{d,'class':'blk'},gBlk);
      if(tr.n>1){p.setAttribute('stroke-dasharray',(tr.bl-4)+' '+tr.len);p.setAttribute('stroke-dashoffset',String(-(i*tr.bl+2)))}
      blkEls.push({k:id+':'+i,el:p});
    }
  });
  const route1=svgEl('path',{d:T.C1.el.getAttribute('d'),'class':'route'},gRoute);
  const route2=svgEl('path',{d:T.C2.el.getAttribute('d'),'class':'route'},gRoute);
  const lamps=[],closedBlocks={};
  ['O','I'].forEach(id=>{
    const tr=T[id],c={x:400,y:210};
    for(let i=0;i<tr.n;i++){
      const s=i*tr.bl,p=tr.el.getPointAtLength(s),q=tr.el.getPointAtLength((s+1)%tr.len);
      let tx=q.x-p.x,ty=q.y-p.y;const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;
      let nx=-ty,ny=tx;const dot=(p.x-c.x)*nx+(p.y-c.y)*ny;
      const out=id==='O';if((out&&dot<0)||(!out&&dot>0)){nx=-nx;ny=-ny}
      const bkKey=id+':'+i;
      const lm=svgEl('circle',{cx:(p.x+nx*14).toFixed(1),cy:(p.y+ny*14).toFixed(1),r:4.8,'class':'lamp go'},gLamp);
      const tt=svgEl('title',{},lm);tt.textContent='Светофор '+lab(bkKey)+': кликните, чтобы закрыть/открыть блок';
      lm.addEventListener('click',()=>toggleBlockLock(bkKey));
      lamps.push({k:bkKey,el:lm});
    }
  });

  /* ---- поезда ---- */
  const DEFS=[
    {id:'A',name:'Поезд А',auto:false,vmax:120,color:'var(--accent)',t:'O',s:700,len:3},
    {id:'B',name:'Поезд Б',auto:true,vmax:90,color:'var(--t-a)',t:'O',s:1500,len:4},
    {id:'C',name:'Поезд В',auto:true,vmax:75,color:'var(--t-b)',t:'I',s:300,len:2}
  ];
  const trains=[];let selectedTrain=0;
  DEFS.forEach((d,idx)=>{
    const tr={def:d,name:d.name,auto:d.auto,vmax:d.vmax,len:d.len,dir:1,wantDir:1,cars:[],jointAcc:0,distM:0,energyWh:0,hornT:0,depotLimit:false};
    const g=svgEl('g',{'class':'train-g'},gTr);
    g.addEventListener('click',()=>selectTrain(idx));
    tr.beam=svgEl('use',{href:'#beam-shape','class':'headlight'},g);
    for(let k=0;k<MAX_CARS;k++){
      const cg=svgEl('g',{},g);
      svgEl('rect',{x:-9,y:-4.5,width:18,height:9,rx:2,'class':'car',style:'fill:'+d.color+(k===0?'':';fill-opacity:.72')},cg);
      if(k===0)svgEl('rect',{x:2,y:-3,width:5,height:6,rx:1,'class':'cab'},cg);
      else svgEl('rect',{x:-5,y:-2.5,width:10,height:5,rx:1,'class':'cargo-stripe'},cg);
      if(k>=tr.len)cg.setAttribute('display','none');
      tr.cars.push(cg);
    }
    tr.tailLamp1=svgEl('circle',{r:1.5,'class':'taillight'},g);
    tr.tailLamp2=svgEl('circle',{r:1.5,'class':'taillight'},g);
    tr.hornRing=svgEl('circle',{r:10,'class':'horn-ring'},g);
    const tg=svgEl('g',{},g);
    tr.tagBg=svgEl('rect',{x:-8,y:-9,width:16,height:15,rx:3,'class':'tagbg'+(idx===0?' sel':'')},tg);
    const tx=svgEl('text',{y:2,'class':'tag'},tg);tx.textContent=d.id;
    tr.tag=tg;
    trains.push(tr);
  });

  /* ---- CV layer ---- */
  let cvOn=false,cvAcc=1;const cvItems=[]; // cvAcc — накопитель для обновления CV раз в 50 мс
  svgEl('text',{x:16,y:24,'class':'cv-hud'},gCv).textContent='CAM_01 · YOLOv8-RAIL · ДЕТЕКЦИЯ СОСТАВОВ';
  trains.forEach(()=>{
    const box=svgEl('rect',{x:0,y:0,width:20,height:20,rx:3,'class':'cv-box'},gCv);
    const bg=svgEl('rect',{x:0,y:0,width:118,height:15,rx:2,'class':'cv-lbl-bg'},gCv);
    const tx=svgEl('text',{x:0,y:0,'class':'cv-lbl'},gCv);
    cvItems.push({box,bg,tx});
  });
  const cvObsGroup=svgEl('g',{hidden:'true'},gCv);
  const cvObsBox=svgEl('rect',{x:0,y:0,width:28,height:28,rx:3,'class':'cv-box warn'},cvObsGroup);
  const cvObsBg=svgEl('rect',{x:0,y:0,width:110,height:15,rx:2,'class':'cv-lbl-bg warn'},cvObsGroup);
  const cvObsTx=svgEl('text',{x:0,y:0,'class':'cv-lbl warn'},cvObsGroup);

  /* ---- obstacle ---- */
  let obstacle=null;
  const obsVisual=svgEl('g',{hidden:'true'},gObs);
  svgEl('polygon',{points:'0,-8 8,6 -8,6','class':'obs-mark'},obsVisual);
  svgEl('text',{x:0,y:3,style:'font:700 8px var(--f-mono);fill:#fff;text-anchor:middle'},obsVisual).textContent='!';

  /* ---- laser ---- */
  let laserOn=false,laserCooldown=0,laserPulse=0,scanCount=0;
  const laserBeam=el$('laser-beam'),laserBtn=el$('laser-btn'),laserBadge=el$('laser-badge'),laserMsg=el$('laser-msg');
  function setLaser(on,silent){
    laserOn=on;
    if(on)gLaser.removeAttribute('hidden');else gLaser.setAttribute('hidden','true');
    laserBtn.classList.toggle('active-cv',on);
    laserBtn.setAttribute('aria-pressed',String(on));
    laserBadge.textContent=on?'АКТИВЕН · О5':'ВЫКЛ';
    laserMsg.textContent=on?'Портал готов. Ожидание прохода состава через блок О5...':'Включите «Лазерный пост», чтобы измерять геометрию гребней и габарит составов при проходе блока О5.';
    if(!silent){FX().relay();log(on?'Лазерный диагностический пост на блоке О5 включён':'Лазерный пост выключен')}
  }

  /* ---- algorithms lab ---- */
  const ALGOS={
    scb:{name:'Базовая СЦБ и автоблокировка',
      code:'# 01_scb_base.py — Классическая автоблокировка\ndef on_tick(railway, trains):\n    for tr in trains:\n        if railway.next_block_occupied(tr):\n            tr.brake_smooth()\n    railway.auto_dispatcher(interval_sec=6)'},
    green:{name:'Зелёная волна (Приоритет Поезда А)',
      code:'# 02_green_wave.py — Приоритетный коридор для экспресса А\ndef on_tick(railway, trains):\n    express = trains["A"]\n    # Уводим автономные составы на внутреннее кольцо\n    if express.track == "O":\n        railway.route_others_to_inner(except_train="A")'},
    laser:{name:'Лазерный контроль и отвод в депо',
      code:'# 03_laser_diag.py — Автоматическая дефектоскопия\nrailway.enable_sensor("LASER_GATE_O5")\ndef on_wheel_scan(train, flange_wear_mm):\n    if flange_wear_mm > 1.5:\n        train.set_speed_limit(0.45)\n        railway.divert_to_depot(train)'},
    eco:{name:'Эко-вождение и рекуперация энергии',
      code:'# 04_eco_drive.py — Энергосберегающий график\ndef on_tick(railway, trains):\n    for tr in trains:\n        tr.limit_acceleration(0.62)\n        tr.enable_regenerative_braking(eff=0.75)'}
  };
  let activeAlgo='scb';
  const algoCode=el$('algo-code'),algoStatus=el$('algo-status');
  algoCode.value=ALGOS.scb.code;
  /* ---- Python API: исполнение пользовательских скриптов ---- */
  let pyProg=null,pyEnabled=false,pyTickAcc=0,pyTrainObjs=[];

  function pyTrainApi(tr){
    const o=RL.PyAPI.obj({
      id:tr.def.id,
      name:tr.name,
      speed:()=>Math.round(tr.v/tr.vmax*100)/100,
      vmax:tr.vmax,
      length:()=>tr.len,
      track:()=>tr.st.t,
      block:()=>lab(key(tr.st)),
      waiting:()=>tr.wait,
      auto:()=>tr.auto,
      distance:()=>Math.round(tr.distM*10)/10,
      energy:()=>Math.round(tr.energyWh*100)/100
    },{
      brake_smooth:()=>{tr.pyBrake=1;return null},
      set_speed_limit:(a)=>{tr.pySpeedLimit=clamp(RL.PyAPI.num(a[0],1),0,1);return null},
      limit_acceleration:(a)=>{tr.pyAccLimit=clamp(RL.PyAPI.num(a[0],1),0,1);return null},
      enable_regenerative_braking:(a,kw)=>{
        const v=(kw.eff!==undefined)?kw.eff:a[0];
        tr.pyRegen=clamp(RL.PyAPI.num(v,0.75),0,1);return null;
      }
    });
    o.__tr=tr;
    return o;
  }

  function pyRailwayApi(){
    return RL.PyAPI.obj({
      time:()=>Math.round(simT*10)/10,
      switch_1:()=>SW[1].div?'divert':'straight',
      switch_2:()=>SW[2].div?'divert':'straight',
      obstacle:()=>!!obstacle
    },{
      log:(a)=>{log('[API] '+a.map(x=>String(x)).join(' '));return null},
      next_block_occupied:(a)=>{
        const tr=a[0]&&a[0].__tr;
        return !!(tr&&tr._pl&&tr._pl.db<Infinity);
      },
      auto_dispatcher:(a,kw)=>{
        disp.checked=true;
        const v=(kw.interval_sec!==undefined)?kw.interval_sec:a[0];
        dispInt=clamp(RL.PyAPI.num(v,6),1,30);
        return null;
      },
      route_others_to_inner:(a,kw)=>{
        const v=(kw.except_train!==undefined)?kw.except_train:a[0];
        const except=String(v===undefined?'A':v);
        let changed=false;
        trains.forEach(t=>{
          if(t.def.id===except)return;
          if(t.st.t==='O'&&!SW[1].div){SW[1].div=true;changed=true}
        });
        if(changed){paintSw();log('[API] Стрелка 1: автономные составы уведены на внутреннее кольцо')}
        return null;
      },
      set_switch:(a)=>{
        const n=Math.trunc(RL.PyAPI.num(a[0],1));
        const mode=String(a[1]===undefined?'divert':a[1]);
        if(!SW[n])return null;
        const want=(mode==='divert'||mode==='1'||mode==='true');
        if(SW[n].div!==want){
          if(swLocked(n)){log('[API] Стрелка '+n+' занята составом — команда отклонена');return null}
          SW[n].div=want;paintSw();
        }
        return null;
      },
      enable_sensor:(a)=>{
        const name=String(a[0]===undefined?'LASER_GATE_O5':a[0]);
        if(/laser/i.test(name)&&!laserOn)setLaser(true,true);
        return null;
      },
      divert_to_depot:(a)=>{
        const tr=a[0]&&a[0].__tr;
        if(!tr)return null;
        tr.depotLimit=true;
        if(tr.st.t==='O'&&!SW[1].div){SW[1].div=true;paintSw()}
        log('[API] '+tr.name+': ограничение 45% и отвод в депо');
        return null;
      },
      close_block:(a)=>{
        const k=String(a[0]);
        if(!closedBlocks[k]){closedBlocks[k]=true;log('Диспетчер: блок '+lab(k)+' закрыт (команда API)')}
        return null;
      },
      open_block:(a)=>{
        const k=String(a[0]);
        if(closedBlocks[k]){delete closedBlocks[k];log('Диспетчер: блок '+lab(k)+' открыт (команда API)')}
        return null;
      },
      block_closed:(a)=>!!closedBlocks[String(a[0])]
    });
  }

  function pyApi(){
    pyTrainObjs=trains.map(pyTrainApi);
    const entries=trains.map((t,i)=>[t.def.id,pyTrainObjs[i]]);
    return {
      railway:pyRailwayApi(),
      trains:RL.PyAPI.dict(entries),
      log:(a)=>{log('[API] '+a.map(x=>String(x)).join(' '));return null}
    };
  }

  function pyFail(e){
    pyEnabled=false;pyProg=null;
    const msg=(e&&e.message)?e.message:'неизвестная ошибка';
    algoStatus.textContent='Ошибка скрипта: '+msg;
    algoStatus.style.color='var(--stop)';
    log('[API] Скрипт остановлен: '+msg);
    FX().chime(true);
  }

  function runUserCode(silent){
    try{
      pyProg=RL.PyAPI.compile(algoCode.value,pyApi());
      pyEnabled=true;pyTickAcc=0;
      algoStatus.style.color='';
      algoStatus.textContent='Скрипт выполняется · on_tick 10 Гц'+(pyProg.hasScan?' · on_wheel_scan подключён':'');
      if(!silent)log('[API] Скрипт скомпилирован и запущен на контроллере');
    }catch(e){pyFail(e)}
  }

  function applyAlgorithm(keyName,silent){
    if(!ALGOS[keyName])return;
    activeAlgo=keyName;
    document.querySelectorAll('.lab-pill').forEach(b=>b.classList.toggle('on',b.getAttribute('data-algo')===keyName));
    algoCode.value=ALGOS[keyName].code;
    const bc=el$('blk-cond'),ba=el$('blk-act');
    if(bc&&ba){bc.value=keyName;ba.value=keyName}
    if(keyName==='laser'&&!laserOn)setLaser(true,true);
    if(keyName==='green')disp.checked=true;
    runUserCode(silent);
    if(!silent){FX().chime(false);log('[API] Загружен алгоритм: '+ALGOS[keyName].name)}
  }
  document.querySelectorAll('.lab-pill').forEach(btn=>btn.addEventListener('click',()=>applyAlgorithm(btn.getAttribute('data-algo'),false)));
  el$('algo-run').addEventListener('click',()=>{
    const txt=algoCode.value;
    const hit=/LASER|laser/.test(txt)?'laser':/inner|green|express/.test(txt)?'green':/eco|regenerative/.test(txt)?'eco':'scb';
    activeAlgo=hit;
    document.querySelectorAll('.lab-pill').forEach(b=>b.classList.toggle('on',b.getAttribute('data-algo')===hit));
    if(hit==='laser'&&!laserOn)setLaser(true,true);
    if(hit==='green')disp.checked=true;
    FX().chime(false);
    runUserCode(false);
  });

  /* ---- state ---- */
  const spd=el$('spd'),lenA=el$('lenA'),atp=el$('atp'),disp=el$('disp');
  let simT=0,crashed=false,running=!RL.reducedMotion(),dispT=2,dispInt=DISP,nextSw=1,uiT=1;
  const logs=[];
  const logEl=el$('log'),alertEl=el$('alert'),cntEl=el$('cnt');
  const crashmark=el$('crashmark');

  function log(msg){
    logs.unshift(mmss(simT)+'  '+msg);
    if(logs.length>5)logs.pop();
    // rebuild log list
    logEl.textContent='';
    for(const l of logs){const li=document.createElement('li');li.textContent=l;logEl.appendChild(li)}
  }
  function selectTrain(idx){selectedTrain=idx;trains.forEach((t,i)=>t.tagBg.classList.toggle('sel',i===idx));ui()}
  function toggleBlockLock(k){
    if(closedBlocks[k]){delete closedBlocks[k];log('Диспетчер: блок '+lab(k)+' открыт для движения')}
    else{closedBlocks[k]=true;log('Диспетчер: блок '+lab(k)+' закрыт (ремонт пути)')}
    FX().relay();
  }
  const dirFwd=el$('dir-fwd'),dirRev=el$('dir-rev');
  function setDirectionA(wantDir){
    const tr=trains[0];if(tr.wantDir===wantDir)return;
    tr.wantDir=wantDir;
    dirFwd.classList.toggle('on',wantDir===1);dirRev.classList.toggle('on',wantDir===-1);
    dirFwd.setAttribute('aria-pressed',String(wantDir===1));dirRev.setAttribute('aria-pressed',String(wantDir===-1));
    FX().relay();log('Поезд А: задан ход '+(wantDir===1?'вперёд':'назад (реверс)'));
  }
  function triggerHorn(){trains[0].hornT=0.65;FX().horn();log('Поезд А: подан звуковой сигнал (тифон)')}

  const needTrailLen=tr=>(tr.len-1)*GAP+6;
  function syncTrailLen(tr){
    // Достраиваем хвост назад по ФАКТИЧЕСКОЙ геометрии пути, минуя логику стрелок:
    // adv() читает текущее состояние SW, и если стрелку переключили после прохода
    // поезда, новые точки уходят на другую ветку — вагоны телепортируются,
    // а CV-рамка (bbox по вагонам) разваливается на весь макет.
    const need=needTrailLen(tr);
    while(tr.trail.length<need){
      const tp=tr.trail[0];let t=tp.t,s=tp.s-STEP;
      if(s<0){
        if(t==='O')s+=T.O.len;
        else if(t==='I')s+=T.I.len;
        else if(t==='C1'){t='O';s=S.sA+s}
        else{t='I';s=S.sC+s}
      }
      tr.trail.unshift(sample(t,s));
    }
    while(tr.trail.length>need)tr.trail.shift();
  }
  const lenAv=el$('lenAv'),lenADec=el$('lenA-dec'),lenAInc=el$('lenA-inc'),lenAMeta=el$('lenA-meta');
  function setTrainLen(idx,newLen,silent){
    const tr=trains[idx];newLen=clamp(newLen,1,MAX_CARS);
    if(tr.len===newLen)return;
    tr.len=newLen;
    if(tr.trail&&tr.trail.length)syncTrailLen(tr);
    for(let k=0;k<MAX_CARS;k++)tr.cars[k].setAttribute('display',k<newLen?'inline':'none');
    if(idx===0){
      lenA.value=String(newLen);lenAv.textContent=newLen+' ваг.';
      lenADec.disabled=(newLen<=1);lenAInc.disabled=(newLen>=MAX_CARS);
      lenAMeta.textContent='1 лок. + '+(newLen-1)+' ваг. · ~'+(newLen*16)+' см (H0) · масса '+(newLen*40)+' т';
    }
    if(!silent){log(tr.name+': длина состава '+newLen+' ваг. (масса '+(newLen*40)+' т)');FX().relay()}
    ui();
  }

  function place(){
    trains.forEach(tr=>{
      const d=tr.def,need=needTrailLen(tr);
      tr.st={t:d.t,s:d.s};tr.trail=[];
      for(let i=need-1;i>=0;i--)tr.trail.push(sample(d.t,d.s-i*STEP));
      tr.dir=1;tr.wantDir=1;
      tr.v=d.auto?d.vmax*0.7:(+spd.value/100*d.vmax);tr.vSm=undefined;
      tr.acc=0;tr.jointAcc=0;tr.wait=false;tr.bk=null;tr.hornT=0;tr.depotLimit=false;tr._nx=null;
      tr.pyBrake=0;tr.pySpeedLimit=1;tr.pyAccLimit=1;tr.pyRegen=0;tr._pl=null;
    });
    dirFwd.classList.add('on');dirRev.classList.remove('on');
  }
  function pushTrailFwd(tr){const need=needTrailLen(tr);tr.trail.push(sample(tr.st.t,tr.st.s));while(tr.trail.length>need)tr.trail.shift()}
  function pushTrailRev(tr){
    const need=needTrailLen(tr),tp=tr.trail[0],st={t:tp.t,s:tp.s};
    adv(st,-STEP);tr.trail.unshift(sample(st.t,st.s));
    while(tr.trail.length>need)tr.trail.pop();
    const hp=tr.trail[tr.trail.length-1];tr.st={t:hp.t,s:hp.s};
  }
  const occ=tr=>{const o={};for(const p of tr.trail)o[p.k]=1;return o};

  /* ---- плавная интерполяция состава между дискретными точками trail ---- */
  function lerpInto(out,p,q,f){
    out.x=p.x+(q.x-p.x)*f;out.y=p.y+(q.y-p.y)*f;
    out.a=wrapA(p.a+wrapA(q.a-p.a)*f);
    out.k=f<0.5?p.k:q.k;out.t=p.t;out.s=p.s+(q.s-p.s)*f;
    return out;
  }
  const _vp=[];for(let i=0;i<64;i++)_vp.push({x:0,y:0,a:0,k:'',t:'',s:0});
  let _vpi=0;
  // позиция по «индексу» в trail с дробной частью; idx>n-1 — экстраполяция вперёд
  function vpos(tr,idx){
    const t=tr.trail,n=t.length;
    if(!n)return _vp[0];
    if(idx<=0)return t[0];
    if(idx>=n-1){
      const f=idx-(n-1);
      if(f>0&&tr._nx)return lerpInto(_vp[_vpi++&63],t[n-1],tr._nx,Math.min(1,f));
      return t[n-1];
    }
    const i=Math.floor(idx);
    return lerpInto(_vp[_vpi++&63],t[i],t[i+1],idx-i);
  }
  // головная точка на следующий шаг пути (для дробного хода вперёд)
  function nextHead(tr){
    if(tr.dir!==1)return null;
    const st={t:tr.st.t,s:tr.st.s};adv(st,STEP);return sample(st.t,st.s);
  }

  /* ---- safety / blocks ---- */
  function blocked(i,k,occs,plans){
    if(closedBlocks[k])return true;
    if(obstacle&&obstacle.k===k)return true;
    for(let j=0;j<trains.length;j++){
      if(j===i)continue;
      if(occs[j][k])return true;
      if(j<i&&plans[j]&&plans[j].claims[k])return true;
    }
    return false;
  }
  // Кэш координат составов для look-ahead. Без него plan() на каждом из ~95 шагов
  // перебирал все точки trail каждого поезда — это и был основной источник лага.
  const NEAR_STRIDE=4,NMAX=512;
  const _nx2=new Float32Array(NMAX),_ny2=new Float32Array(NMAX);
  const _nStart=[],_nCount=[];
  function buildNearCache(){
    let p=0;
    for(let j=0;j<trains.length;j++){
      const a=trains[j].trail;_nStart[j]=p;
      for(let q=0;q<a.length;q+=NEAR_STRIDE){if(p>=NMAX)break;_nx2[p]=a[q].x;_ny2[p]=a[q].y;p++}
      _nCount[j]=p-_nStart[j];
    }
  }
  function nearOtherTrain(i,x,y){
    if(obstacle){const dx=x-obstacle.x,dy=y-obstacle.y;if(dx*dx+dy*dy<256)return true}
    for(let j=0;j<trains.length;j++){
      if(j===i)continue;
      const st=_nStart[j],en=st+_nCount[j];
      for(let q=st;q<en;q++){const dx=x-_nx2[q],dy=y-_ny2[q];if(dx*dx+dy*dy<256)return true}
    }
    return false;
  }
  const _pp={x:0,y:0,a:0,k:'',t:'',s:0}; // переиспользуемая точка для look-ahead
  function plan(i,occs,plans){
    const tr=trains[i],own=occs[i],claims={};let db=Infinity,bk=null;
    const maxLook=LOOK+(tr.len-1)*10;let st;
    if(tr.dir===1){
      st={t:tr.st.t,s:tr.st.s};
      for(let d=STEP;d<=maxLook;d+=STEP){
        adv(st,STEP);samplePt(_pp,st.t,st.s);const k=_pp.k;
        if(nearOtherTrain(i,_pp.x,_pp.y)){db=d;bk=k;break}
        if(!own[k]){if(blocked(i,k,occs,plans)){db=d;bk=k;break}claims[k]=1}
      }
    }else{
      const tailIdx=Math.max(0,tr.trail.length-1-(tr.len-1)*GAP),tp=tr.trail[tailIdx];
      claims[tp.k]=1;st={t:tp.t,s:tp.s};
      for(let d=STEP;d<=maxLook;d+=STEP){
        adv(st,-STEP);samplePt(_pp,st.t,st.s);const k=_pp.k;
        if(nearOtherTrain(i,_pp.x,_pp.y)){db=d;bk=k;break}
        claims[k]=1;
        if(!own[k]&&blocked(i,k,occs,plans)){db=d;bk=k;break}
      }
    }
    return {db,bk,claims};
  }

  function swLocked(n){const s=SW[n];return trains.some(tr=>{const tl=tailLen(tr);return tr.trail.slice(-tl).some(p=>Math.hypot(p.x-s.x,p.y-s.y)<52)})}
  const sw1m=el$('sw1m'),sw2m=el$('sw2m'),sw1b=el$('sw1b'),sw2b=el$('sw2b');
  function paintSw(){
    sw1m.classList.toggle('on',SW[1].div);sw2m.classList.toggle('on',SW[2].div);
    route1.classList.toggle('on',SW[1].div);route2.classList.toggle('on',SW[2].div);
    sw1b.textContent='Стрелка 1 · '+(SW[1].div?'на внутреннее кольцо':'прямо');
    sw2b.textContent='Стрелка 2 · '+(SW[2].div?'на внешнее кольцо':'прямо');
  }
  function toggleSw(n,by){
    if(swLocked(n)){if(by==='user')log('Стрелка '+n+' занята составом, переключить нельзя');return false}
    SW[n].div=!SW[n].div;paintSw();
    if(by==='user')FX().relay();
    log('Стрелка '+n+(by==='auto'?' (диспетчер)':'')+': '+(SW[n].div?(n===1?'на внутреннее кольцо':'на внешнее кольцо'):'прямо'));
    return true;
  }
  function userSw(n){if(disp.checked){disp.checked=false;log('Автодиспетчер выключен, стрелки ваши')}toggleSw(n,'user')}

  function clearObstacle(silent){
    if(!obstacle)return;
    const k=obstacle.k;obstacle=null;
    obsVisual.setAttribute('hidden','true');cvObsGroup.setAttribute('hidden','true');
    el$('obs-btn').textContent='Помеха на пути';el$('obs-btn').classList.remove('warn-btn');
    if(!silent)log('[CV] Помеха на блоке '+lab(k)+' устранена');
  }
  function spawnObstacle(){
    if(obstacle){clearObstacle(false);return}
    const occs=trains.map(occ),allOcc={};
    occs.forEach(o=>{for(const k in o)allOcc[k]=1});
    const m=trains[0],probe={t:m.st.t,s:m.st.s};let found=null;
    for(let d=150;d<=420;d+=30){
      const st={t:probe.t,s:probe.s};adv(st,d*m.dir);
      const k=key(st),pt=sample(st.t,st.s);
      const nearSw=Math.hypot(pt.x-SW[1].x,pt.y-SW[1].y)<60||Math.hypot(pt.x-SW[2].x,pt.y-SW[2].y)<60;
      if(!allOcc[k]&&!nearSw){found={k,x:pt.x,y:pt.y,ttl:10};break}
    }
    if(!found){log('Нет свободного участка для постановки помехи');return}
    obstacle=found;
    obsVisual.setAttribute('transform','translate('+found.x.toFixed(1)+' '+found.y.toFixed(1)+')');
    obsVisual.removeAttribute('hidden');
    el$('obs-btn').textContent='Убрать помеху ('+lab(found.k)+')';el$('obs-btn').classList.add('warn-btn');
    FX().chime(true);log('[CV] Обнаружена помеха на блоке '+lab(found.k)+'!');
  }

  function crash(a,b,x,y){
    crashed=true;trains.forEach(t=>{t.v=0});
    crashmark.setAttribute('cx',x.toFixed(1));crashmark.setAttribute('cy',y.toFixed(1));crashmark.classList.add('on');
    alertEl.hidden=false;FX().chime(true);log('СТОЛКНОВЕНИЕ: '+a.name+' и '+b.name);
  }
  function resetScene(){
    crashed=false;crashmark.classList.remove('on');alertEl.hidden=true;
    clearObstacle(true);
    for(const k in closedBlocks)delete closedBlocks[k];
    SW[1].div=false;SW[2].div=false;paintSw();dispT=2;nextSw=1;
    place();log('Сцена сброшена');
  }

  function runGreenWave(){
    const m=trains[0];
    if(m.st.t!=='O')return;
    if(SW[1].div)toggleSw(1,'auto');
    for(let j=1;j<trains.length;j++){
      if(trains[j].st.t==='O'&&!SW[1].div){
        const dToSw=(S.sA-trains[j].st.s+T.O.len)%T.O.len;
        if(dToSw>20&&dToSw<140)toggleSw(1,'auto');
      }
      if(trains[j].st.t==='I'&&SW[2].div)toggleSw(2,'auto');
    }
  }

  /* ---- simulation step ---- */
  function update(dt){
    simT+=dt;
    if(obstacle){obstacle.ttl-=dt;if(obstacle.ttl<=0)clearObstacle(false)}
    if(laserCooldown>0)laserCooldown=Math.max(0,laserCooldown-dt);
    if(laserPulse>0){laserPulse=Math.max(0,laserPulse-dt);laserBeam.classList.toggle('active',laserPulse>0)}

    // Пользовательский скрипт: on_tick вызывается 10 раз в секунду, а не каждый кадр.
    if(pyEnabled&&pyProg){
      pyTickAcc+=dt;
      if(pyTickAcc>=0.1){
        pyTickAcc=0;
        for(const t of trains)t.pyBrake=0;
        try{pyProg.tick()}catch(e){pyFail(e)}
      }
    }

    const occs=trains.map(occ),plans=[];
    buildNearCache();
    for(let i=0;i<trains.length;i++)plans[i]=plan(i,occs,plans);
    for(let i=0;i<trains.length;i++){
      const tr=trains[i],pl=plans[i],dec=effDec(tr)*(1+tr.pyRegen*0.45),acc=effAcc(tr)*tr.pyAccLimit;
      if(tr.hornT>0)tr.hornT=Math.max(0,tr.hornT-dt);

      const avail=Math.max(0,pl.db-12);
      const vMaxEff=(tr.depotLimit?tr.vmax*0.45:tr.vmax)*tr.pySpeedLimit;
      const vAll=Math.min(vMaxEff,Math.sqrt(2*dec*0.7*avail));
      let want=tr.auto?vMaxEff:(+spd.value/100*vMaxEff);
      if(tr.pyBrake)want=0;

      // реверс: гасим тягу, меняем dir только после полной остановки
      if(!tr.auto&&tr.dir!==tr.wantDir){
        want=0;
        if(tr.v<1.5)tr.dir=tr.wantDir;
      }

      let wait;
      if(tr.auto)wait=pl.db<Infinity&&vAll<3;
      else wait=atp.checked&&pl.db<Infinity&&vAll<3&&want>3;
      const vT=(!tr.auto&&tr.dir!==tr.wantDir)?0:(tr.auto?vAll:(atp.checked?Math.min(want,vAll):want));

      const prevV=tr.v;
      if(tr.v<vT){tr.v=Math.min(vT,tr.v+acc*dt);tr.energyWh+=(tr.v*tr.len*0.004)*dt}
      else{
        tr.v=Math.max(vT,tr.v-dec*dt);
        if(prevV-tr.v>1&&(activeAlgo==='eco'||tr.pyRegen>0)){
          const rec=tr.pyRegen>0?tr.pyRegen:1;
          tr.energyWh=Math.max(0,tr.energyWh-(prevV-tr.v)*tr.len*0.0025*rec*dt);
        }
      }

      tr._pl=pl;

      if(wait&&!tr.wait){
        const reason=closedBlocks[pl.bk]?'блок '+lab(pl.bk)+' закрыт на ремонт':((obstacle&&pl.bk===obstacle.k)?'помеха на пути':'блок '+lab(pl.bk)+' занят');
        log(tr.name+' остановлен: '+reason);
        if(i===0)FX().chime(true);
      }
      if(!wait&&tr.wait)log(tr.name+' продолжил движение');
      tr.wait=wait;tr.bk=pl.bk;

      const ds=tr.v*dt;
      tr.acc+=ds;tr.distM+=(ds*0.012);
      if(i===0&&tr.v>8){tr.jointAcc+=ds;if(tr.jointAcc>=95){tr.jointAcc=0;FX().clack(tr.len)}}
      while(tr.acc>=STEP){
        tr.acc-=STEP;
        if(tr.dir===1){adv(tr.st,STEP);pushTrailFwd(tr)}else pushTrailRev(tr);
      }

      if(laserOn&&laserCooldown<=0){
        const h=tr.trail[tr.trail.length-1];
        if(Math.hypot(h.x-400,h.y-380)<16){
          laserCooldown=3.5;laserPulse=0.8;scanCount++;
          FX().scan();
          const wear=+(0.9+((scanCount*37)%14)/10).toFixed(1);
          const gauge=(1435.0+((scanCount*13)%6)/10).toFixed(1);
          let flagged=false;
          if(pyEnabled&&pyProg&&pyProg.hasScan){
            // Каждое измерение передаётся в on_wheel_scan пользовательского скрипта.
            const obj=pyTrainObjs[i]||pyTrainApi(tr);
            try{pyProg.scan(obj,wear)}catch(e){pyFail(e)}
            flagged=tr.depotLimit||tr.pySpeedLimit<0.9;
          }else{
            flagged=tr.auto&&wear>1.5;
            if(flagged){tr.depotLimit=true;if(tr.st.t==='O'&&!SW[1].div)toggleSw(1,'auto')}
          }
          laserBadge.textContent=flagged?'ДЕФЕКТ · В ДЕПО':'НОРМА · СКАН #'+scanCount;
          laserMsg.textContent=tr.name+' ('+tr.len+' ваг.) · Колея: '+gauge+' мм · Гребень: '+wear+' мм'+(flagged?' → ограничение 45% и отвод в депо':'');
          log('[ЛАЗЕР] '+tr.name+': гребень '+wear+' мм'+(flagged?' (дефект, отвод в депо)':' (норма)'));
        }
      }
    }

    if(!atp.checked&&!crashed){
      const m=trains[0];
      for(let pIdx=0;pIdx<m.trail.length&&!crashed;pIdx++){
        const mp=m.trail[pIdx];
        if(obstacle){const dx=mp.x-obstacle.x,dy=mp.y-obstacle.y;if(dx*dx+dy*dy<196){crash(m,{name:'препятствием ('+lab(obstacle.k)+')'},obstacle.x,obstacle.y);break}}
        for(let j=1;j<trains.length&&!crashed;j++){
          const o=trains[j].trail;
          for(let q=0;q<o.length;q++){
            const dx=mp.x-o[q].x,dy=mp.y-o[q].y;
            if(dx*dx+dy*dy<144){crash(m,trains[j],(mp.x+o[q].x)/2,(mp.y+o[q].y)/2);break}
          }
        }
      }
    }

    if(disp.checked&&!crashed){
      if(activeAlgo==='green'&&!pyEnabled)runGreenWave();
      else{dispT+=dt;if(dispT>=dispInt){if(toggleSw(nextSw,'auto')){nextSw=nextSw===1?2:1;dispT=0}else dispT=dispInt-1}}
    }
  }

  /* ---- render ---- */
  const isDay=()=>document.documentElement.getAttribute('data-theme')==='light';
  function draw(dt){
    dt=dt||1/60;
    const all={};let cnt=0;
    if(obstacle)all[obstacle.k]=1;
    for(const ck in closedBlocks)all[ck]=1;
    const day=isDay();
    // Камера ИИ «снимает» с частотой 20 Гц: рамки обновляются раз в 50 мс,
    // а сами поезда остаются плавными (интерполируются каждый кадр).
    const cvDue=cvOn&&(cvAcc+=dt)>=0.05;
    if(cvDue)cvAcc=0;
    trains.forEach((tr,ti)=>{
      const n=tr.trail.length;
      const phi=clamp(tr.acc/STEP,0,1);            // недойденная доля шага
      // сглаженная скорость — показания приборов и подписи CV не «прыгают»
      tr.vSm=(tr.vSm===undefined)?tr.v:tr.vSm+(tr.v-tr.vSm)*(1-Math.exp(-dt*6));
      const headIdx=n-1+tr.dir*phi;                // непрерывная позиция головы
      tr._nx=tr.dir===1?nextHead(tr):null; // следующая точка головы (для дробного хода)
      const carPt=k=>vpos(tr,Math.max(0,headIdx-k*GAP));
      const pHead=vpos(tr,headIdx);
      const pTail=carPt((tr.len-1));
      let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
      for(let k=0;k<tr.len;k++){
        const p=carPt(k);
        tr.cars[k].setAttribute('transform','translate('+p.x.toFixed(2)+' '+p.y.toFixed(2)+') rotate('+p.a.toFixed(2)+')');
        if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
        if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
      }
      const frontPt=tr.dir===1?pHead:pTail;
      const frontAng=tr.dir===1?pHead.a:(pTail.a+180);
      const rearPt=tr.dir===1?pTail:pHead;
      const rearRad=(tr.dir===1?pTail.a:(pHead.a+180))*Math.PI/180;

      tr.beam.setAttribute('transform','translate('+frontPt.x.toFixed(2)+' '+frontPt.y.toFixed(2)+') rotate('+frontAng.toFixed(2)+')');
      tr.beam.setAttribute('visibility',(!day&&tr.v>1)?'visible':'hidden');

      const rx=rearPt.x-Math.cos(rearRad)*9,ry=rearPt.y-Math.sin(rearRad)*9;
      const nx=-Math.sin(rearRad)*2.6,ny=Math.cos(rearRad)*2.6;
      tr.tailLamp1.setAttribute('cx',(rx+nx).toFixed(2));tr.tailLamp1.setAttribute('cy',(ry+ny).toFixed(2));
      tr.tailLamp2.setAttribute('cx',(rx-nx).toFixed(2));tr.tailLamp2.setAttribute('cy',(ry-ny).toFixed(2));

      if(tr.hornT>0){
        const prog=1-(tr.hornT/0.65);
        tr.hornRing.setAttribute('cx',frontPt.x.toFixed(2));tr.hornRing.setAttribute('cy',frontPt.y.toFixed(2));
        tr.hornRing.setAttribute('r',(10+prog*34).toFixed(1));tr.hornRing.style.opacity=String((1-prog)*0.85);
      }else tr.hornRing.style.opacity='0';

      tr.tag.setAttribute('transform','translate('+pHead.x.toFixed(2)+' '+(pHead.y-17).toFixed(2)+')');
      if(cvDue){
        const cv=cvItems[ti];
        // Рамка строится по bbox состава на момент «кадра» камеры.
        const tx=minX-12,ty=minY-12,tw=(maxX-minX)+24,th=(maxY-minY)+24;
        const pred=(ti===0)?predictLivery(LIVERIES[curLivery].rgb):null;
        const known=!!pred&&pred.key===curLivery;
        const isUntrained=(ti===0&&!known);
        const warn=tr.wait||isUntrained;
        const clsTag=(ti===0)?LIVERIES[curLivery].clsName:tr.def.id;
        const lbl=isUntrained?('НЕИЗВ_ЛОК · '+Math.max(18,Math.round(Math.min(pred?pred.conf:0.18,0.45)*100))+'% [ОБУЧИТЕ CV]'):(clsTag+' · '+tr.len+' ваг · '+Math.round(tr.vSm*0.8)+' км/ч');        const lw=lbl.length*6.1+8,ly=Math.max(16,ty-17);
        cv.box.setAttribute('x',tx.toFixed(2));cv.box.setAttribute('y',ty.toFixed(2));
        cv.box.setAttribute('width',tw.toFixed(2));cv.box.setAttribute('height',th.toFixed(2));
        cv.box.classList.toggle('warn',warn);
        cv.bg.setAttribute('x',tx.toFixed(2));cv.bg.setAttribute('y',ly.toFixed(2));cv.bg.setAttribute('width',lw.toFixed(2));
        cv.bg.classList.toggle('warn',warn);
        cv.tx.setAttribute('x',(tx+4).toFixed(2));cv.tx.setAttribute('y',(ly+11).toFixed(2));
        cv.tx.classList.toggle('warn',warn);cv.tx.textContent=lbl;
      }
      const o=occ(tr);for(const k in o)all[k]=1;
    });
    if(cvDue){
      if(obstacle){
        cvObsGroup.removeAttribute('hidden');
        const ox=obstacle.x,oy=obstacle.y;
        cvObsBox.setAttribute('x',(ox-14).toFixed(2));cvObsBox.setAttribute('y',(oy-14).toFixed(2));
        cvObsBg.setAttribute('x',(ox-48).toFixed(2));cvObsBg.setAttribute('y',(oy-32).toFixed(2));
        cvObsTx.setAttribute('x',(ox-44).toFixed(2));cvObsTx.setAttribute('y',(oy-21).toFixed(2));
        cvObsTx.textContent='ПОМЕХА · 96% ['+lab(obstacle.k)+']';
      }else cvObsGroup.setAttribute('hidden','true');
    }
    for(const k in all)cnt++;
    for(let i=0;i<blkEls.length;i++){
      const b=blkEls[i];
      b.el.classList.toggle('on',!!all[b.k]);
      b.el.classList.toggle('closed',!!closedBlocks[b.k]);
    }
    for(let i=0;i<lamps.length;i++){
      const lk=lamps[i].k;
      lamps[i].el.setAttribute('class',(all[lk]?'lamp stop':'lamp go')+(closedBlocks[lk]?' manual-lock':''));
    }
    cntEl.textContent=String(cnt);
  }

  /* ---- UI refresh (throttled) ---- */
  const tstateEl=el$('tstate');
  const teleTitle=el$('tele-title'),teleMode=el$('tele-mode'),teleSpd=el$('tele-spd'),teleDist=el$('tele-dist'),teleNrg=el$('tele-nrg');
  // Кэш строк tstate: создаём один раз, обновляемtextContent
  const tstateRows=trains.map((tr,idx)=>{
    const li=document.createElement('li');
    if(idx===0)li.className='sel';
    li.addEventListener('click',ev=>{if(ev.target.closest&&ev.target.closest('.stepper'))return;selectTrain(idx)});
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
    li.appendChild(sw);li.appendChild(box);li.appendChild(stp);tstateEl.appendChild(li);
    return {li,sw,s,num,bDec,bInc};
  });
  function ui(){
    trains.forEach((tr,idx)=>{
      const row=tstateRows[idx];
      const v=(tr.vSm===undefined)?tr.v:tr.vSm; // сглаженное показание
      row.li.className=idx===selectedTrain?'sel':'';
      row.sw.style.background=tr.def.color;
      row.num.textContent=tr.len+' ваг.';
      row.bDec.disabled=(tr.len<=1);row.bInc.disabled=(tr.len>=MAX_CARS);
      const pct=Math.round(v/tr.vmax*100);
      const mode=tr.auto?(tr.depotLimit?'депо':'авто'):(tr.dir===-1?'реверс':'ручн.');
      const st=crashed?'авария':(tr.wait?('ждёт ('+lab(tr.bk)+')'):(tr.v<2?'стоит':'идёт'));
      row.s.textContent=mode+' · '+pct+'% · '+st;
    });
    const sel=trains[selectedTrain]||trains[0];
    const sv=(sel.vSm===undefined)?sel.v:sel.vSm;
    teleTitle.textContent='Телеметрия: '+sel.name;
    const stateWord=sel.wait?'ТОРМОЗ СЦБ':(sel.v<2?'СТОЯНКА':(sel.dir===-1?'РЕВЕРС':'ТЯГА'));
    teleMode.textContent=stateWord+' · '+sel.len+' ВАГ.';
    teleSpd.textContent=Math.round(sv*3.2)+' мм/с';
    teleDist.textContent=sel.distM.toFixed(1)+' м';
    teleNrg.textContent=sel.energyWh.toFixed(1)+' Вт·ч';
  }

  /* ---- animation loop ---- */
  const simPanel=el$('sim-preset');
  let last=0;
  function frame(ts){
    // Движок скрытой вкладки не должен тратить кадры (как в конструкторе)
    if(simPanel.hidden){last=0;requestAnimationFrame(frame);return}
    if(!last)last=ts;
    const dt=Math.min(0.05,(ts-last)/1000);last=ts;
    if(running&&!crashed)update(dt);
    draw(dt);
    uiT+=dt;if(uiT>0.18){uiT=0;ui()}
    requestAnimationFrame(frame);
  }

  /* ---- controls wiring ---- */
  const spdv=el$('spdv');
  spd.addEventListener('input',()=>{spdv.textContent=spd.value+'%'});
  lenA.addEventListener('input',()=>setTrainLen(0,+lenA.value,false));
  lenADec.addEventListener('click',()=>setTrainLen(0,trains[0].len-1,false));
  lenAInc.addEventListener('click',()=>setTrainLen(0,trains[0].len+1,false));
  dirFwd.addEventListener('click',()=>setDirectionA(1));
  dirRev.addEventListener('click',()=>setDirectionA(-1));
  el$('horn').addEventListener('click',triggerHorn);
  el$('stop').addEventListener('click',()=>{spd.value=0;spdv.textContent='0%'});
  const playBtn=el$('play'),livePreset=el$('live-preset');
  playBtn.addEventListener('click',()=>{
    running=!running;
    playBtn.textContent=running?'Пауза':'Запустить';
    playBtn.classList.toggle('pri',running);
    livePreset.classList.toggle('paused',!running);
  });
  el$('reset').addEventListener('click',resetScene);
  atp.addEventListener('change',()=>{
    log(atp.checked?'Защита от столкновений включена':'Защита отключена: поезд А едет без блокировки');
    RL.setStatus('atp',atp.checked,atp.checked?'вкл':'выкл');
  });
  const cvBtn=el$('cv-btn');
  cvBtn.addEventListener('click',()=>{
    cvOn=!cvOn;
    cvAcc=1; // первый «кадр» камеры — сразу при включении
    if(cvOn)gCv.removeAttribute('hidden');else gCv.setAttribute('hidden','true');
    cvBtn.classList.toggle('active-cv',cvOn);cvBtn.setAttribute('aria-pressed',String(cvOn));
    RL.setStatus('cv',cvOn,cvOn?'вкл':'выкл');
    FX().relay();log(cvOn?'Камера ИИ (CV): распознавание составов и габаритов включено':'Камера ИИ (CV) выключена');
  });
  laserBtn.addEventListener('click',()=>setLaser(!laserOn,false));
  el$('obs-btn').addEventListener('click',spawnObstacle);
  sw1b.addEventListener('click',()=>userSw(1));sw2b.addEventListener('click',()=>userSw(2));
  [['sw1m',1],['sw2m',2]].forEach(([id,n])=>{
    const e=$(id);
    e.addEventListener('click',()=>userSw(n));
    e.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();userSw(n)}});
  });

  /* ---- scenario launches (from #fields) ---- */
  document.querySelectorAll('[data-launch]').forEach(btn=>btn.addEventListener('click',()=>{
    const sc=btn.getAttribute('data-launch');
    el$('tab-preset').click();
    el$('sim-title').scrollIntoView({behavior:'smooth'});
    if(!running)playBtn.click();
    if(sc==='green'){applyAlgorithm('green',false);spd.value=80;spdv.textContent='80%'}
    else if(sc==='cv'){if(!cvOn)cvBtn.click();if(!obstacle)spawnObstacle()}
    else if(sc==='block'){closedBlocks['O:3']=true;FX().relay();log('Лаб. работа: закрыт блок О4 (имитация отказа рельсовой цепи)')}
    else if(sc==='laser')applyAlgorithm('laser',false);
    else if(sc==='heavy'){setTrainLen(0,7,false);spd.value=65;spdv.textContent='65%'}
    else if(sc==='eco')applyAlgorithm('eco',false);
  }));

  /* ---- Python / blocks toggle ---- */
  function setLangMode(mode){
    const isBlk=(mode==='blk');
    algoCode.hidden=isBlk;el$('algo-blocks').hidden=!isBlk;
    el$('lang-py').classList.toggle('on',!isBlk);el$('lang-blk').classList.toggle('on',isBlk);
    el$('lang-py').setAttribute('aria-pressed',String(!isBlk));el$('lang-blk').setAttribute('aria-pressed',String(isBlk));
  }
  el$('lang-py').addEventListener('click',()=>setLangMode('py'));
  el$('lang-blk').addEventListener('click',()=>setLangMode('blk'));
  const blkCond=el$('blk-cond'),blkAct=el$('blk-act');
  // Блочный конструктор собирает настоящую программу: условие задаёт обёртку
  // (on_tick / on_wheel_scan), действие — тело с нужным отступом.
  const BLK_CONDS={
    scb:{head:'# Автогенерация из блоков: автоблокировка\ndef on_tick(railway, trains):\n    for tr in trains:\n        if railway.next_block_occupied(tr):\n',pad:12},
    green:{head:'# Автогенерация из блоков: приоритет экспресса\ndef on_tick(railway, trains):\n    express = trains["A"]\n    if express.track == "O":\n',pad:8},
    laser:{head:'# Автогенерация из блоков: дефектоскопия\nrailway.enable_sensor("LASER_GATE_O5")\ndef on_wheel_scan(train, flange_wear_mm):\n    if flange_wear_mm > 1.5:\n',pad:8},
    eco:{head:'# Автогенерация из блоков: эко-вождение\ndef on_tick(railway, trains):\n',pad:4}
  };
  const BLK_ACTS={
    scb:{code:'for tr in trains:\n    if railway.next_block_occupied(tr):\n        tr.brake_smooth()\nrailway.auto_dispatcher(interval_sec=6)'},
    green:{code:'railway.route_others_to_inner(except_train="A")'},
    laser:{code:'for tr in trains:\n    tr.set_speed_limit(0.45)\n    railway.divert_to_depot(tr)',scan:'train.set_speed_limit(0.45)\nrailway.divert_to_depot(train)'},
    eco:{code:'for tr in trains:\n    tr.limit_acceleration(0.62)\n    tr.enable_regenerative_braking(eff=0.75)'}
  };
  function buildBlockCode(condKey,actKey){
    const c=BLK_CONDS[condKey]||BLK_CONDS.scb,a=BLK_ACTS[actKey]||BLK_ACTS.scb;
    let body=a.code,pad=c.pad;
    if(condKey==='laser'&&a.scan)body=a.scan;
    const pre=' '.repeat(pad);
    return c.head+body.split('\n').map(l=>l?pre+l:l).join('\n')+'\n';
  }
  function applyBlocks(){
    algoCode.value=buildBlockCode(blkCond.value,blkAct.value);
    activeAlgo=blkCond.value;
    document.querySelectorAll('.lab-pill').forEach(b=>b.classList.remove('on'));
    if(blkCond.value==='laser'&&!laserOn)setLaser(true,true);
    if(blkCond.value==='green')disp.checked=true;
    runUserCode(false);
    log('[БЛОКИ] Собрана схема: «'+blkCond.options[blkCond.selectedIndex].text+'» → «'+blkAct.options[blkAct.selectedIndex].text+'»');
  }
  blkCond.addEventListener('change',()=>{blkAct.value=blkCond.value;applyBlocks();FX().relay()});
  blkAct.addEventListener('change',()=>{blkCond.value=blkAct.value;applyBlocks();FX().relay()});

  /* ---- CV livery & retrain ---- */
  const LIVERIES={
    amber:{color:'var(--accent)',rgb:[255,107,0],label:'А',clsName:'ШТАТН-А',trained:true},
    cobalt:{color:'#3b82f6',rgb:[59,130,246],label:'Экспресс-А',clsName:'ЭКСПРЕСС-А',trained:false},
    emerald:{color:'#10b981',rgb:[16,185,129],label:'Маневр-А',clsName:'МАНЕВР-А',trained:false},
    crimson:{color:'#ef4444',rgb:[239,68,68],label:'Спец-А',clsName:'СПЕЦСОСТАВ-А',trained:false}
  };
  // «Модель» CV — центроиды окрасок, собранные из кадров датасета.
  // Распознавание: ближайший центроид в RGB + уверенность по расстоянию.
  const cvModel={classes:[],mAP:0};
  cvModel.classes.push({key:'amber',cls:LIVERIES.amber.clsName,rgb:LIVERIES.amber.rgb.slice()});
  cvModel.mAP=0.97;
  function predictLivery(rgb){
    let best=null,bd=Infinity;
    for(const c of cvModel.classes){
      const d=Math.sqrt((rgb[0]-c.rgb[0])**2+(rgb[1]-c.rgb[1])**2+(rgb[2]-c.rgb[2])**2);
      if(d<bd){bd=d;best=c}
    }
    if(!best||bd>150)return {key:null,cls:'НЕИЗВ_ЛОК',conf:0,dist:bd};
    return {key:best.key,cls:best.cls,conf:clamp(1-bd/320,0.2,0.99),dist:bd};
  }
  let curLivery='amber',retrainTimer=null;
  const cvRetrain=el$('cv-retrain'),cvClsState=el$('cv-cls-state'),cvTrainBar=el$('cv-train-bar'),cvTrainFill=el$('cv-train-fill');
  function updateCvTrainUi(){
    const lv=LIVERIES[curLivery],p=predictLivery(lv.rgb),known=!!p.key&&p.key===curLivery;
    if(known){
      cvClsState.textContent='класс в базе · mAP@50 '+cvModel.mAP.toFixed(2);
      cvClsState.style.color='var(--go)';
      cvRetrain.disabled=true;cvRetrain.classList.remove('pri');
      cvRetrain.textContent='Модель знает класс '+lv.clsName+' ('+Math.round(p.conf*100)+'%)';
    }else{
      cvClsState.textContent=p.key?'похоже на '+LIVERIES[p.key].clsName+', но окрас другой':'новый окрас — модель его не знает';
      cvClsState.style.color='var(--stop)';
      cvRetrain.disabled=false;cvRetrain.classList.add('pri');
      cvRetrain.textContent='Собрать датасет и обучить (24 кадра)';
    }
  }
  function setLiveryA(key,silent){
    if(!LIVERIES[key])return;
    curLivery=key;
    const lv=LIVERIES[key],trA=trains[0];
    trA.def.color=lv.color;
    trA.cars.forEach((cg,k)=>{const r=cg.querySelector('.car');if(r)r.setAttribute('style','fill:'+lv.color+(k===0?'':';fill-opacity:.72'))});
    document.querySelectorAll('.swatch-btn').forEach(b=>b.classList.toggle('on',b.getAttribute('data-liv')===key));
    updateCvTrainUi();ui();
    if(!silent){
      FX().relay();
      const p=predictLivery(lv.rgb);
      log((p.key===key)?'Локомотив А: окрас «'+lv.label+'» распознаётся моделью CV':'[CV] Локомотив А перекрашен ('+lv.label+'): уверенность модели '+Math.round(Math.max(18,Math.min(p.conf,0.45)*100))+'%, нужно дообучение');
    }
  }
  document.querySelectorAll('.swatch-btn').forEach(b=>b.addEventListener('click',()=>setLiveryA(b.getAttribute('data-liv'),false)));
  cvRetrain.addEventListener('click',()=>{
    const lv=LIVERIES[curLivery];
    if(lv.trained||retrainTimer)return;
    cvTrainBar.hidden=false;cvTrainFill.style.width='0%';cvRetrain.disabled=true;
    cvRetrain.textContent='Сбор кадров 0/24...';
    log('[CV] Датасет: сбор 24 кадров класса «'+lv.clsName+'»...');
    const noise=()=>((Math.random()*2-1)*14);
    let frame=0,sum=[0,0,0];
    retrainTimer=setInterval(()=>{
      // «Кадр» датасета: цвет локомотива + шум освещения/сенсора
      sum[0]+=lv.rgb[0]+noise();sum[1]+=lv.rgb[1]+noise();sum[2]+=lv.rgb[2]+noise();
      frame++;
      cvTrainFill.style.width=Math.round(frame/24*100)+'%';
      cvRetrain.textContent='Сбор кадров '+frame+'/24...';
      if(frame>=24){
        clearInterval(retrainTimer);retrainTimer=null;
        const c=[Math.round(sum[0]/24),Math.round(sum[1]/24),Math.round(sum[2]/24)];
        cvModel.classes.push({key:curLivery,cls:lv.clsName,rgb:c});
        // Валидация на 40 синтетических кадрах вокруг центроида
        let ok=0;
        for(let i=0;i<40;i++){
          const s=[c[0]+noise(),c[1]+noise(),c[2]+noise()];
          if(predictLivery(s).key===curLivery)ok++;
        }
        cvModel.mAP=Math.round(ok/40*0.97*100)/100;
        lv.trained=true;cvTrainBar.hidden=true;
        if(!cvOn)cvBtn.click();
        updateCvTrainUi();FX().chime(false);
        log('[CV] Обучение завершено: mAP@50 '+cvModel.mAP.toFixed(2)+', класс «'+lv.clsName+'» добавлен в модель');
      }
    },220);
  });

  /* ---- custom task builder ---- */
  const tskObj=el$('tsk-obj'),tskMod=el$('tsk-mod'),tskSummary=el$('tsk-summary');
  function updateTaskPreview(){
    const obj=tskObj.value,mod=tskMod.value,parts=[];
    if(obj==='heavy')parts.push('увеличит состав А до 6 вагонов');
    else if(obj==='repaint')parts.push('перекрасит локомотив А в новый класс и включит CV');
    else parts.push('установит базовый состав А (3 ваг.)');
    if(mod==='cv_obs')parts.push('включит Камеру ИИ и поставит помеху на пути');
    else if(mod==='laser_depot')parts.push('активирует Лазерный пост О5 и скрипт дефектоскопии');
    else if(mod==='green_wave')parts.push('запустит приоритетный коридор «Зелёная волна»');
    else if(mod==='eco_regen')parts.push('применит алгоритм эко-вождения и рекуперации');
    tskSummary.textContent='Стенд '+parts.join(', ')+' и зафиксирует вашу задачу в журнале.';
  }
  ['tsk-lvl','tsk-obj','tsk-mod'].forEach(id=>$(id).addEventListener('change',updateTaskPreview));
  updateTaskPreview();
  el$('tsk-launch').addEventListener('click',()=>{
    const obj=tskObj.value,mod=tskMod.value,goal=el$('tsk-goal').value.trim();
    el$('tab-preset').click();el$('sim-title').scrollIntoView({behavior:'smooth'});
    if(!running)playBtn.click();
    if(obj==='heavy'){setTrainLen(0,6,true);setLiveryA('amber',true)}
    else if(obj==='repaint'){setTrainLen(0,3,true);setLiveryA('crimson',true);if(!cvOn)cvBtn.click()}
    else{setTrainLen(0,3,true);setLiveryA('amber',true)}
    if(mod==='cv_obs'){if(!cvOn)cvBtn.click();if(!obstacle)spawnObstacle()}
    else if(mod==='laser_depot')applyAlgorithm('laser',true);
    else if(mod==='green_wave')applyAlgorithm('green',true);
    else if(mod==='eco_regen')applyAlgorithm('eco',true);
    FX().chime(false);log('[ЗАДАЧА] '+(goal||'Пользовательский инженерный сценарий запущен'));
  });

  /* ---- kit configurator ---- */
  function updateCfg(){
    const cv=el$('cfg-cv').checked,ls=el$('cfg-laser').checked,ex=el$('cfg-ext').checked;
    const seats=6+(ex?4:0)+(cv?2:0),labs=8+(cv?4:0)+(ls?3:0)+(ex?3:0),specs=2+(cv?2:0)+(ls?1:0)+(ex?1:0);
    el$('cfg-seats').textContent=seats+'–'+(seats+2)+' чел.';
    el$('cfg-labs').textContent=labs+' тем';
    el$('cfg-specs').textContent=specs+' из 6';
  }
  ['cfg-cv','cfg-laser','cfg-ext'].forEach(id=>$(id).addEventListener('change',updateCfg));
  updateCfg();

  /* ---- boot ---- */
  place();paintSw();
  log('Диспетчерская запущена. Поезд А под вашим управлением, Б и В автономны');
  if(!running){playBtn.textContent='Запустить';playBtn.classList.remove('pri');livePreset.classList.add('paused')}
  ui();draw();
  requestAnimationFrame(frame);
})();
