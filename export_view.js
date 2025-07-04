const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const Library = require("@saltcorn/data/models/library");
const User = require("@saltcorn/data/models/user");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const { jsexprToWhere } = require("@saltcorn/data/models/expression");
const { mergeIntoWhere } = require("@saltcorn/data/utils");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");

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
  code,
} = require("@saltcorn/markup/tags");
const {
  field_picker_fields,
  picked_fields_to_query,
  stateFieldsToWhere,
  stateFieldsToQuery,
  readState,
  initial_config_all_fields,
  calcfldViewOptions,
  calcrelViewOptions,
} = require("@saltcorn/data/plugin-helper");

const {
  get_viewable_fields,
  get_viewable_fields_from_layout,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");
const { hashState } = require("@saltcorn/data/utils");
const { getState, features } = require("@saltcorn/data/db/state");

const {
  json_response,
  auto_expand_json_cols,
  async_stringify,
} = require("./common");

const initial_config = async ({ table_id, exttable_name }) => {
  return { columns: [], layout: { list_columns: true, besides: [] } };
};

const columnsListBuilderStep = {
  name: "Columns",
  onlyWhen: (context) => context.what !== "All columns",
  builder: async (context) => {
    const table = await Table.findOne(
      context.table_id
        ? { id: context.table_id }
        : { name: context.exttable_name }
    );
    const fields = table.getFields();
    //console.log(context);
    for (const field of fields) {
      if (field.type === "Key") {
        field.reftable = Table.findOne({
          name: field.reftable_name,
        });
        if (field.reftable) await field.reftable.getFields();
      }
    }
    const { field_view_options, handlesTextStyle } = calcfldViewOptions(
      fields,
      "list"
    );
    if (table.name === "users") {
      fields.push(
        new Field({
          name: "verification_url",
          label: "Verification URL",
          type: "String",
        })
      );
      field_view_options.verification_url = ["as_text", "as_link"];
    }
    const rel_field_view_options = await calcrelViewOptions(table, "list");
    const roles = await User.get_roles();
    const { parent_field_list } = await table.get_parent_relations(true, true);

    const { child_field_list, child_relations } =
      await table.get_child_relations(true);
    var agg_field_opts = {};
    child_relations.forEach(({ table, key_field, through }) => {
      const aggKey =
        (through ? `${through.name}->` : "") +
        `${table.name}.${key_field.name}`;
      agg_field_opts[aggKey] = table.fields
        .filter((f) => !f.calculated || f.stored)
        .map((f) => ({
          name: f.name,
          label: f.label,
          ftype: f.type.name || f.type,
          table_name: table.name,
          table_id: table.id,
        }));
    });
    const agg_fieldview_options = {};

    Object.values(getState().types).forEach((t) => {
      agg_fieldview_options[t.name] = Object.entries(t.fieldviews)
        .filter(([k, v]) => !v.isEdit && !v.isFilter)
        .map(([k, v]) => k);
    });
    const library = (await Library.find({})).filter((l) =>
      l.suitableFor("list")
    );

    if (!context.layout?.list_columns) {
      // legacy views
      const newCols = [];

      const typeMap = {
        Field: "field",
        JoinField: "join_field",
        ViewLink: "view_link",
        Link: "link",
        Action: "action",
        Text: "blank",
        DropdownMenu: "dropdown_menu",
        Aggregation: "aggregation",
      };
      (context.columns || []).forEach((col) => {
        const newCol = {
          alignment: col.alignment || "Default",
          col_width: col.col_width || "",
          showif: col.showif || "",
          header_label: col.header_label || "",
          col_width_units: col.col_width_units || "px",
          contents: {
            ...col,
            configuration: { ...col },
            type: typeMap[col.type],
          },
        };
        delete newCol.contents._columndef;
        delete newCol.contents.configuration._columndef;
        delete newCol.contents.configuration.type;

        switch (col.type) {
          case "ViewLink":
            newCol.contents.isFormula = {
              label: !!col.view_label_formula,
            };
            break;
          case "Link":
            newCol.contents.isFormula = {
              url: !!col.link_url_formula,
              text: !!col.link_text_formula,
            };
            newCol.contents.text = col.link_text;
            newCol.contents.url = col.link_url;
            break;
        }

        newCols.push(newCol);
      });

      context.layout = {
        besides: newCols,
        list_columns: true,
      };
    }
    return {
      tableName: table.name,
      fields: fields.map((f) => f.toBuilder),

      //fieldViewConfigForms,
      field_view_options: {
        ...field_view_options,
        ...rel_field_view_options,
      },
      parent_field_list,
      child_field_list,
      agg_field_opts,
      agg_fieldview_options,
      actions: [],
      triggerActions: [],
      builtInActions: [],
      roles,
      disable_toolbox: { action: true, view: true, dropdown_menu: true },
      library,

      handlesTextStyle,
      mode: "list",
      ownership:
        !!table.ownership_field_id ||
        !!table.ownership_formula ||
        table.name === "users",
    };
  },
};

const columnsLegacyStep = (req) => ({
  name: "Columns",
  onlyWhen: (context) => context.what !== "All columns",
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
        ["Field", "JoinField", "Aggregation", "FormulaValue"].includes(name)
    );

    const use_field_picker_repeat = field_picker_repeat.filter(
      (f) => !["state_field", "col_width", "col_width_units"].includes(f.name)
    );

    return new Form({
      fields: [
        {
          name: "what",
          type: "String",
          required: true,
          attributes: { options: ["Whole table", "Specify columns"] },
        },
        new FieldRepeat({
          name: "columns",
          fancyMenuEditor: true,
          showIf: { what: "Whole table" },
          fields: use_field_picker_repeat,
        }),
      ],
    });
  },
});

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "Specification",
        form: (context) => {
          const table = Table.findOne(
            context.table_id || context.exttable_name
          );
          return new Form({
            fields: [
              {
                name: "what",
                label: "What to export",
                type: "String",
                required: true,
                attributes: { options: ["All columns", "Specify columns"] },
              },
              {
                name: "include_fml",
                label: req.__("Row inclusion formula"),
                class: "validate-expression",
                sublabel:
                  req.__("Only include rows where this formula is true. ") +
                  req.__("In scope:") +
                  " " +
                  [
                    ...table.fields.map((f) => f.name),
                    "user",
                    "year",
                    "month",
                    "day",
                    "today()",
                  ]
                    .map((s) => code(s))
                    .join(", "),
                type: "String",
                help: {
                  topic: "Inclusion Formula",
                  context: { table_name: table.name },
                },
              },
              {
                name: "delimiter",
                label: "Delimiter",
                type: "String",
                required: true,
                attributes: {
                  options: [
                    { name: ",", label: "Comma (,)" },
                    { name: ";", label: "Semicolon (;)" },
                    { name: "\t", label: "Tab (⇥)" },
                  ],
                },
              },
              {
                name: "label",
                label: "Label",
                type: "String",
                required: true,
                default: "Export CSV",
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
                name: "bom",
                label: "Add BOM",
                sublabel: "Prepend the UTF-8 byte order mark (BOM) to the file",
                type: "Bool",
              },
            ],
          });
        },
      },
      features.list_builder ? columnsListBuilderStep : columnsLegacyStep(req),
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id }, { cached: true });
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
      const sf = new Field(f);
      sf.required = false;
      return sf;
    });
};

