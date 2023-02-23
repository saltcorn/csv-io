const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");

const stringify = require("csv-stringify");

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
  readState,
} = require("@saltcorn/data/plugin-helper");

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

          const use_field_picker_repeat = field_picker_repeat.filter(
            (f) => !["state_field", "col_width_units"].includes(f.name)
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
  const table = Table.findOne(table_id);
  const rows = await table.getJoinedRows({});
  const str = await async_stringify(rows);
  //console.log(str);
  return {
    json: {
      download: {
        blob: Buffer.from(str).toString("base64"),
        filename: "export.csv",
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
  routes: { do_download },
};
