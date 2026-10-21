/* Guided-tour config for the ED/UC Simulator.
   The shared engine (../tour-shared.js) reads this object.

   The tour never edits the network, so it has nothing to save or restore
   beyond the tab, which the engine handles. The steps on the results solve
   a network that changed since its last run first (window.__ED_TOUR, in
   script.js), so they never point at faded or empty figures. */
function edTab(name) {
  var tab = document.querySelector('.ctrl-tab[data-tab="' + name + '"]');
  if (tab && !tab.classList.contains('active')) tab.click();
}
function edResults() {
  if (window.__ED_TOUR) window.__ED_TOUR.ensureResults();
}
window.__TOUR = {
  seenKey: 'educ-tour-v1-seen',
  launchLabel: '🧭 Take a tour',
  steps: [
    {
      target: null,
      title: '👋 Welcome to the ED/UC Simulator',
      body: 'Draw a network, decide which units run each hour and at what output, and read the <strong>prices</strong> that follow. ' +
            'About a minute.'
    },
    {
      target: '.quick-start-row',
      title: '① Start from an example',
      body: 'One click loads a worked network and solves it:' +
            '<ul><li>PJM 5-bus, three units</li>' +
            '<li>Solar and battery, two areas</li>' +
            '<li>Save or open your own from the same row</li></ul>'
    },
    {
      target: '#palette',
      title: '② Draw your own',
      body: '<ul><li>Drag a part onto the diagram, a device onto a <strong>bus</strong></li>' +
            '<li>Line, transformer, HVDC link: pick it, drag bus to bus</li></ul>'
    },
    {
      target: ['.ctrl-tabs', '#tab-element'],
      onEnter: function () { edTab('element'); },
      title: '③ Element',
      body: '<ul><li>A unit’s type, rating, minimum stable loading, <strong>marginal cost</strong> (flat, or rising with its output), commitment and ramp limits</li>' +
            '<li>A load’s profile: pick one and drag its bars, vary it by weekday, or Custom to take every hour from a file</li></ul>'
    },
    {
      target: ['.ctrl-tabs', '#tab-dispatch'],
      onEnter: function () { edTab('dispatch'); },
      title: '④ Dispatch',
      body: '<ul><li><strong>Unit commitment</strong> or economic dispatch</li>' +
            '<li>The horizon, line limits and load shedding</li></ul>'
    },
    {
      target: '#runBtn',
      title: '⑤ Run',
      body: 'Press <strong>Run dispatch</strong> (Ctrl+Enter) after a change. ' +
            'Until you do, the last result stays, faded.'
    },
    {
      target: '.hour-ctl',
      onEnter: edResults,
      title: '⑥ Pick an hour',
      body: 'Drag the hour, or press ▶ to play the day on the diagram: flows, prices and which units run.'
    },
    {
      target: '.metrics.ed-result',
      onEnter: edResults,
      title: '⑦ Read the result',
      body: 'Operating cost, the average price, start-ups and the most congested branch.'
    },
    {
      target: '#dispCard',
      onEnter: edResults,
      title: '⑧ The charts',
      body: '<ul><li>Dispatch in merit order (any curtailment under it), nodal prices, commitment and storage</li>' +
            '<li>Click any of them to show that hour on the diagram</li></ul>'
    },
    {
      target: '#tablesCard',
      onEnter: edResults,
      title: '⑨ Results by element',
      body: '<ul><li>Opens from its chevron</li>' +
            '<li>Units, Buses, Branches and Hours, each with <strong>⬇ CSV</strong></li></ul>'
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
