import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export const source = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
export const plain = value => JSON.parse(JSON.stringify(value));
export function load(file, stubs = {}, globals = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const resolve = name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/')) {
      for (const ext of ['.ts','.tsx','.mjs']) if (existsSync(new URL('../../' + name.slice(2) + ext, import.meta.url))) return load(name.slice(2) + ext, stubs, globals);
    }
    return require(name);
  };
  runInNewContext(code, { module: loaded, exports: loaded.exports, require: resolve, URL, URLSearchParams, Request, Response, FormData, TextDecoder, AbortSignal, crypto: webcrypto,
    process: { env: {} }, console, fetch: async()=>{ throw Error('Unmocked network forbidden'); }, ...globals }, { filename: file });
  return loaded.exports;
}
export function hookRunner() {
  const slots=[];let cursor=0;let dirty=false;let effects=[];
  const hooks={
    useState(initial){const n=cursor++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return [slots[n],value=>{const next=typeof value==='function'?value(slots[n]):value;dirty ||= next!==slots[n];slots[n]=next;}];},
    useRef(initial){const n=cursor++;return slots[n] ||= {current:initial};},
    useEffect(effect,deps){const n=cursor++;if(!slots[n]||deps.some((value,i)=>value!==slots[n][i]))effects.push(effect);slots[n]=deps;},
    useSyncExternalStore(_subscribe,snapshot){return snapshot();}
  };
  return {hooks,render(Component,props){let tree;do{cursor=0;dirty=false;effects=[];tree=Component(props);effects.forEach(effect=>effect());}while(dirty);return tree;}};
}
export function elements(tree,predicate) {
  if(!tree||typeof tree!=='object')return [];
  if(Array.isArray(tree))return tree.flatMap(child=>elements(child,predicate));
  return [...(predicate(tree)?[tree]:[]),...elements(tree.props?.children,predicate)];
}