const run = async (
  table_id,
  viewname,
  { columns, label, button_style },
  state,
  extraArgs
) => {
  return button(
    {
      class: ["btn", button_style || "btn-primary"],
      onclick: `view_post('${viewname}', 'do_download', {});`,
    },
    i({ class: "fas fa-download me-1" }),
    label || "Export CSV"
  );
};

const do_download = async (
  table_id,
  viewname,
  { columns, layout, what, delimiter, bom, include_fml },
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
  const where = await stateFieldsToWhere({
    fields,
    state,
    table,
    prefix: "a.",
  });
  const q = await stateFieldsToQuery({
    state,
    fields,
    prefix: "a.",
    stateHash,
  });
  if (include_fml) {
    const ctx = { ...state, user_id: req.user?.id || null, user: req.user };
    let where1 = jsexprToWhere(include_fml, ctx, fields);
    mergeIntoWhere(where, where1 || {});
  }

  if (what === "All columns") {
    const pk_name = table.pk_name;

    const columns = table.fields
      .sort((a, b) => a[pk_name] - b[pk_name])
      .map((f) => f.name);
    const rows = await table.getRows(where, { orderBy: pk_name });
    auto_expand_json_cols(columns, table, rows);
    const str = await async_stringify(rows, {
      header: true,
      columns,
      bom: !!bom,
      delimiter: delimiter || ",",
      cast: {
        date: (value) => value.toISOString(),
        boolean: (v) => (v ? "true" : "false"),
      },
    });

    return json_response(table, str);
  }
  let rows = await table.getJoinedRows({
    where,
    joinFields,
    aggregations,
    ...q,
    forPublic: !req.user,
    forUser: req.user,
  });

  const tfields = layout?.list_columns
    ? get_viewable_fields_from_layout(
        viewname,
        stateHash,
        table,
        fields,
        columns,
        false,
        { noHTML: true, ...req },
        req.__,
        state,
        viewname,
        layout.besides
      )
    : get_viewable_fields(
        viewname,
        stateHash,
        table,
        fields,
        columns,
        false,
        { noHTML: true, ...req },
        req.__
      );

  const layoutCols = layout?.besides;
  const csvRows = rows.map((row) => {
    const csvRow = {};
    tfields.forEach(({ label, key }, ix) => {
      const layooutCol = layoutCols?.[ix];
      csvRow[layooutCol?.header_label || label] =
        typeof key === "function" ? key(row) : row[key];
    });
    return csvRow;
  });
  const str = await async_stringify(csvRows, {
    header: true,
    delimiter: delimiter || ",",
    bom: !!bom,
  });

  return json_response(table, str);
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
