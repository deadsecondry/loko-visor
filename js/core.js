/* РельсЛаб · ядро: утилиты, кэш DOM */
/* ================================================================
   РЕЛЬСЛАБ v6.0 — Модернизированная платформа
   Архитектура: единое ядро (RL namespace) + модули симуляции.
   Модули: fx (звук/тема) → core (утилиты) → sim (движок) →
   ui (панели) → builder (конструктор).
   ================================================================ */
'use strict';

/* ---- CORE: утилиты, общие для всех модулей ---- */
window.RL = {};
const RL = window.RL;
(function core(){
  const NS='http://www.w3.org/2000/svg';
  const $=id=>document.getElementById(id);
  const svgEl=(n,a,p)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e};
  const mmss=t=>{const m=Math.floor(t/60),s=Math.floor(t%60);return (m<10?'0':'')+m+':'+(s<10?'0':'')+s};
  const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
  const reducedMotion=()=>window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Кэш DOM-элементов — заполняется лениво, переиспользуется в циклах
  const cache={};
  function el$(id){return cache[id]||(cache[id]=$(id))}
  Object.assign(RL,{NS,$,el$,svgEl,mmss,clamp,reducedMotion});
})();
