import {localTempo} from './local-tempo.mjs';
self.onmessage=async({data})=>{try{self.postMessage(await localTempo(data.file));}catch{self.postMessage({reason:'BPM could not be determined reliably. Enter BPM manually.'});}};
