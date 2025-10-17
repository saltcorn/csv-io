const Table = require("@saltcorn/data/models/table");
const File = require("@saltcorn/data/models/file");
const Form = require("@saltcorn/data/models/form");
const Workflow = require("@saltcorn/data/models/workflow");
const { eval_expression } = require("@saltcorn/data/models/expression");
const { dollarizeObject } = require("@saltcorn/data/utils");
const { div, button, i } = require("@saltcorn/markup/tags");
const { async_stringify, auto_expand_json_cols } = require("./common");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

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
                label: req.__("Row values formula"),
                class: "validate-expression",
                sublabel:
                  req.__(
                    "Optional. A formula evaluated for each CSV row to set/override field values."
                  ) +
                  " " +
                  req.__("Use ") +
                  "<code>parent</code>" +
                  req.__(" for the current row, ") +
                  "<code>$foo</code>" +
                  req.__(" for shorthand access to a column, and ") +
                  "<code>user</code>. " +
                  req.__("Example: ") +
                  "<code>{status: parent.position}</code>",
                type: "String",
                fieldview: "textarea",
              },
              {
                name: "overwrite_csv_fields",
                label: req.__("Overwrite CSV values"),
                sublabel: req.__(
                  "If a key from the formula is also present in the CSV, overwrite with formula value"
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

  try {
    let importFilePath = importPath;

    if (configuration?.field_values_formula) {
      try {
        const fields = await table.getFields();
        const fieldNames = new Set(fields.map((f) => f.name));
        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "sc-csv-"));
        const tmpCsvPath = path.join(tmpDir, path.basename(importPath));

        const parsed = await table.import_csv_file(importPath, {
          no_table_write: true,
          no_transaction: true,
        });
        if (parsed?.error) return { json: { error: parsed.error, details: parsed.details } };
        const rows = parsed?.rows || [];

        const transformed = rows.map((row) => {
          const parent = row; // current CSV row context
          const exprRow = { parent, ...dollarizeObject(parent) };
          const val = eval_expression(
            configuration.field_values_formula,
            exprRow,
            req.user,
            "Row values formula"
          );
          if (!val || typeof val !== "object" || Array.isArray(val))
            throw new Error("Row values formula must evaluate to an object");
          const filtered = Object.fromEntries(
            Object.entries(val).filter(([k]) => fieldNames.has(k))
          );
          const overwrite = configuration?.overwrite_csv_fields !== false; // default true
          const out = { ...row };
          if (overwrite) Object.assign(out, filtered);
          else {
            for (const [k, v] of Object.entries(filtered)) {
              if (typeof out[k] === "undefined" || out[k] === null || out[k] === "") out[k] = v;
            }
          }
          return out;
        });

        const headerSet = new Set();
        for (const r of transformed) Object.keys(r).forEach((k) => headerSet.add(k));
        const columns = [...headerSet];

        auto_expand_json_cols(columns, table, transformed);

        const csvStr = await async_stringify(transformed, {
          header: true,
          columns,
          delimiter: ",",
          cast: {
            date: (value) => value instanceof Date ? value.toISOString() : value,
            boolean: (v) => (v ? "true" : "false"),
          },
        });
        await fsp.writeFile(tmpCsvPath, csvStr);
        importFilePath = tmpCsvPath;
      } catch (e) {
        return { json: { error: `Row values formula error: ${e.message}` } };
      }
    }

    const opts = {
      no_transaction: true,
      overwrite_csv_fields: configuration?.overwrite_csv_fields !== false,
    };

    const result = await table.import_csv_file(importFilePath, opts);
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
