/* ED/UC Simulator: encodes the animated diagram as a GIF, off the main
   thread. One palette for the whole loop (taken from the first frame, whose
   arrows already show every colour), and every later frame keeps only the
   pixels that changed: the rest is transparent over the frame before it.

   A run through the hours is too many frames to hand over at once, so it comes
   as a stream: 'start' with a sample of its colours for the palette, then one
   'frame' at a time (each acknowledged), then 'end'. */
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';

var S = null;
function stream(d){
  if(d.cmd === 'start'){
    var pal = quantize(new Uint8ClampedArray(d.sample), 255);
    while(pal.length < 255) pal.push([0, 0, 0]);
    S = { enc: GIFEncoder(), pal: pal, palette: pal.concat([[255, 0, 255]]), prev: null, w: d.w, h: d.h, n: 0 };
    return;
  }
  if(d.cmd === 'frame'){
    var idx = applyPalette(new Uint8ClampedArray(d.buf), S.pal);
    if(!S.prev) S.enc.writeFrame(idx, S.w, S.h, { palette: S.palette, delay: d.delay, repeat: 0 });
    else {
      var out = new Uint8Array(idx.length);
      for(var p = 0; p < idx.length; p++) out[p] = idx[p] === S.prev[p] ? 255 : idx[p];
      S.enc.writeFrame(out, S.w, S.h, { delay: d.delay, transparent: true, transparentIndex: 255, dispose: 1 });
    }
    S.prev = idx;
    self.postMessage({ ack: ++S.n });
    return;
  }
  S.enc.finish();
  var bytes = S.enc.bytes();
  S = null;
  self.postMessage({ bytes: bytes }, [bytes.buffer]);
}

self.onmessage = function(e){
  try {
    if(e.data && e.data.cmd){ stream(e.data); return; }
    var d = e.data, w = d.w, h = d.h, bufs = d.frames, delay = d.delay;
    var enc = GIFEncoder();
    var pal = quantize(new Uint8ClampedArray(bufs[0]), 255);
    while(pal.length < 255) pal.push([0, 0, 0]);
    var palette = pal.concat([[255, 0, 255]]); // index 255: transparent
    var prev = null;
    for(var i = 0; i < bufs.length; i++){
      var idx = applyPalette(new Uint8ClampedArray(bufs[i]), pal);
      if(i === 0) enc.writeFrame(idx, w, h, { palette: palette, delay: delay, repeat: 0 });
      else {
        var out = new Uint8Array(idx.length);
        for(var p = 0; p < idx.length; p++) out[p] = idx[p] === prev[p] ? 255 : idx[p];
        enc.writeFrame(out, w, h, { delay: delay, transparent: true, transparentIndex: 255, dispose: 1 });
      }
      prev = idx;
      self.postMessage({ progress: (i + 1) / bufs.length });
    }
    enc.finish();
    var bytes = enc.bytes();
    self.postMessage({ bytes: bytes }, [bytes.buffer]);
  } catch(err){
    self.postMessage({ error: String(err && err.message || err) });
  }
};
