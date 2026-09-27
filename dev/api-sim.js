// Runs the real scoreboard function (functions/api/[[route]].js) inside the
// page, over SQLite compiled to wasm, so the game and the server code can be
// tested together without Cloudflare. On a #debug page:
//
//   await BTD_API_SIM()          // patches fetch for /api/* and reloads the board
//   BTD_API_SIM.skew(55e3)       // move the server's clock forward (ms)
//   BTD_API_SIM.sql('SELECT * FROM runs')
//
// Dev only: never part of the build.
(function(){
  var SQLJS = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
  function load(src){
    return new Promise(function(res, rej){ var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  // just enough of D1's interface: prepare/bind/first/all/run and batch
  function d1(db){
    function stmt(sql, args){
      function rows(){
        var s = db.prepare(sql), out = [];
        s.bind(args || []);
        while (s.step()) out.push(s.getAsObject());
        s.free();
        return out;
      }
      return {
        bind: function(){ return stmt(sql, [].slice.call(arguments).map(function(v){ return v === undefined ? null : v; })); },
        first: async function(col){ var r = rows()[0] || null; return col && r ? r[col] : r; },
        all: async function(){ return { results: rows(), success: true }; },
        run: async function(){ rows(); return { success: true, meta: { changes: db.getRowsModified() } }; }
      };
    }
    return {
      prepare: function(sql){ return stmt(sql, []); },
      batch: async function(list){ var out = []; for (var i = 0; i < list.length; i++) out.push(await list[i].run()); return out; }
    };
  }
  var skew = 0, realNow = Date.now, installed = null;
  window.BTD_API_SIM = async function(opts){
    opts = opts || {};
    if (!installed){
      if (!window.initSqlJs) await load(SQLJS + 'sql-wasm.js');
      var SQL = await window.initSqlJs({ locateFile: function(f){ return SQLJS + f; } });
      var db = new SQL.Database();
      var mod = await import('/functions/api/%5B%5Broute%5D%5D.js?' + realNow());
      Date.now = function(){ return realNow() + skew; };
      var realFetch = window.fetch.bind(window);
      window.fetch = async function(input, init){
        var url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.pathname.indexOf('/api/') !== 0) return realFetch(input, init);
        var headers = new Headers((init && init.headers) || {});
        headers.set('CF-Connecting-IP', opts.ip || '203.0.113.7');
        var request = new Request(url, Object.assign({}, init, { headers: headers }));
        var route = url.pathname.slice(5).split('/').filter(Boolean);
        return mod.onRequest({ request: request, env: opts.noDB ? {} : { DB: d1(db) }, params: { route: route } });
      };
      installed = { db: db };
    }
    if (window.BTD_WORLD){ BTD_WORLD.online = null; if (window.BTD_WORLD_LOAD) await BTD_WORLD_LOAD(); }
    return 'api sim installed';
  };
  BTD_API_SIM.skew = function(ms){ skew += ms; return skew; };
  BTD_API_SIM.sql = function(q){ var r = installed.db.exec(q); return r.length ? r[0].values.map(function(v){ var o = {}; r[0].columns.forEach(function(c, i){ o[c] = v[i]; }); return o; }) : []; };
})();
