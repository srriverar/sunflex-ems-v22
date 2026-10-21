/* Load Flow Simulator: encodes the animated diagram as a GIF, off the main
   thread. One palette for the whole loop (taken from the first frame, whose
   arrows already show every colour), and every later frame keeps only the
   pixels that changed: the rest is transparent over the frame before it. */
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';

self.onmessage = function(e){
  try {
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
