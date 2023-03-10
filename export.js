const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");

const stringify = require("csv-stringify");
const URL = require("url").URL;
const {
  text,
  div,
  h5,
  h6,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  hr,
  text_attr,
  button,
} = require("@saltcorn/markup/tags");
const {
  field_picker_fields,
  picked_fields_to_query,
  stateFieldsToWhere,
  stateFieldsToQuery,
  readState,
  initial_config_all_fields,
} = require("@saltcorn/data/plugin-helper");

const {
  get_viewable_fields,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");
const { hashState } = require("@saltcorn/data/utils");

const initial_config = initial_config_all_fields(false);

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "Columns",
        form: async (context) => {
          const table = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          //console.log(context);
          const field_picker_repeat = await field_picker_fields({
            table,
            viewname: context.viewname,
            req,
          });

          const type_pick = field_picker_repeat.find((f) => f.name === "type");
          type_pick.attributes.options = type_pick.attributes.options.filter(
            ({ name }) =>
              ["Field", "JoinField", "Aggregation", "FormulaValue"].includes(
                name
              )
          );

          const use_field_picker_repeat = field_picker_repeat.filter(
            (f) =>
              !["state_field", "col_width", "col_width_units"].includes(f.name)
          );

          return new Form({
            fields: [
              new FieldRepeat({
                name: "columns",
                fancyMenuEditor: true,
                fields: use_field_picker_repeat,
              }),
            ],
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
      const sf = new Field(f);
      sf.required = false;
      return sf;
    });
};

const run = async (table_id, viewname, { columns }, state, extraArgs) => {
  return button(
    {
      class: "btn btn-primary",
      onclick: `view_post('${viewname}', 'do_download', {});`,
    },
    i({ class: "fas fa-download me-1" }),
    "Export CSV"
  );
};

const async_stringify = (...args) => {
  return new Promise((resolve) => {
    stringify(...args, function (err, output) {
      resolve(output);
    });
  });
};

const do_download = async (
  table_id,
  viewname,
  { columns },
  body,
  { req, res }
) => {
  const table = await Table.findOne(table_id);
  const state = {};
  const referrer = req.get("Referrer");
  if (referrer) {
    const refUrl = new URL(referrer || "");
    for (const [name, value] of refUrl.searchParams) {
      state[name] = value;
    }
  }
  const stateHash = hashState(state, viewname);

  const fields = await table.getFields();
  const { joinFields, aggregations } = picked_fields_to_query(columns, fields);
  const where = await stateFieldsToWhere({ fields, state, table });
  const q = await stateFieldsToQuery({
    state,
    fields,
    prefix: "a.",
    stateHash,
  });

  let rows = await table.getJoinedRows({
    where,
    joinFields,
    aggregations,
    ...q,
    forPublic: !req.user,
    forUser: req.user,
  });
  const tfields = get_viewable_fields(
    viewname,
    stateHash,
    table,
    fields,
    columns,
    false,
    req,
    req.__
  );

  const csvRows = rows.map((row) => {
    const csvRow = {};
    tfields.forEach(({ label, key }) => {
      csvRow[label] = typeof key === "function" ? key(row) : row[key];
    });
    return csvRow;
  });
  const str = await async_stringify(csvRows, { header: true });

  return {
    json: {
      download: {
        blob: Buffer.from(str).toString("base64"),
        filename: `${table.name}.csv`,
        mimetype: "text/csv",
      },
    },
  };
};

module.exports = {
  name: "CSV Export",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
  initial_config,

  routes: { do_download },
};
