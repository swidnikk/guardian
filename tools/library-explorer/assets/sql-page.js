(async () => {
  const st = document.getElementById('sqlstatus'), out = document.getElementById('sqlout');
  if (location.protocol === 'file:') { st.textContent = 'Opened from disk: WASM/fetch are blocked. Serve over http to use this page.'; return; }
  try {
    const SQL = await initSqlJs({ locateFile: (f) => '../assets/vendor/' + f });
    const db = new SQL.Database(new Uint8Array(await (await fetch('../data/library.sqlite')).arrayBuffer()));
    st.textContent = 'Database loaded. Tables: ' + db.exec("select name from sqlite_master where type in ('table','view')")[0].values.map((r) => r[0]).join(', ');
    document.getElementById('run').onclick = () => {
      out.textContent = '';
      try {
        for (const r of db.exec(document.getElementById('sqlq').value)) {
          const t = document.createElement('table'); const h = t.createTHead().insertRow();
          r.columns.forEach((c) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = c; h.appendChild(th); });
          r.values.forEach((v) => { const tr = t.insertRow(); v.forEach((x) => { tr.insertCell().textContent = x; }); });
          out.appendChild(t);
        }
      } catch (e) { out.textContent = 'Error: ' + e.message; }
    };
  } catch (e) { st.textContent = 'Could not load the database: ' + e.message; }
})();
