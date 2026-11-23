/* РельсЛаб · звук, тема, UI-хром */
/* ---- FX: Web Audio синтезатор + тема пульта ---- */
(function fx(){
  const RL = window.RL;
  const {el$} = RL;
  let ctx=null,enabled=false;
  function ensureCtx(){
    if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)ctx=new AC()}
    if(ctx&&ctx.state==='suspended')ctx.resume();
  }
  // Общий осцилляторный генератор — устраняет дублирование из 5 функций
  // fr — момент окончания частотной огибающей (по умолчанию 85% длительности)
  function tone({type,f0,f1,fr,dur,vol,delay=0,filter}){
    if(!enabled)return;ensureCtx();if(!ctx)return;
    const t=ctx.currentTime+delay,osc=ctx.createOscillator(),g=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(f0,t);
    if(f1)osc.frequency.exponentialRampToValueAtTime(f1,t+(fr||dur*0.85));
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    if(filter){const flt=ctx.createBiquadFilter();flt.type='lowpass';flt.frequency.setValueAtTime(filter,t);osc.connect(flt);flt.connect(g)}
    else osc.connect(g);
    g.connect(ctx.destination);osc.start(t);osc.stop(t+dur+0.005);
  }
  RL.RailFX={
    isOn:()=>enabled,
    relay:()=>tone({type:'triangle',f0:420,f1:140,fr:0.045,dur:0.05,vol:0.14}),
    clack(cars){
      if(!enabled)return;ensureCtx();if(!ctx)return;
      const n=Math.min(4,Math.max(1,Math.ceil((cars||3)/2)));
      for(let i=0;i<n;i++)tone({type:'square',f0:190-i*12,f1:75,fr:0.025,dur:0.028,vol:0.032,delay:i*0.055});
    },
    horn(){
      if(!enabled)return;ensureCtx();if(!ctx)return;
      [293.66,369.99].forEach(f=>{
        // тифон: пила через lowpass с ADSR-огибающей
        const t=ctx.currentTime,osc=ctx.createOscillator(),g=ctx.createGain(),flt=ctx.createBiquadFilter();
        osc.type='sawtooth';osc.frequency.setValueAtTime(f,t);
        flt.type='lowpass';flt.frequency.setValueAtTime(900,t);
        g.gain.setValueAtTime(0.001,t);g.gain.linearRampToValueAtTime(0.08,t+0.04);
        g.gain.setValueAtTime(0.08,t+0.28);g.gain.exponentialRampToValueAtTime(0.001,t+0.42);
        osc.connect(flt);flt.connect(g);g.connect(ctx.destination);osc.start(t);osc.stop(t+0.44);
      });
    },
    scan:()=>tone({type:'sine',f0:1180,f1:1640,fr:0.07,dur:0.08,vol:0.045}),
    chime(warn){
      if(!enabled)return;ensureCtx();if(!ctx)return;
      (warn?[330,220]:[587.3,784]).forEach((f,i)=>tone({type:'sine',f0:f,dur:0.19,vol:0.07,delay:i*0.09}));
    }
  };
  const sndBtn=el$('snd-btn');
  sndBtn.addEventListener('click',()=>{
    enabled=!enabled;
    if(enabled){ensureCtx();RL.RailFX.chime(false)}
    sndBtn.textContent=enabled?'Звук: вкл':'Звук: выкл';
    sndBtn.classList.toggle('on',enabled);
    sndBtn.setAttribute('aria-pressed',String(enabled));
  });
  // Тема
  const thmBtn=el$('thm-btn');
  // Тема: по умолчанию светлая («Оранж-лайн»), переключатель — на тёмную
  let dark=false;
  function applyTheme(isDark){
    document.documentElement.setAttribute('data-theme',isDark?'dark':'light');
    thmBtn.textContent=isDark?'Тема: ночь':'Тема: день';
    RL.isDay=!isDark; // кэш для цикла отрисовки
  }
  applyTheme(dark);
  thmBtn.addEventListener('click',()=>{dark=!dark;applyTheme(dark)});

  /* ---- UI-хром: часы реального времени ---- */
  const clock=el$('clock');
  if(clock){
    const pad=n=>String(n).padStart(2,'0');
    const tick=()=>{
      const d=new Date();
      clock.textContent=pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
    };
    tick();
    setInterval(tick,1000);
  }

  /* ---- Статус систем в шапке (СЦБ / АТП / CV) ---- */
  const sysMap={};
  document.querySelectorAll('.sys').forEach(node=>{
    sysMap[node.getAttribute('data-sys')]=node;
  });
  RL.setStatus=function(key,on,label){
    const node=sysMap[key];
    if(!node)return;
    node.classList.toggle('on',!!on);
    const b=node.querySelector('b');
    if(b&&label)b.textContent=label;
  };
  RL.setStatus('scb',true,'активна');

  /* ---- Вкладки пульта: Тяга / Путь / Сенсоры / Журнал ---- */
  const tabs=[...document.querySelectorAll('.ptab[data-ptab]')];
  const panes=[...document.querySelectorAll('.pane[data-pane]')];
  tabs.forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.getAttribute('data-ptab');
      tabs.forEach(t=>{
        const on=t===btn;
        t.classList.toggle('on',on);
        t.setAttribute('aria-selected',String(on));
      });
      panes.forEach(p=>p.classList.toggle('on',p.getAttribute('data-pane')===id));
    });
  });
})();
