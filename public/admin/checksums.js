document.addEventListener('DOMContentLoaded', function () {
  var successEl = document.getElementById('success-message');
  function showSuccess(msg) {
    if (!successEl) return;
    successEl.textContent = msg || 'Success';
    successEl.classList.add('show');
    setTimeout(function(){ successEl.classList.remove('show'); }, 2500);
  }

  document.getElementById('add-checksum-btn').addEventListener('click', function(){
    var add = document.getElementById('checksums-add');
    var list = document.getElementById('checksums-list');
    if (add) add.hidden = false;
    if (list) list.hidden = true;
  });

  function setupCollapsibles() {
    Array.prototype.slice.call(document.querySelectorAll('.collapsible')).forEach(function(button){
      button.addEventListener('click', function (ev) {
        var btn = ev.target;
        btn.classList.toggle('active');
        var content = btn.nextElementSibling;
        if (!content) return;
        if (content.style.display === 'block') content.style.display = 'none';
        else content.style.display = 'block';
      });
    });
  }

  async function fetchChecksums() {
    var response = await fetch('/api/admin/checksums');
    var payload = await response.json();
    var groupedChecksums = payload.checksums;
    var versions = payload.versions;
    var container = document.getElementById('checksums-container');
    if (!container) return;
    container.innerHTML = '';

    for (var sdkVersion in groupedChecksums) {
      var tableRows = '';
      groupedChecksums[sdkVersion].forEach(function (checksum) {
        tableRows += '\n          <tr class="checksum-entry">\n            <td>' + checksum.checksum + '</td>\n            <td>' + (checksum.description || '') + '</td>\n            <td>\n              <button class="btn-primary btn-edit">Edit</button>\n              <button class="btn-secondary btn-delete">Delete</button>\n            </td>\n          </tr>';
      });

      container.innerHTML += '\n        <button class="collapsible">' + sdkVersion + ' (Click to expand)</button>\n        <div class="content">\n          <table class="checksums-table admin-table">\n            <tr>\n              <th style="width:10%">Checksum</th>\n              <th style="width:80%">Notes</th>\n              <th style="width:10%">Options</th>\n            </tr>\n            ' + tableRows + '\n          </table>\n        </div>';
    }

    setupCollapsibles();

    Array.prototype.slice.call(container.querySelectorAll('.btn-delete')).forEach(function(btn){
      btn.addEventListener('click', async function(ev){
        var row = ev.target.closest('tr');
        var checksum = row && row.querySelector('td') ? row.querySelector('td').textContent : '';
        if (!checksum) return;
        if (!confirm('Delete checksum ' + checksum + '?')) return;
        var res = await fetch('/api/admin/checksums?checksum=' + encodeURIComponent(checksum), { method: 'DELETE' });
        if (res.ok) { showSuccess('Checksum deleted'); fetchChecksums(); }
      });
    });

    Array.prototype.slice.call(container.querySelectorAll('.btn-edit')).forEach(function(btn){
      btn.addEventListener('click', function(ev){
        var row = ev.target.closest('tr');
        var cells = row ? row.querySelectorAll('td') : [];
        var checksum = cells[0] ? cells[0].textContent : '';
        var description = cells[1] ? cells[1].textContent : '';
        var checksumEl = document.getElementById('checksum2Input');
        var descriptionEl = document.getElementById('description2Input');
        if (checksumEl) checksumEl.value = checksum || '';
        if (descriptionEl) descriptionEl.value = description || '';
        var upd = document.getElementById('checksums-update');
        var list = document.getElementById('checksums-list');
        if (upd) upd.hidden = false;
        if (list) list.hidden = true;
      });
    });
  }

  // Add submit
  var addForm = document.getElementById('checksums-add-form');
  if (addForm) {
    addForm.addEventListener('submit', async function(e){
      e.preventDefault();
      var checksum = document.getElementById('checksumInput').value;
      var sdkversion = document.getElementById('sdkversionInput').value;
      var description = document.getElementById('descriptionInput').value;
      var res = await fetch('/api/admin/checksums', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checksum: checksum, sdkversion: sdkversion, description: description })
      });
      if (res.ok) {
        showSuccess('Checksum added');
        document.getElementById('checksums-add').hidden = true;
        document.getElementById('checksums-list').hidden = false;
        fetchChecksums();
      }
    });
  }

  // Update submit
  var updateForm = document.getElementById('checksums-update-form');
  if (updateForm) {
    updateForm.addEventListener('submit', async function(e){
      e.preventDefault();
      var checksum = document.getElementById('checksum2Input').value;
      var sdkversion = document.getElementById('sdkversion2Input').value;
      var description = document.getElementById('description2Input').value;
      var res = await fetch('/api/admin/checksums', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checksum: checksum, sdkversion: sdkversion, description: description })
      });
      if (res.ok) {
        showSuccess('Checksum updated');
        document.getElementById('checksums-update').hidden = true;
        document.getElementById('checksums-list').hidden = false;
        fetchChecksums();
      }
    });
  }

  window.onload = fetchChecksums;
});


