const Table = require("@saltcorn/data/models/table");
const File = require("@saltcorn/data/models/file");
const { div, button, i } = require("@saltcorn/markup/tags");

const initial_config = async ({}) => ({
  label: "Import CSV",
  button_style: "btn-primary",
});

const run = async (
  table_id,
  viewname,
  { label, button_style },
  state,
  extra
) => {
  return button(
    {
      class: ["btn", button_style || "btn-primary"],
      onclick: `document.getElementById('sc_csv_input_${viewname}').click();`,
    },
    i({ class: "fas fa-file-upload me-1" }),
    label || "Import CSV",
    div(
      { style: "display:none" },
      `<input id='sc_csv_input_${viewname}' type='file' accept='.csv,text/csv' onchange="(function(el){const f=el.files[0]; if(!f) return; const fd=new FormData(); fd.append('file', f); view_post('${viewname}', 'do_upload', fd); })(this)" />`
    )
  );
};

const do_upload = async (table_id, viewname, configuration, body, { req }) => {
  const table = await Table.findOne(table_id);
  if (!table) return { json: { error: "Table not found" } };

  if (!req.files || Object.keys(req.files).length === 0) {
    return { json: { error: "No file uploaded" } };
  }

  const fileKey = Object.keys(req.files)[0];
  const saved = await File.from_req_files(
    req.files[fileKey],
    req.user ? req.user.id : null,
    1
  );
  if (!saved) return { json: { error: "Failed saving uploaded file" } };

  const importPath = saved.location || saved.path_to_serve || saved.filename;

  // import into table
  try {
    const result = await table.import_csv_file(importPath, {
      no_transaction: true,
    });
    if (result.error)
      return { json: { error: result.error, details: result.details } };
    else return { json: { success: result.success, details: result.details } };
  } catch (e) {
    return { json: { error: e.message } };
  }
};

module.exports = {
  name: "CSV Import",
  display_state_form: false,
  initial_config,
  run,
  routes: { do_upload },
};
