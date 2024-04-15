const db = require("@saltcorn/data/db");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const File = require("@saltcorn/data/models/file");
const { jsexprToWhere } = require("@saltcorn/data/models/expression");
const {
  field_picker_fields,
  picked_fields_to_query,
  stateFieldsToWhere,
  stateFieldsToQuery,
  readState,
  initial_config_all_fields,
} = require("@saltcorn/data/plugin-helper");
const { auto_expand_json_cols, async_stringify } = require("./common");
const {
  get_viewable_fields,
  get_viewable_fields_from_layout,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");
const { interpolate } = require("@saltcorn/data/utils");

module.exports = {
  configFields: async ({ table }) => {
    const views = await View.find({ viewtemplate: "CSV Export" });
    return [
      {
        name: "export_view",
        label: "Export View",
        sublabel:
          "Choose a CSV Export view which will define the columns in the exported CSV file",
        type: "String",
        required: true,
        attributes: {
          options: views.map((v) => v.select_option),
        },
      },
      {
        name: "where",
        label: "Where",
        type: "String",
        class: "validate-expression",
        sublabel: "Only include rows where this formula is true. ",
      },
      {
        name: "filename",
        label: "File name",
        type: "String",
      },
    ];
  },
  /**
   * @param {object} opts
   * @param {object} opts.row
   * @param {object} opts.configuration
   * @param {object} opts.user
   * @returns {Promise<void>}
   */
  run: async ({
    row,
    req,
    configuration: { export_view, where, filename },
    user,
  }) => {
    const view = View.findOne({ name: export_view });
    const table = Table.findOne({ id: view.table_id });
    const { columns, what, layout, delimiter, bom } = view.configuration;

    const fields = await table.getFields();
    const { joinFields, aggregations } = picked_fields_to_query(
      columns,
      table.fields
    );

    const where1 = where
      ? jsexprToWhere(
          where,
          { ...(row || {}), user, user_id: user?.id },
          fields
        )
      : {};
    const write_file = async (str) => {
      const fnm =
        interpolate && row ? interpolate(filename, row, user) : filename;
      await File.from_contents(fnm, "text/csv", str, user?.id);
    };

    if (what === "All columns") {
      const columns = table.fields
        .sort((a, b) => a.id - b.id)
        .map((f) => f.name);
      const rows = await table.getRows(where1, { orderBy: "id" });
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
      await write_file(str);
      return {};
    }
    let rows = await table.getJoinedRows({
      where: where1,
      joinFields,
      aggregations,
      forPublic: !user,
      forUser: user,
    });

    const myReq = req
      ? { noHTML: true, ...req }
      : { user, __: (s) => s, noHTML: true };
    const tfields = layout?.list_columns
      ? get_viewable_fields_from_layout(
          view.name,
          "",
          table,
          fields,
          columns,
          false,
          myReq,
          req?.__ || ((s) => s),
          where1,
          view.name,
          layout.besides
        )
      : get_viewable_fields(
          view.name,
          "",
          table,
          fields,
          columns,
          false,
          myReq,
          req?.__ || ((s) => s)
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
    const str1 = str.replace(/<time[^>]*>(.*?)<\/time>/gi, "$1");
    //console.log(str1);
    await write_file(str1);
    return {};
  },
};
