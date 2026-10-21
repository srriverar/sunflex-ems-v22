/* ED/UC Simulator: the optimisation, off the main thread.

   A module worker: it loads ed-core.js (the same file the page and the audit
   use) and the PSA.js optimiser, which fetches the HiGHS solver beside it on
   the first run. The page posts { id, model, opts } and gets back
   { id, res } or { id, error }; { id, init: true } only loads the engine and
   answers with the standard line types for the inspector. */
import './ed-core.js';

var ED = self.ED;
var engineP = null;
function engine(){
  if(!engineP){
    engineP = import('./engine/psa-opt.min.js');
    engineP.catch(function(){ engineP = null; });
  }
  return engineP;
}

self.onmessage = function(e){
  var d = e.data || {};
  engine().then(function(psa){
    if(d.init){ self.postMessage({ id: d.id, types: psa.stdTypes() }); return; }
    return ED.solve(psa, ED.load(d.model), d.opts).then(function(res){
      self.postMessage({ id: d.id, res: res });
    });
  }).catch(function(err){
    self.postMessage({ id: d.id, error: String(err && err.message || err) });
  });
};
