/* Guided-tour config for the Load Flow Simulator.
   The shared engine (../tour-shared.js) reads this object.

   The tour never edits the diagram, so it has nothing to save or restore
   beyond the tab, which the engine handles. The steps on the results solve
   a network that changed since its last run first (window.__LF_TOUR, in
   script.js), so they never point at faded or empty figures. */
function lfTab(name) {
  var tab = document.querySelector('.ctrl-tab[data-tab="' + name + '"]');
  if (tab && !tab.classList.contains('active')) tab.click();
}
function lfResults() {
  if (window.__LF_TOUR) window.__LF_TOUR.ensureResults();
}
window.__TOUR = {
  seenKey: 'loadflow-tour-v1-seen',
  launchLabel: '🧭 Take a tour',
  steps: [
    {
      target: null,
      title: '👋 Welcome to the Load Flow Simulator',
      body: 'Draw a <strong>single-line diagram</strong>, run a load flow and watch the power move. ' +
            'About a minute.'
    },
    {
      target: '.quick-start-row',
      title: '① Start from a network',
      body: 'One click loads a worked network and solves it:' +
            '<ul><li>WSCC 9-bus, 3-bus ring</li>' +
            '<li>20/0.4 kV feeder, HVDC link</li>' +
            '<li>Save or open your own from the same row</li></ul>'
    },
    {
      target: '#palette',
      title: '② Draw your own',
      body: '<ul><li>Drag a part onto the diagram, a device onto a <strong>bus</strong></li>' +
            '<li>Line, transformer, HVDC link: pick it, drag bus to bus</li>' +
            '<li>Undo, redo and Clear sit below</li></ul>'
    },
    {
      target: '#sldStage',
      title: '③ Edit on the diagram',
      body: '<ul><li>Click to <strong>select</strong>, drag to move, Del deletes</li>' +
            '<li>+ and − zoom; ⤢ fills the screen</li></ul>'
    },
    {
      target: ['.ctrl-tabs', '#tab-element'],
      onEnter: function () { lfTab('element'); },
      title: '④ Element',
      body: '<ul><li>A selected element’s ratings, set points and line types</li>' +
            '<li>With nothing selected: the network’s name, every element and any <strong>checks</strong> to fix</li></ul>'
    },
    {
      target: ['.ctrl-tabs', '#tab-solver'],
      onEnter: function () { lfTab('solver'); },
      title: '⑤ Load flow and Labels',
      body: '<ul><li><strong>Load flow</strong>: AC Newton-Raphson or DC, and the limits that flag a bus or branch</li>' +
            '<li>Labels: what each kind of element shows</li></ul>'
    },
    {
      target: '#runBtn',
      title: '⑥ Run',
      body: 'Press <strong>Run load flow</strong> (Ctrl+Enter) after a change. ' +
            'Until you do, the last result stays, faded.'
    },
    {
      target: '.sld-viewbar',
      onEnter: lfResults,
      title: '⑦ Watch the power move',
      body: '<ul><li>Solid arrows: active power; open arrows: reactive</li>' +
            '<li><strong>Colour by</strong> bus voltage or branch loading: amber nears a limit, red is past it</li></ul>'
    },
    {
      target: '.metrics.lf-result',
      onEnter: lfResults,
      title: '⑧ Read the result',
      body: 'Iterations to converge, losses, the voltage range and the most loaded branch.'
    },
    {
      target: '#tablesCard',
      onEnter: lfResults,
      title: '⑨ Results by element',
      body: '<ul><li>Opens from its chevron</li>' +
            '<li>Buses, Branches and Devices, each with <strong>⬇ CSV</strong></li></ul>'
    },
    {
      target: '#sldCard .chart-head .btn-cluster',
      title: '⑩ Export and share',
      body: '<strong>Share</strong> holds it all:' +
            '<ul><li>SVG, PNG or an animated GIF of the diagram</li>' +
            '<li>A link that opens your network, or an embed for a site</li></ul>'
    },
    {
      target: null,
      title: '✅ You are all set',
      body: '<ul><li>Draw over the example or load another</li>' +
            '<li>Everything runs in your browser</li>' +
            '<li>Replay this tour with the 🧭 button</li></ul>'
    }
  ]
};
