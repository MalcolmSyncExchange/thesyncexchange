import {localWaveform} from './local-waveform.mjs';
self.onmessage=async({data})=>{try{const result=await localWaveform(data.file);self.postMessage({id:data.id,result});}catch{self.postMessage({id:data.id,unavailable:true});}};
