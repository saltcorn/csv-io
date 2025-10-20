const Table = require("@saltcorn/data/models/table");
const File = require("@saltcorn/data/models/file");
const Form = require("@saltcorn/data/models/form");
const Workflow = require("@saltcorn/data/models/workflow");
const { eval_expression } = require("@saltcorn/data/models/expression");
const { div, button, i } = require("@saltcorn/markup/tags");

const initial_config = async ({}) => ({
  label: "Import CSV",
  button_style: "btn-primary",
  overwrite_csv_fields: true,
});

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: req.__("Settings"),
        form: (context) =>
          new Form({
            fields: [
              {
                name: "label",
                label: req.__("Label"),
                type: "String",
                required: true,
                default: "Import CSV",
              },
              {
                name: "button_style",
                label: req.__("Button Style"),
                type: "String",
                required: true,
                attributes: {
                  options: [
                    { name: "btn-primary", label: req.__("Primary button") },
                    {
                      name: "btn-secondary",
                      label: req.__("Secondary button"),
                    },
                    { name: "btn-success", label: req.__("Success button") },
                    { name: "btn-danger", label: req.__("Danger button") },
                    {
                      name: "btn-outline-primary",
                      label: req.__("Primary outline button"),
                    },
                    {
                      name: "btn-outline-secondary",
                      label: req.__("Secondary outline button"),
                    },
                    { name: "btn-link", label: req.__("Link") },
                  ],
                },
              },
              {
                name: "field_values_formula",
                label: req.__("Extra values (formula)"),
                class: "validate-expression",
                sublabel:
                  req.__(
                    "Optional. A formula evaluated once to set fixed values for all imported rows."
                  ) +
                  " " +
                  req.__("You can also reference ") +
                  "<code>user</code>" +
                  req.__(" Example: ") +
                  "<code>{status: 'new', owner: user.id}</code>",
                type: "String",
                fieldview: "textarea",
              },
              {
                name: "overwrite_csv_fields",
                label: req.__("Overwrite CSV by extra values"),
                sublabel: req.__(
                  "If a key from the formula is also present in the CSV, overwrite it with the extra value"
                ),
                type: "Bool",
                default: true,
              },
            ],
          }),
      },
    ],
  });

const run = async (
  table_id,
  viewname,
  { label, button_style },
  state,
  extra
) => {
  const encodedState = encodeURIComponent(JSON.stringify(state || {}));
  return button(
    {
      class: ["btn", button_style || "btn-primary"],
      onclick: `document.getElementById('sc_csv_input_${viewname}').click();`,
    },
    i({ class: "fas fa-file-upload me-1" }),
    label || "Import CSV",
    div(
      { style: "display:none" },
      `<input id='sc_csv_input_${viewname}' type='file' accept='.csv,text/csv' onchange="(function(el){const f=el.files[0]; if(!f) return; const fd=new FormData(); fd.append('file', f); fd.append('state', '${encodedState}'); view_post('${viewname}', 'do_upload', fd); })(this)" />`
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

  try {
    let viewState = {};
    const rawState = body?.state || req?.body?.state;
    if (typeof rawState === "string") {
      try {
        viewState = JSON.parse(decodeURIComponent(rawState));
      } catch (e) {
        viewState = {};
      }
    } else if (rawState && typeof rawState === "object") {
      viewState = rawState;
    }
    let extra_row_values = undefined;
    if (configuration?.field_values_formula) {
      const val = eval_expression(
        configuration.field_values_formula,
        viewState,
        req.user,
        "Extra values formula"
      );
      if (!val || typeof val !== "object" || Array.isArray(val))
        return {
          json: { error: "Extra values formula must evaluate to an object" },
        };
      extra_row_values = val;
    }

    const opts = {
      no_transaction: true,
      overwrite_csv_fields: configuration?.overwrite_csv_fields !== false,
      extra_row_values,
    };

    const result = await table.import_csv_file(importPath, opts);
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
  configuration_workflow,
  run,
  routes: { do_upload },
};
