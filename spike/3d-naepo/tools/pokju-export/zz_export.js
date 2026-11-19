
  /* spike helper (not part of pokju-edu): hand a finished car model to a GLB exporter */
  window.__pokju = { keys: Object.keys(CARS), exportCar: function (key) {
    var g = CARS[key].g, was = g.visible; g.visible = true;
    return new Promise(function (res, rej) { new GLTFExporter().parse(g, function (buf) { g.visible = was; var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); res(btoa(s)); }, rej, { binary: true, onlyVisible: false }); });
  } };
