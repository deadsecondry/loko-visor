/* ============================================================
   РельсЛаб · мини-интерпретатор Python-подобного API
   Исполняет пользовательский скрипт прямо в браузере (без Pyodide):
   подмножество синтаксиса Python 3 + объектная модель макета.
   ============================================================ */
(function pyapi(){
  'use strict';
  const RL = window.RL;

  function PyError(msg, ln){
    const e = new Error(msg + (ln ? ' · строка ' + ln : ''));
    e.py = true; return e;
  }

  /* ---------------- лексер выражений ---------------- */
  const OPS = ['**','//','==','!=','<=','>=','+','-','*','/','%','<','>','=','(',')','[',']',',','.',':'];
  const isIdCh = c => /[A-Za-z_$\u0400-\u04FF]/.test(c);

  function lex(src, ln){
    const out = []; let i = 0;
    while(i < src.length){
      const c = src[i];
      if(c === ' ' || c === '\t'){ i++; continue; }
      if(c === '#') break;
      if(/[0-9]/.test(c)){
        let j = i; while(j < src.length && /[0-9.]/.test(src[j])) j++;
        out.push({t:'num', v:parseFloat(src.slice(i,j))}); i = j; continue;
      }
      if(c === '"' || c === "'"){
        let j = i + 1, buf = '';
        while(j < src.length && src[j] !== c){
          if(src[j] === '\\' && j + 1 < src.length){ buf += src[j+1]; j += 2; }
          else { buf += src[j]; j++; }
        }
        if(j >= src.length) throw PyError('Незакрытая строка', ln);
        out.push({t:'str', v:buf}); i = j + 1; continue;
      }
      if(isIdCh(c)){
        let j = i; while(j < src.length && (isIdCh(src[j]) || /[0-9]/.test(src[j]))) j++;
        out.push({t:'id', v:src.slice(i,j)}); i = j; continue;
      }
      let hit = null;
      for(const op of OPS) if(src.startsWith(op, i)){ hit = op; break; }
      if(!hit) throw PyError('Неизвестный символ «' + c + '»', ln);
      out.push({t:'op', v:hit}); i += hit.length;
    }
    out.push({t:'end', v:null});
    return out;
  }

  /* ---------------- парсер выражений ---------------- */
  function exprParser(tokens, ln){
    let p = 0;
    const peek = () => tokens[p];
    const next = () => tokens[p++];
    const isOp = v => peek().t === 'op' && peek().v === v;
    const isKw = v => peek().t === 'id' && peek().v === v;
    const expect = v => { if(!isOp(v)) throw PyError('Ожидалось «' + v + '»', ln); p++; };

    function callArgs(){
      const args = [], kwargs = {};
      if(isOp(')')){ p++; return {args, kwargs}; }
      for(;;){
        const t1 = tokens[p], t2 = tokens[p+1];
        if(t1 && t1.t === 'id' && t2 && t2.t === 'op' && t2.v === '='){
          p += 2; kwargs[t1.v] = parseExpr();
        } else args.push(parseExpr());
        if(isOp(',')){ p++; continue; }
        break;
      }
      expect(')');
      return {args, kwargs};
    }

    function primary(){
      const t = next();
      if(t.t === 'num') return {k:'num', v:t.v};
      if(t.t === 'str') return {k:'str', v:t.v};
      if(t.t === 'id'){
        if(t.v === 'True') return {k:'const', v:true};
        if(t.v === 'False') return {k:'const', v:false};
        if(t.v === 'None') return {k:'const', v:null};
        return {k:'name', v:t.v};
      }
      if(t.t === 'op' && t.v === '('){ const e = parseExpr(); expect(')'); return e; }
      if(t.t === 'op' && t.v === '['){
        const items = [];
        if(!isOp(']')){ for(;;){ items.push(parseExpr()); if(isOp(',')){p++;continue;} break; } }
        expect(']'); return {k:'list', items};
      }
      throw PyError('Неожиданный фрагмент выражения', ln);
    }

    function postfix(){
      let e = primary();
      for(;;){
        if(isOp('.')){
          p++; const n = next();
          if(n.t !== 'id') throw PyError('Ожидалось имя атрибута', ln);
          e = {k:'attr', obj:e, name:n.v};
        } else if(isOp('(')){
          p++; const {args, kwargs} = callArgs();
          e = {k:'call', fn:e, args, kwargs};
        } else if(isOp('[')){
          p++; const key = parseExpr(); expect(']');
          e = {k:'index', obj:e, key};
        } else break;
      }
      return e;
    }

    function unary(){
      if(isOp('-')){ p++; return {k:'neg', e:unary()}; }
      if(isOp('+')){ p++; return unary(); }
      return postfix();
    }
    function mul(){
      let l = unary();
      while(isOp('*') || isOp('/') || isOp('%') || isOp('//')){
        const op = next().v; l = {k:'bin', op, l, r:unary()};
      }
      return l;
    }
    function add(){
      let l = mul();
      while(isOp('+') || isOp('-')){
        const op = next().v; l = {k:'bin', op, l, r:mul()};
      }
      return l;
    }
    function compare(){
      let l = add();
      for(;;){
        if(isOp('==') || isOp('!=') || isOp('<') || isOp('>') || isOp('<=') || isOp('>=')){
          const op = next().v; l = {k:'cmp', op, l, r:add()};
        } else if(isKw('in')){ p++; l = {k:'in', l, r:add()}; }
        else break;
      }
      return l;
    }
    function notE(){
      if(isKw('not')){ p++; return {k:'not', e:notE()}; }
      return compare();
    }
    function andE(){
      let l = notE();
      while(isKw('and')){ p++; l = {k:'and', l, r:notE()}; }
      return l;
    }
    function parseExpr(){
      let l = andE();
      while(isKw('or')){ p++; l = {k:'or', l, r:andE()}; }
      return l;
    }

    return {parse:parseExpr};
  }

  /* ---------------- разбор программы по строкам ---------------- */
  function parseProgram(src){
    const raw = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const lines = [];
    for(let i = 0; i < raw.length; i++){
      const text = raw[i];
      const stripped = text.trim();
      if(!stripped || stripped[0] === '#') continue;
      const indent = text.length - text.replace(/^\s+/, '').length;
      lines.push({indent, text:stripped, ln:i + 1});
    }
    if(!lines.length) return [];
    const [stmts, idx] = parseBlock(lines, 0, lines[0].indent);
    if(idx < lines.length) throw PyError('Лишний отступ', lines[idx].ln);
    return stmts;
  }

  function nextIndent(lines, i, parent){
    if(i < lines.length && lines[i].indent > parent) return lines[i].indent;
    throw PyError('Ожидался блок с отступом', i < lines.length ? lines[i].ln : undefined);
  }

  function parseBlock(lines, i, indent){
    const out = [];
    while(i < lines.length && lines[i].indent === indent){
      const [st, ni] = parseStmt(lines, i);
      out.push(st); i = ni;
    }
    if(i < lines.length && lines[i].indent > indent) throw PyError('Неожиданный отступ', lines[i].ln);
    return [out, i];
  }

  function splitAssign(text){
    let depth = 0, q = null;
    for(let i = 0; i < text.length; i++){
      const c = text[i];
      if(q){ if(c === q && text[i-1] !== '\\') q = null; continue; }
      if(c === '"' || c === "'"){ q = c; continue; }
      if(c === '(' || c === '[') depth++;
      else if(c === ')' || c === ']') depth--;
      else if(c === '=' && depth === 0){
        const prev = text[i-1], nxt = text[i+1];
        if(nxt === '=' || prev === '!' || prev === '<' || prev === '>' || prev === '=') continue;
        return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
      }
    }
    return null;
  }

  function parseParams(s){
    return s.split(',').map(x => x.trim()).filter(Boolean).map(x => {
      const eq = x.indexOf('=');
      if(eq < 0) return {name:x, def:null};
      return {name:x.slice(0, eq).trim(), def:exprParser(lex(x.slice(eq + 1), 0), 0).parse()};
    });
  }

  function parseStmt(lines, i){
    const L = lines[i], txt = L.text, ln = L.ln;
    let m;

    if((m = /^def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:$/.exec(txt))){
      const params = parseParams(m[2]);
      const ind = nextIndent(lines, i + 1, L.indent);
      const [body, ni] = parseBlock(lines, i + 1, ind);
      return [{k:'def', name:m[1], params, body, ln}, ni];
    }

    if((m = /^for\s+([A-Za-z_]\w*)\s+in\s+(.+):$/.exec(txt))){
      const iter = exprParser(lex(m[2], ln), ln).parse();
      const ind = nextIndent(lines, i + 1, L.indent);
      const [body, ni] = parseBlock(lines, i + 1, ind);
      return [{k:'for', var:m[1], iter, body, ln}, ni];
    }

    if((m = /^while\s+(.+):$/.exec(txt))){
      const test = exprParser(lex(m[1], ln), ln).parse();
      const ind = nextIndent(lines, i + 1, L.indent);
      const [body, ni] = parseBlock(lines, i + 1, ind);
      return [{k:'while', test, body, ln}, ni];
    }

    if((m = /^if\s+(.+):$/.exec(txt))){
      const branches = [];
      let j = i, test = m[1];
      for(;;){
        const ind = nextIndent(lines, j + 1, L.indent);
        const [body, nj] = parseBlock(lines, j + 1, ind);
        branches.push({test:test === null ? null : exprParser(lex(test, ln), ln).parse(), body});
        j = nj;
        if(j < lines.length && lines[j].indent === L.indent){
          const t2 = lines[j].text; let mm;
          if((mm = /^elif\s+(.+):$/.exec(t2))){ test = mm[1]; j++; continue; }
          if(/^else\s*:$/.test(t2)){
            j++;
            const ind2 = nextIndent(lines, j, L.indent);
            const [b2, nj2] = parseBlock(lines, j, ind2);
            branches.push({test:null, body:b2}); j = nj2;
          }
        }
        break;
      }
      return [{k:'if', branches, ln}, j];
    }

    if(/^return(\s|$)/.test(txt)){
      const rest = txt.slice(6).trim();
      return [{k:'return', expr:rest ? exprParser(lex(rest, ln), ln).parse() : null, ln}, i + 1];
    }
    if(txt === 'break') return [{k:'break', ln}, i + 1];
    if(txt === 'continue') return [{k:'continue', ln}, i + 1];
    if(txt === 'pass') return [{k:'pass', ln}, i + 1];

    const asg = splitAssign(txt);
    if(asg){
      const [lhs, rhs] = asg;
      const expr = exprParser(lex(rhs, ln), ln).parse();
      let target;
      if((m = /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/.exec(lhs))){
        target = {k:'attr', obj:{k:'name', v:m[1]}, name:m[2]};
      } else if(/^[A-Za-z_]\w*$/.test(lhs)){
        target = {k:'name', v:lhs};
      } else throw PyError('Недопустимая цель присваивания «' + lhs + '»', ln);
      return [{k:'assign', target, expr, ln}, i + 1];
    }

    return [{k:'expr', expr:exprParser(lex(txt, ln), ln).parse(), ln}, i + 1];
  }

  /* ---------------- объектная модель ---------------- */
  class PyObj {
    constructor(props, methods){ this.p = props || {}; this.m = methods || {}; }
  }
  class PyDict {
    constructor(entries){
      this.map = new Map(); this.order = [];
      for(const [k, v] of entries){ this.map.set(k, v); this.order.push(k); }
    }
  }
  class Scope {
    constructor(parent){ this.vars = Object.create(null); this.parent = parent; }
    find(name){
      let s = this;
      while(s){ if(name in s.vars) return s; s = s.parent; }
      return null;
    }
  }

  function num(v, dflt){
    if(v === undefined || v === null) return dflt === undefined ? 0 : dflt;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (dflt === undefined ? 0 : dflt);
  }
  function truthy(v){
    if(v === null || v === undefined || v === false || v === 0 || v === '') return false;
    if(Array.isArray(v)) return v.length > 0;
    if(v instanceof PyDict) return v.order.length > 0;
    return true;
  }
  function iterate(v){
    if(Array.isArray(v)) return v;
    if(v instanceof PyDict) return v.order.map(k => v.map.get(k));
    if(typeof v === 'string') return v.split('');
    throw PyError('Объект не поддерживает перебор (ожидался список или набор поездов)');
  }
  function getAttr(o, name){
    if(o instanceof PyObj){
      if(Object.prototype.hasOwnProperty.call(o.p, name)){
        const val = o.p[name];
        return typeof val === 'function' ? val() : val;
      }
      if(o.m && o.m[name]) return {__bound:o, __name:name};
      throw PyError('У объекта нет атрибута «' + name + '»');
    }
    if(o instanceof PyDict){
      if(o.map.has(name)) return o.map.get(name);
      throw PyError('Нет элемента «' + name + '»');
    }
    throw PyError('Нельзя прочитать «' + name + '» у этого значения');
  }
  function setAttr(o, name, v){
    if(o instanceof PyObj){ o.p[name] = v; return; }
    throw PyError('Нельзя изменить «' + name + '»');
  }
  function getItem(o, k){
    if(o instanceof PyDict){
      if(!o.map.has(k)) throw PyError('Нет ключа «' + k + '»');
      return o.map.get(k);
    }
    if(Array.isArray(o)){
      let i = Math.trunc(num(k)); if(i < 0) i += o.length;
      return o[i];
    }
    if(typeof o === 'string') return o[Math.trunc(num(k))];
    throw PyError('Объект не поддерживает индексацию');
  }
  function callValue(fn, args, kwargs){
    if(fn && fn.__bound){
      const impl = fn.__bound.m[fn.__name];
      if(!impl) throw PyError('Метод «' + fn.__name + '» недоступен');
      return impl(args, kwargs);
    }
    if(typeof fn === 'function') return fn(args, kwargs);
    throw PyError('Вызов не является функцией');
  }

  /* ---------------- исполнение ---------------- */
  let STEPS = 0, DEPTH = 0;
  const LIMIT = 60000, MAXDEPTH = 24;

  function ev(n, sc){
    switch(n.k){
      case 'num': case 'str': return n.v;
      case 'const': return n.v;
      case 'list': return n.items.map(x => ev(x, sc));
      case 'name': {
        const owner = sc.find(n.v);
        if(!owner) throw PyError('Имя «' + n.v + '» не определено');
        return owner.vars[n.v];
      }
      case 'attr': return getAttr(ev(n.obj, sc), n.name);
      case 'index': return getItem(ev(n.obj, sc), ev(n.key, sc));
      case 'call': {
        const fn = ev(n.fn, sc);
        const args = n.args.map(a => ev(a, sc));
        const kwargs = {};
        for(const k in n.kwargs) kwargs[k] = ev(n.kwargs[k], sc);
        return callValue(fn, args, kwargs);
      }
      case 'bin': {
        const a = ev(n.l, sc), b = ev(n.r, sc);
        switch(n.op){
          case '+': return (typeof a === 'string' || typeof b === 'string') ? String(a) + String(b) : num(a) + num(b);
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(b) === 0 ? 0 : num(a) / num(b);
          case '//': return num(b) === 0 ? 0 : Math.floor(num(a) / num(b));
          case '%': return num(b) === 0 ? 0 : num(a) % num(b);
          case '**': return Math.pow(num(a), num(b));
        }
        throw PyError('Неизвестный оператор ' + n.op);
      }
      case 'neg': return -num(ev(n.e, sc));
      case 'not': return !truthy(ev(n.e, sc));
      case 'and': { const a = ev(n.l, sc); return truthy(a) ? ev(n.r, sc) : a; }
      case 'or': { const a = ev(n.l, sc); return truthy(a) ? a : ev(n.r, sc); }
      case 'cmp': {
        const a = ev(n.l, sc), b = ev(n.r, sc);
        switch(n.op){
          case '==': return a === b || num(a, NaN) === num(b, NaN);
          case '!=': return !(a === b || num(a, NaN) === num(b, NaN));
          case '<': return a < b;
          case '>': return a > b;
          case '<=': return a <= b;
          case '>=': return a >= b;
        }
        return false;
      }
      case 'in': {
        const a = ev(n.l, sc), b = ev(n.r, sc);
        return iterate(b).some(x => x === a || num(x, NaN) === num(a, NaN));
      }
    }
    throw PyError('Неподдерживаемое выражение');
  }

  function exec(list, sc){
    for(const s of list){
      if(++STEPS > LIMIT) throw PyError('Превышен лимит операций — проверьте циклы');
      switch(s.k){
        case 'def': sc.vars[s.name] = {__def:s}; break;
        case 'assign': {
          const v = ev(s.expr, sc);
          if(s.target.k === 'name') sc.vars[s.target.v] = v;
          else setAttr(ev(s.target.obj, sc), s.target.name, v);
          break;
        }
        case 'expr': ev(s.expr, sc); break;
        case 'pass': break;
        case 'return': return {__ret:true, value:s.expr ? ev(s.expr, sc) : undefined};
        case 'break': return 'break';
        case 'continue': return 'continue';
        case 'for': {
          const seq = iterate(ev(s.iter, sc));
          for(const item of seq){
            const child = new Scope(sc); child.vars[s.var] = item;
            const r = exec(s.body, child);
            if(r === 'break') break;
            if(r === 'continue') continue;
            if(r && r.__ret) return r;
          }
          break;
        }
        case 'while': {
          let guard = 0;
          while(truthy(ev(s.test, sc))){
            if(++guard > 5000) throw PyError('Цикл while не завершился');
            const r = exec(s.body, new Scope(sc));
            if(r === 'break') break;
            if(r === 'continue') continue;
            if(r && r.__ret) return r;
          }
          break;
        }
        case 'if': {
          for(const br of s.branches){
            if(br.test === null || truthy(ev(br.test, sc))){
              const r = exec(br.body, new Scope(sc));
              if(r) return r;
              break;
            }
          }
          break;
        }
      }
    }
  }

  function callDef(def, args, sc, ln){
    if(++DEPTH > MAXDEPTH){ DEPTH--; throw PyError('Слишком глубокая рекурсия', ln); }
    const child = new Scope(sc);
    def.params.forEach((p, idx) => {
      child.vars[p.name] = idx < args.length ? args[idx] : (p.def ? ev(p.def, sc) : null);
    });
    const r = exec(def.body, child);
    DEPTH--;
    return (r && r.__ret) ? r.value : undefined;
  }

  /* ---------------- публичный API ---------------- */
  RL.PyAPI = {
    obj:(props, methods) => new PyObj(props, methods),
    dict:entries => new PyDict(entries),
    PyObj, PyDict, num, truthy,

    /** Скомпилировать скрипт. api — объект с railway/trains/... */
    compile(code, api){
      const stmts = parseProgram(code);
      const g = new Scope(null);

      g.vars.True = true; g.vars.False = false; g.vars.None = null;
      g.vars.len = (a) => (a[0] instanceof PyDict ? a[0].order.length : Array.isArray(a[0]) ? a[0].length : String(a[0] ?? '').length);
      g.vars.range = (a) => { const n = Math.trunc(num(a[0])); const out = []; for(let i = 0; i < n; i++) out.push(i); return out; };
      g.vars.min = (a) => Math.min.apply(null, a.map(x => num(x)));
      g.vars.max = (a) => Math.max.apply(null, a.map(x => num(x)));
      g.vars.abs = (a) => Math.abs(num(a[0]));
      g.vars.round = (a) => { const d = a.length > 1 ? Math.trunc(num(a[1])) : 0; const m = Math.pow(10, d); return Math.round(num(a[0]) * m) / m; };
      g.vars.int = (a) => Math.trunc(num(a[0]));
      g.vars.str = (a) => String(a[0] ?? '');
      g.vars.print = (a) => { if(api && api.log) api.log(a.map(x => typeof x === 'number' ? String(Math.round(x * 100) / 100) : String(x)).join(' ')); return null; };

      if(api) for(const k in api) g.vars[k] = api[k];

      STEPS = 0;
      exec(stmts, g); // верхнеуровневые вызовы (например railway.enable_sensor(...))

      const tickDef = g.vars.on_tick, scanDef = g.vars.on_wheel_scan;
      // on_tick принято объявлять как def on_tick(railway, trains) — передаём
      // объекты макета, чтобы параметры не затеняли их значением None.
      const tickArgs = [api ? api.railway : null, api ? api.trains : null];
      return {
        hasTick: !!(tickDef && tickDef.__def),
        hasScan: !!(scanDef && scanDef.__def),
        tick(){
          if(!(tickDef && tickDef.__def)) return;
          STEPS = 0;
          callDef(tickDef.__def, tickArgs, g);
        },
        scan(train, wear){
          if(!(scanDef && scanDef.__def)) return;
          STEPS = 0;
          callDef(scanDef.__def, [train, num(wear)], g);
        }
      };
    }
  };
})();
