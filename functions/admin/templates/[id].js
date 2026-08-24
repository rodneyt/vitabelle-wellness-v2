import { layout } from './index.js';

export async function onRequestGet(context) {
  const id = context.params.id;

  const template = await context.env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(id).first();
  if (!template) return new Response('Not found', { status: 404 });

  const version = await context.env.DB.prepare('SELECT * FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1').bind(id).first();

  const fieldsSchemaRaw = version ? version.fields_schema : '[]';
  const legalBodyRaw = version ? version.legal_body : '';

  return new Response(layout(`
    <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@500&family=Playfair+Display:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
    <style>
      .toggle-checkbox:checked { right: 0; border-color: #4f46e5; }
      .toggle-checkbox:checked + .toggle-label { background-color: #4f46e5; }
      .toggle-checkbox { transition: all 0.2s ease; }
      .toggle-label { transition: all 0.2s ease; }
      .field-card { transition: all 0.2s ease; }
      .field-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
      .preview-field { margin-bottom: 12px; }
      .prose h2, .prose h3 {
        font-family: 'Playfair Display', serif;
        text-transform: uppercase;
        background-color: #fbdbe2;
        display: inline-block;
        padding: 6px 16px;
        margin-top: 2.5rem;
        margin-bottom: 1.5rem;
        color: #1e1b18;
        letter-spacing: 0.05em;
        font-size: 1.25rem;
        font-weight: 600;
        border-radius: 4px;
      }
      .prose p { margin-bottom: 1rem; line-height: 1.6; }
    </style>

    <div class="mb-6 flex justify-between items-center">
      <h1 class="text-2xl font-semibold text-gray-900">Edit Template: ${template.title} (v${version ? version.version_number : 0})</h1>
      <a href="/admin/templates" class="text-indigo-600 hover:text-indigo-900">&larr; Back</a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- LEFT: Visual Editor -->
      <div>
        <form id="templateForm" method="POST">
          <input type="hidden" name="action" value="save">
          <input type="hidden" name="fields_schema" id="fieldsSchemaInput">
          
          <!-- Fields Editor -->
          <div class="bg-white shadow-sm rounded-lg p-6 mb-6">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-lg font-medium text-gray-900">Form Fields</h2>
              <button type="button" id="addFieldBtn" class="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
                + Add Field
              </button>
            </div>
            <div id="fieldsContainer" class="space-y-3">
              <!-- Fields rendered by JS -->
            </div>
            <p id="noFieldsMsg" class="text-sm text-gray-400 italic mt-2 hidden">No fields yet. Click "Add Field" to start.</p>
          </div>

          <!-- Legal Body -->
          <div class="bg-white shadow-sm rounded-lg p-6 mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">Legal Body (HTML Content)</label>
            <textarea name="legal_body" id="legalBodyInput" rows="12" class="block w-full rounded-md border-gray-300 shadow-sm p-2 border font-mono text-sm">${legalBodyRaw.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
          </div>

          <div class="flex justify-between items-center">
            <button type="submit" class="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
              Save New Version
            </button>
          </div>
        </form>

        <!-- Secure Link Generator -->
        <div class="mt-8 bg-white shadow-sm rounded-lg p-6">
          <h2 class="text-lg font-medium text-gray-900">Generate Secure Client Link</h2>
          <p class="text-sm text-gray-500 mt-1">Create a unique, one-time use link that expires automatically.</p>
          <form method="POST" class="flex items-end space-x-4 mt-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Expires in (days)</label>
              <input type="number" name="expire_days" value="7" min="1" max="30" class="mt-1 block w-24 rounded-md border-gray-300 shadow-sm p-2 border sm:text-sm">
            </div>
            <button type="submit" name="action" value="generate_link" class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700">Generate Link</button>
          </form>
        </div>
      </div>

      <!-- RIGHT: Live Preview -->
      <div>
        <div class="bg-white shadow-sm rounded-lg p-6 sticky top-4">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-medium text-gray-900">Client Preview</h2>
            <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">How the client sees it</span>
          </div>
          <div id="livePreview" class="border border-gray-200 rounded-lg p-6 bg-gray-50 max-h-[70vh] overflow-y-auto">
            <!-- Preview rendered by JS -->
          </div>
        </div>
      </div>
    </div>

    <script>
      // Initialize fields from server data
      let fields = [];
      try {
        fields = ${fieldsSchemaRaw};
        if (!Array.isArray(fields)) fields = [];
      } catch(e) { fields = []; }

      const container = document.getElementById('fieldsContainer');
      const noFieldsMsg = document.getElementById('noFieldsMsg');
      const preview = document.getElementById('livePreview');

      function createToggle(id, label, checked) {
        return \`
          <label class="flex items-center cursor-pointer select-none">
            <div class="relative">
              <input type="checkbox" class="toggle-checkbox sr-only" id="\${id}" \${checked ? 'checked' : ''}>
              <div class="toggle-label block w-8 h-4 rounded-full \${checked ? 'bg-indigo-600' : 'bg-gray-300'}"></div>
              <div class="dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition \${checked ? 'translate-x-4' : ''}"></div>
            </div>
            <span class="ml-2 text-xs font-medium text-gray-600">\${label}</span>
          </label>
        \`;
      }

      function renderFields() {
        container.innerHTML = '';
        noFieldsMsg.classList.toggle('hidden', fields.length > 0);

        fields.forEach((field, idx) => {
          const isS2 = field.name && field.name.startsWith('s2_');
          const card = document.createElement('div');
          card.className = 'field-card bg-gray-50 border border-gray-200 rounded-lg p-4 ' + (isS2 ? 'border-l-4 border-l-amber-400' : '');
          
          card.innerHTML = \`
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded">#\${idx + 1}</span>
                \${isS2 ? '<span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Provider Field</span>' : ''}
                \${field.type === 'signature' ? '<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Signature</span>' : ''}
              </div>
              <button type="button" onclick="removeField(\${idx})" class="text-red-400 hover:text-red-600 text-sm">&times; Remove</button>
            </div>
            
            <div class="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Field Name</label>
                <input type="text" value="\${field.name || ''}" onchange="updateField(\${idx}, 'name', this.value)" class="block w-full text-sm rounded border-gray-300 p-1.5 border">
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Label</label>
                <input type="text" value="\${field.label || ''}" onchange="updateField(\${idx}, 'label', this.value)" class="block w-full text-sm rounded border-gray-300 p-1.5 border">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select onchange="updateField(\${idx}, 'type', this.value)" class="block w-full text-sm rounded border-gray-300 p-1.5 border">
                  <option value="text" \${field.type === 'text' ? 'selected' : ''}>Text</option>
                  <option value="date" \${field.type === 'date' ? 'selected' : ''}>Date</option>
                  <option value="email" \${field.type === 'email' ? 'selected' : ''}>Email</option>
                  <option value="tel" \${field.type === 'tel' ? 'selected' : ''}>Phone</option>
                  <option value="checkbox" \${field.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                  <option value="signature" \${field.type === 'signature' ? 'selected' : ''}>Signature</option>
                  <option value="config" \${field.type === 'config' ? 'selected' : ''}>Config (hidden)</option>
                </select>
              </div>
              <div class="flex items-end space-x-4 pb-1">
                <label class="flex items-center cursor-pointer select-none">
                  <input type="checkbox" class="sr-only" \${field.required ? 'checked' : ''} onchange="updateField(\${idx}, 'required', this.checked)">
                  <div class="w-8 h-4 rounded-full \${field.required ? 'bg-indigo-600' : 'bg-gray-300'} relative transition">
                    <div class="dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition \${field.required ? 'translate-x-4' : ''}"></div>
                  </div>
                  <span class="ml-2 text-xs font-medium text-gray-600">Required</span>
                </label>
              </div>
            </div>

            <!-- Lock & Hide Controls -->
            <div class="flex items-center space-x-6 pt-2 border-t border-gray-200">
              <label class="flex items-center cursor-pointer select-none">
                <input type="checkbox" class="sr-only" \${field.locked ? 'checked' : ''} onchange="updateField(\${idx}, 'locked', this.checked)">
                <div class="w-8 h-4 rounded-full \${field.locked ? 'bg-amber-500' : 'bg-gray-300'} relative transition">
                  <div class="dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition \${field.locked ? 'translate-x-4' : ''}"></div>
                </div>
                <span class="ml-2 text-xs font-medium \${field.locked ? 'text-amber-700' : 'text-gray-600'}">🔒 Locked</span>
              </label>

              <label class="flex items-center cursor-pointer select-none">
                <input type="checkbox" class="sr-only" \${field.hidden ? 'checked' : ''} onchange="updateField(\${idx}, 'hidden', this.checked)">
                <div class="w-8 h-4 rounded-full \${field.hidden ? 'bg-red-500' : 'bg-gray-300'} relative transition">
                  <div class="dot absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition \${field.hidden ? 'translate-x-4' : ''}"></div>
                </div>
                <span class="ml-2 text-xs font-medium \${field.hidden ? 'text-red-700' : 'text-gray-600'}">👁 Hidden</span>
              </label>
            </div>

            \${field.locked ? \`
            <div class="mt-3 bg-amber-50 border border-amber-200 rounded p-3">
              <label class="block text-xs font-medium text-amber-700 mb-1">Locked Value (pre-filled, client cannot change)</label>
              <input type="\${field.type === 'checkbox' ? 'text' : field.type || 'text'}" value="\${field.locked_value || ''}" onchange="updateField(\${idx}, 'locked_value', this.value)" class="block w-full text-sm rounded border-amber-300 p-1.5 border bg-white" placeholder="Enter the fixed value...">
            </div>
            \` : ''}
          \`;

          container.appendChild(card);
        });

        updatePreview();
      }

      function updateField(idx, key, value) {
        fields[idx][key] = value;
        renderFields();
      }

      function removeField(idx) {
        if (confirm('Remove this field?')) {
          fields.splice(idx, 1);
          renderFields();
        }
      }

      function addField() {
        fields.push({
          name: 'new_field_' + (fields.length + 1),
          label: 'New Field',
          type: 'text',
          required: false,
          locked: false,
          hidden: false
        });
        renderFields();
      }

      function updatePreview() {
        const clientFields = fields.filter(f => !f.name?.startsWith('s2_') && f.type !== 'config' && !f.hidden);
        
        let html = '<div class="space-y-4">';
        clientFields.forEach(f => {
          if (f.type === 'signature') {
            html += \`
              <div class="preview-field">
                <label class="block text-sm font-medium text-gray-700 mb-1">\${f.label || f.name}\${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>
                <div class="border-2 border-dashed border-gray-300 rounded-md h-24 flex items-center justify-center text-gray-400 text-sm bg-white">
                  ✍️ Signature Pad
                </div>
              </div>
            \`;
          } else if (f.type === 'checkbox') {
            html += \`
              <div class="preview-field flex items-center">
                <input type="checkbox" \${f.locked ? 'checked disabled' : ''} class="h-4 w-4 text-pink-600 border-gray-300 rounded mr-2">
                <label class="text-sm text-gray-700">\${f.label || f.name}\${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>
                \${f.locked ? '<span class="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">🔒 Locked</span>' : ''}
              </div>
            \`;
          } else if (f.locked) {
            html += \`
              <div class="preview-field">
                <label class="block text-sm font-medium text-gray-700 mb-1">\${f.label || f.name}\${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>
                <div class="bg-gray-100 border border-gray-300 rounded-md p-2 text-sm text-gray-700 flex items-center justify-between">
                  <span>\${f.locked_value || '<em class="text-gray-400">No value set</em>'}</span>
                  <span class="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">🔒 Locked</span>
                </div>
              </div>
            \`;
          } else {
            html += \`
              <div class="preview-field">
                <label class="block text-sm font-medium text-gray-700 mb-1">\${f.label || f.name}\${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>
                <input type="\${f.type || 'text'}" class="block w-full text-sm rounded-md border-gray-300 p-2 border bg-white" placeholder="Client fills this..." disabled>
              </div>
            \`;
          }
        });

        // Show hidden fields indicator
        const hiddenFields = fields.filter(f => f.hidden);
        if (hiddenFields.length > 0) {
          html += '<div class="mt-4 pt-3 border-t border-dashed border-gray-300">';
          html += '<p class="text-xs text-gray-400 italic">👁 ' + hiddenFields.length + ' hidden field(s) not shown to client</p>';
          html += '</div>';
        }

        // Show provider fields indicator
        const providerFields = fields.filter(f => f.name?.startsWith('s2_'));
        if (providerFields.length > 0) {
          html += '<div class="mt-2">';
          html += '<p class="text-xs text-amber-500 italic">⚠️ ' + providerFields.length + ' provider-only field(s) shown only in CRM</p>';
          html += '</div>';
        }

        html += '</div>';
        preview.innerHTML = html;
      }

      // Event listeners
      document.getElementById('addFieldBtn').addEventListener('click', addField);
      
      document.getElementById('templateForm').addEventListener('submit', function(e) {
        // Clean up fields before saving
        const cleanFields = fields.map(f => {
          const clean = { name: f.name, label: f.label, type: f.type, required: !!f.required };
          if (f.locked) { clean.locked = true; clean.locked_value = f.locked_value || ''; }
          if (f.hidden) { clean.hidden = true; }
          if (f.locked_value && f.locked) { clean.locked_value = f.locked_value; }
          return clean;
        });
        document.getElementById('fieldsSchemaInput').value = JSON.stringify(cleanFields);
      });

      // Update preview when legal body changes
      document.getElementById('legalBodyInput').addEventListener('input', updatePreview);

      // Initial render
      renderFields();
    </script>
  `), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost(context) {
  try {
    const id = context.params.id;
    const formData = await context.request.formData();
    const action = formData.get('action');

    if (action === 'generate_link') {
      const expireDays = parseInt(formData.get('expire_days'), 10) || 7;
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expireDays);
      
      await context.env.DB.prepare('INSERT INTO client_links (id, template_id, token, expires_at) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, token, expiresAt.toISOString())
        .run();
        
      return new Response(layout(`
        <div class="mb-6 flex justify-between items-center">
          <h1 class="text-2xl font-semibold text-gray-900">Secure Link Generated</h1>
          <a href="/admin/templates/${id}" class="text-indigo-600 hover:text-indigo-900">&larr; Back to Template</a>
        </div>
        <div class="bg-white shadow-sm sm:rounded-lg p-6 space-y-4">
          <p class="text-sm text-gray-500">Copy the following unique link and send it to your client. It will expire on ${expiresAt.toLocaleString()} and can only be used once.</p>
          <div class="flex items-center space-x-2">
            <input type="text" readonly value="https://vitabellemiami.com/secure/${token}" class="flex-1 rounded-md border-gray-300 bg-gray-50 shadow-sm p-3 font-mono text-sm border" id="secureLink">
            <button onclick="navigator.clipboard.writeText(document.getElementById('secureLink').value); alert('Copied!')" class="py-3 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">Copy</button>
          </div>
        </div>
      `), { headers: { 'Content-Type': 'text/html' } });
    }

    const fieldsSchema = formData.get('fields_schema');
    const legalBody = formData.get('legal_body');

    const latestVersion = await context.env.DB.prepare('SELECT version_number FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1').bind(id).first();
    const nextVersion = (latestVersion ? latestVersion.version_number : 0) + 1;
    const now = new Date().toISOString();
    const versionId = crypto.randomUUID();

    await context.env.DB.prepare('INSERT INTO template_versions (id, template_id, version_number, legal_body, fields_schema, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(versionId, id, nextVersion, legalBody, fieldsSchema, now)
      .run();

    await context.env.DB.prepare('UPDATE templates SET current_version_id = ?, updated_at = ? WHERE id = ?')
      .bind(versionId, now, id)
      .run();

    return Response.redirect(new URL(`/admin/templates/${id}`, context.request.url), 302);
  } catch (err) {
    return new Response(`Error saving template version: ${err.message}`, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  try {
    const id = context.params.id;
    await context.env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
