import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute } from 'node:path';
import { MediaError, limits } from './errors.mjs';
const launcher = fileURLToPath(new URL('sandbox.py', import.meta.url));
export const FFMPEG_VERSION = '9.0.2';
export class MediaTools {
  constructor(toolDir, python = '/usr/bin/python3') { this.toolDir = toolDir; this.python = python; this.peakParserRss=0; this.parserCpuMicros=0; }
  async run(tool, args, { signal, onData, maxBytes = limits.probeBytes, fileLimit = 4_000_000, timeout = limits.processMs, readOnly = false } = {}) {
    if(signal?.aborted)throw new MediaError('worker_lease_expired');
    return new Promise((resolve, reject) => {
      const roots=[...new Set(args.filter(isAbsolute).map(dirname))];
      if(roots.length>1){reject(new MediaError('validation_failed'));return;}
      const child = spawn(this.python, [launcher, tool, String(fileLimit), ...args], {
        env: { MEDIA_TOOL_DIR: this.toolDir, MEDIA_WORK_DIR:roots[0]||'/work', MEDIA_READ_ONLY:readOnly?'1':'0' }, stdio: ['ignore', 'pipe', 'pipe','pipe'], detached:true
      });
      let failure, bytes = 0, errBytes = 0; const chunks = [];
      const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{/* already exited */}};
      const abort=()=>{failure=new MediaError('worker_lease_expired');kill();};
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      const timer = setTimeout(() => { failure = new MediaError('validator_timeout'); kill(); }, timeout);
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) { failure = new MediaError('validation_failed'); kill(); return; }
        try { if (onData) onData(chunk); else chunks.push(chunk); }
        catch (error) { failure = error; kill(); }
      });
      child.stderr.on('data', chunk => { errBytes += chunk.length; if (errBytes > limits.stderrBytes) { failure = new MediaError('audio_unreadable'); kill(); } });
      let stats='';child.stdio[3].on('data',chunk=>{stats+=chunk.toString();if(stats.length>256)kill();});
      child.on('error', () => { failure = new MediaError('temporary_system_error'); kill(); });
      // Exit occurs even if descendants keep pipes open. End all mutation
      // capability before close resolves and output validation starts.
      child.on('exit',kill);
      child.on('close', code => { kill();clearTimeout(timer);signal?.removeEventListener('abort',abort);try{const measured=JSON.parse(stats),rss=measured.peak_rss_bytes;for(const key of ['cpu_user_us','cpu_system_us'])if(Number.isSafeInteger(measured[key])&&measured[key]>=0)this.parserCpuMicros+=measured[key];if(Number.isSafeInteger(rss)&&rss>0)this.peakParserRss=Math.max(this.peakParserRss,rss);}catch{/* unavailable on killed process */}if (failure || code !== 0) reject(failure || new MediaError('audio_unreadable')); else resolve(Buffer.concat(chunks)); });
    });
  }
  async verify() {
    for (const tool of ['ffmpeg', 'ffprobe']) {
      const output = await this.run(tool, ['-version']);
      if (!output.toString().startsWith(`${tool} version ${FFMPEG_VERSION} `)) throw new MediaError('temporary_system_error');
    }
  }
  async probe(path, format, signal, maxAllocation = 67108864, readOnly = true) {
    const bytes = await this.run('ffprobe', ['-v','error','-threads','1','-protocol_whitelist','file,pipe','-max_alloc',String(maxAllocation),
      '-f',format,'-show_entries','stream=codec_type,codec_name,profile,sample_rate,channels,bits_per_raw_sample,bits_per_sample,nb_frames,width,height:stream_disposition=attached_pic:format=duration,format_name',
      '-of','json',path], { signal, readOnly });
    try { return JSON.parse(bytes); } catch { throw new MediaError('audio_unreadable'); }
  }
  async decode(path, format, channels, signal, onSamples, maxFrames = 900 * 192000, readOnly = true) {
    let carry = Buffer.alloc(0), samples = 0;
    await this.run('ffmpeg', ['-nostdin','-v','error','-xerror','-err_detect','explode','-threads','1','-filter_threads','1',
      '-protocol_whitelist','file,pipe','-max_alloc','67108864','-f',format,'-i',path,'-map','0:a:0','-vn','-sn','-dn',
      '-c:a','pcm_f32le','-f','f32le','pipe:1'], { signal, readOnly, maxBytes: maxFrames * channels * 4,
      onData(chunk) {
        const data = carry.length ? Buffer.concat([carry,chunk]) : chunk;
        const end = data.length - data.length % 4;
        for (let i = 0; i < end; i += 4) {
          const value = data.readFloatLE(i); if (!Number.isFinite(value)) throw new MediaError('audio_unreadable');
          if (onSamples) onSamples(value, Math.floor(samples / channels), samples % channels); samples++;
        }
        carry = Buffer.from(data.subarray(end));
      }
    });
    if (carry.length || samples % channels) throw new MediaError('audio_unreadable');
    return samples / channels;
  }
}
