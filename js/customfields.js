/* ====================================================================================
   CUSTOM DATA FIELDS — user-defined columns (text/number/date/tag) that don't exist in
   the base schema. Values are entered manually per company (real user input, not
   fabricated) and stored separately so the original dataset stays untouched.
   ==================================================================================== */

let CUSTOM_FIELD_DEFS = [];

async function refreshCustomFieldDefs() {
  CUSTOM_FIELD_DEFS = await loadCustomFieldDefs();
  return CUSTOM_FIELD_DEFS;
}

function renderCustomFieldsEditor(c) {
  const wrap = document.getElementById('customFieldsEditWrap');
  if (!wrap) return;
  if (!CUSTOM_FIELD_DEFS.length) {
    wrap.innerHTML = `<p class="footer-note" style="text-align:left;margin-top:14px;">No custom fields defined yet. <a href="#manage-fields" style="color:var(--purple);font-weight:700;" onclick="event.preventDefault();openManageFieldsPanel();">Add one →</a></p>`;
    return;
  }
  const values = c.customFields || {};
  wrap.innerHTML = `<h3 style="margin-top:18px;">Custom Fields <span class="pb-derived-tag">user-defined</span></h3>` +
    CUSTOM_FIELD_DEFS.map(f => {
      const v = values[f.name] || '';
      const inputType = f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text';
      return `<label>${escapeHtml(f.name)} <input type="${inputType}" data-customfield-id="${f.id}" value="${escapeHtml(String(v))}"></label>`;
    }).join('') +
    `<p class="footer-note" style="text-align:left;">Custom field values save automatically when you click away. <a href="#manage-fields" style="color:var(--purple);font-weight:700;" onclick="event.preventDefault();openManageFieldsPanel();">Manage fields →</a></p>`;

  wrap.querySelectorAll('[data-customfield-id]').forEach(input => {
    input.onblur = async () => {
      await saveCustomFieldValue(c.id, parseInt(input.dataset.customfieldId), input.value);
      const idx = ALL.findIndex(x => x.id === c.id);
      if (idx >= 0) {
        ALL[idx].customFields = ALL[idx].customFields || {};
        const def = CUSTOM_FIELD_DEFS.find(f => f.id === parseInt(input.dataset.customfieldId));
        if (def) ALL[idx].customFields[def.name] = input.value;
      }
    };
  });
}

function openManageFieldsPanel() {
  const html = `
    <h2>⚙️ Manage Custom Fields</h2>
    <p class="subtle">Define your own columns (e.g. an internal tag, a deal-team note, a manually researched metric) that don't exist in the base PitchBook dataset. Fill in values per company from its profile page.</p>
    <div id="manageFieldsList"></div>
    <h3 style="margin-top:18px;">Add a field</h3>
    <div class="adv-rule-row">
      <input type="text" id="newFieldNameInput" placeholder="Field name (e.g. Internal Priority)" style="flex:1;padding:8px 10px;border-radius:8px;border:1.5px solid rgba(155,133,196,0.2);">
      <select id="newFieldTypeInput" style="padding:8px 10px;border-radius:8px;border:1.5px solid rgba(155,133,196,0.2);">
        <option value="text">Text</option>
        <option value="number">Number</option>
        <option value="date">Date</option>
        <option value="tag">Tag</option>
      </select>
      <button class="mini-btn primary" id="addFieldBtn">+ Add Field</button>
    </div>
  `;
  openSlideOver(html);
  renderManageFieldsList();
  document.getElementById('addFieldBtn').onclick = async () => {
    const name = document.getElementById('newFieldNameInput').value.trim();
    if (!name) { alert('Enter a field name.'); return; }
    const type = document.getElementById('newFieldTypeInput').value;
    const result = await createCustomFieldDef(name, type);
    if (result && result.error) { alert(result.error); return; }
    await refreshCustomFieldDefs();
    document.getElementById('newFieldNameInput').value = '';
    renderManageFieldsList();
  };
}

function renderManageFieldsList() {
  const wrap = document.getElementById('manageFieldsList');
  if (!wrap) return;
  wrap.innerHTML = CUSTOM_FIELD_DEFS.length ? `
    <table class="grid"><thead><tr><th>Name</th><th>Type</th><th></th></tr></thead>
      <tbody>${CUSTOM_FIELD_DEFS.map(f => `<tr><td>${escapeHtml(f.name)}</td><td>${escapeHtml(f.field_type)}</td><td><button class="mini-btn" data-remove-field="${f.id}">Delete</button></td></tr>`).join('')}</tbody>
    </table>
  ` : '<p class="empty-state">No custom fields yet.</p>';
  wrap.querySelectorAll('[data-remove-field]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this custom field? All values entered for it across every company will be lost.')) return;
      await deleteCustomFieldDef(btn.dataset.removeField);
      await refreshCustomFieldDefs();
      renderManageFieldsList();
    };
  });
}
