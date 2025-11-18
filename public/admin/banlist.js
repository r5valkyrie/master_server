document.addEventListener('DOMContentLoaded', function () {
  var successEl = document.getElementById('success-message');
  function showSuccess(msg) {
    if (!successEl) return;
    successEl.textContent = msg || 'Success';
    successEl.classList.add('show');
    setTimeout(function(){ successEl.classList.remove('show'); }, 2500);
  }

  var addBtn = document.getElementById('add-ban-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var add = document.getElementById('banlist-add');
      var list = document.getElementById('banlist-list');
      if (add) add.hidden = false;
      if (list) list.hidden = true;
    });
  }

  function searchTable() {
    var searchEl = document.getElementById('search-bar');
    var searchQuery = searchEl && searchEl.value ? searchEl.value.toLowerCase() : '';
    var pagebuttons = document.getElementById('pagination-controls');
    var tableRows = Array.prototype.slice.call(document.getElementsByClassName('banlist-entry'));

    if (!searchQuery || searchQuery.length === 0) {
      if (pagebuttons) pagebuttons.style.display = '';
      if (window.showPage) window.showPage(1);
      return;
    }

    tableRows.forEach(function (row) { row.style.display = 'none'; });

    var filteredRows = tableRows.filter(function (row) {
      var cells = Array.prototype.slice.call(row.cells || []);
      var rowText = cells.map(function (cell) { return (cell.textContent || '').toLowerCase(); }).join(' ');
      return rowText.includes(searchQuery);
    });

    if (pagebuttons) pagebuttons.style.display = 'none';
    filteredRows.forEach(function (row) { row.style.display = ''; });
  }

  var searchBar = document.getElementById('search-bar');
  if (searchBar) searchBar.addEventListener('keyup', searchTable);

  async function fetchBanList() {
    var response = await fetch('/api/admin/banlist');
    var banlist = await response.json();
    var tableBody = document.getElementById('banlist-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    banlist.forEach(function (bannedUser) {
      var startTime = bannedUser.ban_date ? new Date(bannedUser.ban_date).toLocaleString() : '';
      var endTime = bannedUser.ban_expiry_date ? new Date(bannedUser.ban_expiry_date).toLocaleString() : 'Permanent';
      var rowHTML = '\n                <tr class="banlist-entry">\n                    <td>' + (bannedUser.identifier) + '</td>\n                    <td>' + startTime + '</td>\n                    <td>' + endTime + '</td>\n                    <td>' + (bannedUser.ban_reason || '') + '</td>\n                    <td>' + (bannedUser.notes || '') + '</td>\n                    <td>\n                        <button class="btn-primary btn-edit">Edit</button>\n                        <button class="btn-secondary btn-unban">Unban</button>\n                    </td>\n                </tr>\n            ';
      tableBody.innerHTML += rowHTML;
    });

    // attach handlers
    Array.prototype.slice.call(tableBody.querySelectorAll('.btn-unban')).forEach(function (btn) {
      btn.addEventListener('click', async function (ev) {
        var target = ev.target;
        var row = target.closest('tr');
        var idCell = row ? row.querySelector('td') : null;
        var identifier = idCell && idCell.textContent ? idCell.textContent : '';
        if (!identifier) return;
        if (!confirm('Unban ' + identifier + '?')) return;
        var res = await fetch('/api/admin/banlist?identifier=' + encodeURIComponent(identifier), { method: 'DELETE' });
        if (res.ok) { showSuccess('User unbanned'); fetchBanList(); }
      });
    });

    Array.prototype.slice.call(tableBody.querySelectorAll('.btn-edit')).forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        var target = ev.target;
        var row = target.closest('tr');
        var idCell = row ? row.querySelector('td') : null;
        var identifier = idCell && idCell.textContent ? idCell.textContent : '';
        var cells = row ? row.querySelectorAll('td') : [];
        var reason = cells && cells[3] && cells[3].textContent ? cells[3].textContent : '';
        var endText = cells && cells[2] && cells[2].textContent ? cells[2].textContent : '';
        var isPermanent = endText === 'Permanent' || endText === '';
        var idInput = document.getElementById('edit-identifier');
        var reasonInput = document.getElementById('edit-reason');
        var permInput = document.getElementById('edit-permanent');
        var endInput = document.getElementById('edit-end-date');
        if (idInput) idInput.value = identifier;
        if (reasonInput) reasonInput.value = reason || '';
        if (permInput) permInput.checked = isPermanent;
        if (endInput) { endInput.disabled = isPermanent; endInput.value = ''; }
        var editPanel = document.getElementById('banlist-edit');
        var list = document.getElementById('banlist-list');
        if (editPanel) editPanel.hidden = false;
        if (list) list.hidden = true;
      });
    });

    if (window.setupPagination) window.setupPagination(Array.prototype.slice.call(document.getElementsByClassName('banlist-entry')));
  }

  window.onload = function () {
    fetchBanList();
  };

  // Add submit
  var addForm = document.getElementById('banlist-add-form');
  if (addForm) {
    addForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var banTypeEl = document.getElementById('banTypeInput');
      var identifierEl = document.getElementById('identifierInput');
      var reasonEl = document.getElementById('reasonInput');
      var permanentEl = document.getElementById('permabanInput');
      var endDateEl = document.getElementById('end-date-input');
      var banType = parseInt(banTypeEl && banTypeEl.value ? banTypeEl.value : '0');
      var identifier = identifierEl && identifierEl.value ? identifierEl.value.trim() : '';
      var reason = reasonEl && reasonEl.value ? reasonEl.value.trim() : '';
      var permanent = !!(permanentEl && permanentEl.checked);
      var endDate = endDateEl && endDateEl.value ? endDateEl.value : '';
      var res = await fetch('/api/admin/banlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banType: banType, identifier: identifier, reason: reason, permanent: permanent, endDate: permanent ? null : endDate })
      });
      if (res.ok) {
        showSuccess('User banned');
        var add = document.getElementById('banlist-add');
        var list = document.getElementById('banlist-list');
        if (add) add.hidden = true;
        if (list) list.hidden = false;
        fetchBanList();
      }
    });
  }

  // Edit submit
  var editForm = document.getElementById('banlist-edit-form');
  if (editForm) {
    editForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var idInput = document.getElementById('edit-identifier');
      var reasonInput = document.getElementById('edit-reason');
      var permInput = document.getElementById('edit-permanent');
      var endInput = document.getElementById('edit-end-date');
      var identifier = idInput ? idInput.value : '';
      var reason = reasonInput && reasonInput.value ? reasonInput.value.trim() : '';
      var permanent = !!(permInput && permInput.checked);
      var endDate = endInput && endInput.value ? endInput.value : '';
      var res = await fetch('/api/admin/banlist', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier, reason: reason, endDate: permanent ? null : endDate })
      });
      if (res.ok) {
        showSuccess('Ban updated');
        var edit = document.getElementById('banlist-edit');
        var list = document.getElementById('banlist-list');
        if (edit) edit.hidden = true;
        if (list) list.hidden = false;
        fetchBanList();
      }
    });
  }

  // Close buttons
  Array.prototype.slice.call(document.querySelectorAll('.close-btn')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var add = document.getElementById('banlist-add');
      if (add) add.hidden = true;
      var edit = document.getElementById('banlist-edit');
      if (edit) edit.hidden = true;
      var list = document.getElementById('banlist-list');
      if (list) list.hidden = false;
    });
  });
});


